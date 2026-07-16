import { z } from "zod";
import { CAMPAIGN_PLACEMENTS, CAMPAIGN_TYPES } from "./campaign.types";

const optionalTrimmedString = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? undefined : value),
  z.string().trim().min(1).optional()
);

const optionalUuid = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? undefined : value),
  z.string().uuid().optional()
);

const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return value;
}, z.boolean().optional());

const coerceNonNegativeInt = z.coerce.number().int().min(0);
const coercePositiveInt = z.coerce.number().int().positive();

export const publicCampaignsQuerySchema = z.object({
  placement: z.enum(CAMPAIGN_PLACEMENTS).optional()
});

export const recordCampaignViewSchema = z.object({
  campaign_id: z.string().uuid(),
  session_id: z.string().trim().min(1).max(255),
  user_id: optionalUuid
});

export const adminCampaignsQuerySchema = z.object({
  status: z.enum(["active", "expired", "scheduled", "inactive", "all"]).default("all"),
  placement: z.enum(CAMPAIGN_PLACEMENTS).optional(),
  type: z.enum(CAMPAIGN_TYPES).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

export const campaignIdParamsSchema = z.object({
  id: z.string().uuid()
});

const campaignBaseSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: optionalTrimmedString,
  campaign_type: z.enum(CAMPAIGN_TYPES),
  placement: z.enum(CAMPAIGN_PLACEMENTS),
  media_url: optionalTrimmedString,
  thumbnail_url: optionalTrimmedString,
  product_id: optionalUuid,
  popup_delay_seconds: coerceNonNegativeInt.default(0),
  display_duration_seconds: coercePositiveInt.default(15),
  allow_skip_after_seconds: coerceNonNegativeInt.default(5),
  priority: z.coerce.number().int().default(0),
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
  is_active: optionalBoolean.default(true)
});

const refineCampaignRules = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((value: any, ctx) => {
    if (value.start_date && value.end_date && value.end_date < value.start_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "end_date must be on or after start_date",
        path: ["end_date"]
      });
    }

    if (
      value.allow_skip_after_seconds !== undefined
      && value.display_duration_seconds !== undefined
      && value.allow_skip_after_seconds > value.display_duration_seconds
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allow_skip_after_seconds cannot be greater than display_duration_seconds",
        path: ["allow_skip_after_seconds"]
      });
    }

    if (value.campaign_type === "PROMOTED_PRODUCT" && !value.product_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "product_id is required for PROMOTED_PRODUCT campaigns",
        path: ["product_id"]
      });
    }

    if (value.campaign_type === "TEXT") {
      return;
    }

    if (value.campaign_type === "PROMOTED_PRODUCT") {
      return;
    }

    // IMAGE / VIDEO require media_url unless a file upload is provided separately.
    // Controllers enforce file-or-url presence.
  });

export const createCampaignSchema = refineCampaignRules(campaignBaseSchema);

export const updateCampaignSchema = refineCampaignRules(
  campaignBaseSchema.partial().extend({
    title: z.string().trim().min(1).max(255).optional(),
    campaign_type: z.enum(CAMPAIGN_TYPES).optional(),
    placement: z.enum(CAMPAIGN_PLACEMENTS).optional(),
    popup_delay_seconds: coerceNonNegativeInt.optional(),
    display_duration_seconds: coercePositiveInt.optional(),
    allow_skip_after_seconds: coerceNonNegativeInt.optional(),
    priority: z.coerce.number().int().optional(),
    start_date: z.coerce.date().optional(),
    end_date: z.coerce.date().optional(),
    is_active: optionalBoolean
  })
);

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type RecordCampaignViewInput = z.infer<typeof recordCampaignViewSchema>;
export type AdminCampaignsQuery = z.infer<typeof adminCampaignsQuerySchema>;
