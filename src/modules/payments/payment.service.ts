// src/modules/payments/payment.service.ts
import { pool } from "../../config/db";
import { sendEmail } from "../email/email.service";
import { invoiceTemplate } from "../email/email.templates";
import { EmailType } from "../email/email.types";
import { generateInvoiceNumber } from "./invoice.service";
import { initializePaystackPayment, verifyPaystackPayment } from "./paystack.service";

export const initiatePaystackPayment = async (
  user: any,
  orderId: string,
  installmentId: string | null,
  amount: number
) => {

  const reference = await generateInvoiceNumber();

  const txn = await pool.query(`
  INSERT INTO payment_transactions
  (order_id, installment_id, user_id, amount, payment_method, reference, status)
  VALUES ($1,$2,$3,$4,$5,$6,$7)
  RETURNING *
  `,
  [
    orderId,
    installmentId,
    user.id,
    amount,
    "PAYSTACK",
    reference,
    "PENDING"
  ]);

  const userRes = await pool.query(
    `SELECT email FROM users WHERE id = $1`,
    [user.id]
  );
  
  const email = userRes.rows[0]?.email;
  
  if (!email) {
    throw new Error("User email not found");
  }

  const payment = await initializePaystackPayment(
    email,
    amount,
    reference
  );

  return {
    payment_link: payment.authorization_url,
    reference
  };
};

export const verifyPaystack = async (reference: string) => {

  const verification = await verifyPaystackPayment(reference);

  if (verification.status !== "success") {
    throw new Error("Payment not successful");
  }

  const txnRes = await pool.query(`
  SELECT * FROM payment_transactions WHERE reference=$1
  `,[reference]);

  const txn = txnRes.rows[0];

  await pool.query(`
  UPDATE payment_transactions
  SET status='SUCCESS'
  WHERE id=$1
  `,[txn.id]);

  await applyPayment(txn);

  return true;
};

export const initiateManualTransfer = async (
  user: any,
  orderId: string,
  installmentId: string | null,
  amount: number
) => {

  const reference = await generateInvoiceNumber();

  await pool.query(`
  INSERT INTO payment_transactions
  (order_id, installment_id, user_id, amount, payment_method, reference, status)
  VALUES ($1,$2,$3,$4,$5,$6,$7)
  `,
  [
    orderId,
    installmentId,
    user.id,
    amount,
    "BANK_TRANSFER",
    reference,
    "PENDING"
  ]);

  await sendEmail(
  user.id,
  orderId,
  installmentId,
  user.email,
  "Bank Transfer Invoice",
  invoiceTemplate(user.name, reference, amount),
  EmailType.BANK_TRANSFER_INVOICE
);

  return {
    reference,
    bank_name: process.env.BANK_NAME,
    account_name: process.env.BANK_ACCOUNT_NAME,
    account_number: process.env.BANK_ACCOUNT_NUMBER,
    amount
  };

  
};

export const applyPayment = async (txn: any) => {

  if (txn.installment_id) {

    await pool.query(`
    UPDATE installments
    SET status='PAID'
    WHERE id=$1
    `,[txn.installment_id]);

  }

  await pool.query(`
  UPDATE orders
  SET remaining_balance = remaining_balance - $1
  WHERE id=$2
  `,[txn.amount, txn.order_id]);
};