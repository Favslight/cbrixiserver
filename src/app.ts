import Fastify, { fastify, FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";

import { adminRoutes } from "./modules/admin/admin.route";
import { productRoutes } from "./modules/products/product.routes";

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

//app.register(import("@fastify/jwt"), { secret: process.env.JWT_SECRET! });
app.register(import("@fastify/jwt"), {
  secret: process.env.JWT_SECRET!,
  namespace: "adminJwt"
});

app.decorate("adminAuthenticate", async function (request: FastifyRequest, reply: FastifyReply) {
  const payload = await request.adminJwt.verify(request);
  request.admin = payload;
});

app.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max per document
  },
});

app.register(adminRoutes);
app.register(productRoutes);