import { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorResponse } from "../../common/utils/response";
import { requireAdmin } from "../admin/admin.auth";
import { listInstallmentUsers, sendDefaultEmails } from "./installment.service";

const listQuerySchema = z.object({
  filter: z.enum(["all", "defaulting", "current"]).default("all"),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const defaultEmailSchema = z
  .object({
    user_ids: z.array(z.string().uuid()).min(1).max(200).optional(),
    all: z.boolean().optional(),
    force: z.boolean().optional()
  })
  .refine((body) => body.all === true || (body.user_ids && body.user_ids.length > 0), {
    message: "Provide user_ids, or set all to true to email every defaulting user"
  });

export const installmentRoutes = async (app: FastifyInstance) => {
  app.get("/api/admin/installments", { preHandler: [requireAdmin] }, async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query ?? {});

    if (!parsed.success) {
      return errorResponse(reply, 400, "Invalid query", parsed.error.flatten());
    }

    const result = await listInstallmentUsers(parsed.data);
    return reply.send({ success: true, ...result });
  });

  app.post("/api/admin/installments/default-emails", { preHandler: [requireAdmin] }, async (req, reply) => {
    const parsed = defaultEmailSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      return errorResponse(reply, 400, parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.flatten());
    }

    const result = await sendDefaultEmails(parsed.data);

    return reply.send({
      success: true,
      message: `${result.sent.length} email(s) sent, ${result.skipped.length} skipped, ${result.failed.length} failed`,
      ...result
    });
  });
};
