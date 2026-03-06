import { FastifyReply, FastifyRequest } from "fastify";
import { adminLoginService } from "./admin.service";

interface AdminLoginBody {
  email: string;
  password: string;
}

export const adminLoginHandler = async (
  request: FastifyRequest<{ Body: AdminLoginBody }>,
  reply: FastifyReply
) => {
  const { email, password } = request.body;

  if (!email || !password) {
    return reply.status(400).send({
      message: "Email and password required"
    });
  }

  try {
    const result = await adminLoginService(email, password);
    return reply.send(result);
  } catch (err: any) {
    return reply.status(401).send({
      message: err.message
    });
  }
};
