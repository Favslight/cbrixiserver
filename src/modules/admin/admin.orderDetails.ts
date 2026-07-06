import { pool } from "../../config/db";
import { ensureProductColumns } from "../products/product.service";

type AdminRow = Record<string, any>;

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const withAdminUserDisplayFields = <T extends AdminRow>(row: T) => {
  const firstName = normalizeText(row.firstname ?? row.first_name);
  const lastName = normalizeText(row.lastname ?? row.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const displayName = fullName || normalizeText(row.username) || normalizeText(row.email) || null;

  return {
    ...row,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName || null,
    name: displayName
  };
};

export const getAdminOrderItems = async (orderId: string) => {
  await ensureProductColumns();

  const result = await pool.query(
    `
    SELECT
      order_items.*,
      order_items.id AS order_item_id,
      COALESCE(order_items.product_name_snapshot, products.name) AS name,
      COALESCE(order_items.product_name_snapshot, products.name) AS product_name,
      order_items.product_name_snapshot,
      products.description AS product_description,
      products.category AS product_category,
      COALESCE(order_items.variant_name_snapshot, pv.name) AS variant_name,
      COALESCE(order_items.variant_specs_snapshot, pv.specs, '{}'::JSONB) AS variant_specs,
      order_items.variant_name_snapshot,
      order_items.variant_specs_snapshot,
      pv.sku AS variant_sku,
      COALESCE(order_items.price_at_purchase, pv.price, products.price) AS price,
      order_items.price_at_purchase AS unit_price,
      order_items.price_at_purchase AS effective_price,
      ROUND((COALESCE(order_items.price_at_purchase, pv.price, products.price) * order_items.quantity)::NUMERIC, 2) AS line_total,
      COALESCE(products.discount_enabled, FALSE) AS discount_enabled,
      COALESCE(products.discount_percentage, 0) AS discount_percentage,
      CASE
        WHEN COALESCE(products.discount_enabled, FALSE) THEN ROUND((COALESCE(order_items.price_at_purchase, pv.price, products.price) * COALESCE(products.discount_percentage, 0)) / 100, 2)
        ELSE 0
      END AS discount_amount,
      products.image_url,
      products.image_urls,
      products.installment_enabled,
      products.installment_duration_months,
      products.minimum_deposit_percentage
    FROM order_items
    LEFT JOIN products ON products.id = order_items.product_id
    LEFT JOIN product_variants pv ON pv.id = order_items.variant_id
    WHERE order_items.order_id = $1
    ORDER BY order_items.created_at ASC
    `,
    [orderId]
  );

  return result.rows;
};

export const getOrderItemSummary = (items: AdminRow[]) => {
  const productNames = items
    .map((item) => normalizeText(item.product_name ?? item.name))
    .filter((name): name is string => Boolean(name));
  const variantNames = items
    .map((item) => normalizeText(item.variant_name))
    .filter((name): name is string => Boolean(name));
  const productsSummary = items.map((item) => {
    const productName = normalizeText(item.product_name ?? item.name) ?? "Unknown product";
    const variantName = normalizeText(item.variant_name);
    const quantity = Number(item.quantity ?? 0);
    const variantLabel = variantName && variantName.toLowerCase() !== "default"
      ? ` - ${variantName}`
      : "";
    const quantityLabel = quantity > 0 ? ` x${quantity}` : "";

    return `${productName}${variantLabel}${quantityLabel}`;
  });

  return {
    item_count: items.length,
    total_quantity: items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    product_names: productNames,
    variant_names: variantNames,
    products_summary: productsSummary,
    order_summary: productsSummary.join(", ")
  };
};

export const withAdminOrderItemDetails = async <T extends AdminRow>(order: T) => {
  const orderItems = await getAdminOrderItems(order.id ?? order.order_id);

  return {
    ...order,
    ...getOrderItemSummary(orderItems),
    order_items: orderItems
  };
};

export const withAdminOrderItemDetailsList = async <T extends AdminRow>(orders: T[]) => {
  return Promise.all(orders.map((order) => withAdminOrderItemDetails(order)));
};
