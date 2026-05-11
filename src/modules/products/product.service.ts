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
  if (!id) throw new Error("Product id is required");

  if (!data || typeof data !== "object") {
    throw new Error("Update payload is required");
  }

  const hasAnyUpdateField = [
    "name",
    "description",
    "category",
    "price",
    "image_url",
    "image_public_id",
    "image_urls",
    "image_public_ids",
    "stock"
  ].some((key) => data[key] !== undefined);

  if (!hasAnyUpdateField) {
    throw new Error("No update fields provided");
  }

  await ensureProductColumns();

  const query = `
  UPDATE products
  SET name=COALESCE($1, name),
      description=COALESCE($2, description),
      category=COALESCE($3, category),
      price=COALESCE($4, price),
      image_url=COALESCE($5, image_url),
      image_public_id=COALESCE($6, image_public_id),
      image_urls=COALESCE($7, image_urls),
      image_public_ids=COALESCE($8, image_public_ids),
      stock=COALESCE($9, stock),
      updated_at=NOW()
  WHERE id=$10
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

export const getActiveProductsByCategory = async (category: string) => {
  await ensureProductColumns();

  const normalizedCategory = category?.trim();
  if (!normalizedCategory) {
    throw new Error("Category is required");
  }

  const result = await pool.query(
    `
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
      AND LOWER(category) = LOWER($1)
    `,
    [normalizedCategory]
  );

  return result.rows;
};
