import { FastifyInstance } from "fastify";
import { checkoutController, getMyOrdersController } from "./checkout.controller";
import { requireUser } from "../auth/user.auth";
import { requireMarketplaceOpen } from "../marketplace/marketplace.guard";

export const checkoutRoutes = async (app: FastifyInstance) => {
  app.post("/checkout", { preHandler: [requireUser, requireMarketplaceOpen] }, checkoutController);
  app.get("/my-orders", { preHandler: [requireUser] }, getMyOrdersController);
};
