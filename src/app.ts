import Fastify, { fastify, FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";

import { adminRoutes } from "./modules/admin/admin.route";
import { productRoutes } from "./modules/products/product.routes";
//import { userAuthRoutes } from "./modules/userAuth/userAuth.route";
import { cartRoutes } from "./modules/cart/cart.route";
import { checkoutRoutes } from "./modules/checkout/checkout.route";
import { paymentRoutes } from "./modules/payments/payment.route";
import { adminPaymentRoutes } from "./modules/admin/admin.payment.routes";
import { startInstallmentReminderJob } from "./modules/email/email.scheduler";
import { authRoutes } from "./modules/auth/auth.route";

startInstallmentReminderJob();

export const app = Fastify ({
    logger : true
});

app.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (req, body, done) => {
    (req as any).rawBody = body.toString("utf8");

    try {
      const json = JSON.parse(body.toString("utf8"));
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  }
);

app.register(cors, {
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
});

app.register(import("@fastify/jwt"), { secret: process.env.USER_JWT_SECRET! });
app.register(import("@fastify/jwt"), {
  secret: process.env.JWT_SECRET!,
  namespace: "adminJwt"
});

app.decorate(
  "authenticate",
  async function (request: FastifyRequest, reply: FastifyReply) {
    // Decode JWT and type it
    const decoded = await request.jwtVerify<{ id: string; email?: string }>();

    // Attach to request.user so routes can safely access it
    request.user = {
      id: decoded.id,
      email: decoded.email ?? ""// optional, or fetch from DB if needed
    };
  }
);

app.decorate("adminAuthenticate", async function (request: FastifyRequest, reply: FastifyReply) {
  const payload = await request.adminJwt.verify(request);
  request.admin = payload;
});

app.register(multipart, {
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max per document
  },
});

app.register(adminRoutes);
app.register(productRoutes);
//app.register(userAuthRoutes);
app.register(cartRoutes);
app.register(checkoutRoutes, { prefix: "/order" });
app.register(authRoutes, { prefix: "/user" });
app.register(paymentRoutes);
app.register(adminPaymentRoutes);