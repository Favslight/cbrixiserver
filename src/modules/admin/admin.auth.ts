import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

const extractBearer = (value?: string) => {
  if (!value) return null;
  return value.startsWith("Bearer ") ? value.slice(7).trim() : value.trim();
};

const extractCookieToken = (cookieHeader?: string) => {
  if (!cookieHeader) return null;

  const pairs = cookieHeader.split(";").map((part) => part.trim());
  for (const pair of pairs) {
    const [name, ...rest] = pair.split("=");
    if (!name || !rest.length) continue;
    if (name === "admin_token") {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
};

export const requireAdmin = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const authHeader = request.headers.authorization;
  const customHeaderToken = Array.isArray(request.headers["x-admin-token"])
    ? request.headers["x-admin-token"][0]
    : request.headers["x-admin-token"];
  const cookieToken = extractCookieToken(request.headers.cookie);

  const token =
    extractBearer(authHeader) ??
    extractBearer(customHeaderToken) ??
    cookieToken;

  if (!token) {
    reply.status(401).send({ message: "Unauthorized" });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      role: "ADMIN" | "MAIN_ADMIN" | "SUPER_ADMIN";
      email?: string;
    };

    request.admin = {
      id: payload.id,
      role: payload.role,
      email: payload.email ?? ""
    };
  } catch (error) {
    console.error("Admin token verification error:", error);
    reply.status(401).send({
      message: "Authorization token is invalid"
    });
  }
};
