import crypto from "crypto";
import { pool } from "../../config/db";
import { sendEmail } from "../email/email.service";
import {
  referralBonusEarnedTemplate,
  referralPayoutApprovedTemplate,
  referralPayoutRequestedAdminTemplate,
  referralPayoutRequestedTemplate
} from "../email/email.templates";
import { EmailType } from "../email/email.types";
import { createNotification } from "../notifications/notification.service";

type ReferralSettingsInput = {
  is_enabled?: boolean;
  bonus_percentage?: number;
};

let ensureReferralSchemaPromise: Promise<void> | null = null;

const frontendUrl = () => (process.env.FRONTEND_URL || "https://cbrixi.com").replace(/\/$/, "");

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const ensureReferralSchema = async () => {
  if (!ensureReferralSchemaPromise) {
    ensureReferralSchemaPromise = (async () => {
      await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32),
      ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0;

      UPDATE users
      SET referral_code = UPPER(SUBSTRING(REPLACE(id::TEXT, '-', '') FROM 1 FOR 10))
      WHERE referral_code IS NULL OR referral_code = '';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique
      ON users(referral_code)
      WHERE referral_code IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_users_referred_by_user_id
      ON users(referred_by_user_id);

      CREATE TABLE IF NOT EXISTS referral_settings (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        is_enabled BOOLEAN DEFAULT FALSE,
        bonus_percentage NUMERIC(5,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      INSERT INTO referral_settings (id, is_enabled, bonus_percentage)
      VALUES (1, FALSE, 0)
      ON CONFLICT (id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS referral_rewards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        referrer_id UUID NOT NULL REFERENCES users(id),
        referred_user_id UUID NOT NULL REFERENCES users(id),
        order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        payment_transaction_id UUID UNIQUE REFERENCES payment_transactions(id) ON DELETE SET NULL,
        purchase_amount NUMERIC(15,2) NOT NULL,
        bonus_percentage NUMERIC(5,2) NOT NULL,
        reward_amount NUMERIC(15,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'AVAILABLE',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS referral_payout_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        amount NUMERIC(15,2) NOT NULL,
        account_name VARCHAR(255) NOT NULL,
        account_number VARCHAR(50) NOT NULL,
        bank_name VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'PENDING',
        admin_id UUID,
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE referral_rewards
      ADD COLUMN IF NOT EXISTS payout_request_id UUID REFERENCES referral_payout_requests(id),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS restored_from_notification_id UUID;

      CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_id
      ON referral_rewards(referrer_id);

      CREATE INDEX IF NOT EXISTS idx_referral_rewards_referred_user_id
      ON referral_rewards(referred_user_id);

      CREATE INDEX IF NOT EXISTS idx_referral_rewards_status
      ON referral_rewards(status);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_restored_notification
      ON referral_rewards(restored_from_notification_id)
      WHERE restored_from_notification_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_referral_payout_requests_user_id
      ON referral_payout_requests(user_id);

      CREATE INDEX IF NOT EXISTS idx_referral_payout_requests_status
      ON referral_payout_requests(status);
      `);

      // Keep referral earnings even if admin deletes the related payment/order.
      await pool.query(`
      DO $$
      DECLARE
        constraint_row RECORD;
      BEGIN
        ALTER TABLE referral_rewards
          ALTER COLUMN order_id DROP NOT NULL,
          ALTER COLUMN payment_transaction_id DROP NOT NULL;

        FOR constraint_row IN
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          WHERE rel.relname = 'referral_rewards'
            AND con.contype = 'f'
            AND (
              con.confrelid = 'orders'::regclass
              OR con.confrelid = 'payment_transactions'::regclass
            )
        LOOP
          EXECUTE format('ALTER TABLE referral_rewards DROP CONSTRAINT %I', constraint_row.conname);
        END LOOP;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'referral_rewards_order_id_fkey'
        ) THEN
          ALTER TABLE referral_rewards
            ADD CONSTRAINT referral_rewards_order_id_fkey
              FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'referral_rewards_payment_transaction_id_fkey'
        ) THEN
          ALTER TABLE referral_rewards
            ADD CONSTRAINT referral_rewards_payment_transaction_id_fkey
              FOREIGN KEY (payment_transaction_id) REFERENCES payment_transactions(id) ON DELETE SET NULL;
        END IF;
      END $$;
      `);
    })();
  }

  await ensureReferralSchemaPromise;
};

const generateReferralCode = (firstname?: string, lastname?: string) => {
  const seed = `${firstname ?? ""}${lastname ?? ""}`
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase();
  return `${seed || "CBX"}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

export const createUniqueReferralCode = async (
  client: { query: typeof pool.query },
  firstname?: string,
  lastname?: string
) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateReferralCode(firstname, lastname);
    const existing = await client.query(
      `SELECT id FROM users WHERE referral_code = $1`,
      [code]
    );

    if (!existing.rows[0]) return code;
  }

  return crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
};

export const findReferrerByCode = async (
  client: { query: typeof pool.query },
  referralCode?: string | null
) => {
  const normalizedCode = referralCode?.trim().toUpperCase();
  if (!normalizedCode) return null;

  const result = await client.query(
    `
    SELECT id, firstname, lastname, email, referral_code
    FROM users
    WHERE UPPER(referral_code) = $1
    `,
    [normalizedCode]
  );

  return result.rows[0] ?? null;
};

export const getReferralSettings = async () => {
  await ensureReferralSchema();

  const result = await pool.query(`SELECT * FROM referral_settings WHERE id = 1`);
  return result.rows[0];
};

export const updateReferralSettings = async (input: ReferralSettingsInput) => {
  await ensureReferralSchema();

  const bonusPercentage = input.bonus_percentage;

  if (
    bonusPercentage !== undefined
    && (!Number.isFinite(Number(bonusPercentage)) || Number(bonusPercentage) < 0 || Number(bonusPercentage) > 100)
  ) {
    throw new Error("bonus_percentage must be between 0 and 100");
  }

  const result = await pool.query(
    `
    UPDATE referral_settings
    SET is_enabled = COALESCE($1, is_enabled),
        bonus_percentage = COALESCE($2, bonus_percentage),
        updated_at = NOW()
    WHERE id = 1
    RETURNING *
    `,
    [
      input.is_enabled,
      bonusPercentage === undefined ? null : Number(bonusPercentage)
    ]
  );

  return result.rows[0];
};

const sendOptionalEmail = async (
  userId: string | null,
  email: string | undefined,
  subject: string,
  html: string,
  emailType: EmailType
) => {
  if (!email) return;

  try {
    await sendEmail(userId, null, null, email, subject, html, emailType);
  } catch (error) {
    console.error("Optional referral email failed", error);
  }
};

export const recordReferralRewardForTransaction = async (transactionId: string) => {
  await ensureReferralSchema();

  const txnRes = await pool.query(
    `
    SELECT
      pt.id,
      pt.order_id,
      pt.user_id,
      pt.amount,
      pt.status,
      u.referred_by_user_id,
      buyer.firstname AS buyer_firstname,
      buyer.lastname AS buyer_lastname,
      referrer.email AS referrer_email,
      referrer.firstname AS referrer_firstname
    FROM payment_transactions pt
    JOIN orders o ON o.id = pt.order_id
    JOIN users u ON u.id = o.user_id
    JOIN users buyer ON buyer.id = o.user_id
    LEFT JOIN users referrer ON referrer.id = u.referred_by_user_id
    WHERE pt.id = $1
    `,
    [transactionId]
  );

  const txn = txnRes.rows[0];

  if (!txn || txn.status !== "SUCCESS" || !txn.referred_by_user_id) {
    return null;
  }

  const settings = await getReferralSettings();
  const bonusPercentage = Number(settings?.bonus_percentage ?? 0);

  if (!settings?.is_enabled || bonusPercentage <= 0) {
    return null;
  }

  const purchaseAmount = Number(txn.amount);
  const rewardAmount = roundMoney((purchaseAmount * bonusPercentage) / 100);

  if (rewardAmount <= 0) {
    return null;
  }

  const rewardRes = await pool.query(
    `
    INSERT INTO referral_rewards
      (referrer_id, referred_user_id, order_id, payment_transaction_id,
       purchase_amount, bonus_percentage, reward_amount, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE')
    ON CONFLICT (payment_transaction_id) DO NOTHING
    RETURNING *
    `,
    [
      txn.referred_by_user_id,
      txn.user_id,
      txn.order_id,
      txn.id,
      purchaseAmount,
      bonusPercentage,
      rewardAmount
    ]
  );

  const reward = rewardRes.rows[0];
  if (!reward) return null;

  await createNotification({
    targetType: "USER",
    userId: txn.referred_by_user_id,
    title: "Referral bonus earned",
    message: `You earned NGN ${rewardAmount.toLocaleString("en-NG")} from a referral purchase.`,
    type: "REFERRAL_BONUS_EARNED",
    metadata: {
      reward_id: reward.id,
      referred_user_id: txn.user_id,
      order_id: txn.order_id,
      payment_transaction_id: txn.id,
      reward_amount: rewardAmount,
      purchase_amount: purchaseAmount,
      bonus_percentage: bonusPercentage
    }
  });

  await sendOptionalEmail(
    txn.referred_by_user_id,
    txn.referrer_email,
    "Referral Bonus Earned",
    referralBonusEarnedTemplate(
      txn.referrer_firstname ?? "there",
      `${txn.buyer_firstname ?? ""} ${txn.buyer_lastname ?? ""}`.trim() || "your referral",
      rewardAmount,
      purchaseAmount,
      bonusPercentage
    ),
    EmailType.REFERRAL_BONUS_EARNED
  );

  return reward;
};

/**
 * Restores missing referral rewards from SUCCESS payments and from bonus notifications.
 * Safe to run repeatedly (idempotent).
 */
export const rebuildMissingReferralRewards = async (referrerId?: string) => {
  await ensureReferralSchema();

  const { ensureNotificationSchema } = await import("../notifications/notification.service");
  await ensureNotificationSchema();

  const settings = await getReferralSettings();
  const settingsBonusPercentage = Number(settings?.bonus_percentage ?? 0);
  const restored: Array<Record<string, unknown>> = [];

  const parseRewardAmountFromMessage = (message?: string | null) => {
    if (!message) return 0;
    const match = message.match(/NGN\s*([\d,]+(?:\.\d+)?)/i);
    if (!match?.[1]) return 0;
    return Number(match[1].replace(/,/g, ""));
  };

  const paymentValues: unknown[] = [];
  let paymentReferrerFilter = "";
  if (referrerId) {
    paymentValues.push(referrerId);
    paymentReferrerFilter = `AND buyer.referred_by_user_id = $${paymentValues.length}`;
  }

  const missingPaymentRewards = await pool.query(
    `
    SELECT
      pt.id AS payment_transaction_id,
      pt.order_id,
      pt.amount,
      buyer.id AS referred_user_id,
      buyer.referred_by_user_id AS referrer_id
    FROM payment_transactions pt
    JOIN orders o ON o.id = pt.order_id
    JOIN users buyer ON buyer.id = o.user_id
    WHERE pt.status = 'SUCCESS'
      AND buyer.referred_by_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM referral_rewards rr
        WHERE rr.payment_transaction_id = pt.id
      )
      ${paymentReferrerFilter}
    ORDER BY pt.created_at ASC
    `,
    paymentValues
  );

  for (const row of missingPaymentRewards.rows) {
    const purchaseAmount = Number(row.amount);
    if (purchaseAmount <= 0) continue;

    const linkedNotification = await pool.query(
      `
      SELECT metadata, message
      FROM notifications
      WHERE type = 'REFERRAL_BONUS_EARNED'
        AND user_id = $1
        AND (
          metadata->>'payment_transaction_id' = $2
          OR metadata->>'order_id' = $3
        )
      ORDER BY created_at ASC
      LIMIT 1
      `,
      [row.referrer_id, row.payment_transaction_id, row.order_id]
    );

    const notificationMeta = (linkedNotification.rows[0]?.metadata ?? {}) as Record<string, unknown>;
    const rewardPercentage = Number(
      notificationMeta.bonus_percentage ?? (settingsBonusPercentage > 0 ? settingsBonusPercentage : 0)
    );
    const rewardAmountFromNotification = Number(notificationMeta.reward_amount ?? 0);
    const rewardAmountFromMessage = parseRewardAmountFromMessage(linkedNotification.rows[0]?.message);

    const rewardAmount = rewardAmountFromNotification > 0
      ? roundMoney(rewardAmountFromNotification)
      : rewardAmountFromMessage > 0
        ? roundMoney(rewardAmountFromMessage)
        : rewardPercentage > 0
          ? roundMoney((purchaseAmount * rewardPercentage) / 100)
          : 0;

    if (rewardAmount <= 0) continue;

    const inserted = await pool.query(
      `
      INSERT INTO referral_rewards
        (referrer_id, referred_user_id, order_id, payment_transaction_id,
         purchase_amount, bonus_percentage, reward_amount, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE')
      ON CONFLICT (payment_transaction_id) DO NOTHING
      RETURNING *
      `,
      [
        row.referrer_id,
        row.referred_user_id,
        row.order_id,
        row.payment_transaction_id,
        purchaseAmount,
        rewardPercentage > 0
          ? rewardPercentage
          : roundMoney((rewardAmount / purchaseAmount) * 100),
        rewardAmount
      ]
    );

    if (inserted.rows[0]) {
      restored.push(inserted.rows[0]);
    }
  }

  const notificationValues: unknown[] = ["REFERRAL_BONUS_EARNED"];
  let notificationReferrerFilter = "";
  if (referrerId) {
    notificationValues.push(referrerId);
    notificationReferrerFilter = `AND n.user_id = $${notificationValues.length}`;
  }

  // Include soft-deleted notifications so wiped earnings can still be recovered.
  const missingFromNotifications = await pool.query(
    `
    SELECT
      n.id AS notification_id,
      n.user_id AS referrer_id,
      n.metadata,
      n.message,
      n.created_at
    FROM notifications n
    WHERE n.type = $1
      AND n.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM referral_rewards rr
        WHERE rr.restored_from_notification_id = n.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM referral_rewards rr
        WHERE n.metadata ? 'payment_transaction_id'
          AND NULLIF(n.metadata->>'payment_transaction_id', '') IS NOT NULL
          AND rr.payment_transaction_id = NULLIF(n.metadata->>'payment_transaction_id', '')::UUID
      )
      AND NOT EXISTS (
        SELECT 1
        FROM referral_rewards rr
        WHERE n.metadata ? 'reward_id'
          AND NULLIF(n.metadata->>'reward_id', '') IS NOT NULL
          AND rr.id = NULLIF(n.metadata->>'reward_id', '')::UUID
      )
      ${notificationReferrerFilter}
    ORDER BY n.created_at ASC
    `,
    notificationValues
  );

  for (const row of missingFromNotifications.rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    let referredUserId = typeof metadata.referred_user_id === "string"
      ? metadata.referred_user_id
      : null;
    const orderId = typeof metadata.order_id === "string" ? metadata.order_id : null;
    const paymentTransactionId = typeof metadata.payment_transaction_id === "string"
      ? metadata.payment_transaction_id
      : null;

    let rewardAmount = Number(metadata.reward_amount ?? 0);
    if (!(rewardAmount > 0)) {
      rewardAmount = parseRewardAmountFromMessage(row.message);
    }

    const purchaseAmount = Number(metadata.purchase_amount ?? 0);
    const rewardPercentage = Number(
      metadata.bonus_percentage ?? settingsBonusPercentage ?? 0
    );

    if (!referredUserId && orderId) {
      const orderUser = await pool.query(`SELECT user_id FROM orders WHERE id = $1`, [orderId]);
      referredUserId = orderUser.rows[0]?.user_id ?? null;
    }

    if (!referredUserId && paymentTransactionId) {
      const paymentUser = await pool.query(
        `SELECT user_id FROM payment_transactions WHERE id = $1`,
        [paymentTransactionId]
      );
      referredUserId = paymentUser.rows[0]?.user_id ?? null;
    }

    if (!referredUserId || !Number.isFinite(rewardAmount) || rewardAmount <= 0) {
      continue;
    }

    const alreadyRestored = await pool.query(
      `
      SELECT id
      FROM referral_rewards
      WHERE referrer_id = $1
        AND referred_user_id = $2
        AND reward_amount = $3
        AND (
          ($4::uuid IS NOT NULL AND order_id = $4)
          OR ($5::uuid IS NOT NULL AND payment_transaction_id = $5)
          OR (
            payment_transaction_id IS NULL
            AND order_id IS NULL
            AND restored_from_notification_id IS NOT NULL
          )
        )
      LIMIT 1
      `,
      [row.referrer_id, referredUserId, roundMoney(rewardAmount), orderId, paymentTransactionId]
    );
    if (alreadyRestored.rows[0]) continue;

    const paymentExists = paymentTransactionId
      ? (await pool.query(`SELECT id FROM payment_transactions WHERE id = $1`, [paymentTransactionId])).rows[0]
      : null;
    const orderExists = orderId
      ? (await pool.query(`SELECT id FROM orders WHERE id = $1`, [orderId])).rows[0]
      : null;

    try {
      const inserted = await pool.query(
        `
        INSERT INTO referral_rewards
          (referrer_id, referred_user_id, order_id, payment_transaction_id,
           purchase_amount, bonus_percentage, reward_amount, status, restored_from_notification_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE', $8)
        RETURNING *
        `,
        [
          row.referrer_id,
          referredUserId,
          orderExists ? orderId : null,
          paymentExists ? paymentTransactionId : null,
          purchaseAmount > 0 ? purchaseAmount : roundMoney(rewardAmount),
          rewardPercentage > 0 ? rewardPercentage : 0,
          roundMoney(rewardAmount),
          row.notification_id
        ]
      );

      if (inserted.rows[0]) {
        restored.push(inserted.rows[0]);
      }
    } catch (error: any) {
      // Ignore unique conflicts if another restore path already created the row.
      if (error?.code !== "23505") {
        throw error;
      }
    }
  }

  return {
    restored_count: restored.length,
    restored
  };
};

export const creditReferralRewardManually = async (input: {
  referrer_id?: string;
  referrer_email?: string;
  referred_user_id?: string | null;
  referred_email?: string | null;
  reward_amount: number;
  purchase_amount?: number;
  bonus_percentage?: number;
  note?: string;
}) => {
  await ensureReferralSchema();

  const rewardAmount = roundMoney(Number(input.reward_amount));
  if (!Number.isFinite(rewardAmount) || rewardAmount <= 0) {
    throw new Error("reward_amount must be greater than 0");
  }

  let referrerId = input.referrer_id?.trim() || null;
  if (!referrerId && input.referrer_email) {
    const referrerRes = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
      [input.referrer_email.trim()]
    );
    referrerId = referrerRes.rows[0]?.id ?? null;
  }
  if (!referrerId) throw new Error("Referrer not found");

  let referredUserId = input.referred_user_id?.trim() || null;
  if (!referredUserId && input.referred_email) {
    const referredRes = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
      [input.referred_email.trim()]
    );
    referredUserId = referredRes.rows[0]?.id ?? null;
  }
  if (!referredUserId) {
    // Keep a valid FK even for manual credits with unknown referred user.
    referredUserId = referrerId;
  }

  const purchaseAmount = roundMoney(Number(input.purchase_amount ?? rewardAmount));
  const bonusPercentage = Number(input.bonus_percentage ?? 0);

  const inserted = await pool.query(
    `
    INSERT INTO referral_rewards
      (referrer_id, referred_user_id, order_id, payment_transaction_id,
       purchase_amount, bonus_percentage, reward_amount, status)
    VALUES ($1, $2, NULL, NULL, $3, $4, $5, 'AVAILABLE')
    RETURNING *
    `,
    [referrerId, referredUserId, purchaseAmount, bonusPercentage, rewardAmount]
  );

  const reward = inserted.rows[0];

  await createNotification({
    targetType: "USER",
    userId: referrerId,
    title: "Referral balance restored",
    message: `Your referral balance of NGN ${rewardAmount.toLocaleString("en-NG")} has been restored.${input.note ? ` Note: ${input.note}` : ""}`,
    type: "REFERRAL_BONUS_EARNED",
    metadata: {
      reward_id: reward.id,
      reward_amount: rewardAmount,
      purchase_amount: purchaseAmount,
      bonus_percentage: bonusPercentage,
      manual_credit: true,
      note: input.note ?? null
    }
  });

  return reward;
};

type ReferralDashboardOptions = {
  limit?: number;
  offset?: number;
};

const normalizePagination = (options?: ReferralDashboardOptions) => {
  const limit = Math.min(Math.max(Number(options?.limit ?? 20), 1), 100);
  const offset = Math.max(Number(options?.offset ?? 0), 0);
  return { limit, offset };
};

export const getMyReferralDashboard = async (
  userId: string,
  options?: ReferralDashboardOptions
) => {
  await ensureReferralSchema();

  // Self-heal: restore any referral earnings wiped by payment/order deletes.
  try {
    await rebuildMissingReferralRewards(userId);
  } catch (error) {
    console.error("Failed to rebuild missing referral rewards", error);
  }

  const userRes = await pool.query(
    `
    SELECT id, firstname, lastname, email, referral_code, referral_count
    FROM users
    WHERE id = $1
    `,
    [userId]
  );

  const user = userRes.rows[0];
  if (!user) throw new Error("User not found");

  if (!user.referral_code) {
    const code = await createUniqueReferralCode(pool, user.firstname, user.lastname);
    const updated = await pool.query(
      `UPDATE users SET referral_code = $1, updated_at = NOW() WHERE id = $2 RETURNING referral_code`,
      [code, userId]
    );
    user.referral_code = updated.rows[0].referral_code;
  }

  const settings = await getReferralSettings();

  const totalsRes = await pool.query(
    `
    SELECT
      COALESCE(SUM(reward_amount) FILTER (WHERE status IN ('AVAILABLE', 'REQUESTED', 'PAID')), 0) AS total_earned,
      COALESCE(SUM(reward_amount) FILTER (WHERE status = 'AVAILABLE'), 0) AS available_balance,
      COALESCE(SUM(reward_amount) FILTER (WHERE status = 'REQUESTED'), 0) AS pending_payout_balance,
      COALESCE(SUM(reward_amount) FILTER (WHERE status = 'PAID'), 0) AS paid_out_balance
    FROM referral_rewards
    WHERE referrer_id = $1
    `,
    [userId]
  );

  const { limit, offset } = normalizePagination(options);

  const referredCountRes = await pool.query(
    `
    SELECT COUNT(*)::INT AS total
    FROM users referred
    WHERE referred.referred_by_user_id = $1
    `,
    [userId]
  );
  const totalReferred = Number(referredCountRes.rows[0]?.total ?? 0);

  const referredUsersRes = await pool.query(
    `
    SELECT
      referred.id,
      referred.firstname,
      referred.lastname,
      referred.email,
      referred.created_at,
      COALESCE(SUM(rr.purchase_amount), 0) AS total_purchase_amount,
      COALESCE(SUM(rr.reward_amount), 0) AS total_reward_amount,
      COALESCE(SUM(rr.reward_amount) FILTER (WHERE rr.status = 'AVAILABLE'), 0) AS available_reward_amount,
      COUNT(rr.id)::INT AS reward_count
    FROM users referred
    LEFT JOIN referral_rewards rr
      ON rr.referred_user_id = referred.id
     AND rr.referrer_id = $1
    WHERE referred.referred_by_user_id = $1
    GROUP BY referred.id
    ORDER BY referred.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, limit, offset]
  );

  const rewardsRes = await pool.query(
    `
    SELECT
      rr.*,
      referred.firstname AS referred_firstname,
      referred.lastname AS referred_lastname,
      referred.email AS referred_email
    FROM referral_rewards rr
    JOIN users referred ON referred.id = rr.referred_user_id
    WHERE rr.referrer_id = $1
    ORDER BY rr.created_at DESC
    `,
    [userId]
  );

  const payoutsRes = await pool.query(
    `
    SELECT *
    FROM referral_payout_requests
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );

  const referralCode = user.referral_code;
  const referralLink = `${frontendUrl()}/signup?ref=${encodeURIComponent(referralCode)}`;

  return {
    settings: {
      is_enabled: settings.is_enabled,
      bonus_percentage: settings.bonus_percentage
    },
    referral_code: referralCode,
    referral_link: referralLink,
    referral_count: Number(user.referral_count ?? totalReferred),
    stats: {
      total_referred: totalReferred,
      total_earned: Number(totalsRes.rows[0]?.total_earned ?? 0),
      available_balance: Number(totalsRes.rows[0]?.available_balance ?? 0),
      pending_payout_balance: Number(totalsRes.rows[0]?.pending_payout_balance ?? 0),
      paid_out_balance: Number(totalsRes.rows[0]?.paid_out_balance ?? 0)
    },
    referred_users: referredUsersRes.rows.map((friend) => ({
      id: friend.id,
      firstname: friend.firstname,
      lastname: friend.lastname,
      name: `${friend.firstname ?? ""} ${friend.lastname ?? ""}`.trim() || friend.email,
      email: friend.email,
      created_at: friend.created_at,
      total_purchase_amount: Number(friend.total_purchase_amount ?? 0),
      total_reward_amount: Number(friend.total_reward_amount ?? 0),
      available_reward_amount: Number(friend.available_reward_amount ?? 0),
      reward_count: Number(friend.reward_count ?? 0)
    })),
    referred_users_pagination: {
      limit,
      offset,
      total: totalReferred,
      has_more: offset + referredUsersRes.rows.length < totalReferred
    },
    rewards: rewardsRes.rows,
    payout_requests: payoutsRes.rows
  };
};

export const requestReferralPayout = async (
  userId: string,
  input: {
    account_name?: string;
    account_number?: string;
    bank_name?: string;
  }
) => {
  await ensureReferralSchema();

  const accountName = input.account_name?.trim();
  const accountNumber = input.account_number?.trim();
  const bankName = input.bank_name?.trim();

  if (!accountName || !accountNumber || !bankName) {
    throw new Error("account_name, account_number and bank_name are required");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userRes = await client.query(
      `SELECT id, firstname, lastname, email FROM users WHERE id = $1`,
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) throw new Error("User not found");

    const rewardsRes = await client.query(
      `
      SELECT id, reward_amount
      FROM referral_rewards
      WHERE referrer_id = $1
        AND status = 'AVAILABLE'
      FOR UPDATE
      `,
      [userId]
    );

    const amount = roundMoney(
      rewardsRes.rows.reduce((sum, reward) => sum + Number(reward.reward_amount), 0)
    );

    if (amount <= 0) {
      throw new Error("No available referral balance to withdraw");
    }

    const payoutRes = await client.query(
      `
      INSERT INTO referral_payout_requests
        (user_id, amount, account_name, account_number, bank_name, status)
      VALUES ($1, $2, $3, $4, $5, 'PENDING')
      RETURNING *
      `,
      [userId, amount, accountName, accountNumber, bankName]
    );

    const payout = payoutRes.rows[0];

    await client.query(
      `
      UPDATE referral_rewards
      SET status = 'REQUESTED',
          payout_request_id = $1,
          updated_at = NOW()
      WHERE id = ANY($2::UUID[])
      `,
      [payout.id, rewardsRes.rows.map((reward) => reward.id)]
    );

    await client.query("COMMIT");

    await createNotification({
      targetType: "USER",
      userId,
      title: "Referral payout requested",
      message: `Your referral payout request for NGN ${amount.toLocaleString("en-NG")} has been submitted.`,
      type: "REFERRAL_PAYOUT_REQUESTED",
      metadata: { payout_request_id: payout.id, amount }
    });

    await createNotification({
      targetType: "ADMIN",
      title: "Referral payout request",
      message: `${user.firstname ?? "A user"} requested a referral payout of NGN ${amount.toLocaleString("en-NG")}.`,
      type: "REFERRAL_PAYOUT_REQUESTED",
      metadata: { payout_request_id: payout.id, user_id: userId, amount }
    });

    await sendOptionalEmail(
      userId,
      user.email,
      "Referral Payout Request Received",
      referralPayoutRequestedTemplate(user.firstname ?? "there", amount, bankName, accountName, accountNumber),
      EmailType.REFERRAL_PAYOUT_REQUESTED
    );

    await sendOptionalEmail(
      null,
      process.env.ADMIN_NOTIFICATION_EMAIL,
      "Referral Payout Request",
      referralPayoutRequestedAdminTemplate(
        `${user.firstname ?? ""} ${user.lastname ?? ""}`.trim() || user.email,
        user.email,
        amount,
        bankName,
        accountName,
        accountNumber
      ),
      EmailType.REFERRAL_PAYOUT_REQUESTED
    );

    return payout;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getReferralPayoutRequests = async (status?: string) => {
  await ensureReferralSchema();

  const normalizedStatus = status?.trim().toUpperCase();
  const values: unknown[] = [];
  const where = normalizedStatus && ["PENDING", "APPROVED"].includes(normalizedStatus)
    ? (values.push(normalizedStatus), "WHERE rpr.status = $1")
    : "";

  const result = await pool.query(
    `
    SELECT
      rpr.*,
      u.firstname,
      u.lastname,
      u.email
    FROM referral_payout_requests rpr
    JOIN users u ON u.id = rpr.user_id
    ${where}
    ORDER BY rpr.created_at DESC
    `,
    values
  );

  return result.rows;
};

export const approveReferralPayout = async (payoutRequestId: string, adminId?: string | null) => {
  await ensureReferralSchema();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const payoutRes = await client.query(
      `
      SELECT rpr.*, u.email, u.firstname
      FROM referral_payout_requests rpr
      JOIN users u ON u.id = rpr.user_id
      WHERE rpr.id = $1
      FOR UPDATE
      `,
      [payoutRequestId]
    );

    const payout = payoutRes.rows[0];
    if (!payout) throw new Error("Payout request not found");
    if (payout.status === "APPROVED") throw new Error("Payout request already approved");

    const updatedRes = await client.query(
      `
      UPDATE referral_payout_requests
      SET status = 'APPROVED',
          admin_id = $2,
          approved_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [payoutRequestId, adminId ?? null]
    );

    await client.query(
      `
      UPDATE referral_rewards
      SET status = 'PAID',
          updated_at = NOW()
      WHERE payout_request_id = $1
      `,
      [payoutRequestId]
    );

    await client.query("COMMIT");

    const updated = updatedRes.rows[0];
    const amount = Number(updated.amount);

    await createNotification({
      targetType: "USER",
      userId: updated.user_id,
      title: "Referral payout approved",
      message: `Your referral payout of NGN ${amount.toLocaleString("en-NG")} has been approved.`,
      type: "REFERRAL_PAYOUT_APPROVED",
      metadata: { payout_request_id: updated.id, amount }
    });

    await sendOptionalEmail(
      updated.user_id,
      payout.email,
      "Referral Payout Approved",
      referralPayoutApprovedTemplate(payout.firstname ?? "there", amount),
      EmailType.REFERRAL_PAYOUT_APPROVED
    );

    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getReferralRewardsForAdmin = async () => {
  await ensureReferralSchema();

  const result = await pool.query(`
    SELECT
      rr.*,
      referrer.firstname AS referrer_firstname,
      referrer.lastname AS referrer_lastname,
      referrer.email AS referrer_email,
      referred.firstname AS referred_firstname,
      referred.lastname AS referred_lastname,
      referred.email AS referred_email
    FROM referral_rewards rr
    JOIN users referrer ON referrer.id = rr.referrer_id
    JOIN users referred ON referred.id = rr.referred_user_id
    ORDER BY rr.created_at DESC
  `);

  return result.rows;
};
