import { FastifyInstance } from "fastify";
import { requireAdmin } from "../admin/admin.auth";
import {
  activateCampaignController,
  createCampaignController,
  deactivateCampaignController,
  deleteCampaignController,
  getCampaignByIdController,
  getCampaignStatsController,
  getHomepageCampaignsController,
  listAdminCampaignsController,
  recordCampaignViewController,
  updateCampaignController
} from "./campaign.controller";

export const campaignRoutes = async (app: FastifyInstance) => {
  // Public
  app.get("/api/campaigns/homepage", getHomepageCampaignsController);
  app.post("/api/campaigns/view", recordCampaignViewController);

  // Admin
  app.get("/api/admin/campaigns/stats", { preHandler: [requireAdmin] }, getCampaignStatsController);
  app.get("/api/admin/campaigns", { preHandler: [requireAdmin] }, listAdminCampaignsController);
  app.get("/api/admin/campaigns/:id", { preHandler: [requireAdmin] }, getCampaignByIdController);
  app.post("/api/admin/campaigns", { preHandler: [requireAdmin] }, createCampaignController);
  app.patch("/api/admin/campaigns/:id", { preHandler: [requireAdmin] }, updateCampaignController);
  app.delete("/api/admin/campaigns/:id", { preHandler: [requireAdmin] }, deleteCampaignController);
  app.patch("/api/admin/campaigns/:id/activate", { preHandler: [requireAdmin] }, activateCampaignController);
  app.patch("/api/admin/campaigns/:id/deactivate", { preHandler: [requireAdmin] }, deactivateCampaignController);
};
