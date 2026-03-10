import { FastifyRequest, FastifyReply } from "fastify";
import { getSettings, updateMinimumWalletBalance } from "./settings.service";

export const getSettingsController = async (_req: FastifyRequest, reply: FastifyReply) => {
  const settings = await getSettings();
  return reply.send({ success: true, settings });
};

export const updateSettingsController = async (req: FastifyRequest, reply: FastifyReply) => {
  const { minimum_wallet_balance } = req.body as any;
  const settings = await updateMinimumWalletBalance(minimum_wallet_balance);
  return reply.send({ success: true, settings });
};