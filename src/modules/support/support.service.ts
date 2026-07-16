import jwt from "jsonwebtoken";
import { pool } from "../../config/db";

let ensureSchemaPromise: Promise<void> | null = null;

export type SupportSenderType = "USER" | "ADMIN";

export const ensureSupportSchema = async () => {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS support_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'OPEN',
        last_message_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS support_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
        sender_type VARCHAR(10) NOT NULL,
        sender_id UUID,
        message TEXT NOT NULL,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_support_conversations_user_id
      ON support_conversations(user_id);

      CREATE INDEX IF NOT EXISTS idx_support_conversations_status
      ON support_conversations(status);

      CREATE INDEX IF NOT EXISTS idx_support_messages_conversation_id
      ON support_messages(conversation_id, created_at DESC);
    `).then(() => undefined);
  }

  await ensureSchemaPromise;
};

type PaginationInput = {
  limit?: number;
  offset?: number;
  page?: number;
  defaultLimit?: number;
};

const normalizePagination = (input: PaginationInput = {}) => {
  const defaultLimit = input.defaultLimit ?? 30;
  const limit = Math.min(Math.max(Number(input.limit ?? defaultLimit) || defaultLimit, 1), 100);

  let offset = Math.max(Number(input.offset ?? 0) || 0, 0);
  let page = Math.max(Number(input.page ?? 0) || 0, 0);

  if (page > 0) {
    offset = (page - 1) * limit;
  } else {
    page = Math.floor(offset / limit) + 1;
  }

  return { limit, offset, page };
};

const buildPaginationMeta = (
  pagination: { limit: number; offset: number; page: number },
  total: number,
  returnedCount: number
) => {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.limit);

  return {
    page: pagination.page,
    limit: pagination.limit,
    offset: pagination.offset,
    total,
    total_pages: totalPages,
    has_more: pagination.offset + returnedCount < total,
    has_previous: pagination.offset > 0
  };
};

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const formatSupportUserDisplay = (row: {
  user_id?: string;
  firstname?: string | null;
  lastname?: string | null;
  username?: string | null;
  email?: string | null;
}) => {
  const firstName = normalizeText(row.firstname);
  const lastName = normalizeText(row.lastname);
  const username = normalizeText(row.username);
  const email = normalizeText(row.email);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const name = fullName || username || email || (row.user_id ? `User ${row.user_id.slice(0, 8)}` : "Customer");

  return {
    firstname: firstName,
    lastname: lastName,
    username,
    email,
    full_name: fullName || null,
    name,
    display_name: name
  };
};

export const formatConversationForAdmin = (row: Record<string, any>) => {
  const userDisplay = formatSupportUserDisplay({
    user_id: row.user_id,
    firstname: row.firstname,
    lastname: row.lastname,
    username: row.username,
    email: row.email
  });

  return {
    id: row.id,
    user_id: row.user_id,
    status: row.status,
    ...userDisplay,
    last_message: row.last_message ?? null,
    unread_count: Number(row.unread_count ?? 0),
    last_message_at: row.last_message_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null
  };
};

const formatMessageRow = (row: Record<string, any>) => {
  const senderDisplay = row.sender_type === "USER"
    ? formatSupportUserDisplay({
        user_id: row.sender_id,
        firstname: row.sender_firstname,
        lastname: row.sender_lastname,
        username: row.sender_username,
        email: row.sender_email
      })
    : {
        name: "CBRIXI Support",
        display_name: "CBRIXI Support",
        full_name: "CBRIXI Support",
        firstname: null,
        lastname: null,
        username: null,
        email: null
      };

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_type: row.sender_type,
    sender_id: row.sender_id,
    message: row.message,
    read_at: row.read_at,
    created_at: row.created_at,
    sender_name: senderDisplay.name,
    sender_display_name: senderDisplay.display_name,
    sender_firstname: senderDisplay.firstname,
    sender_lastname: senderDisplay.lastname,
    sender_username: senderDisplay.username,
    sender_email: senderDisplay.email
  };
};

export const getOrCreateUserConversation = async (userId: string) => {
  await ensureSupportSchema();

  const existing = await pool.query(
    `
    SELECT *
    FROM support_conversations
    WHERE user_id = $1 AND status = 'OPEN'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId]
  );

  if (existing.rows[0]) return existing.rows[0];

  const created = await pool.query(
    `
    INSERT INTO support_conversations (user_id, status)
    VALUES ($1, 'OPEN')
    RETURNING *
    `,
    [userId]
  );

  return created.rows[0];
};

export const getConversationById = async (conversationId: string) => {
  await ensureSupportSchema();

  const result = await pool.query(
    `
    SELECT
      sc.*,
      u.firstname,
      u.lastname,
      u.username,
      u.email
    FROM support_conversations sc
    JOIN users u ON u.id = sc.user_id
    WHERE sc.id = $1
    `,
    [conversationId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return formatConversationForAdmin(row);
};

export const listAdminConversations = async (options?: {
  limit?: number;
  offset?: number;
  page?: number;
}) => {
  await ensureSupportSchema();
  const pagination = normalizePagination({
    ...options,
    defaultLimit: 50
  });

  const result = await pool.query(
    `
    SELECT
      sc.*,
      u.firstname,
      u.lastname,
      u.username,
      u.email,
      COUNT(*) OVER()::INT AS total_count,
      (
        SELECT sm.message
        FROM support_messages sm
        WHERE sm.conversation_id = sc.id
        ORDER BY sm.created_at DESC
        LIMIT 1
      ) AS last_message,
      (
        SELECT COUNT(*)::INT
        FROM support_messages sm
        WHERE sm.conversation_id = sc.id
          AND sm.sender_type = 'USER'
          AND sm.read_at IS NULL
      ) AS unread_count
    FROM support_conversations sc
    LEFT JOIN users u ON u.id = sc.user_id
    WHERE EXISTS (
      SELECT 1
      FROM support_messages sm
      WHERE sm.conversation_id = sc.id
    )
    ORDER BY COALESCE(sc.last_message_at, sc.created_at) DESC
    LIMIT $1 OFFSET $2
    `,
    [pagination.limit, pagination.offset]
  );

  const total = Number(result.rows[0]?.total_count ?? 0);

  return {
    conversations: result.rows.map((row) => formatConversationForAdmin(row)),
    pagination: buildPaginationMeta(pagination, total, result.rows.length)
  };
};

export const getConversationMessages = async (
  conversationId: string,
  options?: {
    limit?: number;
    offset?: number;
    page?: number;
  }
) => {
  await ensureSupportSchema();
  const pagination = normalizePagination({
    ...options,
    defaultLimit: 50
  });

  const countRes = await pool.query(
    `SELECT COUNT(*)::INT AS total FROM support_messages WHERE conversation_id = $1`,
    [conversationId]
  );
  const total = Number(countRes.rows[0]?.total ?? 0);

  // Return the newest page by default so long chats still show recent messages.
  // page/offset move backward through older messages.
  const result = await pool.query(
    `
    SELECT *
    FROM (
      SELECT
        sm.*,
        u.firstname AS sender_firstname,
        u.lastname AS sender_lastname,
        u.username AS sender_username,
        u.email AS sender_email
      FROM support_messages sm
      LEFT JOIN users u ON u.id = sm.sender_id AND sm.sender_type = 'USER'
      WHERE sm.conversation_id = $1
      ORDER BY sm.created_at DESC
      LIMIT $2 OFFSET $3
    ) recent_messages
    ORDER BY created_at ASC
    `,
    [conversationId, pagination.limit, pagination.offset]
  );

  return {
    messages: result.rows.map((row) => formatMessageRow(row)),
    pagination: buildPaginationMeta(pagination, total, result.rows.length)
  };
};

export const createSupportMessage = async (input: {
  conversationId: string;
  senderType: SupportSenderType;
  senderId?: string | null;
  message: string;
}) => {
  await ensureSupportSchema();

  const trimmedMessage = input.message.trim();
  if (!trimmedMessage) throw new Error("Message cannot be empty");

  const conversation = await getConversationById(input.conversationId);
  if (!conversation) throw new Error("Conversation not found");

  const result = await pool.query(
    `
    INSERT INTO support_messages
      (conversation_id, sender_type, sender_id, message)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [input.conversationId, input.senderType, input.senderId ?? null, trimmedMessage]
  );

  await pool.query(
    `
    UPDATE support_conversations
    SET last_message_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    `,
    [input.conversationId]
  );

  if (input.senderType === "ADMIN") {
    await pool.query(
      `
      UPDATE support_messages
      SET read_at = NOW()
      WHERE conversation_id = $1
        AND sender_type = 'USER'
        AND read_at IS NULL
      `,
      [input.conversationId]
    );
  }

  const inserted = result.rows[0];
  const enrichedRow = input.senderType === "USER"
    ? {
        ...inserted,
        sender_firstname: conversation.firstname,
        sender_lastname: conversation.lastname,
        sender_username: conversation.username,
        sender_email: conversation.email
      }
    : inserted;

  return {
    message: formatMessageRow(enrichedRow),
    conversation
  };
};

export const markConversationReadForAdmin = async (conversationId: string) => {
  await ensureSupportSchema();

  await pool.query(
    `
    UPDATE support_messages
    SET read_at = NOW()
    WHERE conversation_id = $1
      AND sender_type = 'USER'
      AND read_at IS NULL
    `,
    [conversationId]
  );
};

export const verifySupportSocketAuth = (token?: string, role?: string) => {
  if (!token) throw new Error("Authentication token is required");

  if (role === "admin") {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      role?: string;
      email?: string;
    };

    return {
      role: "admin" as const,
      id: payload.id,
      email: payload.email ?? ""
    };
  }

  const payload = jwt.verify(token, process.env.USER_JWT_SECRET!) as {
    id: string;
    email?: string;
  };

  return {
    role: "user" as const,
    id: payload.id,
    email: payload.email ?? ""
  };
};
