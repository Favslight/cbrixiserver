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

const normalizePagination = (limit?: number, offset?: number) => ({
  limit: Math.min(Math.max(Number(limit ?? 30), 1), 100),
  offset: Math.max(Number(offset ?? 0), 0)
});

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
      u.email
    FROM support_conversations sc
    JOIN users u ON u.id = sc.user_id
    WHERE sc.id = $1
    `,
    [conversationId]
  );

  return result.rows[0] ?? null;
};

export const listAdminConversations = async (limit?: number, offset?: number) => {
  await ensureSupportSchema();
  const pagination = normalizePagination(limit, offset);

  const result = await pool.query(
    `
    SELECT
      sc.*,
      u.firstname,
      u.lastname,
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
    JOIN users u ON u.id = sc.user_id
    ORDER BY COALESCE(sc.last_message_at, sc.created_at) DESC
    LIMIT $1 OFFSET $2
    `,
    [pagination.limit, pagination.offset]
  );

  const total = Number(result.rows[0]?.total_count ?? 0);

  return {
    conversations: result.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      status: row.status,
      firstname: row.firstname,
      lastname: row.lastname,
      email: row.email,
      name: `${row.firstname ?? ""} ${row.lastname ?? ""}`.trim() || row.email,
      last_message: row.last_message,
      unread_count: Number(row.unread_count ?? 0),
      last_message_at: row.last_message_at,
      created_at: row.created_at
    })),
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      total,
      has_more: pagination.offset + result.rows.length < total
    }
  };
};

export const getConversationMessages = async (
  conversationId: string,
  limit?: number,
  offset?: number
) => {
  await ensureSupportSchema();
  const pagination = normalizePagination(limit, offset);

  const countRes = await pool.query(
    `SELECT COUNT(*)::INT AS total FROM support_messages WHERE conversation_id = $1`,
    [conversationId]
  );
  const total = Number(countRes.rows[0]?.total ?? 0);

  const result = await pool.query(
    `
    SELECT *
    FROM support_messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
    LIMIT $2 OFFSET $3
    `,
    [conversationId, pagination.limit, pagination.offset]
  );

  return {
    messages: result.rows,
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      total,
      has_more: pagination.offset + result.rows.length < total
    }
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

  return {
    message: result.rows[0],
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
