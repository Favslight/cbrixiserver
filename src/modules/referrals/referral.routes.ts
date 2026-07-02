import { FastifyInstance } from "fastify";
import { requireAdmin } from "../admin/admin.auth";
import { requireUser } from "../auth/user.auth";
import {
  approveReferralPayout,
  getMyReferralDashboard,
  getReferralPayoutRequests,
  getReferralRewardsForAdmin,
  getReferralSettings,
  requestReferralPayout,
  updateReferralSettings
} from "./referral.service";

export const referralRoutes = async (app: FastifyInstance) => {
  app.get("/referrals/me", { preHandler: [requireUser] }, async (req, reply) => {
    const dashboard = await getMyReferralDashboard(req.user.id);
    return reply.send({ success: true, referral: dashboard });
  });

  app.post("/referrals/payout", { preHandler: [requireUser] }, async (req, reply) => {
    try {
      const payout = await requestReferralPayout(req.user.id, req.body as any);
      return reply.status(201).send({ success: true, payout });
    } catch (error: any) {
      return reply.status(400).send({ message: error.message });
    }
  });

  app.get("/admin/referrals/settings", { preHandler: [requireAdmin] }, async (_req, reply) => {
    const settings = await getReferralSettings();
    return reply.send({ success: true, settings });
  });

  app.patch("/admin/referrals/settings", { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const body = req.body as { is_enabled?: boolean; bonus_percentage?: number };
      const settings = await updateReferralSettings({
        is_enabled: typeof body.is_enabled === "boolean" ? body.is_enabled : undefined,
        bonus_percentage: body.bonus_percentage === undefined ? undefined : Number(body.bonus_percentage)
      });
      return reply.send({ success: true, settings });
    } catch (error: any) {
      return reply.status(400).send({ message: error.message });
    }
  });

  app.get("/admin/referrals/payouts", { preHandler: [requireAdmin] }, async (req, reply) => {
    const { status } = req.query as { status?: string };
    const payouts = await getReferralPayoutRequests(status);
    return reply.send({ success: true, payouts });
  });

  app.post("/admin/referrals/payouts/:id/approve", { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const payout = await approveReferralPayout(id, req.admin?.id);
      return reply.send({ success: true, payout });
    } catch (error: any) {
      return reply.status(400).send({ message: error.message });
    }
  });

  app.get("/admin/referrals/rewards", { preHandler: [requireAdmin] }, async (_req, reply) => {
    const rewards = await getReferralRewardsForAdmin();
    return reply.send({ success: true, rewards });
  });
};
