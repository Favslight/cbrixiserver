import { pool } from "../../config/db";

export const getSettings = async () => {
  const result = await pool.query(`SELECT * FROM system_settings LIMIT 1`);
  return result.rows[0];
};

export const updateMinimumWalletBalance = async (balance: number) => {
  const result = await pool.query(`
    UPDATE system_settings
    SET minimum_wallet_balance=$1, updated_at=NOW()
    RETURNING *
  `, [balance]);
  return result.rows[0];
};