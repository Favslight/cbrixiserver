import { FastifyInstance } from "fastify";
import {
  paystackInitiateController,
  verifyPaystackController,
  manualTransferController
} from "./payment.controller";
import { requireUser } from "../auth/user.auth";
import { paystackWebhookController } from "./paystack.webhook.controller";


export const paymentRoutes = async (app: FastifyInstance) => {

  app.post("/payment/paystack/initiate", { preHandler: [requireUser] }, paystackInitiateController);

  app.post("/payment/paystack/verify", { preHandler: [requireUser] }, verifyPaystackController);

  app.post("/payment/manual/initiate", { preHandler: [requireUser] }, manualTransferController);

  app.post("/payment/paystack/webhook", paystackWebhookController);

};