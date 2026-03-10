import { FastifyInstance } from "fastify";
import { adminLoginHandler, getAllUsersDetailsController } from "./admin.controller";
import { requireAdmin } from "./admin.auth";

export const adminRoutes = async (app: FastifyInstance) =>
{
    app.post("/admin/login", adminLoginHandler);

    app.get("/admin/users/details", { preHandler: [requireAdmin] }, getAllUsersDetailsController);
}