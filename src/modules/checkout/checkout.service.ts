// src/modules/checkout/checkout.service.ts
import { pool } from "../../config/db";
import { getCart } from "../cart/cart.service";
import { sendEmail } from "../email/email.service";
import { orderCreatedTemplate } from "../email/email.templates";
import { EmailType } from "../email/email.types";

import axios from "axios";

/*const KNOWRIST_API = "https://api.knowrist.com/wallet";

export const fetchWalletBalance = async (externalUserId: string, token: string) => {
  const res = await axios.get(`${KNOWRIST_API}?user_id=${externalUserId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};*/

export const createOrderFromCart = async (
  user: any,
  paymentMode: "FULL" | "INSTALLMENT",
  externalEmail: string | null
) => {
  const cartItems = await getCart(user.id);
  if (!cartItems.length) throw new Error("Cart is empty");

  if (paymentMode === "INSTALLMENT" && !externalEmail) {
  throw new Error("External email is required for installment");
}

  let totalAmount = 0;
  cartItems.forEach(item => totalAmount += Number(item.price) * item.quantity);

  let depositAmount = paymentMode === "INSTALLMENT" ? totalAmount * 0.5 : totalAmount;
  let remainingBalance = totalAmount - depositAmount;

  const status = paymentMode === "INSTALLMENT"
  ? "AWAITING_APPROVAL"
  : "PENDING";

  // Create order
  const orderRes = await pool.query(`
    INSERT INTO orders (user_id, total_amount, deposit_amount, remaining_balance, payment_mode, status, external_email)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [user.id, totalAmount, depositAmount, remainingBalance, paymentMode, status, externalEmail]);

  const order = orderRes.rows[0];

  // Create order items
  for (const item of cartItems) {
    await pool.query(`
      INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
      VALUES ($1,$2,$3,$4)
    `, [order.id, item.product_id, item.quantity, item.price]);

    // Only create installments if payment mode is INSTALLMENT
    if (paymentMode === "INSTALLMENT") {
      const months = item.installment_duration_months || 1; // fallback to 1 month if not set
      const installmentAmount = (item.price * item.quantity) / months;

      for (let i = 1; i <= months; i++) {
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + i);

        await pool.query(`
          INSERT INTO installments (order_id, installment_number, amount, due_date)
          VALUES ($1,$2,$3,$4)
        `, [order.id, i, installmentAmount, dueDate]);
      }
    }
  }

  await sendEmail(
  user.id,
  order.id,
  null,
  user.email,
  "Order Created",
  orderCreatedTemplate(user.firstname, order.total_amount),
  EmailType.ORDER_CREATED
);

  const cartItemIds = cartItems.map(item => item.cart_item_id);
  await pool.query(
    `UPDATE cart_items SET status='PENDING_CHECKOUT' WHERE id IN (${cartItemIds.map((_, i) => `$${i + 1}`).join(",")})`,
    cartItemIds
  )

  return {order, cartItems};
};