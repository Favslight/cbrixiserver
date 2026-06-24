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
import { partnerRoutes } from "./modules/partner/partner.routes";

startInstallmentReminderJob();

export const app = Fastify ({
    logger : true,
    bodyLimit: 100 * 1024 * 1024
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

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://api.cbrixi.com"
]);

const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

for (const origin of configuredOrigins) {
  allowedOrigins.add(origin);
}

if (process.env.FRONTEND_URL) {
  try {
    allowedOrigins.add(new URL(process.env.FRONTEND_URL).origin);
  } catch {
    app.log.warn("FRONTEND_URL is not a valid URL. Skipping CORS origin auto-allow.");
  }
}

const allowedDomainSuffixes = [".cbrixi.com", ".afresh.center"];

const isAllowedOrigin = (origin: string) => {
  if (allowedOrigins.has(origin)) {
    return true;
  }

  try {
    const parsedOrigin = new URL(origin);
    const hostname = parsedOrigin.hostname.toLowerCase();

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return true;
    }

    return allowedDomainSuffixes.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
};

app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }

    if (isAllowedOrigin(origin)) {
      cb(null, true);
      return;
    }

    cb(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-partner-key"]
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
    fileSize: 40 * 1024 * 1024, // 40MB max per image
    files: 4,
    parts: 30
  }
});

app.register(adminRoutes);
app.register(productRoutes);
//app.register(userAuthRoutes);
app.register(cartRoutes);
app.register(checkoutRoutes, { prefix: "/order" });
app.register(authRoutes, { prefix: "/user" });
app.register(paymentRoutes);
app.register(adminPaymentRoutes);
app.register(partnerRoutes, { prefix: "/api/partner" });
