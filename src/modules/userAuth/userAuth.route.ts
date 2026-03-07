import { FastifyInstance } from "fastify";
import { loginController } from "./userAuth.controller";

export const userAuthRoutes = async (app: FastifyInstance) => {

  app.post("/auth/login", loginController);

};