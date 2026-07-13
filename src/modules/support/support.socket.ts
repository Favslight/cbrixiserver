import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import {
  createSupportMessage,
  ensureSupportSchema,
  getConversationById,
  getOrCreateUserConversation,
  verifySupportSocketAuth
} from "./support.service";

type SupportSocket = Socket & {
  data: {
    role?: "user" | "admin";
    userId?: string;
    adminId?: string;
  };
};

let io: Server | null = null;

const conversationRoom = (conversationId: string) => `support:conversation:${conversationId}`;
const adminInboxRoom = "support:admin-inbox";

export const initSupportSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true
    },
    path: "/socket.io"
  });

  io.use(async (socket: SupportSocket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: string; role?: string };
      const identity = verifySupportSocketAuth(auth.token, auth.role);
      socket.data.role = identity.role;
      if (identity.role === "admin") {
        socket.data.adminId = identity.id;
      } else {
        socket.data.userId = identity.id;
      }
      next();
    } catch (error: any) {
      next(error);
    }
  });

  io.on("connection", async (socket: SupportSocket) => {
    await ensureSupportSchema();

    if (socket.data.role === "admin") {
      socket.join(adminInboxRoom);
    } else if (socket.data.userId) {
      const conversation = await getOrCreateUserConversation(socket.data.userId);
      socket.join(conversationRoom(conversation.id));
      socket.emit("support:conversation", { conversation_id: conversation.id });
    }

    socket.on("support:join", async (payload: { conversation_id?: string }, callback) => {
      try {
        if (socket.data.role === "admin") {
          if (!payload?.conversation_id) throw new Error("conversation_id is required");
          const conversation = await getConversationById(payload.conversation_id);
          if (!conversation) throw new Error("Conversation not found");
          socket.join(conversationRoom(conversation.id));
          callback?.({ success: true, conversation_id: conversation.id });
          return;
        }

        const conversation = await getOrCreateUserConversation(socket.data.userId!);
        socket.join(conversationRoom(conversation.id));
        callback?.({ success: true, conversation_id: conversation.id });
      } catch (error: any) {
        callback?.({ success: false, message: error.message });
      }
    });

    socket.on("support:send", async (payload: { conversation_id?: string; message?: string }, callback) => {
      try {
        const messageText = payload?.message?.trim();
        if (!messageText) throw new Error("Message cannot be empty");

        let conversationId = payload.conversation_id;

        if (socket.data.role === "user") {
          const conversation = await getOrCreateUserConversation(socket.data.userId!);
          conversationId = conversation.id;
        }

        if (!conversationId) throw new Error("conversation_id is required");

        const conversation = await getConversationById(conversationId);
        if (!conversation) throw new Error("Conversation not found");

        if (socket.data.role === "user" && conversation.user_id !== socket.data.userId) {
          throw new Error("You cannot send messages to this conversation");
        }

        const { message } = await createSupportMessage({
          conversationId,
          senderType: socket.data.role === "admin" ? "ADMIN" : "USER",
          senderId: socket.data.role === "admin" ? socket.data.adminId : socket.data.userId,
          message: messageText
        });

        const eventPayload = {
          conversation_id: conversationId,
          message
        };

        io!.to(conversationRoom(conversationId)).emit("support:message", eventPayload);
        io!.to(adminInboxRoom).emit("support:conversation:updated", {
          conversation_id: conversationId,
          last_message: message.message,
          last_message_at: message.created_at,
          unread_count: socket.data.role === "user" ? 1 : 0
        });

        callback?.({ success: true, ...eventPayload });
      } catch (error: any) {
        callback?.({ success: false, message: error.message });
      }
    });
  });

  return io;
};

export const getSupportIo = () => io;
