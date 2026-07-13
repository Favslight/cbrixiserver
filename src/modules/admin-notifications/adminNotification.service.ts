import { pool } from "../../config/db";
import { sendEmail } from "../email/email.service";
import {
  staffNewOrderTemplate,
  staffPaymentReceivedTemplate,
  staffPendingPaymentTemplate
} from "../email/email.templates";
import { EmailType } from "../email/email.types";

let ensureSchemaPromise: Promise<void> | null = null;

export const ensureAdminNotificationSchema = async () => {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS admin_notification_emails (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        label VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        added_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_admin_notification_emails_active
      ON admin_notification_emails(is_active)
      WHERE is_active = TRUE;
    `).then(async () => {
      const envEmail = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
      if (!envEmail) return;

      await pool.query(
        `
        INSERT INTO admin_notification_emails (email, label, is_active)
        VALUES ($1, 'Default admin', TRUE)
        ON CONFLICT (email) DO NOTHING
        `,
        [envEmail.toLowerCase()]
      );
    }).then(() => undefined);
  }

  await ensureSchemaPromise;
};

export const getAdminNotificationEmails = async () => {
  await ensureAdminNotificationSchema();

  const result = await pool.query(
    `
    SELECT id, email, label, is_active, added_by, created_at, updated_at
    FROM admin_notification_emails
    ORDER BY created_at ASC
    `
  );

  return result.rows;
};

export const addAdminNotificationEmail = async (
  email: string,
  label?: string | null,
  addedBy?: string | null
) => {
  await ensureAdminNotificationSchema();

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Email is required");

  const result = await pool.query(
    `
    INSERT INTO admin_notification_emails (email, label, added_by, is_active)
    VALUES ($1, $2, $3, TRUE)
    ON CONFLICT (email) DO UPDATE
    SET label = COALESCE(EXCLUDED.label, admin_notification_emails.label),
        is_active = TRUE,
        updated_at = NOW()
    RETURNING *
    `,
    [normalizedEmail, label?.trim() || null, addedBy ?? null]
  );

  return result.rows[0];
};

export const removeAdminNotificationEmail = async (id: string) => {
  await ensureAdminNotificationSchema();

  const result = await pool.query(
    `DELETE FROM admin_notification_emails WHERE id = $1 RETURNING *`,
    [id]
  );

  if (!result.rows[0]) throw new Error("Notification email not found");
  return result.rows[0];
};

const getActiveStaffEmails = async () => {
  await ensureAdminNotificationSchema();

  const result = await pool.query(
    `
    SELECT email
    FROM admin_notification_emails
    WHERE is_active = TRUE
    ORDER BY created_at ASC
    `
  );

  return result.rows.map((row) => row.email as string);
};

const notifyStaff = async (
  subject: string,
  html: string,
  emailType: EmailType
) => {
  const emails = await getActiveStaffEmails();
  if (!emails.length) return;

  await Promise.all(
    emails.map(async (email) => {
      try {
        await sendEmail(null, null, null, email, subject, html, emailType);
      } catch (error) {
        console.error(`Staff notification email failed for ${email}`, error);
      }
    })
  );
};

export const notifyStaffOfNewOrder = async (input: {
  orderId: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  totalAmount: number;
  depositAmount: number;
  remainingAmount: number;
  paymentMode: string;
  status: string;
}) => {
  await notifyStaff(
    "New order placed on CBRIXI",
    staffNewOrderTemplate(input),
    EmailType.STAFF_NEW_ORDER
  );
};

export const notifyStaffOfPayment = async (input: {
  orderId: string;
  transactionId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  paymentMethod: string;
  status: string;
}) => {
  const subject = input.status === "PENDING"
    ? "Pending payment awaiting review"
    : "Payment received on CBRIXI";

  const html = input.status === "PENDING"
    ? staffPendingPaymentTemplate(input)
    : staffPaymentReceivedTemplate(input);

  await notifyStaff(
    subject,
    html,
    input.status === "PENDING" ? EmailType.STAFF_PENDING_PAYMENT : EmailType.STAFF_PAYMENT_RECEIVED
  );
};
