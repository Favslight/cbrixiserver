import { FastifyRequest, FastifyReply } from "fastify";
import { addToCart, getCart, removeCartItem } from "./cart.service";

export const addToCartController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const user: any = req.user;
  const { product_id, quantity } = req.body as any;

  const item = await addToCart(user.id, product_id, quantity || 1);

  return reply.send({
    success: true,
    item
  });
};

export const getCartController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const user: any = req.user;

  const cart = await getCart(user.id);

  return reply.send({
    success: true,
    cart
  });
};

export const removeCartItemController = async (
  req: FastifyRequest<{ Params: { itemId: string } }>,
  reply: FastifyReply
) => {

  const item = await removeCartItem(req.params.itemId);

  return reply.send({
    success: true,
    item
  });
};