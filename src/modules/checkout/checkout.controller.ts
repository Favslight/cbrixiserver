import { FastifyRequest, FastifyReply } from "fastify";
import { createOrderFromCart } from "./checkout.service";

export const checkoutController = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const user: any = req.user;
    const { payment_mode } = req.body as any; // "FULL" | "INSTALLMENT"
    const token = req.headers.authorization?.split(" ")[1]; // user's Knowrist token

    const order = await createOrderFromCart(user, payment_mode, token!);

    return reply.send({ success: true, order });

  } catch (err: any) {
    return reply.status(400).send({ success: false, message: err.message });
  }
};