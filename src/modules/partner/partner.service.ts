import { pool } from "../../config/db";
import {
  PartnerProductFilters,
  PartnerSalesRecordInput
} from "./partner.types";

export class DuplicatePartnerSalesRecordError extends Error {
  constructor() {
    super("A sales record already exists for this external order");
    this.name = "DuplicatePartnerSalesRecordError";
  }
}

const partnerProductSelect = `
  p.id,
  p.name,
  LOWER(
    TRIM(BOTH '-' FROM REGEXP_REPLACE(p.name, '[^a-zA-Z0-9]+', '-', 'g'))
  ) AS slug,
  p.description,
  p.category,
  p.price::FLOAT8 AS price,
  CASE
    WHEN CARDINALITY(COALESCE(p.image_urls, ARRAY[]::TEXT[])) > 0
      THEN p.image_urls
    WHEN p.image_url IS NOT NULL
      THEN ARRAY[p.image_url]
    ELSE ARRAY[]::TEXT[]
  END AS images,
  'ACTIVE' AS status,
  p.created_at
`;

export const getPartnerProducts = async (
  filters: PartnerProductFilters
) => {
  const conditions = ["p.is_active = TRUE"];
  const values: unknown[] = [];

  if (filters.category) {
    values.push(filters.category);
    conditions.push(`LOWER(p.category) = LOWER($${values.length})`);
  }

  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(
      p.name ILIKE $${values.length}
      OR p.description ILIKE $${values.length}
      OR p.category ILIKE $${values.length}
    )`);
  }

  if (filters.min_price !== undefined) {
    values.push(filters.min_price);
    conditions.push(`p.price >= $${values.length}`);
  }

  if (filters.max_price !== undefined) {
    values.push(filters.max_price);
    conditions.push(`p.price <= $${values.length}`);
  }

  const offset = (filters.page - 1) * filters.limit;
  values.push(filters.limit, offset);

  const result = await pool.query(
    `SELECT ${partnerProductSelect},
            COUNT(*) OVER()::INT AS total_count
     FROM products p
     WHERE ${conditions.join(" AND ")}
     ORDER BY p.created_at DESC
     LIMIT $${values.length - 1}
     OFFSET $${values.length}`,
    values
  );

  const total = result.rows[0]?.total_count ?? 0;
  const products = result.rows.map(({ total_count, ...product }) => product);

  return {
    products,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const getPartnerProductById = async (id: string) => {
  const result = await pool.query(
    `SELECT ${partnerProductSelect}
     FROM products p
     WHERE p.id = $1
       AND p.is_active = TRUE
     LIMIT 1`,
    [id]
  );

  return result.rows[0] ?? null;
};

export const createPartnerSalesRecord = async (
  partnerAppId: string,
  data: PartnerSalesRecordInput,
  rawPayload: unknown
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const recordResult = await client.query(
      `INSERT INTO partner_sales_records (
         partner_app_id,
         external_order_id,
         invoice_number,
         customer_name,
         customer_email,
         customer_phone,
         delivery_address,
         payment_status,
         order_status,
         total_amount,
         raw_payload
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::JSONB)
       ON CONFLICT (partner_app_id, external_order_id) DO NOTHING
       RETURNING id, partner_app_id, external_order_id, invoice_number, created_at`,
      [
        partnerAppId,
        data.external_order_id,
        data.invoice_number ?? null,
        data.customer_name,
        data.customer_email,
        data.customer_phone,
        data.delivery_address,
        data.payment_status,
        data.order_status,
        data.total_amount,
        JSON.stringify(rawPayload)
      ]
    );

    const salesRecord = recordResult.rows[0];

    if (!salesRecord) {
      throw new DuplicatePartnerSalesRecordError();
    }

    for (const item of data.items) {
      await client.query(
        `INSERT INTO partner_sales_record_items (
           sales_record_id,
           product_id,
           product_name_snapshot,
           unit_price_snapshot,
           quantity,
           total_price
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          salesRecord.id,
          item.product_id,
          item.product_name,
          item.unit_price,
          item.quantity,
          item.total_price
        ]
      );
    }

    await client.query("COMMIT");
    return salesRecord;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
