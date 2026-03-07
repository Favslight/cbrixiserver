import { FastifyInstance } from "fastify";
import {
  addToCartController,
  getCartController,
  removeCartItemController
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

};