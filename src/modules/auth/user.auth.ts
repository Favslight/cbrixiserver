import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

export const requireUser = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {

  const auth = request.headers.authorization;

  if (!auth) {
    return reply.status(401).send({ message: "Unauthorized" });
  }

  const token = auth.replace("Bearer ", "");

  try {

    const payload = jwt.verify(
      token,
      process.env.USER_JWT_SECRET!
    ) as any;

    request.user = payload;

  } catch {

    return reply.status(401).send({
      message: "Invalid token"
    });

  }

};