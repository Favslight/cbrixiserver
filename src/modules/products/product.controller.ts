import { FastifyRequest, FastifyReply } from "fastify";
import { createProduct } from "./product.service";

export const createProductController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const product = await createProduct(req.body);

  return reply.send({
    success: true,
    product
  });

};