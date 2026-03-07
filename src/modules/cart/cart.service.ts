import { pool } from "../../config/db";

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

  const result = await pool.query(
    `
    SELECT
      cart_items.id,
      products.name,
      products.price,
      products.image_url,
      cart_items.quantity
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