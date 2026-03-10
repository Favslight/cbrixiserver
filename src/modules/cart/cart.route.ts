// src/modules/cart/cart.route.ts
import { FastifyInstance } from "fastify";
import {
  addToCartController,
  getCartController,
  removeCartItemController,
  updateCartItemController
} from "./cart.controller";
import { requireUser } from "../auth/user.auth";

export const cartRoutes = async (app: FastifyInstance) => {

  app.post(
    "/cart/add",
    { preHandler: [requireUser] },
    addToCartController
  );

  app.get(
    "/cart",
    { preHandler: [requireUser] },
    getCartController
  );

  app.delete<{ Params: { itemId: string } }>(
    "/cart/item/:itemId",
    { preHandler: [requireUser] },
    removeCartItemController
  );

  app.patch<{
  Params: { itemId: string };
  Body: { quantity: number };
}>(
  "/cart/item/:itemId",
  { preHandler: [requireUser] },
  updateCartItemController
);

};