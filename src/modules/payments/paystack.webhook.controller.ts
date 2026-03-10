import { FastifyRequest, FastifyReply } from "fastify";
import { handlePaystackWebhook } from "./paystack.webhook.service";

export const paystackWebhookController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  try {

    const signature = req.headers["x-paystack-signature"] as string;

    const body = req.body;

    await handlePaystackWebhook(signature, body);

    reply.code(200).send({ received: true });

  } catch (error) {

    console.error("Webhook error:", error);

    reply.code(400).send({ error: "Webhook processing failed" });

  }
};