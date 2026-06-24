import { FastifyReply, FastifyRequest } from "fastify";
import { errorResponse, successResponse } from "../../common/utils/response";
import {
  createPartnerSalesRecord,
  DuplicatePartnerSalesRecordError,
  getPartnerProductById,
  getPartnerProducts
} from "./partner.service";
import {
  partnerProductParamsSchema,
  partnerProductsQuerySchema,
  partnerSalesRecordSchema
} from "./partner.validation";

export const getPartnerProductsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const parsed = partnerProductsQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    return errorResponse(reply, 400, "Invalid product filters", parsed.error.flatten());
  }

  try {
    const result = await getPartnerProducts(parsed.data);
    return successResponse(reply, 200, "Products retrieved successfully", result);
  } catch (error) {
    request.log.error(error, "Failed to retrieve partner products");
    return errorResponse(reply, 500, "Failed to retrieve products");
  }
};

export const getPartnerProductController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const parsed = partnerProductParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    return errorResponse(reply, 400, "Invalid product id", parsed.error.flatten());
  }

  try {
    const product = await getPartnerProductById(parsed.data.id);

    if (!product) {
      return errorResponse(reply, 404, "Active product not found");
    }

    return successResponse(reply, 200, "Product retrieved successfully", { product });
  } catch (error) {
    request.log.error(error, "Failed to retrieve partner product");
    return errorResponse(reply, 500, "Failed to retrieve product");
  }
};

export const createPartnerSalesRecordController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const parsed = partnerSalesRecordSchema.safeParse(request.body);

  if (!parsed.success) {
    return errorResponse(reply, 400, "Invalid sales record", parsed.error.flatten());
  }

  if (!request.partner) {
    return errorResponse(reply, 401, "Partner authentication is required");
  }

  try {
    const salesRecord = await createPartnerSalesRecord(
      request.partner.id,
      parsed.data,
      request.body
    );

    return successResponse(reply, 201, "Sales record stored successfully", {
      sales_record: salesRecord
    });
  } catch (error) {
    if (error instanceof DuplicatePartnerSalesRecordError) {
      return errorResponse(reply, 409, error.message);
    }

    request.log.error(error, "Failed to store partner sales record");
    return errorResponse(reply, 500, "Failed to store sales record");
  }
};
