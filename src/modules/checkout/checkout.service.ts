// src/modules/checkout/checkout.service.ts
import { pool } from "../../config/db";
import { clearCart, getCart } from "../cart/cart.service";
import { notifyStaffOfNewOrder } from "../admin-notifications/adminNotification.service";
import { sendEmail } from "../email/email.service";
import { orderCreatedTemplate } from "../email/email.templates";
import { EmailType } from "../email/email.types";
import {
  ensureCbrillianceVerificationColumns,
  normalizeCbrillianceEmail
} from "../users/cbrillianceVerification.service";

export const createOrderFromCart = async (
  user: any,
  paymentMode: "FULL" | "INSTALLMENT",
  externalEmail: string | null
) => {
  await ensureCbrillianceVerificationColumns();

  const userRes = await pool.query(
    `
    SELECT
      id,
      firstname,
      lastname,
      email,
      cbrilliance_email,
      cbrilliance_email_verified
    FROM users
    WHERE id=$1
    `,
    [user.id]
  );
  const currentUser = userRes.rows[0];

  if (!currentUser) throw new Error("User not found");

  const cartItems = await getCart(user.id);
  if (!cartItems.length) throw new Error("Cart is empty");

  if (!["FULL", "INSTALLMENT"].includes(paymentMode)) {
    throw new Error("Invalid payment mode");
  }

  const submittedExternalEmail = normalizeCbrillianceEmail(externalEmail);
  const verifiedCbrillianceEmail = currentUser.cbrilliance_email_verified
    ? normalizeCbrillianceEmail(currentUser.cbrilliance_email)
    : null;
  const normalizedExternalEmail = submittedExternalEmail ?? verifiedCbrillianceEmail;
  const isUsingVerifiedCbrillianceEmail = Boolean(
    paymentMode === "INSTALLMENT"
    && verifiedCbrillianceEmail
    && normalizedExternalEmail === verifiedCbrillianceEmail
  );

  if (paymentMode === "INSTALLMENT" && !normalizedExternalEmail) {
    throw new Error("Cbrilliance email is required for installment");
  }

  if (paymentMode === "INSTALLMENT") {
    const nonInstallmentItem = cartItems.find((item) => !item.installment_enabled);
    if (nonInstallmentItem) {
      throw new Error(`${nonInstallmentItem.name} is not available for installment payment`);
    }
  }

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + Number(item.effective_price ?? item.price) * item.quantity,
    0
  );

  const depositAmount = paymentMode === "INSTALLMENT"
    ? cartItems.reduce((sum, item) => {
        const lineTotal = Number(item.effective_price ?? item.price) * item.quantity;
        const depositPercentage = Number(item.minimum_deposit_percentage ?? 50);
        return sum + (lineTotal * depositPercentage) / 100;
      }, 0)
    : totalAmount;

  const installmentBalance = totalAmount - depositAmount;
  const remainingBalance = paymentMode === "INSTALLMENT" ? installmentBalance : 0;

  const status = paymentMode === "INSTALLMENT" && !isUsingVerifiedCbrillianceEmail
    ? "AWAITING_APPROVAL"
    : "PENDING";

  // Create order
  const orderRes = await pool.query(`
    INSERT INTO orders (user_id, total_amount, deposit_amount, remaining_balance, payment_mode, status, external_email)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [currentUser.id, totalAmount, depositAmount, remainingBalance, paymentMode, status, normalizedExternalEmail]);

  const order = orderRes.rows[0];

  // Create order items
  for (const item of cartItems) {
    await pool.query(`
      INSERT INTO order_items (
        order_id,
        product_id,
        variant_id,
        quantity,
        price_at_purchase,
        product_name_snapshot,
        variant_name_snapshot,
        variant_specs_snapshot
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::JSONB)
    `, [
      order.id,
      item.product_id,
      item.variant_id,
      item.quantity,
      item.effective_price ?? item.price,
      item.name,
      item.variant_name,
      JSON.stringify(item.variant_specs ?? {})
    ]);
  }

  if (paymentMode === "INSTALLMENT" && installmentBalance > 0) {
    const months = Math.max(
      ...cartItems.map((item) => Number(item.installment_duration_months || 1))
    );
    const installmentAmount = installmentBalance / months;

    for (let i = 1; i <= months; i++) {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + i);

      await pool.query(`
        INSERT INTO installments (order_id, installment_number, amount, due_date)
        VALUES ($1,$2,$3,$4)
      `, [order.id, i, installmentAmount, dueDate]);
    }
  }

  await sendEmail(
  currentUser.id,
  order.id,
  null,
  currentUser.email,
  "Order Created",
  orderCreatedTemplate(
    currentUser.firstname,
    Number(order.total_amount),
    order.payment_mode,
    Number(order.deposit_amount ?? 0),
    order.status === "AWAITING_APPROVAL"
  ),
  EmailType.ORDER_CREATED
);

  await clearCart(currentUser.id);

  await notifyStaffOfNewOrder({
    orderId: order.id,
    userId: currentUser.id,
    customerName: `${currentUser.firstname ?? ""} ${currentUser.lastname ?? ""}`.trim() || currentUser.email,
    customerEmail: currentUser.email,
    totalAmount: Number(order.total_amount),
    depositAmount: Number(order.deposit_amount ?? 0),
    remainingAmount: Number(order.remaining_balance ?? 0),
    paymentMode: order.payment_mode,
    status: order.status
  });

  return {
    order: {
      ...order,
      total_amount: Number(order.total_amount),
      deposit_amount: Number(order.deposit_amount ?? 0),
      remaining_balance: Number(order.remaining_balance ?? 0),
      remaining_amount: Number(order.remaining_balance ?? 0)
    },
    cartItems
  };
};

export const getUserOrders = async (userId: string) => {
  const ordersRes = await pool.query(
    `
    SELECT
      orders.*,
      users.email AS user_email,
      users.firstname,
      users.lastname
    FROM orders
    JOIN users ON users.id = orders.user_id
    WHERE orders.user_id = $1
    ORDER BY orders.created_at DESC
    `,
    [userId]
  );

  const orders = [];

  for (const order of ordersRes.rows) {
    const itemsRes = await pool.query(
      `
      SELECT
        order_items.*,
        COALESCE(order_items.product_name_snapshot, products.name) AS name,
        COALESCE(order_items.variant_name_snapshot, pv.name) AS variant_name,
        COALESCE(order_items.variant_specs_snapshot, pv.specs, '{}'::JSONB) AS variant_specs,
        pv.sku AS variant_sku,
        products.description,
        COALESCE(order_items.price_at_purchase, pv.price, products.price) AS price,
        COALESCE(products.discount_enabled, FALSE) AS discount_enabled,
        COALESCE(products.discount_percentage, 0) AS discount_percentage,
        CASE
          WHEN COALESCE(products.discount_enabled, FALSE) THEN ROUND((COALESCE(order_items.price_at_purchase, pv.price, products.price) * COALESCE(products.discount_percentage, 0)) / 100, 2)
          ELSE 0
        END AS discount_amount,
        order_items.price_at_purchase AS discounted_price,
        order_items.price_at_purchase AS effective_price,
        products.image_url,
        products.image_urls,
        products.installment_duration_months,
        products.minimum_deposit_percentage
      FROM order_items
      JOIN products ON products.id = order_items.product_id
      LEFT JOIN product_variants pv ON pv.id = order_items.variant_id
      WHERE order_items.order_id = $1
      ORDER BY order_items.created_at ASC
      `,
      [order.id]
    );

    const installmentsRes = await pool.query(
      `
      SELECT *
      FROM installments
      WHERE order_id = $1
      ORDER BY installment_number ASC
      `,
      [order.id]
    );

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
    const nextInstallment = installmentsRes.rows.find((installment) => installment.status === "PENDING") ?? null;
    const depositRemaining = Math.max(depositAmount - paidAmount, 0);
    const isAwaitingApproval = order.status === "AWAITING_APPROVAL";
    const isRejected = order.status === "REJECTED";
    const isPaid = remainingBalance <= 0 || order.status === "PAID";
    const canPayDeposit = !isAwaitingApproval && !isRejected && !isPaid && order.payment_mode === "INSTALLMENT" && depositRemaining > 0;
    const canPayRemainingBalance = !isAwaitingApproval && !isRejected && !isPaid && remainingBalance > 0 && depositRemaining === 0;
    const nextPaymentAmount = isAwaitingApproval || isRejected || isPaid
      ? 0
      : order.payment_mode === "INSTALLMENT" && depositRemaining > 0
        ? depositRemaining
        : nextInstallment
          ? Number(nextInstallment.amount)
          : remainingBalance;
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
      ...installmentsRes.rows.map((installment) => ({
        ...installment,
        payment_type: "INSTALLMENT_PAYMENT",
        payment_label: `Installment ${installment.installment_number}`,
        can_pay: canPayRemainingBalance && installment.status === "PENDING"
      }))
    ];

    orders.push({
      ...order,
      remaining_balance: remainingBalance,
      paid_amount: paidAmount,
      payment_progress_percentage: totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0,
      next_payment_amount: nextPaymentAmount,
      next_payment_due_date: nextInstallment?.due_date ?? null,
      next_installment: nextInstallment,
      can_pay: !isAwaitingApproval && !isRejected && !isPaid && remainingBalance > 0,
      can_pay_deposit: canPayDeposit,
      can_pay_remaining_balance: canPayRemainingBalance,
      order_items: itemsRes.rows,
      installments: installmentsRes.rows,
      payment_schedule: paymentSchedule,
      transactions: transactionsRes.rows
    });
  }

  return orders;
};
