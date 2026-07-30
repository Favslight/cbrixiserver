import { FastifyInstance } from "fastify";
import { requireAdmin } from "../admin/admin.auth";
import {
  activateHeroSlideController,
  createHeroSlideController,
  deactivateHeroSlideController,
  deleteHeroSlideController,
  getHeroSlideByIdController,
  getPublicHeroSlidesController,
  listAdminHeroSlidesController,
  updateHeroSlideController
} from "./heroCarousel.controller";

export const heroCarouselRoutes = async (app: FastifyInstance) => {
  app.get("/api/hero-carousel", getPublicHeroSlidesController);

  app.get("/api/admin/hero-carousel", { preHandler: [requireAdmin] }, listAdminHeroSlidesController);
  app.get("/api/admin/hero-carousel/:id", { preHandler: [requireAdmin] }, getHeroSlideByIdController);
  app.post("/api/admin/hero-carousel", { preHandler: [requireAdmin] }, createHeroSlideController);
  app.patch("/api/admin/hero-carousel/:id", { preHandler: [requireAdmin] }, updateHeroSlideController);
  app.delete("/api/admin/hero-carousel/:id", { preHandler: [requireAdmin] }, deleteHeroSlideController);
  app.patch("/api/admin/hero-carousel/:id/activate", { preHandler: [requireAdmin] }, activateHeroSlideController);
  app.patch("/api/admin/hero-carousel/:id/deactivate", { preHandler: [requireAdmin] }, deactivateHeroSlideController);
};
