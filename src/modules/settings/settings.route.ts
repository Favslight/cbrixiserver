import { FastifyInstance } from "fastify";
import { getSettingsController, updateSettingsController } from "./settings.controller";
import { requireAdmin } from "../admin/admin.auth";

export const settingsRoutes = async (app: FastifyInstance) => {
  app.get("/admin/settings", { preHandler: [requireAdmin] }, getSettingsController);
  app.patch("/admin/settings", { preHandler: [requireAdmin] }, updateSettingsController);
};