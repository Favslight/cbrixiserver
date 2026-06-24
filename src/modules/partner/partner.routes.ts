import { FastifyInstance } from "fastify";
import { verifyPartnerApiKey } from "./partner.auth";
import {
  createPartnerSalesRecordController,
  getPartnerProductController,
  getPartnerProductsController
} from "./partner.controller";

export const partnerRoutes = async (app: FastifyInstance) => {
  app.addHook("preHandler", verifyPartnerApiKey);

  app.get("/products", getPartnerProductsController);
  app.get("/products/:id", getPartnerProductController);
  app.post("/sales-records", createPartnerSalesRecordController);
};
