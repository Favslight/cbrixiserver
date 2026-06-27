// src/modules/payments/payment.service.ts
import { pool } from "../../config/db";
import { sendEmail } from "../email/email.service";
import { invoiceTemplate, paymentSuccessTemplate } from "../email/email.templates";
import { EmailType } from "../email/email.types";
import { generateInvoiceNumber } from "./invoice.service";
import { initializePaystackPayment, verifyPaystackPayment } from "./paystack.service";

export const initiatePaystackPayment = async (
  user: any,
  orderId: string,
  installmentId: string | null,
  amount?: number
) => {

  const reference = await generateInvoiceNumber();
  const payableAmount = await resolvePayableAmount(user.id, orderId, installmentId, amount);

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
    payableAmount,
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
    payableAmount,
    reference
  );

  return {
    payment_link: payment.authorization_url,
    reference,
    amount: payableAmount
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

  if (!txn) {
    throw new Error("Transaction not found");
  }

  if (txn.status === "SUCCESS") {
    return true;
  }

  await pool.query(`
  UPDATE payment_transactions
  SET status='SUCCESS'
  WHERE id=$1
  `,[txn.id]);

  await applyPayment(txn);
  await sendPaymentSuccessNotification(txn);

  return true;
};

export const initiateManualTransfer = async (
  user: any,
  orderId: string,
  installmentId: string | null,
  amount?: number
) => {

  const reference = await generateInvoiceNumber();
  const payableAmount = await resolvePayableAmount(user.id, orderId, installmentId, amount);

  await pool.query(`
  INSERT INTO payment_transactions
  (order_id, installment_id, user_id, amount, payment_method, reference, status)
  VALUES ($1,$2,$3,$4,$5,$6,$7)
  `,
  [
    orderId,
    installmentId,
    user.id,
    payableAmount,
    "BANK_TRANSFER",
    reference,
    "PENDING"
  ]);

  const userRes = await pool.query(
    `SELECT id, email, firstname FROM users WHERE id = $1`,
    [user.id]
  );
  const currentUser = userRes.rows[0];

  if (!currentUser?.email) {
    throw new Error("User email not found");
  }

  await sendEmail(
  currentUser.id,
  orderId,
  installmentId,
  currentUser.email,
  "Bank Transfer Invoice",
  invoiceTemplate(currentUser.firstname ?? "Customer", reference, payableAmount),
  EmailType.BANK_TRANSFER_INVOICE
);

  return {
    reference,
    bank_name: process.env.BANK_NAME,
    account_name: process.env.BANK_ACCOUNT_NAME,
    account_number: process.env.BANK_ACCOUNT_NUMBER,
    amount: payableAmount
  };

  
};

export const applyPayment = async (txn: any) => {

  if (txn.installment_id) {

    await pool.query(`
    UPDATE installments
    SET status='PAID',
        paid_at=NOW()
    WHERE id=$1
    `,[txn.installment_id]);

  }

  await pool.query(`
  UPDATE orders o
  SET remaining_balance = GREATEST(o.total_amount - paid.total_paid, 0),
      status = CASE
        WHEN GREATEST(o.total_amount - paid.total_paid, 0) <= 0 THEN 'PAID'
        ELSE 'PARTIALLY_PAID'
      END,
      updated_at = NOW()
  FROM (
    SELECT COALESCE(SUM(amount), 0) AS total_paid
    FROM payment_transactions
    WHERE order_id=$1 AND status='SUCCESS'
  ) paid
  WHERE o.id=$1
  `,[txn.order_id]);
};

const resolvePayableAmount = async (
  userId: string,
  orderId: string,
  installmentId: string | null,
  requestedAmount?: number
) => {
  const orderRes = await pool.query(
    `
    SELECT *
    FROM orders
    WHERE id=$1 AND user_id=$2
    `,
    [orderId, userId]
  );

  const order = orderRes.rows[0];

  if (!order) throw new Error("Order not found");

  if (order.status === "AWAITING_APPROVAL") {
    throw new Error("Your installment request is pending admin approval");
  }

  if (order.status === "REJECTED") {
    throw new Error("This order was rejected and cannot be paid");
  }

  const paidRes = await pool.query(
    `
    SELECT COALESCE(SUM(amount), 0) AS paid_amount
    FROM payment_transactions
    WHERE order_id=$1 AND status='SUCCESS'
    `,
    [orderId]
  );

  const paidAmount = Number(paidRes.rows[0]?.paid_amount ?? 0);
  const remainingBalance = Math.max(Number(order.total_amount) - paidAmount, 0);

  if (remainingBalance <= 0 || order.status === "PAID") {
    throw new Error("This order has already been paid");
  }

  if (installmentId) {
    const installmentRes = await pool.query(
      `
      SELECT *
      FROM installments
      WHERE id=$1 AND order_id=$2
      `,
      [installmentId, orderId]
    );

    const installment = installmentRes.rows[0];

    if (!installment) throw new Error("Installment not found for this order");
    if (installment.status === "PAID") throw new Error("This installment has already been paid");

    return Math.min(Number(installment.amount), remainingBalance);
  }

  if (order.payment_mode === "INSTALLMENT") {
    const depositAmount = Number(order.deposit_amount ?? 0);
    const depositRemaining = Math.max(depositAmount - paidAmount, 0);

    if (depositRemaining > 0) {
      return Math.min(depositRemaining, remainingBalance);
    }
  }

  const sanitizedRequestedAmount = Number(requestedAmount ?? remainingBalance);

  if (!Number.isFinite(sanitizedRequestedAmount) || sanitizedRequestedAmount <= 0) {
    throw new Error("Invalid payment amount");
  }

  return Math.min(sanitizedRequestedAmount, remainingBalance);
};

export const sendPaymentSuccessNotification = async (txn: any) => {
  const userRes = await pool.query(
    `SELECT id, email, firstname FROM users WHERE id=$1`,
    [txn.user_id]
  );

  const user = userRes.rows[0];

  if (!user?.email) return;

  await sendEmail(
    txn.user_id,
    txn.order_id,
    txn.installment_id,
    user.email,
    "Payment Successful",
    paymentSuccessTemplate(user.firstname ?? "Customer", Number(txn.amount)),
    EmailType.PAYMENT_SUCCESS
  );
};
