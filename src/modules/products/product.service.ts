// src/modules/products/product.service.ts
import { pool } from "../../config/db";

let ensureProductColumnsPromise: Promise<void> | null = null;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const calculateProductDiscount = (
  priceInput: number | string,
  discountEnabledInput: boolean,
  discountPercentageInput?: number | string | null
) => {
  const price = Number(priceInput);

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("price must be a valid non-negative number");
  }

  const discountEnabled = discountEnabledInput === true;
  const discountPercentage = discountEnabled
    ? Number(discountPercentageInput ?? 0)
    : 0;

  if (
    discountEnabled
    && (!Number.isFinite(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100)
  ) {
    throw new Error("discount_percentage must be greater than 0 and less than or equal to 100 when discount is active");
  }

  const normalizedPrice = roundMoney(price);
  const normalizedPercentage = discountEnabled ? roundMoney(discountPercentage) : 0;
  const discountAmount = discountEnabled
    ? roundMoney((normalizedPrice * normalizedPercentage) / 100)
    : 0;
  const discountedPrice = discountEnabled
    ? Math.max(roundMoney(normalizedPrice - discountAmount), 0)
    : normalizedPrice;

  return {
    price: normalizedPrice,
    discount_enabled: discountEnabled,
    discount_percentage: normalizedPercentage,
    discount_amount: discountAmount,
    discounted_price: discountedPrice,
    effective_price: discountedPrice
  };
};

export const ensureProductColumns = async () => {
  if (!ensureProductColumnsPromise) {
    ensureProductColumnsPromise = (async () => {
      await pool.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS image_url TEXT,
        ADD COLUMN IF NOT EXISTS image_public_id TEXT,
        ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
        ADD COLUMN IF NOT EXISTS image_public_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
        ADD COLUMN IF NOT EXISTS discount_enabled BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discounted_price NUMERIC(15,2),
        ADD COLUMN IF NOT EXISTS installment_enabled BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS minimum_deposit_percentage INTEGER DEFAULT 50,
        ADD COLUMN IF NOT EXISTS installment_duration_months INTEGER,
        ADD COLUMN IF NOT EXISTS fine_percentage_on_default INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS minimum_wallet_balance_required NUMERIC(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 0
      `);

      await pool.query(`
        UPDATE products
        SET
          discount_enabled = COALESCE(discount_enabled, FALSE),
          discount_percentage = CASE
            WHEN COALESCE(discount_enabled, FALSE) THEN COALESCE(discount_percentage, 0)
            ELSE 0
          END,
          discount_amount = CASE
            WHEN COALESCE(discount_enabled, FALSE) THEN ROUND((price * COALESCE(discount_percentage, 0)) / 100, 2)
            ELSE 0
          END,
          discounted_price = CASE
            WHEN COALESCE(discount_enabled, FALSE) THEN GREATEST(ROUND(price - ((price * COALESCE(discount_percentage, 0)) / 100), 2), 0)
            ELSE price
          END
        WHERE discounted_price IS NULL
           OR discount_amount IS NULL
           OR discount_percentage IS NULL
           OR discount_enabled IS NULL
      `);
    })();
  }

  await ensureProductColumnsPromise;
};

const productImageUrlSelect = `
  CASE
    WHEN image_url IS NOT NULL AND image_url <> '' THEN image_url
    WHEN CARDINALITY(COALESCE(image_urls, ARRAY[]::TEXT[])) > 0 THEN image_urls[1]
    ELSE NULL
  END AS image_url
`;

const productImageUrlsSelect = `
  CASE
    WHEN CARDINALITY(COALESCE(image_urls, ARRAY[]::TEXT[])) > 0 THEN image_urls
    WHEN image_url IS NOT NULL AND image_url <> '' THEN ARRAY[image_url]
    ELSE ARRAY[]::TEXT[]
  END AS image_urls
`;

const productSelectColumns = `
  id,
  name,
  description,
  category,
  price,
  COALESCE(discount_enabled, FALSE) AS discount_enabled,
  COALESCE(discount_percentage, 0) AS discount_percentage,
  COALESCE(discount_amount, 0) AS discount_amount,
  COALESCE(discounted_price, price) AS discounted_price,
  CASE
    WHEN COALESCE(discount_enabled, FALSE) THEN COALESCE(discounted_price, price)
    ELSE price
  END AS effective_price,
  ${productImageUrlSelect},
  image_public_id,
  ${productImageUrlsSelect},
  COALESCE(image_public_ids, ARRAY[]::TEXT[]) AS image_public_ids,
  stock,
  installment_enabled,
  minimum_deposit_percentage,
  installment_duration_months,
  fine_percentage_on_default,
  minimum_wallet_balance_required,
  grace_period_days,
  is_active,
  created_at,
  updated_at
`;

export const createProduct = async (data: any) => {
  await ensureProductColumns();
  const discount = calculateProductDiscount(
    data.price,
    data.discount_enabled === true,
    data.discount_percentage
  );

  const query = `
  INSERT INTO products
(name, description, category, price, image_url, image_public_id,
 image_urls, image_public_ids,
 stock, installment_enabled, minimum_deposit_percentage,
 installment_duration_months, fine_percentage_on_default,
 minimum_wallet_balance_required, grace_period_days,
 discount_enabled, discount_percentage, discount_amount, discounted_price)
  VALUES
  ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
  RETURNING ${productSelectColumns}
  `;

  const values = [
    data.name,
    data.description,
    data.category,
    discount.price,
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
    data.grace_period_days,
    discount.discount_enabled,
    discount.discount_percentage,
    discount.discount_amount,
    discount.discounted_price
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};

export const getAllProducts = async () => {
  await ensureProductColumns();

  const result = await pool.query(`
    SELECT ${productSelectColumns}
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
    "stock",
    "installment_enabled",
    "minimum_deposit_percentage",
    "installment_duration_months",
    "fine_percentage_on_default",
    "minimum_wallet_balance_required",
    "grace_period_days",
    "discount_enabled",
    "discount_percentage"
  ].some((key) => data[key] !== undefined);

  if (!hasAnyUpdateField) {
    throw new Error("No update fields provided");
  }

  await ensureProductColumns();

  const current = await pool.query(
    `SELECT price, discount_enabled, discount_percentage FROM products WHERE id=$1`,
    [id]
  );

  if (!current.rows[0]) {
    return null;
  }

  const discount = calculateProductDiscount(
    data.price ?? current.rows[0].price,
    data.discount_enabled ?? current.rows[0].discount_enabled,
    data.discount_percentage ?? current.rows[0].discount_percentage
  );

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
      installment_enabled=COALESCE($10, installment_enabled),
      minimum_deposit_percentage=COALESCE($11, minimum_deposit_percentage),
      installment_duration_months=COALESCE($12, installment_duration_months),
      fine_percentage_on_default=COALESCE($13, fine_percentage_on_default),
      minimum_wallet_balance_required=COALESCE($14, minimum_wallet_balance_required),
      grace_period_days=COALESCE($15, grace_period_days),
      discount_enabled=$16,
      discount_percentage=$17,
      discount_amount=$18,
      discounted_price=$19,
      updated_at=NOW()
  WHERE id=$20
  RETURNING ${productSelectColumns}
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
    data.grace_period_days,
    discount.discount_enabled,
    discount.discount_percentage,
    discount.discount_amount,
    discount.discounted_price,
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
           COALESCE(discount_enabled, FALSE) AS discount_enabled,
           COALESCE(discount_percentage, 0) AS discount_percentage,
           COALESCE(discount_amount, 0) AS discount_amount,
           COALESCE(discounted_price, price) AS discounted_price,
           CASE
             WHEN COALESCE(discount_enabled, FALSE) THEN COALESCE(discounted_price, price)
             ELSE price
           END AS effective_price,
           ${productImageUrlSelect},
           ${productImageUrlsSelect},
           stock,
           installment_enabled,
           minimum_deposit_percentage,
           installment_duration_months,
           fine_percentage_on_default,
           minimum_wallet_balance_required,
           grace_period_days
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
           COALESCE(discount_enabled, FALSE) AS discount_enabled,
           COALESCE(discount_percentage, 0) AS discount_percentage,
           COALESCE(discount_amount, 0) AS discount_amount,
           COALESCE(discounted_price, price) AS discounted_price,
           CASE
             WHEN COALESCE(discount_enabled, FALSE) THEN COALESCE(discounted_price, price)
             ELSE price
           END AS effective_price,
           ${productImageUrlSelect},
           ${productImageUrlsSelect},
           stock,
           installment_enabled,
           minimum_deposit_percentage,
           installment_duration_months,
           fine_percentage_on_default,
           minimum_wallet_balance_required,
           grace_period_days
    FROM products
    WHERE is_active = true
      AND LOWER(category) = LOWER($1)
    `,
    [normalizedCategory]
  );

  return result.rows;
};
