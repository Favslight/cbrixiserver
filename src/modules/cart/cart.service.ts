import { pool } from "../../config/db";
import { ensureProductColumns } from "../products/product.service";

const resolveProductVariant = async (
  productId: string,
  variantId?: string | null
) => {
  await ensureProductColumns();

  const values: unknown[] = [productId];
  let variantFilter = "pv.is_default = TRUE";

  if (variantId) {
    values.push(variantId);
    variantFilter = `pv.id = $${values.length}`;
  }

  const result = await pool.query(
    `
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.is_active AS product_is_active,
      pv.id AS variant_id,
      pv.name AS variant_name,
      pv.stock,
      pv.is_active AS variant_is_active
    FROM products p
    JOIN product_variants pv ON pv.product_id = p.id
    WHERE p.id = $1
      AND ${variantFilter}
    ORDER BY pv.is_default DESC, pv.sort_order ASC, pv.created_at ASC
    LIMIT 1
    `,
    values
  );

  const row = result.rows[0];

  if (!row || !row.product_is_active || !row.variant_is_active) {
    throw new Error("Product variant not found");
  }

  return row;
};

export const addToCart = async (
  userId: string,
  productId: string,
  quantity: number,
  variantId?: string | null
) => {
  const requestedQuantity = Number(quantity || 1);
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new Error("Quantity must be greater than zero");
  }

  const variant = await resolveProductVariant(productId, variantId);

  if (Number(variant.stock) < requestedQuantity) {
    throw new Error("Insufficient stock");
  }

  let cart = await pool.query(
    `SELECT id FROM carts WHERE user_id=$1`,
    [userId]
  );

  if (!cart.rows[0]) {
    cart = await pool.query(
      `INSERT INTO carts (user_id)
       VALUES ($1)
       RETURNING id`,
      [userId]
    );
  }

  const cartId = cart.rows[0].id;

  const existing = await pool.query(
    `SELECT id, quantity FROM cart_items
     WHERE cart_id=$1 AND product_id=$2 AND variant_id=$3`,
    [cartId, productId, variant.variant_id]
  );

  if (existing.rows[0]) {
    const newQty = Number(existing.rows[0].quantity) + requestedQuantity;

    if (Number(variant.stock) < newQty) {
      throw new Error("Insufficient stock");
    }

    const updated = await pool.query(
      `UPDATE cart_items
       SET quantity=$1
       WHERE id=$2
       RETURNING *`,
      [newQty, existing.rows[0].id]
    );

    return updated.rows[0];
  }

  const result = await pool.query(
    `INSERT INTO cart_items (cart_id, product_id, variant_id, quantity)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [cartId, productId, variant.variant_id, requestedQuantity]
  );

  return result.rows[0];
};

export const getCart = async (userId: string) => {
  await ensureProductColumns();

  const result = await pool.query(
    `
    SELECT
      cart_items.id AS cart_item_id,
      cart_items.product_id,
      cart_items.variant_id,
      cart_items.quantity,
      products.name,
      pv.name AS variant_name,
      COALESCE(pv.specs, '{}'::JSONB) AS variant_specs,
      pv.sku AS variant_sku,
      pv.price,
      COALESCE(products.discount_enabled, FALSE) AS discount_enabled,
      COALESCE(products.discount_percentage, 0) AS discount_percentage,
      CASE
        WHEN COALESCE(products.discount_enabled, FALSE) THEN ROUND((pv.price * COALESCE(products.discount_percentage, 0)) / 100, 2)
        ELSE 0
      END AS discount_amount,
      CASE
        WHEN COALESCE(products.discount_enabled, FALSE) THEN GREATEST(ROUND(pv.price - ((pv.price * COALESCE(products.discount_percentage, 0)) / 100), 2), 0)
        ELSE pv.price
      END AS discounted_price,
      CASE
        WHEN COALESCE(products.discount_enabled, FALSE) THEN GREATEST(ROUND(pv.price - ((pv.price * COALESCE(products.discount_percentage, 0)) / 100), 2), 0)
        ELSE pv.price
      END AS effective_price,
      products.image_url,
      products.image_urls,
      products.installment_enabled,
      products.installment_duration_months,
      products.minimum_deposit_percentage,
      products.minimum_wallet_balance_required,
      pv.stock
    FROM carts
    JOIN cart_items ON carts.id = cart_items.cart_id
    JOIN products ON products.id = cart_items.product_id
    JOIN product_variants pv ON pv.id = cart_items.variant_id
    WHERE carts.user_id = $1
      AND products.is_active = TRUE
      AND pv.is_active = TRUE
    `,
    [userId]
  );

  return result.rows;
};

export const removeCartItem = async (itemId: string) => {
  const result = await pool.query(
    `DELETE FROM cart_items WHERE id=$1 RETURNING *`,
    [itemId]
  );

  return result.rows[0];
};

export const updateCartItemQuantity = async (
  itemId: string,
  quantity: number
) => {
  if (quantity <= 0) {
    throw new Error("Quantity must be greater than zero");
  }

  await ensureProductColumns();

  const item = await pool.query(
    `
    SELECT cart_items.id, pv.stock
    FROM cart_items
    JOIN product_variants pv ON pv.id = cart_items.variant_id
    WHERE cart_items.id=$1
    `,
    [itemId]
  );

  if (!item.rows[0]) {
    throw new Error("Cart item not found");
  }

  if (Number(item.rows[0].stock) < quantity) {
    throw new Error("Insufficient stock");
  }

  const updated = await pool.query(
    `
    UPDATE cart_items
    SET quantity=$1
    WHERE id=$2
    RETURNING *
    `,
    [quantity, itemId]
  );

  return updated.rows[0];
};
