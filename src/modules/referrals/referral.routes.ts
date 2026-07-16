import { FastifyInstance } from "fastify";
import { requireAdmin } from "../admin/admin.auth";
import { requireUser } from "../auth/user.auth";
import { pool } from "../../config/db";
import {
  approveReferralPayout,
  creditReferralRewardManually,
  getMyReferralDashboard,
  getReferralPayoutRequests,
  getReferralRewardsForAdmin,
  getReferralSettings,
  rebuildMissingReferralRewards,
  requestReferralPayout,
  updateReferralSettings
} from "./referral.service";

export const referralRoutes = async (app: FastifyInstance) => {
  app.get("/referrals/me", { preHandler: [requireUser] }, async (req, reply) => {
    const { limit, offset } = req.query as { limit?: string; offset?: string };
    const dashboard = await getMyReferralDashboard(req.user.id, {
      limit: limit === undefined ? undefined : Number(limit),
      offset: offset === undefined ? undefined : Number(offset)
    });
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

  app.post("/admin/referrals/rebuild-rewards", { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const body = (req.body ?? {}) as {
        user_id?: string;
        referrer_id?: string;
        referrer_email?: string;
      };

      let referrerId = body.referrer_id?.trim() || body.user_id?.trim() || undefined;

      if (!referrerId && body.referrer_email) {
        const userRes = await pool.query(
          `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
          [body.referrer_email.trim()]
        );
        referrerId = userRes.rows[0]?.id;
        if (!referrerId) {
          return reply.status(404).send({ message: "Referrer not found" });
        }
      }

      const result = await rebuildMissingReferralRewards(referrerId);
      return reply.send({
        success: true,
        restored_count: result.restored_count,
        restored: result.restored
      });
    } catch (error: any) {
      return reply.status(400).send({ message: error.message });
    }
  });

  app.post("/admin/referrals/rewards/credit", { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const body = req.body as {
        referrer_id?: string;
        referrer_email?: string;
        referred_user_id?: string;
        referred_email?: string;
        reward_amount?: number;
        purchase_amount?: number;
        bonus_percentage?: number;
        note?: string;
      };

      const reward = await creditReferralRewardManually({
        referrer_id: body.referrer_id,
        referrer_email: body.referrer_email,
        referred_user_id: body.referred_user_id,
        referred_email: body.referred_email,
        reward_amount: Number(body.reward_amount),
        purchase_amount: body.purchase_amount === undefined ? undefined : Number(body.purchase_amount),
        bonus_percentage: body.bonus_percentage === undefined ? undefined : Number(body.bonus_percentage),
        note: body.note
      });

      return reply.status(201).send({ success: true, reward });
    } catch (error: any) {
      return reply.status(400).send({ message: error.message });
    }
  });
};
