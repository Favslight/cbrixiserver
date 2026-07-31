import { z } from "zod";

const optionalTrimmedString = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? undefined : value),
  z.string().trim().min(1).optional()
);

const nullableTrimmedString = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.string().trim().min(1).nullable().optional()
);

const optionalUuid = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? undefined : value),
  z.string().uuid().optional()
);

const nullableUuid = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.string().uuid().nullable().optional()
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

const nullableDate = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.coerce.date().nullable().optional()
);

export const heroSlideIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const adminHeroSlidesQuerySchema = z.object({
  status: z.enum(["active", "scheduled", "expired", "inactive", "all"]).default("all"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const heroSlideBaseSchema = z.object({
  eyebrow: nullableTrimmedString,
  title: nullableTrimmedString,
  subtitle: nullableTrimmedString,
  description: nullableTrimmedString,
  media_type: z.enum(["IMAGE", "VIDEO"]).default("IMAGE"),
  image_url: optionalTrimmedString,
  mobile_image_url: nullableTrimmedString,
  video_url: nullableTrimmedString,
  mobile_video_url: nullableTrimmedString,
  alt_text: nullableTrimmedString,
  link_url: nullableTrimmedString,
  product_id: nullableUuid,
  badge_text: nullableTrimmedString,
  accent_color: nullableTrimmedString,
  text_position: z.enum(["LEFT", "CENTER", "RIGHT"]).default("LEFT"),
  display_order: z.coerce.number().int().default(0),
  autoplay_seconds: z.coerce.number().int().positive().max(60).default(6),
  start_date: nullableDate,
  end_date: nullableDate,
  is_active: optionalBoolean.default(true)
});

const refineHeroSlideRules = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((value: any, ctx) => {
    if (value.start_date && value.end_date && value.end_date < value.start_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "end_date must be on or after start_date",
        path: ["end_date"]
      });
    }
  });

export const createHeroSlideSchema = refineHeroSlideRules(heroSlideBaseSchema);

export const updateHeroSlideSchema = refineHeroSlideRules(
  heroSlideBaseSchema.partial().extend({
    title: nullableTrimmedString,
    product_id: nullableUuid.or(optionalUuid),
    is_active: optionalBoolean
  })
);

export type AdminHeroSlidesQuery = z.infer<typeof adminHeroSlidesQuerySchema>;
export type CreateHeroSlideInput = z.infer<typeof createHeroSlideSchema>;
export type UpdateHeroSlideInput = z.infer<typeof updateHeroSlideSchema>;
