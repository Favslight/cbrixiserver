import { FastifyInstance } from "fastify";
import {
  getPendingPayments,
  getApprovedPayments,
  getRejectedPayments,
  approvePayment,
  rejectPayment,
  approveOrder,
  getPendingOrders,
  getApprovedOrders,
  getRejectedOrders,
  rejectOrder
} from "./admin.payment.controller";
import { requireAdmin } from "./admin.auth";

export const adminPaymentRoutes = async (app: FastifyInstance) => {

  app.get("/admin/payments/pending", { preHandler: [requireAdmin] }, getPendingPayments);
  app.get("/admin/payments/approved", { preHandler: [requireAdmin] }, getApprovedPayments);
  app.get("/admin/payments/rejected", { preHandler: [requireAdmin] }, getRejectedPayments);

  app.post("/admin/payments/:id/approve", { preHandler: [requireAdmin] }, approvePayment);
  app.post("/admin/payments/:id/reject", { preHandler: [requireAdmin] }, rejectPayment);
  app.post("/admin/orders/:id/approve", { preHandler: [requireAdmin] }, approveOrder);
  app.get("/admin/orders/pending", { preHandler: [requireAdmin] }, getPendingOrders);
  app.get("/admin/orders/approved", { preHandler: [requireAdmin] }, getApprovedOrders);
  app.get("/admin/orders/rejected", { preHandler: [requireAdmin] }, getRejectedOrders);
  app.post("/admin/orders/:id/reject", { preHandler: [requireAdmin] }, rejectOrder);
};
