import { FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../../config/db";
import { applyPayment } from "../payments/payment.service";

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