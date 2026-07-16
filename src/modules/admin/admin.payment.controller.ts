import { FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../../config/db";
import { applyPayment, sendPaymentSuccessNotification } from "../payments/payment.service";
import { sendEmail } from "../email/email.service";
import { orderApprovedTemplate, orderRejectedTemplate } from "../email/email.templates";
import { EmailType } from "../email/email.types";
import { ensureReferralSchema, recordReferralRewardForTransaction } from "../referrals/referral.service";
import {
  ensureCbrillianceVerificationColumns,
  markUserCbrillianceEmailVerified,
  normalizeCbrillianceEmail
} from "../users/cbrillianceVerification.service";
import {
  getAdminOrderItems,
  getOrderItemSummary,
  withAdminOrderItemDetailsList,
  withAdminUserDisplayFields
} from "./admin.orderDetails";

const paymentListQuery = `
  SELECT
    pt.*,
    u.firstname,
    u.lastname,
    u.email,
    o.payment_mode,
    o.total_amount,
    o.deposit_amount,
    COALESCE(success_payments.paid_amount, 0) AS paid_amount,
    GREATEST(o.total_amount - COALESCE(success_payments.paid_amount, 0), 0) AS remaining_balance,
    o.status AS order_status,
    o.external_email,
    i.installment_number,
    i.due_date AS installment_due_date,
    i.status AS installment_status,
    CASE
      WHEN o.payment_mode = 'INSTALLMENT' AND pt.installment_id IS NULL THEN 'INSTALLMENT_DEPOSIT'
      WHEN pt.installment_id IS NOT NULL THEN 'INSTALLMENT_PAYMENT'
      ELSE 'ORDER_PAYMENT'
    END AS payment_type,
    CASE
      WHEN o.payment_mode = 'INSTALLMENT' AND pt.installment_id IS NULL THEN 'First deposit'
      WHEN pt.installment_id IS NOT NULL THEN CONCAT('Installment ', i.installment_number)
      ELSE 'Full payment'
    END AS payment_label
  FROM payment_transactions pt
  JOIN users u ON u.id = pt.user_id
  JOIN orders o ON o.id = pt.order_id
  LEFT JOIN installments i ON i.id = pt.installment_id
  LEFT JOIN (
    SELECT order_id, SUM(amount) AS paid_amount
    FROM payment_transactions
    WHERE status = 'SUCCESS'
    GROUP BY order_id
  ) success_payments ON success_payments.order_id = o.id
  WHERE pt.status = $1
`;

const orderListQuery = `
  SELECT
    o.*,
    u.firstname,
    u.lastname,
    u.email AS user_email,
    u.cbrilliance_email,
    u.cbrilliance_email_verified,
    u.cbrilliance_email_verified_at,
    verified_user.id AS verified_user_id,
    verified_user.firstname AS verified_firstname,
    verified_user.lastname AS verified_lastname,
    verified_user.email AS verified_email,
    (verified_user.id IS NOT NULL) AS external_email_exists
  FROM orders o
  JOIN users u ON u.id = o.user_id
  LEFT JOIN users verified_user ON LOWER(verified_user.email) = LOWER(o.external_email)
`;

const sendPaymentsByStatus = async (
  reply: FastifyReply,
  status: "PENDING" | "SUCCESS" | "FAILED",
  bankTransferOnly = false
) => {
  const result = await pool.query(
    `
    ${paymentListQuery}
    ${bankTransferOnly ? "AND pt.payment_method = 'BANK_TRANSFER'" : ""}
    ORDER BY pt.created_at DESC
    `,
    [status]
  );

  const payments = await Promise.all(
    result.rows.map(async (payment) => {
      const orderItems = await getAdminOrderItems(payment.order_id);
      const orderSummary = getOrderItemSummary(orderItems);
      const paymentWithUser = withAdminUserDisplayFields(payment);

      return {
        ...paymentWithUser,
        ...orderSummary,
        order_items: orderItems,
        order: {
          id: payment.order_id,
          user_id: payment.user_id,
          payment_mode: payment.payment_mode,
          total_amount: payment.total_amount,
          deposit_amount: payment.deposit_amount,
          paid_amount: payment.paid_amount,
          remaining_balance: payment.remaining_balance,
          status: payment.order_status,
          external_email: payment.external_email,
          ...orderSummary,
          order_items: orderItems
        }
      };
    })
  );

  return reply.send(payments);
};

export const getPendingPayments = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  return sendPaymentsByStatus(reply, "PENDING", true);
};

export const getApprovedPayments = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  return sendPaymentsByStatus(reply, "SUCCESS");
};

export const getRejectedPayments = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  return sendPaymentsByStatus(reply, "FAILED");
};

export const getPendingOrders = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  await ensureCbrillianceVerificationColumns();

  const result = await pool.query(`
  ${orderListQuery}
  WHERE o.status = 'AWAITING_APPROVAL'
  ORDER BY o.created_at DESC
  `);

  const orders = await withAdminOrderItemDetailsList(
    result.rows.map((order) => withAdminUserDisplayFields(order))
  );

  return reply.send(orders);
};

export const getApprovedOrders = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  await ensureCbrillianceVerificationColumns();

  const result = await pool.query(`
  ${orderListQuery}
  WHERE o.payment_mode = 'INSTALLMENT'
  AND o.status IN ('PENDING', 'PARTIALLY_PAID', 'PAID')
  ORDER BY o.created_at DESC
  `);

  const orders = await withAdminOrderItemDetailsList(
    result.rows.map((order) => withAdminUserDisplayFields(order))
  );

  return reply.send(orders);
};

export const getRejectedOrders = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  await ensureCbrillianceVerificationColumns();

  const result = await pool.query(`
  ${orderListQuery}
  WHERE o.status = 'REJECTED'
  ORDER BY o.created_at DESC
  `);

  const orders = await withAdminOrderItemDetailsList(
    result.rows.map((order) => withAdminUserDisplayFields(order))
  );

  return reply.send(orders);
};

export const approveOrder = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  await ensureCbrillianceVerificationColumns();

  const { id } = req.params as any;

  const orderRes = await pool.query(`
  SELECT * FROM orders WHERE id=$1
  `,[id]);

  const order = orderRes.rows[0];

  if (!order) throw new Error("Order not found");

  if (order.payment_mode === "INSTALLMENT") {
    const normalizedExternalEmail = normalizeCbrillianceEmail(order.external_email);

    if (!normalizedExternalEmail) {
      throw new Error("Cannot approve installment order because no Cbrilliance email was submitted");
    }

    const verifiedEmailRes = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
      [normalizedExternalEmail]
    );

    if (!verifiedEmailRes.rows[0]) {
      throw new Error("Cannot approve installment order because the submitted Cbrilliance email does not exist");
    }

    await markUserCbrillianceEmailVerified(order.user_id, normalizedExternalEmail);
  }

  await pool.query(`
  UPDATE orders
  SET status='PENDING'
  WHERE id=$1
  `,[id]);

  const userRes = await pool.query(
    `SELECT id, email, firstname FROM users WHERE id = $1`,
    [order.user_id]
  );

  const user = userRes.rows[0];

  await sendEmail(
    user.id,
    order.id,
    null,
    user.email,
    "Order Approved",
    orderApprovedTemplate(user.firstname, Number(order.total_amount), Number(order.deposit_amount), order.external_email),
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
    `SELECT id, email, firstname FROM users WHERE id = $1`,
    [order.user_id]
  );

  const user = userRes.rows[0];

  await sendEmail(
    user.id,
    order.id,
    null,
    user.email,
    "Order Rejected",
    orderRejectedTemplate(user.firstname, order.external_email),
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
  await sendPaymentSuccessNotification(txn);
  await recordReferralRewardForTransaction(txn.id);

  return reply.send({ success:true });
};

export const rejectPayment = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const { id } = req.params as any;

  const txnRes = await pool.query(`
  SELECT * FROM payment_transactions WHERE id=$1
  `,[id]);

  const txn = txnRes.rows[0];

  if (!txn) throw new Error("Transaction not found");

  if (txn.status === "SUCCESS") {
    throw new Error("Approved payments cannot be rejected");
  }

  await pool.query(`
  UPDATE payment_transactions
  SET status='FAILED'
  WHERE id=$1
  `,[id]);

  return reply.send({ success:true });
};

export const deletePayment = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const { id } = req.params as { id: string };
  await ensureReferralSchema();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const txnRes = await client.query(
      `SELECT * FROM payment_transactions WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const txn = txnRes.rows[0];

    if (!txn) {
      await client.query("ROLLBACK");
      return reply.status(404).send({ success: false, message: "Payment not found" });
    }

    await client.query(
      `
      UPDATE referral_rewards
      SET payment_transaction_id = NULL,
          updated_at = NOW()
      WHERE payment_transaction_id = $1
      `,
      [id]
    );

    await client.query(
      `DELETE FROM payment_transactions WHERE id = $1`,
      [id]
    );

    if (txn.status === "SUCCESS" && txn.order_id) {
      await client.query(
        `
        UPDATE orders o
        SET remaining_balance = GREATEST(o.total_amount - paid.total_paid, 0),
            status = CASE
              WHEN GREATEST(o.total_amount - paid.total_paid, 0) <= 0 THEN 'PAID'
              WHEN paid.total_paid > 0 THEN 'PARTIALLY_PAID'
              WHEN o.status IN ('AWAITING_APPROVAL', 'REJECTED') THEN o.status
              ELSE 'PENDING'
            END,
            updated_at = NOW()
        FROM (
          SELECT COALESCE(SUM(amount), 0) AS total_paid
          FROM payment_transactions
          WHERE order_id = $1 AND status = 'SUCCESS'
        ) paid
        WHERE o.id = $1
        `,
        [txn.order_id]
      );
    }

    await client.query("COMMIT");

    return reply.send({
      success: true,
      deleted_id: id,
      order_id: txn.order_id
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    return reply.status(400).send({ success: false, message: error.message });
  } finally {
    client.release();
  }
};

export const deleteOrder = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const { id } = req.params as { id: string };
  await ensureReferralSchema();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const order = orderRes.rows[0];

    if (!order) {
      await client.query("ROLLBACK");
      return reply.status(404).send({ success: false, message: "Order not found" });
    }

    await client.query(
      `
      UPDATE referral_rewards
      SET order_id = NULL,
          payment_transaction_id = NULL,
          updated_at = NOW()
      WHERE order_id = $1
         OR payment_transaction_id IN (
           SELECT id FROM payment_transactions WHERE order_id = $1
         )
      `,
      [id]
    );

    await client.query(
      `DELETE FROM payment_transactions WHERE order_id = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM default_events WHERE order_id = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM email_logs WHERE order_id = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM orders WHERE id = $1`,
      [id]
    );

    await client.query("COMMIT");

    return reply.send({
      success: true,
      deleted_id: id
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    return reply.status(400).send({ success: false, message: error.message });
  } finally {
    client.release();
  }
};
