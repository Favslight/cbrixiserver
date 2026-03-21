import { FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../../config/db";
import { applyPayment } from "../payments/payment.service";
import { sendEmail } from "../email/email.service";
import { orderApprovedTemplate, orderRejectedTemplate } from "../email/email.templates";
import { EmailType } from "../email/email.types";

export const getPendingPayments = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const result = await pool.query(`
  SELECT pt.*, u.firstname, u.lastname
  FROM payment_transactions pt
  JOIN users u ON u.id = pt.user_id
  WHERE pt.status='PENDING'
  AND pt.payment_method='BANK_TRANSFER'
  ORDER BY pt.created_at DESC
  `);

  return reply.send(result.rows);
};

export const getPendingOrders = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const result = await pool.query(`
  SELECT * FROM orders
  WHERE status = 'AWAITING_APPROVAL'
  ORDER BY created_at DESC
  `);

  return reply.send(result.rows);
};

export const approveOrder = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const { id } = req.params as any;

  const orderRes = await pool.query(`
  SELECT * FROM orders WHERE id=$1
  `,[id]);

  const order = orderRes.rows[0];

  if (!order) throw new Error("Order not found");

  await pool.query(`
  UPDATE orders
  SET status='PENDING'
  WHERE id=$1
  `,[id]);

  const userRes = await pool.query(
    `SELECT email, firstname FROM users WHERE id = $1`,
    [order.user_id]
  );

  const user = userRes.rows[0];

  await sendEmail(
    user.id,
    order.id,
    null,
    user.email,
    "Order Approved",
    orderApprovedTemplate(user.firstname, order.total_amount),
    EmailType.ORDER_APPROVED
  );

  return reply.send({ success:true });
};

export const rejectOrder = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const { id } = req.params as any;

  const orderRes = await pool.query(`
  SELECT * FROM orders WHERE id=$1
  `,[id]);

  const order = orderRes.rows[0];

  if (!order) throw new Error("Order not found");

  await pool.query(`
  UPDATE orders
  SET status='REJECTED'
  WHERE id=$1
  `,[id]);

  const userRes = await pool.query(
    `SELECT email, firstname FROM users WHERE id = $1`,
    [order.user_id]
  );

  const user = userRes.rows[0];

  await sendEmail(
    user.id,
    order.id,
    null,
    user.email,
    "Order Rejected",
    orderRejectedTemplate(user.firstname),
    EmailType.ORDER_REJECTED
  );

  return reply.send({ success:true });
};

export const approvePayment = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const { id } = req.params as any;

  const txnRes = await pool.query(`
  SELECT * FROM payment_transactions WHERE id=$1
  `,[id]);

  const txn = txnRes.rows[0];

  if (!txn) throw new Error("Transaction not found");

  await pool.query(`
  UPDATE payment_transactions
  SET status='SUCCESS'
  WHERE id=$1
  `,[id]);

  await applyPayment(txn);

  return reply.send({ success:true });
};