import { pool } from "../../config/db";

export type NotificationTargetType = "USER" | "ADMIN";

export type CreateNotificationInput = {
  targetType: NotificationTargetType;
  userId?: string | null;
  title: string;
  message: string;
  type: string;
  metadata?: Record<string, unknown> | null;
};

let ensureNotificationsPromise: Promise<void> | null = null;

export const ensureNotificationSchema = async () => {
  if (!ensureNotificationsPromise) {
    ensureNotificationsPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_type VARCHAR(20) NOT NULL DEFAULT 'USER',
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(80) NOT NULL,
        metadata JSONB DEFAULT '{}'::JSONB,
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user_id
      ON notifications(user_id);

      CREATE INDEX IF NOT EXISTS idx_notifications_target_type
      ON notifications(target_type);

      CREATE INDEX IF NOT EXISTS idx_notifications_unread
      ON notifications(target_type, user_id, is_read)
      WHERE deleted_at IS NULL;
    `).then(() => undefined);
  }

  await ensureNotificationsPromise;
};

export const createNotification = async (input: CreateNotificationInput) => {
  await ensureNotificationSchema();

  const result = await pool.query(
    `
    INSERT INTO notifications
      (target_type, user_id, title, message, type, metadata)
    VALUES ($1, $2, $3, $4, $5, $6::JSONB)
    RETURNING *
    `,
    [
      input.targetType,
      input.userId ?? null,
      input.title,
      input.message,
      input.type,
      JSON.stringify(input.metadata ?? {})
    ]
  );

  return result.rows[0];
};

const notificationScope = (targetType: NotificationTargetType, userId?: string | null) => {
  if (targetType === "ADMIN") {
    return {
      clause: "target_type = 'ADMIN'",
      values: [] as unknown[]
    };
  }

  return {
    clause: "target_type = 'USER' AND user_id = $1",
    values: [userId]
  };
};

export const getNotifications = async (
  targetType: NotificationTargetType,
  userId: string | null,
  status: "all" | "read" | "unread" = "all"
) => {
  await ensureNotificationSchema();

  const scope = notificationScope(targetType, userId);
  const values = [...scope.values];
  const statusClause = status === "read"
    ? "AND is_read = TRUE"
    : status === "unread"
      ? "AND is_read = FALSE"
      : "";

  const result = await pool.query(
    `
    SELECT *
    FROM notifications
    WHERE ${scope.clause}
      AND deleted_at IS NULL
      ${statusClause}
    ORDER BY created_at DESC
    `,
    values
  );

  return result.rows;
};

export const getUnreadNotificationCount = async (
  targetType: NotificationTargetType,
  userId: string | null
) => {
  await ensureNotificationSchema();

  const scope = notificationScope(targetType, userId);
  const result = await pool.query(
    `
    SELECT COUNT(*)::INT AS count
    FROM notifications
    WHERE ${scope.clause}
      AND deleted_at IS NULL
      AND is_read = FALSE
    `,
    scope.values
  );

  return result.rows[0]?.count ?? 0;
};

export const markNotificationRead = async (
  targetType: NotificationTargetType,
  userId: string | null,
  notificationId: string
) => {
  await ensureNotificationSchema();

  const scope = notificationScope(targetType, userId);
  const values = [...scope.values, notificationId];
  const idParam = values.length;

  const result = await pool.query(
    `
    UPDATE notifications
    SET is_read = TRUE,
        read_at = COALESCE(read_at, NOW())
    WHERE ${scope.clause}
      AND id = $${idParam}
      AND deleted_at IS NULL
    RETURNING *
    `,
    values
  );

  return result.rows[0] ?? null;
};

export const markAllNotificationsRead = async (
  targetType: NotificationTargetType,
  userId: string | null
) => {
  await ensureNotificationSchema();

  const scope = notificationScope(targetType, userId);
  const result = await pool.query(
    `
    UPDATE notifications
    SET is_read = TRUE,
        read_at = COALESCE(read_at, NOW())
    WHERE ${scope.clause}
      AND deleted_at IS NULL
      AND is_read = FALSE
    RETURNING *
    `,
    scope.values
  );

  return result.rows;
};

export const deleteNotification = async (
  targetType: NotificationTargetType,
  userId: string | null,
  notificationId: string
) => {
  await ensureNotificationSchema();

  const scope = notificationScope(targetType, userId);
  const values = [...scope.values, notificationId];
  const idParam = values.length;

  const result = await pool.query(
    `
    UPDATE notifications
    SET deleted_at = NOW()
    WHERE ${scope.clause}
      AND id = $${idParam}
      AND deleted_at IS NULL
    RETURNING *
    `,
    values
  );

  return result.rows[0] ?? null;
};
