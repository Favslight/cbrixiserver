import { pool } from "../../config/db";

let ensureCbrillianceVerificationColumnsPromise: Promise<void> | null = null;

export const ensureCbrillianceVerificationColumns = async () => {
  if (!ensureCbrillianceVerificationColumnsPromise) {
    ensureCbrillianceVerificationColumnsPromise = (async () => {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS cbrilliance_email VARCHAR(150),
        ADD COLUMN IF NOT EXISTS cbrilliance_email_verified BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS cbrilliance_email_verified_at TIMESTAMP
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_cbrilliance_email
        ON users(LOWER(cbrilliance_email))
        WHERE cbrilliance_email IS NOT NULL
      `);
    })();
  }

  await ensureCbrillianceVerificationColumnsPromise;
};

export const normalizeCbrillianceEmail = (email?: string | null) => {
  const normalizedEmail = email?.trim().toLowerCase();
  return normalizedEmail || null;
};

export const markUserCbrillianceEmailVerified = async (
  userId: string,
  email: string
) => {
  await ensureCbrillianceVerificationColumns();

  const normalizedEmail = normalizeCbrillianceEmail(email);
  if (!normalizedEmail) {
    throw new Error("Cbrilliance email is required");
  }

  const result = await pool.query(
    `
    UPDATE users
    SET cbrilliance_email = $1,
        cbrilliance_email_verified = TRUE,
        cbrilliance_email_verified_at = NOW(),
        updated_at = NOW()
    WHERE id = $2
    RETURNING id, cbrilliance_email, cbrilliance_email_verified, cbrilliance_email_verified_at
    `,
    [normalizedEmail, userId]
  );

  return result.rows[0] ?? null;
};
