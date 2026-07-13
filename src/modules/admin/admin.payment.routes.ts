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
import {
  addAdminNotificationEmail,
  getAdminNotificationEmails,
  removeAdminNotificationEmail
} from "../admin-notifications/adminNotification.service";

export const adminPaymentRoutes = async (app: FastifyInstance) => {

  app.get("/admin/notification-emails", { preHandler: [requireAdmin] }, async (_req, reply) => {
    const emails = await getAdminNotificationEmails();
    return reply.send({ success: true, emails });
  });

  app.post("/admin/notification-emails", { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const body = req.body as { email?: string; label?: string };
      const email = await addAdminNotificationEmail(
        body.email ?? "",
        body.label,
        req.admin?.id
      );
      return reply.status(201).send({ success: true, email });
    } catch (error: any) {
      return reply.status(400).send({ message: error.message });
    }
  });

  app.delete("/admin/notification-emails/:id", { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const email = await removeAdminNotificationEmail(id);
      return reply.send({ success: true, email });
    } catch (error: any) {
      return reply.status(400).send({ message: error.message });
    }
  });

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
