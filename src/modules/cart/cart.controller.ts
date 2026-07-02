// src/modules/cart/cart.controller.ts
import { FastifyRequest, FastifyReply } from "fastify";
import { addToCart, getCart, removeCartItem, updateCartItemQuantity } from "./cart.service";

export const addToCartController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const user: any = req.user;
  const { product_id, variant_id, variantId, quantity } = req.body as any;

  const item = await addToCart(user.id, product_id, quantity || 1, variant_id ?? variantId);

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

export const updateCartItemController = async (
  req: FastifyRequest<{
    Params: { itemId: string };
    Body: { quantity: number };
  }>,
  reply: FastifyReply
) => {

  const { itemId } = req.params;
  const { quantity } = req.body;

  const item = await updateCartItemQuantity(itemId, quantity);

  return reply.send({
    success: true,
    item
  });
};
