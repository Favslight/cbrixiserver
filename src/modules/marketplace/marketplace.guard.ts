import { FastifyReply, FastifyRequest } from "fastify";
import { getMarketplaceStatus } from "./marketplace.service";

export const MARKETPLACE_LOCKED_STATUS_CODE = 423;

/**
 * preHandler for routes that browse or buy from the marketplace.
 * Deliberately NOT applied to payments on existing orders, so customers can
 * keep paying their installments while the marketplace is locked.
 */
export const requireMarketplaceOpen = async (
  _request: FastifyRequest,
  reply: FastifyReply
) => {
  const status = await getMarketplaceStatus();

  if (!status.locked) return;

  return reply.code(MARKETPLACE_LOCKED_STATUS_CODE).send({
    success: false,
    marketplace_locked: true,
    title: status.title,
    message: status.message
  });
};
