// src/modules/products/product.routes.ts
import { FastifyInstance } from "fastify";
import { bulkUpdateProductPurchaseSettingsController, createProductController, deleteProductController, getProductsController, getPublicProductsByCategoryController, getPublicProductsController, markProductInStockController, markProductOutOfStockController, previewProductDiscountController, reorderHomepageProductsController, updateProductController } from "./product.controller";
import { requireAdmin } from "../admin/admin.auth";

export async function productRoutes(app: FastifyInstance) {

  app.post("/admin/products", 
    { preHandler: [requireAdmin] }, 
    createProductController);

  app.post("/admin/products/discount-preview",
    { preHandler: [requireAdmin] },
    previewProductDiscountController);

  app.get("/admin/products", 
    { preHandler: [requireAdmin] }, 
    getProductsController);

  app.patch("/admin/products/display-order",
    { preHandler: [requireAdmin] },
    reorderHomepageProductsController);

  app.patch("/admin/products/purchase-settings",
    { preHandler: [requireAdmin] },
    bulkUpdateProductPurchaseSettingsController);

  app.patch<{ Params: { id: string } }>(
    "/admin/products/:id/out-of-stock",
    { preHandler: [requireAdmin] },
    markProductOutOfStockController
  );

  app.patch<{ Params: { id: string } }>(
    "/admin/products/:id/in-stock",
    { preHandler: [requireAdmin] },
    markProductInStockController
  );

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
