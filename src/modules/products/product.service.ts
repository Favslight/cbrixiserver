// src/modules/products/product.service.ts
import { pool } from "../../config/db";

let ensureProductColumnsPromise: Promise<void> | null = null;

const ensureProductColumns = async () => {
  if (!ensureProductColumnsPromise) {
    ensureProductColumnsPromise = (async () => {
      await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
        ADD COLUMN IF NOT EXISTS image_public_ids TEXT[] DEFAULT ARRAY[]::TEXT[]
      `);
    })();
  }

  await ensureProductColumnsPromise;
};

export const createProduct = async (data: any) => {
  await ensureProductColumns();

  const query = `
  INSERT INTO products
(name, description, category, price, image_url, image_public_id,
 image_urls, image_public_ids,
 stock, installment_enabled, minimum_deposit_percentage,
 installment_duration_months, fine_percentage_on_default,
 minimum_wallet_balance_required, grace_period_days)
  VALUES
  ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
  RETURNING *
  `;

  const values = [
    data.name,
    data.description,
    data.category,
    data.price,
    data.image_url,
    data.image_public_id,
    data.image_urls,
    data.image_public_ids,
    data.stock,
    data.installment_enabled,
    data.minimum_deposit_percentage,
    data.installment_duration_months,
    data.fine_percentage_on_default,
    data.minimum_wallet_balance_required,
    data.grace_period_days
  ];

  const result = await pool.query(query, values);

  return result.rows[0];
};

export const getAllProducts = async () => {
  await ensureProductColumns();

  const result = await pool.query(`
    SELECT *,
           COALESCE(image_urls, ARRAY[]::TEXT[]) AS image_urls,
           COALESCE(image_public_ids, ARRAY[]::TEXT[]) AS image_public_ids
    FROM products
    WHERE is_active = true
    ORDER BY created_at DESC
  `);

  return result.rows;

};

export const deleteProduct = async (id: string) => {
  await ensureProductColumns();

  // get product first
  const product = await pool.query(
    `SELECT image_public_id, image_public_ids FROM products WHERE id=$1`,
    [id]
  );

  if (!product.rows[0]) {
    throw new Error("Product not found");
  }

  // soft-delete in DB to avoid FK failures from existing order/cart references
  const result = await pool.query(
    `UPDATE products
     SET is_active=false, updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [id]
  );

  return result.rows[0];
};

export const updateProduct = async (id: string, data: any) => {

  const query = `
  UPDATE products
  SET name=$1,
      description=$2,
      category=$3,
      price=$4,
      stock=$5,
      updated_at=NOW()
  WHERE id=$6
  RETURNING *
  `;

  const values = [
    data.name,
    data.description,
    data.category,
    data.price,
    data.stock,
    id
  ];

  const result = await pool.query(query, values);

  return result.rows[0];

};


export const getActiveProducts = async () => {
  await ensureProductColumns();

  const result = await pool.query(`
    SELECT id,
           name,
           description,
           category,
           price,
           image_url,
           COALESCE(image_urls, ARRAY[]::TEXT[]) AS image_urls,
           stock
    FROM products
    WHERE is_active = true
  `);

  return result.rows;

};
