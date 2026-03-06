import { FastifyInstance } from "fastify";
import { createProductController } from "./product.controller";
import { requireAdmin } from "../admin/admin.auth";

export const productRoutes = async (app: FastifyInstance) => {

  app.post("/products", { preHandler: requireAdmin }, createProductController);
};