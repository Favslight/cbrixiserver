import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { errorResponse, successResponse } from "../../common/utils/response";
import { requireAdmin } from "../admin/admin.auth";
import {
  getMarketplaceStatus,
  lockMarketplace,
  unlockMarketplace
} from "./marketplace.service";
import { lockMarketplaceSchema } from "./marketplace.validation";

const getStatusController = async (_req: FastifyRequest, reply: FastifyReply) => {
  const status = await getMarketplaceStatus();
  return reply.send({ success: true, ...status });
};

const lockController = async (req: FastifyRequest, reply: FastifyReply) => {
  const parsed = lockMarketplaceSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return errorResponse(reply, 400, "Invalid lock message", parsed.error.flatten());
  }

  const status = await lockMarketplace(parsed.data, req.admin?.id);
  return successResponse(reply, 200, "Marketplace locked", { ...status });
};

const unlockController = async (req: FastifyRequest, reply: FastifyReply) => {
  const status = await unlockMarketplace(req.admin?.id);
  return successResponse(reply, 200, "Marketplace unlocked", { ...status });
};

export const marketplaceRoutes = async (app: FastifyInstance) => {
  // Public: the storefront calls this to decide whether to render the marketplace.
  app.get("/api/marketplace/status", getStatusController);

  app.get("/api/admin/marketplace/status", { preHandler: [requireAdmin] }, getStatusController);
  app.patch("/api/admin/marketplace/lock", { preHandler: [requireAdmin] }, lockController);
  app.patch("/api/admin/marketplace/unlock", { preHandler: [requireAdmin] }, unlockController);
};
