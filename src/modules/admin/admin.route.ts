import { FastifyInstance } from "fastify";
import { adminLoginHandler } from "./admin.controller";

export const adminRoutes = async (app: FastifyInstance) =>
{
    app.post("/admin/login", adminLoginHandler);
}