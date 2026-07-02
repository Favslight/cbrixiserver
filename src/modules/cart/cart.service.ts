// src/modules/cart/cart.service.ts
import { pool } from "../../config/db";
import { ensureProductColumns } from "../products/product.service";

export const addToCart = async (
  userId: string,
  productId: string,
  quantity: number
) => {

  // get or create cart
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

  // check if item already exists
  const existing = await pool.query(
    `SELECT id, quantity FROM cart_items
     WHERE cart_id=$1 AND product_id=$2`,
    [cartId, productId]
  );

  if (existing.rows[0]) {

    const newQty = existing.rows[0].quantity + quantity;

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
    `INSERT INTO cart_items (cart_id, product_id, quantity)
     VALUES ($1,$2,$3)
     RETURNING *`,
    [cartId, productId, quantity]
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
      cart_items.quantity,
      products.name,
      products.price,
      COALESCE(products.discount_enabled, FALSE) AS discount_enabled,
      COALESCE(products.discount_percentage, 0) AS discount_percentage,
      COALESCE(products.discount_amount, 0) AS discount_amount,
      COALESCE(products.discounted_price, products.price) AS discounted_price,
      CASE
        WHEN COALESCE(products.discount_enabled, FALSE) THEN COALESCE(products.discounted_price, products.price)
        ELSE products.price
      END AS effective_price,
      products.image_url,
      products.image_urls,
      products.installment_enabled,
      products.installment_duration_months,
      products.minimum_deposit_percentage,
      products.minimum_wallet_balance_required
    FROM carts
    JOIN cart_items ON carts.id = cart_items.cart_id
    JOIN products ON products.id = cart_items.product_id
    WHERE carts.user_id = $1
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

  const item = await pool.query(
    `
    SELECT cart_items.id, products.stock
    FROM cart_items
    JOIN products ON products.id = cart_items.product_id
    WHERE cart_items.id=$1
    `,
    [itemId]
  );

  if (!item.rows[0]) {
    throw new Error("Cart item not found");
  }

  if (item.rows[0].stock < quantity) {
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
