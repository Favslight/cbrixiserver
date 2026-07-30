import { FastifyInstance } from "fastify";
import { adminLoginHandler, getAllUsersDetailsController } from "./admin.controller";
import { requireAdmin } from "./admin.auth";

export const adminRoutes = async (app: FastifyInstance) =>
{
    app.post("/admin/login", adminLoginHandler);

    app.get<{ Querystring: { limit?: string; offset?: string; page?: string } }>(
        "/admin/users/details",
        { preHandler: [requireAdmin] },
        getAllUsersDetailsController
    );
}
