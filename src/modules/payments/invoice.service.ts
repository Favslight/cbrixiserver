import { pool } from "../../config/db";

export const generateInvoiceNumber = async () => {
  const year = new Date().getFullYear();

  const result = await pool.query(`
    SELECT COUNT(*) FROM payment_transactions 
    WHERE DATE_PART('year', created_at) = $1
  `, [year]);

  const count = Number(result.rows[0].count) + 1;

  const padded = count.toString().padStart(6, "0");

  return `INV-${year}-${padded}`;
};