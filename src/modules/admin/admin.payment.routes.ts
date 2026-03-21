import { FastifyInstance } from "fastify";
import {
  getPendingPayments,
  approvePayment,
  approveOrder,
  getPendingOrders,
  rejectOrder
} from "./admin.payment.controller";
import { requireAdmin } from "./admin.auth";

export const adminPaymentRoutes = async (app: FastifyInstance) => {

  app.get("/admin/payments/pending", { preHandler: [requireAdmin] }, getPendingPayments);

  app.post("/admin/payments/:id/approve", { preHandler: [requireAdmin] }, approvePayment);
  app.post("/admin/orders/:id/approve", { preHandler: [requireAdmin] }, approveOrder);
  app.get("/admin/orders/pending", { preHandler: [requireAdmin] }, getPendingOrders);
  app.post("/admin/orders/:id/reject", { preHandler: [requireAdmin] }, rejectOrder);
};