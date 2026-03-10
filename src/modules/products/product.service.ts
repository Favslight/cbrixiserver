// src/modules/products/product.service.ts
import { pool } from "../../config/db";
import { deleteFromCloudinary } from "../../plugins/cloudinary";

export const createProduct = async (data: any) => {
  const query = `
  INSERT INTO products
(name, description, category, price, image_url, image_public_id,
 stock, installment_enabled, minimum_deposit_percentage,
 installment_duration_months, fine_percentage_on_default,
 minimum_wallet_balance_required, grace_period_days)
  VALUES
  ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  RETURNING *
  `;

  const values = [
    data.name,
    data.description,
    data.category,
    data.price,
    data.image_url,
    data.image_public_id,
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

  const result = await pool.query(`
    SELECT * FROM products
    ORDER BY created_at DESC
  `);

  return result.rows;

};

export const deleteProduct = async (id: string) => {

  // get product first
  const product = await pool.query(
    `SELECT image_public_id FROM products WHERE id=$1`,
    [id]
  );

  if (!product.rows[0]) {
    throw new Error("Product not found");
  }

  const publicId = product.rows[0].image_public_id;

  // delete from cloudinary
  if (publicId) {
    await deleteFromCloudinary(publicId);
  }

  // delete from DB
  const result = await pool.query(
    `DELETE FROM products WHERE id=$1 RETURNING *`,
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

  const result = await pool.query(`
    SELECT id,name,description,category,price,image_url,stock
    FROM products
    WHERE is_active = true
  `);

  return result.rows;

};