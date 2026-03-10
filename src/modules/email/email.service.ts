import { Resend } from "resend";
import { pool } from "../../config/db";
import { EmailType } from "./email.types";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (
  userId: string,
  orderId: string | null,
  installmentId: string | null,
  email: string,
  subject: string,
  html: string,
  emailType: EmailType
) => {

  const response = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: email,
    subject,
    html
  });

  // log successful email only
  if (response) {

    await pool.query(`
      INSERT INTO email_logs
      (user_id, order_id, installment_id, email_type)
      VALUES ($1,$2,$3,$4)
    `,
    [
      userId,
      orderId,
      installmentId,
      emailType
    ]);

  }

};