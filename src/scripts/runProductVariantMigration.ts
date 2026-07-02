import "dotenv/config";
import { pool } from "../config/db";
import { ensureProductColumns } from "../modules/products/product.service";

const run = async () => {
  await ensureProductColumns();
  console.log("Product variant migration applied");
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
