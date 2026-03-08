import { FastifyRequest, FastifyReply } from "fastify";
import { loginUser } from "./userAuth.service";

export const loginController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const { email, password } = req.body as any;

  const result = await loginUser(email, password);


  return reply.send({
    success: true,
    ...result
  });

};