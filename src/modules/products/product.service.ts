import { pool } from "../../config/db";

export const createProduct = async (data: any) => {
  const query = `
  INSERT INTO products
  (name, description, category, price, image_url,
   stock, installment_enabled, minimum_deposit_percentage,
   installment_duration_months, fine_percentage_on_default,
   minimum_wallet_balance_required, grace_period_days)
  VALUES
  ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  RETURNING *
  `;

  const values = [
    data.name,
    data.description,
    data.category,
    data.price,
    data.image_url,
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