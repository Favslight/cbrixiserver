import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAdmin } from "../admin/admin.auth";
import { requireUser } from "../auth/user.auth";
import {
  deleteNotification,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationTargetType
} from "./notification.service";
import {
  createSupportMessage,
  getConversationMessages,
  getOrCreateUserConversation
} from "../support/support.service";
import { broadcastSupportMessage } from "../support/support.socket";

const getStatus = (req: FastifyRequest) => {
  const status = (req.query as { status?: string }).status;
  return status === "read" || status === "unread" ? status : "all";
};

const sendNotifications = async (
  req: FastifyRequest,
  reply: FastifyReply,
  targetType: NotificationTargetType,
  userId: string | null
) => {
  const notifications = await getNotifications(targetType, userId, getStatus(req));
  return reply.send({ success: true, notifications });
};

const sendUnreadCount = async (
  _req: FastifyRequest,
  reply: FastifyReply,
  targetType: NotificationTargetType,
  userId: string | null
) => {
  const unread_count = await getUnreadNotificationCount(targetType, userId);
  return reply.send({ success: true, unread_count });
};

const sendMarkRead = async (
  req: FastifyRequest,
  reply: FastifyReply,
  targetType: NotificationTargetType,
  userId: string | null
) => {
  const { id } = req.params as { id: string };
  const notification = await markNotificationRead(targetType, userId, id);

  if (!notification) {
    return reply.status(404).send({ message: "Notification not found" });
  }

  return reply.send({ success: true, notification });
};

const sendMarkAllRead = async (
  _req: FastifyRequest,
  reply: FastifyReply,
  targetType: NotificationTargetType,
  userId: string | null
) => {
  const notifications = await markAllNotificationsRead(targetType, userId);
  return reply.send({ success: true, updated_count: notifications.length });
};

const sendDelete = async (
  req: FastifyRequest,
  reply: FastifyReply,
  targetType: NotificationTargetType,
  userId: string | null
) => {
  const { id } = req.params as { id: string };
  const notification = await deleteNotification(targetType, userId, id);

  if (!notification) {
    return reply.status(404).send({ message: "Notification not found" });
  }

  return reply.send({ success: true });
};

export const notificationRoutes = async (app: FastifyInstance) => {
  app.get("/notifications", { preHandler: [requireUser] }, (req, reply) =>
    sendNotifications(req, reply, "USER", req.user.id)
  );

  app.get("/notifications/unread-count", { preHandler: [requireUser] }, (req, reply) =>
    sendUnreadCount(req, reply, "USER", req.user.id)
  );

  app.patch("/notifications/:id/read", { preHandler: [requireUser] }, (req, reply) =>
    sendMarkRead(req, reply, "USER", req.user.id)
  );

  app.patch("/notifications/read-all", { preHandler: [requireUser] }, (req, reply) =>
    sendMarkAllRead(req, reply, "USER", req.user.id)
  );

  app.delete("/notifications/:id", { preHandler: [requireUser] }, (req, reply) =>
    sendDelete(req, reply, "USER", req.user.id)
  );

  app.get("/support/conversation", { preHandler: [requireUser] }, async (req, reply) => {
    const conversation = await getOrCreateUserConversation(req.user.id);
    return reply.send({ success: true, conversation });
  });

  app.get("/support/conversation/messages", { preHandler: [requireUser] }, async (req, reply) => {
    const { limit, offset, page } = req.query as {
      limit?: string;
      offset?: string;
      page?: string;
    };
    const conversation = await getOrCreateUserConversation(req.user.id);
    const result = await getConversationMessages(conversation.id, {
      limit: limit === undefined ? undefined : Number(limit),
      offset: offset === undefined ? undefined : Number(offset),
      page: page === undefined ? undefined : Number(page)
    });

    return reply.send({
      success: true,
      conversation_id: conversation.id,
      ...result
    });
  });

  app.post("/support/conversation/messages", { preHandler: [requireUser] }, async (req, reply) => {
    try {
      const body = req.body as { message?: string };
      const conversation = await getOrCreateUserConversation(req.user.id);
      const { message } = await createSupportMessage({
        conversationId: conversation.id,
        senderType: "USER",
        senderId: req.user.id,
        message: body.message ?? ""
      });

      await broadcastSupportMessage(conversation.id, message, "USER");

      return reply.status(201).send({
        success: true,
        conversation_id: conversation.id,
        message
      });
    } catch (error: any) {
      return reply.status(400).send({ message: error.message });
    }
  });

  app.get("/admin/notifications", { preHandler: [requireAdmin] }, (req, reply) =>
    sendNotifications(req, reply, "ADMIN", null)
  );

  app.get("/admin/notifications/unread-count", { preHandler: [requireAdmin] }, (req, reply) =>
    sendUnreadCount(req, reply, "ADMIN", null)
  );

  app.patch("/admin/notifications/:id/read", { preHandler: [requireAdmin] }, (req, reply) =>
    sendMarkRead(req, reply, "ADMIN", null)
  );

  app.patch("/admin/notifications/read-all", { preHandler: [requireAdmin] }, (req, reply) =>
    sendMarkAllRead(req, reply, "ADMIN", null)
  );

  app.delete("/admin/notifications/:id", { preHandler: [requireAdmin] }, (req, reply) =>
    sendDelete(req, reply, "ADMIN", null)
  );
};
