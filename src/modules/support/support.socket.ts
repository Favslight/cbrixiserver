import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import {
  createSupportMessage,
  ensureSupportSchema,
  formatConversationForAdmin,
  formatSupportUserDisplay,
  getConversationById,
  getOrCreateUserConversation,
  SupportSenderType,
  verifySupportSocketAuth
} from "./support.service";

type SupportSocket = Socket & {
  data: {
    role?: "user" | "admin";
    userId?: string;
    adminId?: string;
  };
};

type SupportMessagePayload = {
  id?: string;
  message: string;
  created_at: string;
  sender_type?: string;
  sender_id?: string | null;
  sender_name?: string;
  sender_display_name?: string;
};

let io: Server | null = null;

const conversationRoom = (conversationId: string) => `support:conversation:${conversationId}`;
const adminInboxRoom = "support:admin-inbox";

const buildSocketCorsOrigins = () => {
  const origins = new Set<string>([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://cbrixi.com",
    "https://www.cbrixi.com",
    "https://api.cbrixi.com"
  ]);

  for (const origin of (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    const trimmed = origin.trim();
    if (trimmed) origins.add(trimmed);
  }

  if (process.env.FRONTEND_URL) {
    try {
      origins.add(new URL(process.env.FRONTEND_URL).origin);
    } catch {
      // ignore invalid FRONTEND_URL
    }
  }

  return [...origins];
};

export const broadcastSupportMessage = async (
  conversationId: string,
  message: SupportMessagePayload,
  senderRole: SupportSenderType
) => {
  if (!io) return;

  const conversation = await getConversationById(conversationId);
  const userDisplay = conversation
    ? formatSupportUserDisplay(conversation)
    : null;

  const eventPayload = {
    conversation_id: conversationId,
    message
  };

  io.to(conversationRoom(conversationId)).emit("support:message", eventPayload);
  io.to(adminInboxRoom).emit("support:conversation:updated", {
    conversation_id: conversationId,
    user_id: conversation?.user_id ?? null,
    firstname: userDisplay?.firstname ?? null,
    lastname: userDisplay?.lastname ?? null,
    username: userDisplay?.username ?? null,
    email: userDisplay?.email ?? null,
    full_name: userDisplay?.full_name ?? null,
    name: userDisplay?.name ?? null,
    display_name: userDisplay?.display_name ?? null,
    last_message: message.message,
    last_message_at: message.created_at,
    unread_count: senderRole === "USER" ? 1 : 0
  });
};

export const initSupportSocket = (httpServer: HttpServer) => {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: buildSocketCorsOrigins(),
      credentials: true
    },
    path: "/socket.io",
    transports: ["polling", "websocket"],
    allowUpgrades: true
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
      const conversationDetails = await getConversationById(conversation.id);
      socket.join(conversationRoom(conversation.id));
      socket.emit("support:conversation", {
        conversation_id: conversation.id,
        ...(conversationDetails ? formatConversationForAdmin(conversationDetails) : {})
      });
    }

    socket.on("support:join", async (payload: { conversation_id?: string }, callback) => {
      try {
        if (socket.data.role === "admin") {
          if (!payload?.conversation_id) throw new Error("conversation_id is required");
          const conversation = await getConversationById(payload.conversation_id);
          if (!conversation) throw new Error("Conversation not found");
          socket.join(conversationRoom(conversation.id));
          callback?.({
            success: true,
            conversation_id: conversation.id,
            conversation
          });
          return;
        }

        const conversation = await getOrCreateUserConversation(socket.data.userId!);
        const conversationDetails = await getConversationById(conversation.id);
        socket.join(conversationRoom(conversation.id));
        callback?.({
          success: true,
          conversation_id: conversation.id,
          conversation: conversationDetails
        });
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

        await broadcastSupportMessage(
          conversationId,
          message,
          socket.data.role === "admin" ? "ADMIN" : "USER"
        );

        callback?.({
          success: true,
          conversation_id: conversationId,
          message
        });
      } catch (error: any) {
        callback?.({ success: false, message: error.message });
      }
    });
  });

  return io;
};

export const getSupportIo = () => io;
