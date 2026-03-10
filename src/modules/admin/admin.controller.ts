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
    const usersRes = await pool.query(`SELECT id, name, username, email, external_user_id, status, created_at FROM users ORDER BY created_at DESC`);
    const users = usersRes.rows;

    // Fetch orders, order items, installments for each user
    const usersWithDetails = [];

    for (const user of users) {
      const ordersRes = await pool.query(
        `SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC`,
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

        detailedOrders.push({
          ...order,
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