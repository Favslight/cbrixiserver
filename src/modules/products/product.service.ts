import { PoolClient } from "pg";
import { pool } from "../../config/db";

let ensureProductColumnsPromise: Promise<void> | null = null;

type ProductVariantInput = {
  id?: string;
  name?: string;
  label?: string;
  spec_name?: string;
  specs?: Record<string, unknown> | null;
  sku?: string | null;
  price?: number | string;
  is_active?: boolean;
};

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
        ADD COLUMN IF NOT EXISTS display_order INTEGER
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_products_display_order
        ON products(display_order ASC, created_at DESC)
        WHERE is_active = TRUE
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

      await pool.query(`
        CREATE TABLE IF NOT EXISTS product_variants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          specs JSONB DEFAULT '{}'::JSONB,
          sku VARCHAR(120),
          price NUMERIC(15,2) NOT NULL,
          is_default BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await pool.query(`
        ALTER TABLE product_variants
        ADD COLUMN IF NOT EXISTS specs JSONB DEFAULT '{}'::JSONB,
        ADD COLUMN IF NOT EXISTS sku VARCHAR(120),
        ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
      `);

      await pool.query(`
        INSERT INTO product_variants (product_id, name, specs, price, is_default, sort_order)
        SELECT p.id, 'Default', '{}'::JSONB, p.price, TRUE, 0
        FROM products p
        WHERE NOT EXISTS (
          SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id
        )
      `);

      await pool.query(`
        ALTER TABLE products
        DROP COLUMN IF EXISTS stock,
        DROP COLUMN IF EXISTS fine_percentage_on_default,
        DROP COLUMN IF EXISTS minimum_wallet_balance_required,
        DROP COLUMN IF EXISTS grace_period_days
      `);

      await pool.query(`
        ALTER TABLE product_variants
        DROP COLUMN IF EXISTS stock
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_one_default
        ON product_variants(product_id)
        WHERE is_default = TRUE
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
        ON product_variants(product_id)
      `);

      await pool.query(`
        ALTER TABLE cart_items
        ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id)
      `);

      await pool.query(`
        UPDATE cart_items ci
        SET variant_id = pv.id
        FROM product_variants pv
        WHERE ci.product_id = pv.product_id
          AND pv.is_default = TRUE
          AND ci.variant_id IS NULL
      `);

      await pool.query(`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id),
        ADD COLUMN IF NOT EXISTS product_name_snapshot VARCHAR(255),
        ADD COLUMN IF NOT EXISTS variant_name_snapshot VARCHAR(255),
        ADD COLUMN IF NOT EXISTS variant_specs_snapshot JSONB DEFAULT '{}'::JSONB
      `);

      await pool.query(`
        UPDATE order_items oi
        SET
          variant_id = COALESCE(oi.variant_id, pv.id),
          product_name_snapshot = COALESCE(oi.product_name_snapshot, p.name),
          variant_name_snapshot = COALESCE(oi.variant_name_snapshot, pv.name),
          variant_specs_snapshot = COALESCE(oi.variant_specs_snapshot, pv.specs, '{}'::JSONB)
        FROM products p
        LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = TRUE
        WHERE oi.product_id = p.id
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
  installment_enabled,
  minimum_deposit_percentage,
  installment_duration_months,
  display_order,
  is_active,
  created_at,
  updated_at
`;

const variantSelectColumns = `
  pv.id,
  pv.product_id,
  pv.name,
  COALESCE(pv.specs, '{}'::JSONB) AS specs,
  pv.sku,
  pv.price,
  COALESCE(p.discount_enabled, FALSE) AS discount_enabled,
  COALESCE(p.discount_percentage, 0) AS discount_percentage,
  CASE
    WHEN COALESCE(p.discount_enabled, FALSE) THEN ROUND((pv.price * COALESCE(p.discount_percentage, 0)) / 100, 2)
    ELSE 0
  END AS discount_amount,
  CASE
    WHEN COALESCE(p.discount_enabled, FALSE) THEN GREATEST(ROUND(pv.price - ((pv.price * COALESCE(p.discount_percentage, 0)) / 100), 2), 0)
    ELSE pv.price
  END AS discounted_price,
  CASE
    WHEN COALESCE(p.discount_enabled, FALSE) THEN GREATEST(ROUND(pv.price - ((pv.price * COALESCE(p.discount_percentage, 0)) / 100), 2), 0)
  ELSE pv.price
  END AS effective_price,
  pv.is_default,
  pv.is_active,
  pv.sort_order,
  pv.created_at,
  pv.updated_at
`;

const getVariantName = (variant: ProductVariantInput, index: number) => {
  const fromField = variant.name ?? variant.label ?? variant.spec_name;
  if (typeof fromField === "string" && fromField.trim()) return fromField.trim();

  if (variant.specs && typeof variant.specs === "object") {
    const values = Object.entries(variant.specs)
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
      .map(([key, value]) => `${key}: ${value}`);
    if (values.length) return values.join(" / ");
  }

  return `Variant ${index + 1}`;
};

const normalizeVariantInputs = (
  variants: ProductVariantInput[] | undefined,
  fallbackPrice: number | string
) => {
  const inputVariants = variants?.length
    ? variants
    : [{
        name: "Default",
        specs: {},
        price: fallbackPrice,
        is_active: true
      }];

  const normalized = inputVariants.map((variant, index) => {
    const price = Number(variant.price);

    if (!Number.isFinite(price) || price < 0) {
      throw new Error("variant price must be a valid non-negative number");
    }

    const specs = variant.specs && typeof variant.specs === "object" && !Array.isArray(variant.specs)
      ? variant.specs
      : {};

    return {
      id: typeof variant.id === "string" && variant.id.trim() ? variant.id.trim() : undefined,
      name: getVariantName(variant, index),
      specs,
      sku: typeof variant.sku === "string" && variant.sku.trim() ? variant.sku.trim() : null,
      price: roundMoney(price),
      is_active: variant.is_active !== false,
      sort_order: index
    };
  });

  if (!normalized.some((variant) => variant.is_active)) {
    throw new Error("At least one active product variant is required");
  }

  return normalized;
};

const getProductVariants = async (
  productIds: string[],
  includeInactive = false
) => {
  if (!productIds.length) return [];

  const result = await pool.query(
    `
    SELECT ${variantSelectColumns}
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.product_id = ANY($1::UUID[])
      AND ($2::BOOLEAN = TRUE OR pv.is_active = TRUE)
    ORDER BY pv.product_id, pv.sort_order ASC, pv.created_at ASC
    `,
    [productIds, includeInactive]
  );

  return result.rows;
};

const attachVariants = async (products: any[], includeInactive = false) => {
  if (!products.length) return products;

  const variants = await getProductVariants(
    products.map((product) => product.id),
    includeInactive
  );
  const variantsByProduct = new Map<string, any[]>();

  for (const variant of variants) {
    const grouped = variantsByProduct.get(variant.product_id) ?? [];
    grouped.push(variant);
    variantsByProduct.set(variant.product_id, grouped);
  }

  return products.map((product) => {
    const productVariants = variantsByProduct.get(product.id) ?? [];
    const activeVariants = productVariants.filter((variant) => variant.is_active);
    const pricedVariants = activeVariants.length ? activeVariants : productVariants;
    const defaultVariant = pricedVariants.find((variant) => variant.is_default) ?? pricedVariants[0] ?? null;
    const lowestVariant = pricedVariants.reduce((lowest, variant) => {
      if (!lowest) return variant;
      return Number(variant.effective_price) < Number(lowest.effective_price) ? variant : lowest;
    }, null as any);
    const highestVariant = pricedVariants.reduce((highest, variant) => {
      if (!highest) return variant;
      return Number(variant.effective_price) > Number(highest.effective_price) ? variant : highest;
    }, null as any);

    return {
      ...product,
      has_variants: activeVariants.length > 1,
      default_variant_id: defaultVariant?.id ?? null,
      variants: productVariants,
      variant_price_min: lowestVariant?.effective_price ?? product.effective_price,
      variant_price_max: highestVariant?.effective_price ?? product.effective_price,
      price: lowestVariant?.price ?? product.price,
      discount_amount: lowestVariant?.discount_amount ?? product.discount_amount,
      discounted_price: lowestVariant?.discounted_price ?? product.discounted_price,
      effective_price: lowestVariant?.effective_price ?? product.effective_price
    };
  });
};

const insertVariants = async (
  client: PoolClient,
  productId: string,
  variants: ReturnType<typeof normalizeVariantInputs>
) => {
  let defaultAssigned = false;

  for (const variant of variants) {
    const isDefault = variant.is_active && !defaultAssigned;
    if (isDefault) defaultAssigned = true;

    await client.query(
      `
      INSERT INTO product_variants
        (product_id, name, specs, sku, price, is_default, is_active, sort_order)
      VALUES ($1,$2,$3::JSONB,$4,$5,$6,$7,$8)
      `,
      [
        productId,
        variant.name,
        JSON.stringify(variant.specs),
        variant.sku,
        variant.price,
        isDefault,
        variant.is_active,
        variant.sort_order
      ]
    );
  }
};

const replaceVariants = async (
  client: PoolClient,
  productId: string,
  variants: ReturnType<typeof normalizeVariantInputs>
) => {
  await client.query(
    `UPDATE product_variants SET is_default = FALSE, is_active = FALSE, updated_at = NOW() WHERE product_id=$1`,
    [productId]
  );

  let defaultAssigned = false;
  const submittedExistingIds: string[] = [];

  for (const variant of variants) {
    const isDefault = variant.is_active && !defaultAssigned;
    if (isDefault) defaultAssigned = true;

    if (variant.id) {
      const updated = await client.query(
        `
        UPDATE product_variants
        SET name=$1,
            specs=$2::JSONB,
            sku=$3,
            price=$4,
            is_default=$5,
            is_active=$6,
            sort_order=$7,
            updated_at=NOW()
        WHERE id=$8 AND product_id=$9
        RETURNING id
        `,
        [
          variant.name,
          JSON.stringify(variant.specs),
          variant.sku,
          variant.price,
          isDefault,
          variant.is_active,
          variant.sort_order,
          variant.id,
          productId
        ]
      );

      if (updated.rows[0]) {
        submittedExistingIds.push(updated.rows[0].id);
        continue;
      }
    }

    const inserted = await client.query(
      `
      INSERT INTO product_variants
        (product_id, name, specs, sku, price, is_default, is_active, sort_order)
      VALUES ($1,$2,$3::JSONB,$4,$5,$6,$7,$8)
      RETURNING id
      `,
      [
        productId,
        variant.name,
        JSON.stringify(variant.specs),
        variant.sku,
        variant.price,
        isDefault,
        variant.is_active,
        variant.sort_order
      ]
    );
    submittedExistingIds.push(inserted.rows[0].id);
  }

  return submittedExistingIds;
};

const homepageProductOrderClause = `
  display_order ASC NULLS LAST,
  created_at DESC
`;

const normalizeDisplayOrderInput = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const displayOrder = Number(value);
  if (!Number.isInteger(displayOrder) || displayOrder < 1) {
    throw new Error("display_order must be a positive integer or null");
  }

  return displayOrder;
};

const rewriteActiveProductDisplayOrder = async (
  client: PoolClient,
  orderedProductIds: string[]
) => {
  await client.query(`
    UPDATE products
    SET display_order = NULL,
        updated_at = NOW()
    WHERE is_active = TRUE
      AND display_order IS NOT NULL
  `);

  if (!orderedProductIds.length) return;

  const valuesSql = orderedProductIds
    .map((_, index) => `($${index + 1}::UUID, ${index + 1})`)
    .join(",");

  await client.query(
    `
    UPDATE products AS p
    SET display_order = ordered.display_order,
        updated_at = NOW()
    FROM (VALUES ${valuesSql}) AS ordered(id, display_order)
    WHERE p.id = ordered.id
    `,
    orderedProductIds
  );
};

const setProductDisplayOrder = async (
  client: PoolClient,
  productId: string,
  displayOrderInput: unknown
) => {
  const displayOrder = normalizeDisplayOrderInput(displayOrderInput);
  if (displayOrder === undefined) return;

  await client.query("LOCK TABLE products IN SHARE ROW EXCLUSIVE MODE");

  const current = await client.query(
    `SELECT id, is_active FROM products WHERE id=$1`,
    [productId]
  );

  if (!current.rows[0]) {
    throw new Error("Product not found");
  }

  const orderedResult = await client.query(
    `
    SELECT id
    FROM products
    WHERE is_active = TRUE
      AND display_order IS NOT NULL
      AND id <> $1
    ORDER BY display_order ASC, created_at DESC, id ASC
    `,
    [productId]
  );

  const orderedProductIds = orderedResult.rows.map((row) => row.id);

  if (displayOrder !== null && current.rows[0].is_active === true) {
    const insertIndex = Math.min(displayOrder - 1, orderedProductIds.length);
    orderedProductIds.splice(insertIndex, 0, productId);
  }

  await rewriteActiveProductDisplayOrder(client, orderedProductIds);

  if (displayOrder === null || current.rows[0].is_active !== true) {
    await client.query(
      `UPDATE products SET display_order=NULL, updated_at=NOW() WHERE id=$1`,
      [productId]
    );
  }
};

export const createProduct = async (data: any) => {
  await ensureProductColumns();

  const variants = normalizeVariantInputs(data.variants, data.price);
  const activeVariants = variants.filter((variant) => variant.is_active);
  const lowestVariant = activeVariants.reduce((lowest, variant) => (
    variant.price < lowest.price ? variant : lowest
  ), activeVariants[0]);

  const productPrice = data.price ?? lowestVariant.price;
  const discount = calculateProductDiscount(
    productPrice,
    data.discount_enabled === true,
    data.discount_percentage
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const query = `
    INSERT INTO products
  (name, description, category, price, image_url, image_public_id,
   image_urls, image_public_ids,
   installment_enabled, minimum_deposit_percentage,
   installment_duration_months,
   discount_enabled, discount_percentage, discount_amount, discounted_price)
    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
      data.installment_enabled,
      data.minimum_deposit_percentage,
      data.installment_duration_months,
      discount.discount_enabled,
      discount.discount_percentage,
      discount.discount_amount,
      discount.discounted_price
    ];

    const result = await client.query(query, values);
    await insertVariants(client, result.rows[0].id, variants);
    await setProductDisplayOrder(client, result.rows[0].id, data.display_order);
    const productResult = await client.query(
      `SELECT ${productSelectColumns} FROM products WHERE id=$1`,
      [result.rows[0].id]
    );
    await client.query("COMMIT");

    const [product] = await attachVariants([productResult.rows[0]], true);
    return product;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getAllProducts = async () => {
  await ensureProductColumns();

  const result = await pool.query(`
    SELECT ${productSelectColumns}
    FROM products
    WHERE is_active = true
    ORDER BY ${homepageProductOrderClause}
  `);

  return attachVariants(result.rows, true);
};

export const deleteProduct = async (id: string) => {
  await ensureProductColumns();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const product = await client.query(
      `SELECT image_public_id, image_public_ids FROM products WHERE id=$1`,
      [id]
    );

    if (!product.rows[0]) {
      throw new Error("Product not found");
    }

    const result = await client.query(
      `UPDATE products
       SET is_active=false, display_order=NULL, updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [id]
    );

    await client.query(
      `UPDATE product_variants SET is_active=false, updated_at=NOW() WHERE product_id=$1`,
      [id]
    );

    await setProductDisplayOrder(client, id, null);
    await client.query("COMMIT");

    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
    "installment_enabled",
    "minimum_deposit_percentage",
    "installment_duration_months",
    "discount_enabled",
    "discount_percentage",
    "display_order",
    "variants"
  ].some((key) => data[key] !== undefined);

  if (!hasAnyUpdateField) {
    throw new Error("No update fields provided");
  }

  await ensureProductColumns();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const current = await client.query(
      `SELECT price, discount_enabled, discount_percentage FROM products WHERE id=$1`,
      [id]
    );

    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    let normalizedVariants: ReturnType<typeof normalizeVariantInputs> | undefined;

    if (data.variants !== undefined) {
      normalizedVariants = normalizeVariantInputs(
        data.variants,
        data.price ?? current.rows[0].price
      );
    }

    const activeVariants = normalizedVariants?.filter((variant) => variant.is_active) ?? [];
    const lowestVariant = activeVariants.reduce((lowest, variant) => (
      !lowest || variant.price < lowest.price ? variant : lowest
    ), undefined as (typeof activeVariants)[number] | undefined);
    const nextPrice = data.price ?? lowestVariant?.price ?? current.rows[0].price;
    const discount = calculateProductDiscount(
      nextPrice,
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
        installment_enabled=COALESCE($9, installment_enabled),
        minimum_deposit_percentage=COALESCE($10, minimum_deposit_percentage),
        installment_duration_months=COALESCE($11, installment_duration_months),
        discount_enabled=$12,
        discount_percentage=$13,
        discount_amount=$14,
        discounted_price=$15,
        updated_at=NOW()
    WHERE id=$16
    RETURNING ${productSelectColumns}
    `;

    const values = [
      data.name,
      data.description,
      data.category,
      nextPrice,
      data.image_url,
      data.image_public_id,
      data.image_urls,
      data.image_public_ids,
      data.installment_enabled,
      data.minimum_deposit_percentage,
      data.installment_duration_months,
      discount.discount_enabled,
      discount.discount_percentage,
      discount.discount_amount,
      discount.discounted_price,
      id
    ];

    await client.query(query, values);

    if (normalizedVariants) {
      await replaceVariants(client, id, normalizedVariants);
    }

    await setProductDisplayOrder(client, id, data.display_order);
    const productResult = await client.query(
      `SELECT ${productSelectColumns} FROM products WHERE id=$1`,
      [id]
    );

    await client.query("COMMIT");

    const [product] = await attachVariants([productResult.rows[0]], true);
    return product;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const reorderHomepageProducts = async (productIds: string[]) => {
  await ensureProductColumns();

  if (!Array.isArray(productIds)) {
    throw new Error("product_ids must be an array");
  }

  const normalizedIds = productIds.map((id) => (
    typeof id === "string" ? id.trim() : ""
  ));
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (normalizedIds.some((id) => !uuidPattern.test(id))) {
    throw new Error("product_ids must contain valid product ids");
  }

  const uniqueIds = new Set(normalizedIds);
  if (uniqueIds.size !== normalizedIds.length) {
    throw new Error("product_ids must not contain duplicates");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE products IN SHARE ROW EXCLUSIVE MODE");

    if (normalizedIds.length) {
      const activeProducts = await client.query(
        `
        SELECT id
        FROM products
        WHERE is_active = TRUE
          AND id = ANY($1::UUID[])
        `,
        [normalizedIds]
      );

      if (activeProducts.rows.length !== normalizedIds.length) {
        throw new Error("All product_ids must be active products");
      }
    }

    await rewriteActiveProductDisplayOrder(client, normalizedIds);
    await client.query("COMMIT");

    return getAllProducts();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
           installment_enabled,
           minimum_deposit_percentage,
           installment_duration_months,
           display_order
    FROM products
    WHERE is_active = true
    ORDER BY ${homepageProductOrderClause}
  `);

  return attachVariants(result.rows);
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
           installment_enabled,
           minimum_deposit_percentage,
           installment_duration_months,
           display_order
    FROM products
    WHERE is_active = true
      AND LOWER(category) = LOWER($1)
    ORDER BY created_at DESC
    `,
    [normalizedCategory]
  );

  return attachVariants(result.rows);
};
