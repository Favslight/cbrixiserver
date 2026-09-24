import { pool } from "../../config/db";
import { sendEmail } from "../email/email.service";
import { installmentOverdueTemplate } from "../email/email.templates";
import { EmailType } from "../email/email.types";

/**
 * "Missed" is derived, never stored. Nothing writes installments.status = 'MISSED',
 * and the customer pay flow only accepts PENDING installments, so persisting it
 * would lock defaulters out of paying. An installment is missed once its due
 * day has fully passed and it is still unpaid.
 */

export type InstallmentDisplayStatus = "PAID" | "MISSED" | "UPCOMING";
export type InstallmentFilter = "all" | "defaulting" | "current";

export type InstallmentRecord = {
  id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  status: InstallmentDisplayStatus;
  paid_at: string | null;
  paid_late: boolean;
  days_overdue: number;
};

export type InstallmentOrder = {
  order_id: string;
  order_ref: string;
  order_status: string;
  order_summary: string | null;
  created_at: string;
  total_amount: number;
  deposit_amount: number;
  deposit_paid: boolean;
  paid_amount: number;
  remaining_balance: number;
  paid_count: number;
  missed_count: number;
  late_paid_count: number;
  total_installments: number;
  overdue_amount: number;
  installments: InstallmentRecord[];
};

export type InstallmentUser = {
  user_id: string;
  name: string;
  email: string;
  is_defaulting: boolean;
  missed_count: number;
  paid_count: number;
  total_installments: number;
  overdue_amount: number;
  outstanding_amount: number;
  max_days_overdue: number;
  last_default_email_at: string | null;
  default_emails_sent: number;
  orders: InstallmentOrder[];
};

const DEFAULT_EMAIL_COOLDOWN_HOURS = 24;

const round2 = (value: number) => Math.round(value * 100) / 100;

const formatDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });

const displayName = (row: Record<string, any>) =>
  [row.firstname, row.lastname].filter(Boolean).join(" ").trim() || row.email;

const loadInstallmentUsers = async (): Promise<InstallmentUser[]> => {
  const result = await pool.query(`
    SELECT
      u.id AS user_id,
      u.firstname,
      u.lastname,
      u.email,
      o.id AS order_id,
      o.status AS order_status,
      o.created_at AS order_created_at,
      o.total_amount,
      o.deposit_amount,
      COALESCE(paid.paid_amount, 0) AS paid_amount,
      COALESCE(paid.deposit_paid_amount, 0) AS deposit_paid_amount,
      (
        SELECT string_agg(
          COALESCE(oi.product_name_snapshot, 'Item') ||
            CASE WHEN oi.quantity > 1 THEN ' x' || oi.quantity ELSE '' END,
          ', '
        )
        FROM order_items oi
        WHERE oi.order_id = o.id
      ) AS order_summary,
      i.id AS installment_id,
      i.installment_number,
      i.amount,
      i.due_date::date::text AS due_date,
      i.status AS raw_status,
      i.paid_at,
      (i.status = 'PAID' AND i.paid_at::date > i.due_date::date) AS paid_late,
      (i.status <> 'PAID' AND i.due_date::date < CURRENT_DATE) AS is_missed,
      CASE
        WHEN i.status <> 'PAID' AND i.due_date::date < CURRENT_DATE
          THEN (CURRENT_DATE - i.due_date::date)
        ELSE 0
      END AS days_overdue
    FROM orders o
    JOIN users u ON u.id = o.user_id
    JOIN installments i ON i.order_id = o.id
    LEFT JOIN (
      SELECT
        order_id,
        SUM(amount) AS paid_amount,
        SUM(amount) FILTER (WHERE installment_id IS NULL) AS deposit_paid_amount
      FROM payment_transactions
      WHERE status = 'SUCCESS'
      GROUP BY order_id
    ) paid ON paid.order_id = o.id
    WHERE o.payment_mode = 'INSTALLMENT'
      AND o.status IN ('PENDING', 'PARTIALLY_PAID')
      AND EXISTS (
        SELECT 1 FROM installments open_i
        WHERE open_i.order_id = o.id AND open_i.status <> 'PAID'
      )
    ORDER BY u.id, o.created_at ASC, i.installment_number ASC
  `);

  const users = new Map<string, InstallmentUser>();
  const orders = new Map<string, InstallmentOrder>();

  for (const row of result.rows) {
    let user = users.get(row.user_id);
    if (!user) {
      user = {
        user_id: row.user_id,
        name: displayName(row),
        email: row.email,
        is_defaulting: false,
        missed_count: 0,
        paid_count: 0,
        total_installments: 0,
        overdue_amount: 0,
        outstanding_amount: 0,
        max_days_overdue: 0,
        last_default_email_at: null,
        default_emails_sent: 0,
        orders: []
      };
      users.set(row.user_id, user);
    }

    let order = orders.get(row.order_id);
    if (!order) {
      const totalAmount = Number(row.total_amount);
      const paidAmount = Number(row.paid_amount);
      const depositAmount = Number(row.deposit_amount ?? 0);

      order = {
        order_id: row.order_id,
        order_ref: String(row.order_id).slice(0, 8).toUpperCase(),
        order_status: row.order_status,
        order_summary: row.order_summary ?? null,
        created_at: row.order_created_at,
        total_amount: totalAmount,
        deposit_amount: depositAmount,
        deposit_paid: Number(row.deposit_paid_amount) >= depositAmount,
        paid_amount: paidAmount,
        remaining_balance: Math.max(totalAmount - paidAmount, 0),
        paid_count: 0,
        missed_count: 0,
        late_paid_count: 0,
        total_installments: 0,
        overdue_amount: 0,
        installments: []
      };
      orders.set(row.order_id, order);
      user.orders.push(order);
    }

    const amount = Number(row.amount);
    const isPaid = row.raw_status === "PAID";
    const status: InstallmentDisplayStatus = isPaid
      ? "PAID"
      : row.is_missed
        ? "MISSED"
        : "UPCOMING";

    order.installments.push({
      id: row.installment_id,
      installment_number: row.installment_number,
      amount,
      due_date: row.due_date,
      status,
      paid_at: row.paid_at ?? null,
      paid_late: Boolean(row.paid_late),
      days_overdue: Number(row.days_overdue)
    });

    order.total_installments += 1;
    user.total_installments += 1;

    if (isPaid) {
      order.paid_count += 1;
      user.paid_count += 1;
      if (row.paid_late) order.late_paid_count += 1;
    } else {
      user.outstanding_amount += amount;
    }

    if (status === "MISSED") {
      order.missed_count += 1;
      order.overdue_amount += amount;
      user.missed_count += 1;
      user.overdue_amount += amount;
      user.max_days_overdue = Math.max(user.max_days_overdue, Number(row.days_overdue));
    }
  }

  const list = Array.from(users.values());
  for (const user of list) {
    user.is_defaulting = user.missed_count > 0;
    user.overdue_amount = round2(user.overdue_amount);
    user.outstanding_amount = round2(user.outstanding_amount);
    for (const order of user.orders) {
      order.overdue_amount = round2(order.overdue_amount);
    }
  }

  if (list.length) {
    const logs = await pool.query(
      `
      SELECT user_id, MAX(sent_at) AS last_sent_at, COUNT(*)::int AS sent_count
      FROM email_logs
      WHERE email_type = $1 AND user_id = ANY($2::uuid[])
      GROUP BY user_id
      `,
      [EmailType.INSTALLMENT_OVERDUE, list.map((user) => user.user_id)]
    );

    for (const log of logs.rows) {
      const user = users.get(log.user_id);
      if (!user) continue;
      user.last_default_email_at = log.last_sent_at;
      user.default_emails_sent = log.sent_count;
    }
  }

  return list;
};

export const listInstallmentUsers = async (query: {
  filter?: InstallmentFilter;
  search?: string;
  page?: number;
  limit?: number;
}) => {
  const all = await loadInstallmentUsers();

  const summary = {
    total_users: all.length,
    defaulting_users: all.filter((user) => user.is_defaulting).length,
    current_users: all.filter((user) => !user.is_defaulting).length,
    total_missed_installments: all.reduce((sum, user) => sum + user.missed_count, 0),
    total_overdue_amount: round2(all.reduce((sum, user) => sum + user.overdue_amount, 0)),
    total_outstanding_amount: round2(all.reduce((sum, user) => sum + user.outstanding_amount, 0))
  };

  const filter = query.filter ?? "all";
  const search = (query.search ?? "").trim().toLowerCase();

  const filtered = all
    .filter((user) => {
      if (filter === "defaulting" && !user.is_defaulting) return false;
      if (filter === "current" && user.is_defaulting) return false;
      if (!search) return true;
      return (
        user.name.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search) ||
        user.orders.some((order) => order.order_ref.toLowerCase().includes(search))
      );
    })
    // Worst offenders first, then alphabetical.
    .sort(
      (a, b) =>
        Number(b.is_defaulting) - Number(a.is_defaulting) ||
        b.max_days_overdue - a.max_days_overdue ||
        a.name.localeCompare(b.name)
    );

  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const start = (page - 1) * limit;

  return {
    summary,
    users: filtered.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total: filtered.length,
      has_more: start + limit < filtered.length
    }
  };
};

export type DefaultEmailTarget = { user_ids?: string[]; all?: boolean; force?: boolean };

export type DefaultEmailOutcome = {
  user_id: string;
  email: string | null;
  reason?: string;
};

export const sendDefaultEmails = async (target: DefaultEmailTarget) => {
  const users = await loadInstallmentUsers();
  const byId = new Map(users.map((user) => [user.user_id, user]));
  const defaulting = users.filter((user) => user.is_defaulting);

  const sent: DefaultEmailOutcome[] = [];
  const skipped: DefaultEmailOutcome[] = [];
  const failed: DefaultEmailOutcome[] = [];

  const candidates: InstallmentUser[] = [];

  if (target.all) {
    candidates.push(...defaulting);
  } else {
    for (const userId of new Set(target.user_ids ?? [])) {
      const user = byId.get(userId);

      if (!user) {
        skipped.push({ user_id: userId, email: null, reason: "No active installment plan found" });
      } else if (!user.is_defaulting) {
        skipped.push({ user_id: userId, email: user.email, reason: "User has no missed installments" });
      } else {
        candidates.push(user);
      }
    }
  }

  const cooldownMs = DEFAULT_EMAIL_COOLDOWN_HOURS * 60 * 60 * 1000;

  for (const user of candidates) {
    if (
      !target.force &&
      user.last_default_email_at &&
      Date.now() - new Date(user.last_default_email_at).getTime() < cooldownMs
    ) {
      skipped.push({
        user_id: user.user_id,
        email: user.email,
        reason: `Already emailed within the last ${DEFAULT_EMAIL_COOLDOWN_HOURS} hours`
      });
      continue;
    }

    const missed = user.orders.flatMap((order) =>
      order.installments
        .filter((installment) => installment.status === "MISSED")
        .map((installment) => ({
          orderRef: order.order_ref,
          installmentNumber: installment.installment_number,
          amount: installment.amount,
          dueDate: formatDate(installment.due_date),
          daysOverdue: installment.days_overdue
        }))
    );

    try {
      await sendEmail(
        user.user_id,
        null,
        null,
        user.email,
        "Action required: missed installment payment",
        installmentOverdueTemplate(user.name.split(" ")[0], missed, user.overdue_amount),
        EmailType.INSTALLMENT_OVERDUE
      );
      sent.push({ user_id: user.user_id, email: user.email });
    } catch (error: any) {
      console.error("Default email failed", { userId: user.user_id, error });
      failed.push({
        user_id: user.user_id,
        email: user.email,
        reason: error?.message ?? "Email failed to send"
      });
    }
  }

  return { sent, skipped, failed };
};
