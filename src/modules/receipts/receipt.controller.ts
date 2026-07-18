import { FastifyReply, FastifyRequest } from "fastify";
import { errorResponse, successResponse } from "../../common/utils/response";
import { sendEmail } from "../email/email.service";
import { EmailType } from "../email/email.types";
import { buildReceiptHtml, receiptEmailTemplate } from "./receipt.html";
import { buildReceiptPdfBuffer } from "./receipt.pdf";
import {
  assertCustomerOwnsReceipt,
  generateReceiptForPayment,
  getReceiptByNumber,
  getReceiptByPaymentId,
  listReceiptsForAdmin,
  listReceiptsForCustomer
} from "./receipt.service";
import {
  orderIdParamsSchema,
  paymentIdParamsSchema,
  receiptListQuerySchema,
  receiptNumberParamsSchema
} from "./receipt.validation";

export const listMyReceiptsController = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const query = receiptListQuerySchema.parse(req.query);
    const result = await listReceiptsForCustomer(req.user.id, {
      page: query.page,
      limit: query.limit,
      orderId: query.order_id
    });
    return successResponse(reply, 200, "Receipts retrieved successfully", result);
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid query parameters", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const listAdminReceiptsController = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const query = receiptListQuerySchema.parse(req.query);
    const result = await listReceiptsForAdmin({
      page: query.page,
      limit: query.limit,
      orderId: query.order_id,
      paymentId: query.payment_id
    });
    return successResponse(reply, 200, "Receipts retrieved successfully", result);
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid query parameters", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const getMyReceiptByNumberController = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const params = receiptNumberParamsSchema.parse(req.params);
    const receipt = await getReceiptByNumber(params.receiptNumber);
    if (!receipt) return errorResponse(reply, 404, "Receipt not found");
    assertCustomerOwnsReceipt(receipt, req.user.id);
    return successResponse(reply, 200, "Receipt retrieved successfully", { receipt });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid receipt number", error.issues);
    }
    if (error.message.includes("not allowed")) {
      return errorResponse(reply, 403, error.message);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const getAdminReceiptByNumberController = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const params = receiptNumberParamsSchema.parse(req.params);
    const receipt = await getReceiptByNumber(params.receiptNumber);
    if (!receipt) return errorResponse(reply, 404, "Receipt not found");
    return successResponse(reply, 200, "Receipt retrieved successfully", { receipt });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid receipt number", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const getReceiptByPaymentController = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const params = paymentIdParamsSchema.parse(req.params);
    let receipt = await getReceiptByPaymentId(params.paymentId);

    if (!receipt) {
      receipt = await generateReceiptForPayment(params.paymentId, req.admin?.id ?? null);
    }

    if (!receipt) return errorResponse(reply, 404, "Receipt not found");
    return successResponse(reply, 200, "Receipt retrieved successfully", { receipt });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid payment id", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

export const getMyOrderReceiptsController = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const params = orderIdParamsSchema.parse(req.params);
    const query = receiptListQuerySchema.parse(req.query);
    const result = await listReceiptsForCustomer(req.user.id, {
      page: query.page,
      limit: query.limit,
      orderId: params.orderId
    });
    return successResponse(reply, 200, "Order receipts retrieved successfully", result);
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid request", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};

const loadReceiptForDownload = async (
  receiptNumber: string,
  options: { customerId?: string; isAdmin?: boolean }
) => {
  const receipt = await getReceiptByNumber(receiptNumber);
  if (!receipt) {
    throw Object.assign(new Error("Receipt not found"), { statusCode: 404 });
  }
  if (!options.isAdmin && options.customerId) {
    assertCustomerOwnsReceipt(receipt, options.customerId);
  }
  return receipt;
};

export const downloadReceiptPdfController = async (
  req: FastifyRequest,
  reply: FastifyReply,
  options: { isAdmin?: boolean } = {}
) => {
  try {
    const params = receiptNumberParamsSchema.parse(req.params);
    const receipt = await loadReceiptForDownload(params.receiptNumber, {
      customerId: options.isAdmin ? undefined : req.user.id,
      isAdmin: options.isAdmin
    });

    const pdf = await buildReceiptPdfBuffer(receipt);
    reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        `attachment; filename="${receipt.receipt_number}.pdf"`
      )
      .send(pdf);
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid receipt number", error.issues);
    }
    if (error.message.includes("not allowed")) {
      return errorResponse(reply, 403, error.message);
    }
    return errorResponse(reply, error.statusCode || 400, error.message);
  }
};

export const viewReceiptHtmlController = async (
  req: FastifyRequest,
  reply: FastifyReply,
  options: { isAdmin?: boolean } = {}
) => {
  try {
    const params = receiptNumberParamsSchema.parse(req.params);
    const receipt = await loadReceiptForDownload(params.receiptNumber, {
      customerId: options.isAdmin ? undefined : req.user.id,
      isAdmin: options.isAdmin
    });

    const html = buildReceiptHtml(receipt);
    return reply.type("text/html").send(html);
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid receipt number", error.issues);
    }
    if (error.message.includes("not allowed")) {
      return errorResponse(reply, 403, error.message);
    }
    return errorResponse(reply, error.statusCode || 400, error.message);
  }
};

export const resendReceiptEmailController = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const params = receiptNumberParamsSchema.parse(req.params);
    const receipt = await getReceiptByNumber(params.receiptNumber);
    if (!receipt) return errorResponse(reply, 404, "Receipt not found");
    if (!receipt.customer_email) {
      return errorResponse(reply, 400, "Customer email not found for this receipt");
    }

    const pdf = await buildReceiptPdfBuffer(receipt);
    const htmlBody = buildReceiptHtml(receipt, { forEmail: true });

    await sendEmail(
      receipt.customer_id,
      receipt.order_id,
      null,
      receipt.customer_email,
      `Your Cbrixi Receipt ${receipt.receipt_number}`,
      `${receiptEmailTemplate(receipt)}\n\n${htmlBody}`,
      EmailType.RECEIPT_ISSUED,
      [
        {
          filename: `${receipt.receipt_number}.pdf`,
          content: pdf,
          contentType: "application/pdf"
        }
      ]
    );

    return successResponse(reply, 200, "Receipt emailed successfully", {
      receipt_number: receipt.receipt_number,
      emailed_to: receipt.customer_email
    });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return errorResponse(reply, 400, "Invalid receipt number", error.issues);
    }
    return errorResponse(reply, 400, error.message);
  }
};
