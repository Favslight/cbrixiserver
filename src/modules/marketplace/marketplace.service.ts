import { pool } from "../../config/db";

export const DEFAULT_LOCK_TITLE = "Marketplace under review";
export const DEFAULT_LOCK_MESSAGE =
  "Our marketplace is currently under review. Please check back later.";

export type MarketplaceStatus = {
  locked: boolean;
  title: string;
  message: string;
  locked_at: string | null;
  updated_at: string | null;
};

let ensureSchemaPromise: Promise<void> | null = null;

export const ensureMarketplaceSchema = async () => {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = pool
      .query(`
        CREATE TABLE IF NOT EXISTS marketplace_settings (
          id INTEGER PRIMARY KEY DEFAULT 1,
          is_locked BOOLEAN NOT NULL DEFAULT FALSE,
          lock_title VARCHAR(150),
          lock_message TEXT,
          locked_at TIMESTAMP,
          locked_by UUID,
          updated_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT marketplace_settings_singleton CHECK (id = 1)
        );

        INSERT INTO marketplace_settings (id) VALUES (1)
        ON CONFLICT (id) DO NOTHING;
      `)
      .then(() => undefined)
      .catch((error) => {
        // Allow a retry on the next call instead of caching a failed attempt.
        ensureSchemaPromise = null;
        throw error;
      });
  }

  await ensureSchemaPromise;
};

const mapStatus = (row: Record<string, any>): MarketplaceStatus => ({
  locked: Boolean(row.is_locked),
  title: row.lock_title || DEFAULT_LOCK_TITLE,
  message: row.lock_message || DEFAULT_LOCK_MESSAGE,
  locked_at: row.locked_at ?? null,
  updated_at: row.updated_at ?? null
});

export const getMarketplaceStatus = async (): Promise<MarketplaceStatus> => {
  await ensureMarketplaceSchema();

  const result = await pool.query(`SELECT * FROM marketplace_settings WHERE id = 1`);
  return mapStatus(result.rows[0] ?? {});
};

export const lockMarketplace = async (
  input: { title?: string; message?: string },
  adminId?: string
): Promise<MarketplaceStatus> => {
  await ensureMarketplaceSchema();

  // A blank title/message falls back to the defaults shown to shoppers.
  const result = await pool.query(
    `
    UPDATE marketplace_settings
    SET is_locked = TRUE,
        lock_title = $1,
        lock_message = $2,
        locked_at = CASE WHEN is_locked THEN locked_at ELSE NOW() END,
        locked_by = $3,
        updated_at = NOW()
    WHERE id = 1
    RETURNING *
    `,
    [input.title || null, input.message || null, adminId ?? null]
  );

  return mapStatus(result.rows[0]);
};

export const unlockMarketplace = async (adminId?: string): Promise<MarketplaceStatus> => {
  await ensureMarketplaceSchema();

  const result = await pool.query(
    `
    UPDATE marketplace_settings
    SET is_locked = FALSE,
        locked_at = NULL,
        locked_by = $1,
        updated_at = NOW()
    WHERE id = 1
    RETURNING *
    `,
    [adminId ?? null]
  );

  return mapStatus(result.rows[0]);
};
