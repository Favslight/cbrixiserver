// src/modules/payments/paystack.webhook.service.ts
import crypto from "crypto";
import { pool } from "../../config/db";
import { applyPayment, sendPaymentSuccessNotification } from "./payment.service";
import { recordReferralRewardForTransaction } from "../referrals/referral.service";

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

    await pool.query(
      `UPDATE payment_transactions
       SET status='SUCCESS'
       WHERE id=$1`,
      [txn.id]
    );

    await applyPayment(txn);
    await sendPaymentSuccessNotification(txn);
    await recordReferralRewardForTransaction(txn.id);
  }
};
