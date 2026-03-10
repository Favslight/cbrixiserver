import { FastifyInstance } from "fastify";
import { checkoutController } from "./checkout.controller";
import { requireUser } from "../auth/user.auth";

export const checkoutRoutes = async (app: FastifyInstance) => {
  app.post("/checkout", { preHandler: [requireUser] }, checkoutController);
};