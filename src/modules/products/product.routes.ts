// src/modules/products/product.routes.ts
import { FastifyInstance } from "fastify";
import { createProductController, deleteProductController, getProductsController, getPublicProductsByCategoryController, getPublicProductsController, updateProductController } from "./product.controller";
import { requireAdmin } from "../admin/admin.auth";

export async function productRoutes(app: FastifyInstance) {

  app.post("/admin/products", 
    { preHandler: [requireAdmin] }, 
    createProductController);

  app.get("/admin/products", 
    { preHandler: [requireAdmin] }, 
    getProductsController);

    app.delete<{ Params: { id: string } }>(
  "/admin/products/:id",
  { preHandler: [requireAdmin] },
  deleteProductController
);

  app.put<{ Params: { id: string } }>(
    "/admin/products/:id",
    { preHandler: [requireAdmin] },
    updateProductController
  );

  app.get("/products/category/:category", getPublicProductsByCategoryController);
  app.get("/products", getPublicProductsController);
};
