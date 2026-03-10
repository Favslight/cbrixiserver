import { FastifyInstance } from "fastify";
import {
  getPendingPayments,
  approvePayment
} from "./admin.payment.controller";
import { requireAdmin } from "./admin.auth";

export const adminPaymentRoutes = async (app: FastifyInstance) => {

  app.get("/admin/payments/pending", { preHandler: [requireAdmin] }, getPendingPayments);

  app.post("/admin/payments/:id/approve", { preHandler: [requireAdmin] }, approvePayment);

};