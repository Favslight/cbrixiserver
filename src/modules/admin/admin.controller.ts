import { FastifyReply, FastifyRequest } from "fastify";
import { adminLoginService } from "./admin.service";
import { pool } from "../../config/db";
import { ensureCbrillianceVerificationColumns } from "../users/cbrillianceVerification.service";

interface AdminLoginBody {
  email: string;
  password: string;
}

export const adminLoginHandler = async (
  request: FastifyRequest<{ Body: AdminLoginBody }>,
  reply: FastifyReply
) => {
  const { email, password } = request.body;

  if (!email || !password) {
    return reply.status(400).send({
      message: "Email and password required"
    });
  }

  try {
    const result = await adminLoginService(email, password);
    return reply.send(result);
  } catch (err: any) {
    return reply.status(401).send({
      message: err.message
    });
  }
};

export const getAllUsersDetailsController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    await ensureCbrillianceVerificationColumns();

    const usersRes = await pool.query(`
      SELECT
        id,
        firstname,
        lastname,
        email,
        cbrilliance_email,
        cbrilliance_email_verified,
        cbrilliance_email_verified_at,
        status,
        created_at
      FROM users
      ORDER BY created_at DESC
    `);
    const users = usersRes.rows;

    // Fetch orders, order items, installments for each user
    const usersWithDetails = [];

    for (const user of users) {
      const ordersRes = await pool.query(
        `
        SELECT
          orders.*,
          verified_user.id AS verified_user_id,
          (verified_user.id IS NOT NULL) AS external_email_exists
        FROM orders
        LEFT JOIN users verified_user ON LOWER(verified_user.email) = LOWER(orders.external_email)
        WHERE orders.user_id=$1
        ORDER BY orders.created_at DESC
        `,
        [user.id]
      );
      const orders = ordersRes.rows;

      const detailedOrders = [];
      for (const order of orders) {
        const itemsRes = await pool.query(
          `SELECT order_items.*, products.name, products.price, products.installment_duration_months
           FROM order_items
           JOIN products ON products.id = order_items.product_id
           WHERE order_items.order_id=$1`,
          [order.id]
        );
        const orderItems = itemsRes.rows;

        const installmentsRes = await pool.query(
          `SELECT * FROM installments WHERE order_id=$1 ORDER BY installment_number ASC`,
          [order.id]
        );
        const installments = installmentsRes.rows;

        const transactionsRes = await pool.query(
          `
          SELECT
            pt.id,
            pt.installment_id,
            pt.amount,
            pt.payment_method,
            pt.reference,
            pt.status,
            pt.created_at,
            i.installment_number,
            CASE
              WHEN orders.payment_mode = 'INSTALLMENT' AND pt.installment_id IS NULL THEN 'INSTALLMENT_DEPOSIT'
              WHEN pt.installment_id IS NOT NULL THEN 'INSTALLMENT_PAYMENT'
              ELSE 'ORDER_PAYMENT'
            END AS payment_type,
            CASE
              WHEN orders.payment_mode = 'INSTALLMENT' AND pt.installment_id IS NULL THEN 'First deposit'
              WHEN pt.installment_id IS NOT NULL THEN CONCAT('Installment ', i.installment_number)
              ELSE 'Full payment'
            END AS payment_label
          FROM payment_transactions pt
          JOIN orders ON orders.id = pt.order_id
          LEFT JOIN installments i ON i.id = pt.installment_id
          WHERE pt.order_id = $1
          ORDER BY pt.created_at DESC
          `,
          [order.id]
        );

        const totalAmount = Number(order.total_amount);
        const depositAmount = Number(order.deposit_amount ?? 0);
        const paidAmount = transactionsRes.rows
          .filter((transaction) => transaction.status === "SUCCESS")
          .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
        const remainingBalance = Math.max(totalAmount - paidAmount, 0);
        const nextInstallment = installments.find((installment) => installment.status === "PENDING") ?? null;
        const depositRemaining = Math.max(depositAmount - paidAmount, 0);
        const isAwaitingApproval = order.status === "AWAITING_APPROVAL";
        const isRejected = order.status === "REJECTED";
        const isPaid = remainingBalance <= 0 || order.status === "PAID";
        const canPayDeposit = !isAwaitingApproval && !isRejected && !isPaid && order.payment_mode === "INSTALLMENT" && depositRemaining > 0;
        const canPayRemainingBalance = !isAwaitingApproval && !isRejected && !isPaid && remainingBalance > 0 && depositRemaining === 0;
        const depositTransactions = transactionsRes.rows.filter((transaction) => transaction.payment_type === "INSTALLMENT_DEPOSIT");
        const depositPaidAmount = depositTransactions
          .filter((transaction) => transaction.status === "SUCCESS")
          .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
        const depositPayment = order.payment_mode === "INSTALLMENT"
          ? {
              payment_type: "INSTALLMENT_DEPOSIT",
              payment_label: "First deposit",
              amount: depositAmount,
              paid_amount: Math.min(depositPaidAmount, depositAmount),
              remaining_amount: Math.max(depositAmount - depositPaidAmount, 0),
              status: isAwaitingApproval
                ? "AWAITING_ORDER_APPROVAL"
                : depositRemaining <= 0
                  ? "PAID"
                  : canPayDeposit
                    ? "PENDING"
                    : order.status,
              can_pay: canPayDeposit,
              transactions: depositTransactions
            }
          : null;
        const paymentSchedule = [
          ...(depositPayment ? [depositPayment] : []),
          ...installments.map((installment) => ({
            ...installment,
            payment_type: "INSTALLMENT_PAYMENT",
            payment_label: `Installment ${installment.installment_number}`,
            can_pay: canPayRemainingBalance && installment.status === "PENDING"
          }))
        ];

        detailedOrders.push({
          ...order,
          remaining_balance: remainingBalance,
          paid_amount: paidAmount,
          payment_progress_percentage: totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0,
          next_payment_amount: isAwaitingApproval || isRejected || isPaid
            ? 0
            : order.payment_mode === "INSTALLMENT" && depositRemaining > 0
              ? depositRemaining
              : nextInstallment
                ? Number(nextInstallment.amount)
                : remainingBalance,
          next_payment_due_date: nextInstallment?.due_date ?? null,
          can_pay: !isAwaitingApproval && !isRejected && !isPaid && remainingBalance > 0,
          can_pay_deposit: canPayDeposit,
          can_pay_remaining_balance: canPayRemainingBalance,
          order_items: orderItems,
          installments,
          payment_schedule: paymentSchedule,
          transactions: transactionsRes.rows
        });
      }

      usersWithDetails.push({
        ...user,
        orders: detailedOrders
      });
    }

    return reply.send({
      success: true,
      users: usersWithDetails
    });
  } catch (error: any) {
    console.error(error);
    return reply.status(500).send({ success: false, message: error.message });
  }
};
