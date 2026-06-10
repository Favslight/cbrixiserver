import { FastifyReply, FastifyRequest } from "fastify";
import { adminLoginService } from "./admin.service";
import { pool } from "../../config/db";

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
    const usersRes = await pool.query(`SELECT id, firstname, lastname, email, status, created_at FROM users ORDER BY created_at DESC`);
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
        const totalAmount = Number(order.total_amount);
        const remainingBalance = Number(order.remaining_balance ?? 0);
        const depositAmount = Number(order.deposit_amount ?? 0);
        const paidAmount = Math.max(totalAmount - remainingBalance, 0);
        const nextInstallment = installments.find((installment) => installment.status === "PENDING") ?? null;
        const depositRemaining = Math.max(depositAmount - paidAmount, 0);
        const isAwaitingApproval = order.status === "AWAITING_APPROVAL";
        const isRejected = order.status === "REJECTED";
        const isPaid = remainingBalance <= 0 || order.status === "PAID";

        detailedOrders.push({
          ...order,
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
          order_items: orderItems,
          installments
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
