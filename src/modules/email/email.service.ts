import { Resend } from "resend";
import { pool } from "../../config/db";
import { EmailType } from "./email.types";

const getResendApiKey = () => {
  const apiKey = process.env.RESEND_API_KEY ?? process.env.RESEND_APIKEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  return apiKey;
};

const getEmailFrom = () => {
  const from = process.env.EMAIL_FROM ?? process.env.RESEND_FROM_EMAIL;

  if (!from) {
    throw new Error("EMAIL_FROM is not configured");
  }

  return from;
};

const resend = new Resend(getResendApiKey());

export const sendEmail = async (
  userId: string | null,
  orderId: string | null,
  installmentId: string | null,
  email: string,
  subject: string,
  html: string,
  emailType: EmailType
) => {

  const response = await resend.emails.send({
    from: getEmailFrom(),
    to: email,
    subject,
    html: html.replace(/\n/g, "<br />")
  });

  if (response.error) {
    console.error("Resend email failed", {
      emailType,
      to: email,
      subject,
      error: response.error
    });

    throw new Error(
      `Email failed to send: ${response.error.message ?? "Unknown Resend error"}`
    );
  }

  if (!response.data?.id) {
    console.error("Resend email returned no message id", {
      emailType,
      to: email,
      subject,
      response
    });

    throw new Error("Email failed to send: Resend returned no message id");
  }

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

  return response.data;

};
