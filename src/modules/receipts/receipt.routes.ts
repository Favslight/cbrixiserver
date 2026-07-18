import { FastifyInstance } from "fastify";
import { requireAdmin } from "../admin/admin.auth";
import { requireUser } from "../auth/user.auth";
import {
  downloadReceiptPdfController,
  getAdminReceiptByNumberController,
  getMyOrderReceiptsController,
  getMyReceiptByNumberController,
  getReceiptByPaymentController,
  listAdminReceiptsController,
  listMyReceiptsController,
  resendReceiptEmailController,
  viewReceiptHtmlController
} from "./receipt.controller";

export const receiptRoutes = async (app: FastifyInstance) => {
  // Customer
  app.get("/receipts/me", { preHandler: [requireUser] }, listMyReceiptsController);
  app.get("/receipts/me/order/:orderId", { preHandler: [requireUser] }, getMyOrderReceiptsController);
  app.get("/receipts/me/:receiptNumber", { preHandler: [requireUser] }, getMyReceiptByNumberController);
  app.get("/receipts/me/:receiptNumber/html", { preHandler: [requireUser] }, (req, reply) =>
    viewReceiptHtmlController(req, reply, { isAdmin: false })
  );
  app.get("/receipts/me/:receiptNumber/pdf", { preHandler: [requireUser] }, (req, reply) =>
    downloadReceiptPdfController(req, reply, { isAdmin: false })
  );

  // Admin
  app.get("/admin/receipts", { preHandler: [requireAdmin] }, listAdminReceiptsController);
  app.get("/admin/receipts/payment/:paymentId", { preHandler: [requireAdmin] }, getReceiptByPaymentController);
  app.get("/admin/receipts/:receiptNumber", { preHandler: [requireAdmin] }, getAdminReceiptByNumberController);
  app.get("/admin/receipts/:receiptNumber/html", { preHandler: [requireAdmin] }, (req, reply) =>
    viewReceiptHtmlController(req, reply, { isAdmin: true })
  );
  app.get("/admin/receipts/:receiptNumber/pdf", { preHandler: [requireAdmin] }, (req, reply) =>
    downloadReceiptPdfController(req, reply, { isAdmin: true })
  );
  app.post("/admin/receipts/:receiptNumber/resend", { preHandler: [requireAdmin] }, resendReceiptEmailController);
};
