import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

// In your admin auth middleware
export const requireAdmin = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const auth = request.headers.authorization;

  if (!auth) {
    reply.status(401).send({ message: "Unauthorized" });
    return;
  }

  const token = auth.replace("Bearer ", "");

  try {
    // ✅ Make sure you're using ADMIN_JWT_SECRET
    const payload = jwt.verify(
      token,
      process.env.ADMIN_JWT_SECRET! // Should be different from user secret
    ) as {
      id: string;
      role: "ADMIN" | "MAIN_ADMIN" | "SUPER_ADMIN";
      email: string;
    };

    request.admin = payload; // Store in request.admin
    
  } catch (error) {
    console.error("Admin token verification error:", error);
    reply.status(401).send({ 
      message: "Authorization token is invalid: The token signature is invalid." 
    });
    return;
  }
};
