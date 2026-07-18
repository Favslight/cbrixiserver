import { pool } from "../../config/db";
import { getAdminOrderItems } from "../admin/admin.orderDetails";
import { ReceiptCompanyInfo, ReceiptItem, ReceiptListItem, ReceiptRecord } from "./receipt.types";

let ensureSchemaPromise: Promise<void> | null = null;

const roundMoney = (value: number) => Math.round(Number(value) * 100) / 100;

export const getReceiptCompanyInfo = (): ReceiptCompanyInfo => ({
  name: process.env.COMPANY_NAME || "Cbrixi",
  tagline: process.env.COMPANY_TAGLINE || "Smart Devices Marketplace",
  website: process.env.COMPANY_WEBSITE || process.env.FRONTEND_URL || "https://www.cbrixi.com",
  support_email: process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "support@cbrixi.com",
  phone: process.env.COMPANY_PHONE || null,
  address: process.env.COMPANY_ADDRESS || null,
  logo_url: process.env.COMPANY_LOGO_URL || null
});

export const ensureReceiptSchema = async () => {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS receipts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        receipt_number VARCHAR(64) NOT NULL UNIQUE,
        invoice_number VARCHAR(255) NOT NULL,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        payment_id UUID NOT NULL UNIQUE REFERENCES payment_transactions(id) ON DELETE CASCADE,
        customer_id UUID NOT NULL REFERENCES users(id),
        amount_paid NUMERIC(15,2) NOT NULL,
        remaining_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
        order_total NUMERIC(15,2) NOT NULL DEFAULT 0,
        subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
        discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
        delivery_fee NUMERIC(15,2) NOT NULL DEFAULT 0,
        payment_method VARCHAR(50) NOT NULL,
        generated_by UUID,
        generated_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS receipt_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        product_name VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(15,2) NOT NULL,
        subtotal NUMERIC(15,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_receipts_order_id ON receipts(order_id);
      CREATE INDEX IF NOT EXISTS idx_receipts_customer_id ON receipts(customer_id);
      CREATE INDEX IF NOT EXISTS idx_receipts_invoice_number ON receipts(invoice_number);
      CREATE INDEX IF NOT EXISTS idx_receipts_generated_at ON receipts(generated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON receipt_items(receipt_id);

      CREATE TABLE IF NOT EXISTS receipt_number_counters (
        day_key VARCHAR(8) PRIMARY KEY,
        last_value INTEGER NOT NULL DEFAULT 0
      );
    `).then(() => undefined);
  }

  await ensureSchemaPromise;
};

const generateReceiptNumber = async (client: { query: typeof pool.query }) => {
  const now = new Date();
  const dayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("");

  const counterRes = await client.query(
    `
    INSERT INTO receipt_number_counters (day_key, last_value)
    VALUES ($1, 1)
    ON CONFLICT (day_key)
    DO UPDATE SET last_value = receipt_number_counters.last_value + 1
    RETURNING last_value
    `,
    [dayKey]
  );

  const sequence = Number(counterRes.rows[0].last_value);
  const padded = sequence.toString().padStart(6, "0");
  return `CBX-RCP-${dayKey}-${padded}`;
};

const mapItem = (row: Record<string, any>): ReceiptItem => ({
  id: row.id,
  receipt_id: row.receipt_id,
  product_id: row.product_id ?? null,
  product_name: row.product_name,
  quantity: Number(row.quantity),
  unit_price: roundMoney(Number(row.unit_price)),
  subtotal: roundMoney(Number(row.subtotal)),
  created_at: row.created_at
});

const hydrateReceipt = async (row: Record<string, any>): Promise<ReceiptRecord> => {
  const itemsRes = await pool.query(
    `
    SELECT *
    FROM receipt_items
    WHERE receipt_id = $1
    ORDER BY created_at ASC
    `,
    [row.id]
  );

  return {
    id: row.id,
    receipt_number: row.receipt_number,
    invoice_number: row.invoice_number,
    order_id: row.order_id,
    payment_id: row.payment_id,
    customer_id: row.customer_id,
    amount_paid: roundMoney(Number(row.amount_paid)),
    remaining_balance: roundMoney(Number(row.remaining_balance)),
    order_total: roundMoney(Number(row.order_total)),
    subtotal: roundMoney(Number(row.subtotal)),
    discount_amount: roundMoney(Number(row.discount_amount)),
    delivery_fee: roundMoney(Number(row.delivery_fee)),
    payment_method: row.payment_method,
    payment_date: row.payment_date ?? row.generated_at,
    generated_by: row.generated_by ?? null,
    generated_by_name: row.generated_by_name ?? null,
    generated_at: row.generated_at,
    created_at: row.created_at,
    customer_name: row.customer_name ?? null,
    customer_email: row.customer_email ?? null,
    customer_phone: row.customer_phone ?? null,
    items: itemsRes.rows.map(mapItem),
    company: getReceiptCompanyInfo()
  };
};

const receiptSelectSql = `
  SELECT
    r.*,
    pt.created_at AS payment_date,
    TRIM(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.lastname, ''))) AS customer_name,
    u.email AS customer_email,
    NULL::TEXT AS customer_phone,
    CASE
      WHEN r.generated_by IS NULL THEN 'SYSTEM'
      ELSE COALESCE(a.email, r.generated_by::TEXT)
    END AS generated_by_name
  FROM receipts r
  JOIN payment_transactions pt ON pt.id = r.payment_id
  JOIN users u ON u.id = r.customer_id
  LEFT JOIN users a ON a.id = r.generated_by
`;

/**
 * Creates a receipt for a SUCCESS payment. Idempotent per payment_id.
 */
export const generateReceiptForPayment = async (
  paymentId: string,
  generatedBy?: string | null
) => {
  await ensureReceiptSchema();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingRes = await client.query(
      `SELECT id FROM receipts WHERE payment_id = $1`,
      [paymentId]
    );
    if (existingRes.rows[0]) {
      await client.query("COMMIT");
      return getReceiptById(existingRes.rows[0].id);
    }

    const paymentRes = await client.query(
      `
      SELECT
        pt.*,
        o.total_amount,
        o.remaining_balance AS order_remaining_balance,
        o.user_id AS order_user_id
      FROM payment_transactions pt
      JOIN orders o ON o.id = pt.order_id
      WHERE pt.id = $1
      FOR UPDATE OF pt
      `,
      [paymentId]
    );

    const payment = paymentRes.rows[0];
    if (!payment) {
      throw new Error("Payment not found");
    }

    if (payment.status !== "SUCCESS") {
      throw new Error("Receipts can only be generated for approved (SUCCESS) payments");
    }

    const orderItems = await getAdminOrderItems(payment.order_id);
    if (!orderItems.length) {
      throw new Error("Order has no items to include on the receipt");
    }

    const subtotal = roundMoney(
      orderItems.reduce(
        (sum, item) => sum + Number(item.line_total ?? Number(item.unit_price ?? item.price) * Number(item.quantity)),
        0
      )
    );
    const orderTotal = roundMoney(Number(payment.total_amount));
    const amountPaid = roundMoney(Number(payment.amount));

    // Prefer live remaining balance after applyPayment; fall back to computed.
    let remainingBalance = roundMoney(Number(payment.order_remaining_balance ?? 0));
    if (!Number.isFinite(remainingBalance)) {
      const paidRes = await client.query(
        `
        SELECT COALESCE(SUM(amount), 0) AS total_paid
        FROM payment_transactions
        WHERE order_id = $1 AND status = 'SUCCESS'
        `,
        [payment.order_id]
      );
      remainingBalance = Math.max(orderTotal - Number(paidRes.rows[0]?.total_paid ?? 0), 0);
    }

    const discountAmount = Math.max(roundMoney(subtotal - orderTotal), 0);
    const receiptNumber = await generateReceiptNumber(client);
    const invoiceNumber = payment.reference || `INV-${payment.id.slice(0, 8).toUpperCase()}`;

    const receiptRes = await client.query(
      `
      INSERT INTO receipts (
        receipt_number,
        invoice_number,
        order_id,
        payment_id,
        customer_id,
        amount_paid,
        remaining_balance,
        order_total,
        subtotal,
        discount_amount,
        delivery_fee,
        payment_method,
        generated_by,
        generated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
      RETURNING id
      `,
      [
        receiptNumber,
        invoiceNumber,
        payment.order_id,
        payment.id,
        payment.user_id || payment.order_user_id,
        amountPaid,
        remainingBalance,
        orderTotal,
        subtotal,
        discountAmount,
        0,
        payment.payment_method,
        generatedBy ?? null
      ]
    );

    const receiptId = receiptRes.rows[0].id;

    for (const item of orderItems) {
      const unitPrice = roundMoney(Number(item.unit_price ?? item.price ?? item.price_at_purchase ?? 0));
      const quantity = Number(item.quantity);
      const lineSubtotal = roundMoney(Number(item.line_total ?? unitPrice * quantity));
      const productName = [
        item.product_name ?? item.name ?? "Product",
        item.variant_name && String(item.variant_name).toLowerCase() !== "default"
          ? `(${item.variant_name})`
          : null
      ].filter(Boolean).join(" ");

      await client.query(
        `
        INSERT INTO receipt_items
          (receipt_id, product_id, product_name, quantity, unit_price, subtotal)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          receiptId,
          item.product_id ?? null,
          productName,
          quantity,
          unitPrice,
          lineSubtotal
        ]
      );
    }

    await client.query("COMMIT");
    return getReceiptById(receiptId);
  } catch (error: any) {
    await client.query("ROLLBACK");

    // Race: another process created the receipt first.
    if (error?.code === "23505") {
      const existing = await pool.query(
        `SELECT id FROM receipts WHERE payment_id = $1`,
        [paymentId]
      );
      if (existing.rows[0]) {
        return getReceiptById(existing.rows[0].id);
      }
    }

    throw error;
  } finally {
    client.release();
  }
};

export const getReceiptById = async (id: string) => {
  await ensureReceiptSchema();

  const result = await pool.query(
    `
    ${receiptSelectSql}
    WHERE r.id = $1
    `,
    [id]
  );

  if (!result.rows[0]) return null;
  return hydrateReceipt(result.rows[0]);
};

export const getReceiptByNumber = async (receiptNumber: string) => {
  await ensureReceiptSchema();

  const result = await pool.query(
    `
    ${receiptSelectSql}
    WHERE UPPER(r.receipt_number) = UPPER($1)
    `,
    [receiptNumber.trim()]
  );

  if (!result.rows[0]) return null;
  return hydrateReceipt(result.rows[0]);
};

export const getReceiptByPaymentId = async (paymentId: string) => {
  await ensureReceiptSchema();

  const result = await pool.query(
    `
    ${receiptSelectSql}
    WHERE r.payment_id = $1
    `,
    [paymentId]
  );

  if (!result.rows[0]) return null;
  return hydrateReceipt(result.rows[0]);
};

export const listReceiptsForCustomer = async (
  customerId: string,
  options: { page?: number; limit?: number; orderId?: string } = {}
) => {
  await ensureReceiptSchema();

  const page = Math.max(Number(options.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(options.limit ?? 20), 1), 100);
  const offset = (page - 1) * limit;

  const values: unknown[] = [customerId];
  let orderFilter = "";
  if (options.orderId) {
    values.push(options.orderId);
    orderFilter = `AND r.order_id = $${values.length}`;
  }

  values.push(limit, offset);

  const result = await pool.query(
    `
    ${receiptSelectSql}
    WHERE r.customer_id = $1
      ${orderFilter}
    ORDER BY r.generated_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  const countValues = values.slice(0, -2);
  const countRes = await pool.query(
    `
    SELECT COUNT(*)::INT AS total
    FROM receipts r
    WHERE r.customer_id = $1
      ${orderFilter}
    `,
    countValues
  );

  const total = Number(countRes.rows[0]?.total ?? 0);

  return {
    receipts: result.rows.map((row): ReceiptListItem => ({
      id: row.id,
      receipt_number: row.receipt_number,
      invoice_number: row.invoice_number,
      order_id: row.order_id,
      payment_id: row.payment_id,
      amount_paid: roundMoney(Number(row.amount_paid)),
      remaining_balance: roundMoney(Number(row.remaining_balance)),
      order_total: roundMoney(Number(row.order_total)),
      payment_method: row.payment_method,
      payment_date: row.payment_date ?? row.generated_at,
      generated_at: row.generated_at
    })),
    pagination: {
      page,
      limit,
      offset,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / limit),
      has_more: offset + result.rows.length < total,
      has_previous: offset > 0
    }
  };
};

export const listReceiptsForAdmin = async (
  options: { page?: number; limit?: number; orderId?: string; paymentId?: string } = {}
) => {
  await ensureReceiptSchema();

  const page = Math.max(Number(options.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(options.limit ?? 20), 1), 100);
  const offset = (page - 1) * limit;

  const values: unknown[] = [];
  const filters: string[] = [];

  if (options.orderId) {
    values.push(options.orderId);
    filters.push(`r.order_id = $${values.length}`);
  }
  if (options.paymentId) {
    values.push(options.paymentId);
    filters.push(`r.payment_id = $${values.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  values.push(limit, offset);

  const result = await pool.query(
    `
    ${receiptSelectSql}
    ${where}
    ORDER BY r.generated_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  const countValues = values.slice(0, -2);
  const countRes = await pool.query(
    `
    SELECT COUNT(*)::INT AS total
    FROM receipts r
    ${where}
    `,
    countValues
  );

  const total = Number(countRes.rows[0]?.total ?? 0);

  return {
    receipts: result.rows.map((row): ReceiptListItem => ({
      id: row.id,
      receipt_number: row.receipt_number,
      invoice_number: row.invoice_number,
      order_id: row.order_id,
      payment_id: row.payment_id,
      amount_paid: roundMoney(Number(row.amount_paid)),
      remaining_balance: roundMoney(Number(row.remaining_balance)),
      order_total: roundMoney(Number(row.order_total)),
      payment_method: row.payment_method,
      payment_date: row.payment_date ?? row.generated_at,
      generated_at: row.generated_at,
      customer_name: row.customer_name ?? null,
      customer_email: row.customer_email ?? null
    })),
    pagination: {
      page,
      limit,
      offset,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / limit),
      has_more: offset + result.rows.length < total,
      has_previous: offset > 0
    }
  };
};

export const assertCustomerOwnsReceipt = (receipt: ReceiptRecord, customerId: string) => {
  if (receipt.customer_id !== customerId) {
    throw new Error("You are not allowed to access this receipt");
  }
};
