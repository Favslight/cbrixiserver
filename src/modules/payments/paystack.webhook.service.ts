// src/modules/payments/paystack.webhook.service.ts
import crypto from "crypto";
import { pool } from "../../config/db";
import { applyPayment } from "./payment.service";
import { EmailType } from "../email/email.types";
import { paymentSuccessTemplate } from "../email/email.templates";
import { sendEmail } from "../email/email.service";

export const handlePaystackWebhook = async (
  signature: string,
  body: any
) => {

  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(JSON.stringify(body))
    .digest("hex");

  if (hash !== signature) {
    throw new Error("Invalid Paystack signature");
  }

  const event = body.event;

  if (event === "charge.success") {

    const reference = body.data.reference;

    const txnRes = await pool.query(
      `SELECT * FROM payment_transactions WHERE reference=$1`,
      [reference]
    );

    const txn = txnRes.rows[0];

    if (!txn) return;

    // prevent duplicate processing
    if (txn.status === "SUCCESS") return;

    const userRes = await pool.query(
  `SELECT id, email, name FROM users WHERE id=$1`,
  [txn.user_id]
);

const user = userRes.rows[0];

    await pool.query(
      `UPDATE payment_transactions
       SET status='SUCCESS'
       WHERE id=$1`,
      [txn.id]
    );

    await applyPayment(txn);

    await sendEmail(
  txn.user_id,
  txn.order_id,
  txn.installment_id,
  user.email,
  "Payment Successful",
  paymentSuccessTemplate(user.name, txn.amount),
  EmailType.PAYMENT_SUCCESS
);
  }
};