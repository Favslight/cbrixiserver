import { FastifyRequest, FastifyReply } from "fastify";
import { createOrderFromCart, getUserOrders } from "./checkout.service";

export const checkoutController = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const user: any = req.user;
    const { payment_mode, externalEmail, external_email } = req.body as any; // "FULL" | "INSTALLMENT"

    const order = await createOrderFromCart(user, payment_mode, externalEmail ?? external_email);

    return reply.send({ success: true, order });

  } catch (err: any) {
    return reply.status(400).send({ success: false, message: err.message });
  }
};

export const getMyOrdersController = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const user: any = req.user;
    const orders = await getUserOrders(user.id);

    return reply.send({ success: true, orders });
  } catch (err: any) {
    return reply.status(400).send({ success: false, message: err.message });
  }
};
