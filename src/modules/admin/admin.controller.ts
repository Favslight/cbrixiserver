import { FastifyReply, FastifyRequest } from "fastify";
import { adminLoginService } from "./admin.service";
import { pool } from "../../config/db";
import { ensureCbrillianceVerificationColumns } from "../users/cbrillianceVerification.service";
import { ensureProductColumns } from "../products/product.service";
import { ensureReferralSchema } from "../referrals/referral.service";
import {
  getAdminOrderItems,
  getOrderItemSummary,
  withAdminUserDisplayFields
} from "./admin.orderDetails";

interface AdminLoginBody {
  email: string;
  password: string;
}

type AdminUsersQuery = {
  limit?: string;
  offset?: string;
  page?: string;
};

const ADMIN_USERS_PAGE_SIZE = 50;

const parseNonNegativeInteger = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
};

const parsePositiveInteger = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
};

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
  req: FastifyRequest<{ Querystring: AdminUsersQuery }>,
  reply: FastifyReply
) => {
  try {
    await ensureCbrillianceVerificationColumns();
    await ensureProductColumns();
    await ensureReferralSchema();

    const requestedLimit = parsePositiveInteger(req.query.limit);
    const requestedOffset = parseNonNegativeInteger(req.query.offset);
    const requestedPage = parseNonNegativeInteger(req.query.page);

    if (Number.isNaN(requestedLimit)) {
      return reply.status(400).send({ success: false, message: "limit must be a positive integer" });
    }

    if (Number.isNaN(requestedOffset)) {
      return reply.status(400).send({ success: false, message: "offset must be a non-negative integer" });
    }

    if (Number.isNaN(requestedPage) || requestedPage === 0) {
      return reply.status(400).send({ success: false, message: "page must be a positive integer" });
    }

    const limit = Math.min(requestedLimit ?? ADMIN_USERS_PAGE_SIZE, ADMIN_USERS_PAGE_SIZE);
    const offset = requestedOffset ?? (requestedPage ? (requestedPage - 1) * limit : 0);

    const totalUsersRes = await pool.query(`
      SELECT COUNT(*)::INTEGER AS total
      FROM users
    `);

    const usersRes = await pool.query(`
      SELECT
        id,
        firstname,
        lastname,
        username,
        email,
        referral_code,
        referred_by_user_id,
        referral_count,
        cbrilliance_email,
        cbrilliance_email_verified,
        cbrilliance_email_verified_at,
        status,
        created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    const users = usersRes.rows;
    const userIds = users.map((user) => user.id);

    const referralBalancesRes = userIds.length
      ? await pool.query(
          `
          SELECT
            referrer_id,
            COALESCE(SUM(reward_amount) FILTER (WHERE status = 'AVAILABLE'), 0) AS available_balance,
            COALESCE(SUM(reward_amount) FILTER (WHERE status = 'REQUESTED'), 0) AS pending_payout_balance,
            COALESCE(SUM(reward_amount) FILTER (WHERE status = 'PAID'), 0) AS paid_out_balance
          FROM referral_rewards
          WHERE referrer_id = ANY($1::UUID[])
          GROUP BY referrer_id
          `,
          [userIds]
        )
      : { rows: [] };
    const referralBalancesByUserId = new Map(
      referralBalancesRes.rows.map((row) => [row.referrer_id, row])
    );

    // Fetch orders, order items, installments for each user
    const usersWithDetails = [];

    for (const user of users) {
      const referralBalance = referralBalancesByUserId.get(user.id) as any;
      const availableReferralBalance = Number(referralBalance?.available_balance ?? 0);
      const pendingReferralPayoutBalance = Number(referralBalance?.pending_payout_balance ?? 0);
      const paidOutReferralBalance = Number(referralBalance?.paid_out_balance ?? 0);

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
        const orderItems = await getAdminOrderItems(order.id);
        const orderItemSummary = getOrderItemSummary(orderItems);

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
          ...orderItemSummary,
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
        ...withAdminUserDisplayFields(user),
        referral_balance: availableReferralBalance,
        available_referral_balance: availableReferralBalance,
        pending_referral_payout_balance: pendingReferralPayoutBalance,
        paid_out_referral_balance: paidOutReferralBalance,
        orders: detailedOrders
      });
    }

    return reply.send({
      success: true,
      pagination: {
        limit,
        offset,
        page: Math.floor(offset / limit) + 1,
        total: Number(totalUsersRes.rows[0]?.total ?? 0),
        has_more: offset + usersWithDetails.length < Number(totalUsersRes.rows[0]?.total ?? 0)
      },
      users: usersWithDetails
    });
  } catch (error: any) {
    console.error(error);
    return reply.status(500).send({ success: false, message: error.message });
  }
};
