import { FastifyInstance } from "fastify";
import { requireAdmin } from "../admin/admin.auth";
import {
  addAdminNotificationEmail,
  getAdminNotificationEmails,
  removeAdminNotificationEmail
} from "./adminNotification.service";

export const adminNotificationRoutes = async (app: FastifyInstance) => {
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
};
