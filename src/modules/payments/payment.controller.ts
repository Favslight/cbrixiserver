import { FastifyRequest, FastifyReply } from "fastify";
import {
  initiatePaystackPayment,
  verifyPaystack,
  initiateManualTransfer
} from "./payment.service";

export const paystackInitiateController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const user: any = req.user;
  const { order_id, installment_id, amount } = req.body as any;

  const result = await initiatePaystackPayment(
    user,
    order_id,
    installment_id,
    amount
  );

  return reply.send(result);
};

export const verifyPaystackController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const { reference } = req.body as any;

  await verifyPaystack(reference);

  return reply.send({ success: true });
};

export const manualTransferController = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {

  const user: any = req.user;
  const { order_id, installment_id, amount } = req.body as any;

  const result = await initiateManualTransfer(
    user,
    order_id,
    installment_id,
    amount
  );

  return reply.send(result);
};