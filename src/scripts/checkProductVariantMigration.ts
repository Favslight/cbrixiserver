import "dotenv/config";
import { pool } from "../config/db";

const run = async () => {
  const tableResult = await pool.query(
    `SELECT to_regclass('public.product_variants') AS product_variants`
  );
  const countsResult = await pool.query(`
    SELECT
      (SELECT COUNT(*)::INT FROM products) AS products,
      (SELECT COUNT(*)::INT FROM product_variants) AS variants,
      (
        SELECT COUNT(*)::INT
        FROM products p
        WHERE NOT EXISTS (
          SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id
        )
      ) AS products_without_variants
  `);

  console.log(JSON.stringify({
    table: tableResult.rows[0].product_variants,
    counts: countsResult.rows[0]
  }));
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
