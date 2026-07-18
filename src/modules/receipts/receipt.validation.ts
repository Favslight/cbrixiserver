import { z } from "zod";

export const receiptNumberParamsSchema = z.object({
  receiptNumber: z.string().trim().min(1).max(64)
});

export const receiptIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const paymentIdParamsSchema = z.object({
  paymentId: z.string().uuid()
});

export const orderIdParamsSchema = z.object({
  orderId: z.string().uuid()
});

export const receiptListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  order_id: z.string().uuid().optional(),
  payment_id: z.string().uuid().optional()
});
