import { FastifyReply, FastifyRequest } from "fastify";
import { pool } from "../../config/db";
import { errorResponse } from "../../common/utils/response";
import { PartnerApp } from "./partner.types";

export const verifyPartnerApiKey = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const headerValue = request.headers["x-partner-key"];
  const apiKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!apiKey?.trim()) {
    return errorResponse(reply, 401, "Partner API key is required");
  }

  try {
    const result = await pool.query<PartnerApp>(
      `SELECT id, name, is_active
       FROM partner_apps
       WHERE api_key = $1
         AND is_active = TRUE
       LIMIT 1`,
      [apiKey.trim()]
    );

    const partner = result.rows[0];

    if (!partner) {
      return errorResponse(reply, 401, "Invalid or inactive partner API key");
    }

    request.partner = partner;
  } catch (error) {
    request.log.error(error, "Partner API key verification failed");
    return errorResponse(reply, 500, "Unable to authenticate partner");
  }
};
