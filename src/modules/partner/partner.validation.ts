import { z } from "zod";

const optionalTrimmedString = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : value,
  z.string().trim().min(1).optional()
);

const optionalNonNegativeNumber = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : value,
  z.coerce.number().finite().nonnegative().optional()
);

export const partnerProductsQuerySchema = z.object({
  category: optionalTrimmedString,
  search: optionalTrimmedString,
  min_price: optionalNonNegativeNumber,
  max_price: optionalNonNegativeNumber,
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
}).refine(
  ({ min_price, max_price }) =>
    min_price === undefined ||
    max_price === undefined ||
    min_price <= max_price,
  {
    message: "min_price cannot be greater than max_price",
    path: ["min_price"]
  }
);

export const partnerProductParamsSchema = z.object({
  id: z.string().uuid()
});

export const partnerSalesRecordSchema = z.object({
  external_order_id: z.string().trim().min(1).max(255),
  invoice_number: z.string().trim().min(1).max(255).optional(),
  customer_name: z.string().trim().min(1).max(255),
  customer_email: z.string().trim().email().max(255),
  customer_phone: z.string().trim().min(1).max(100),
  delivery_address: z.string().trim().min(1),
  payment_status: z.string().trim().min(1).max(100),
  order_status: z.string().trim().min(1).max(100),
  total_amount: z.number().finite().nonnegative(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    product_name: z.string().trim().min(1).max(255),
    quantity: z.number().int().positive(),
    unit_price: z.number().finite().nonnegative(),
    total_price: z.number().finite().nonnegative()
  })).min(1)
});
