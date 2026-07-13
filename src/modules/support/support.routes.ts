import { FastifyInstance } from "fastify";
import { requireAdmin } from "../admin/admin.auth";
import { requireUser } from "../auth/user.auth";
import {
  getConversationById,
  getConversationMessages,
  getOrCreateUserConversation,
  listAdminConversations,
  markConversationReadForAdmin
} from "./support.service";

export const supportRoutes = async (app: FastifyInstance) => {
  app.get("/support/conversation", { preHandler: [requireUser] }, async (req, reply) => {
    const conversation = await getOrCreateUserConversation(req.user.id);
    return reply.send({ success: true, conversation });
  });

  app.get("/support/conversation/messages", { preHandler: [requireUser] }, async (req, reply) => {
    const { limit, offset } = req.query as { limit?: string; offset?: string };
    const conversation = await getOrCreateUserConversation(req.user.id);
    const result = await getConversationMessages(
      conversation.id,
      limit === undefined ? undefined : Number(limit),
      offset === undefined ? undefined : Number(offset)
    );

    return reply.send({
      success: true,
      conversation_id: conversation.id,
      ...result
    });
  });

  app.get("/admin/support/conversations", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { limit, offset } = req.query as { limit?: string; offset?: string };
    const result = await listAdminConversations(
      limit === undefined ? undefined : Number(limit),
      offset === undefined ? undefined : Number(offset)
    );

    return reply.send({ success: true, ...result });
  });

  app.get("/admin/support/conversations/:id/messages", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { limit, offset } = req.query as { limit?: string; offset?: string };

    const conversation = await getConversationById(id);
    if (!conversation) {
      return reply.status(404).send({ message: "Conversation not found" });
    }

    await markConversationReadForAdmin(id);

    const result = await getConversationMessages(
      id,
      limit === undefined ? undefined : Number(limit),
      offset === undefined ? undefined : Number(offset)
    );

    return reply.send({
      success: true,
      conversation,
      ...result
    });
  });
};
