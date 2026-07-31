import { pool } from "../../config/db";
import { HeroCarouselSlide, HeroCarouselStatusFilter } from "./heroCarousel.types";
import {
  AdminHeroSlidesQuery,
  CreateHeroSlideInput,
  UpdateHeroSlideInput
} from "./heroCarousel.validation";

let ensureSchemaPromise: Promise<void> | null = null;

export const ensureHeroCarouselSchema = async () => {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS hero_carousel_slides (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        eyebrow VARCHAR(120),
        title VARCHAR(255),
        subtitle VARCHAR(255),
        description TEXT,
        image_url TEXT NOT NULL,
        image_public_id TEXT,
        mobile_image_url TEXT,
        mobile_image_public_id TEXT,
        alt_text VARCHAR(255),
        link_url TEXT,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        badge_text VARCHAR(120),
        accent_color VARCHAR(40),
        text_position VARCHAR(10) NOT NULL DEFAULT 'LEFT',
        display_order INTEGER NOT NULL DEFAULT 0,
        autoplay_seconds INTEGER NOT NULL DEFAULT 6,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT hero_carousel_text_position_check CHECK (text_position IN ('LEFT', 'CENTER', 'RIGHT')),
        CONSTRAINT hero_carousel_dates_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
        CONSTRAINT hero_carousel_autoplay_check CHECK (autoplay_seconds > 0)
      );

      ALTER TABLE hero_carousel_slides
      ALTER COLUMN title DROP NOT NULL,
      ALTER COLUMN image_url DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) NOT NULL DEFAULT 'IMAGE',
      ADD COLUMN IF NOT EXISTS video_url TEXT,
      ADD COLUMN IF NOT EXISTS video_public_id TEXT,
      ADD COLUMN IF NOT EXISTS mobile_video_url TEXT,
      ADD COLUMN IF NOT EXISTS mobile_video_public_id TEXT;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'hero_carousel_media_type_check'
        ) THEN
          ALTER TABLE hero_carousel_slides
          ADD CONSTRAINT hero_carousel_media_type_check CHECK (media_type IN ('IMAGE', 'VIDEO'));
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_hero_carousel_active_dates
      ON hero_carousel_slides(is_active, start_date, end_date);

      CREATE INDEX IF NOT EXISTS idx_hero_carousel_order
      ON hero_carousel_slides(display_order ASC, created_at DESC);
    `).then(() => undefined);
  }

  await ensureSchemaPromise;
};

const mapHeroSlide = (row: Record<string, any>): HeroCarouselSlide => ({
  id: row.id,
  eyebrow: row.eyebrow ?? null,
  title: row.title,
  subtitle: row.subtitle ?? null,
  description: row.description ?? null,
  media_type: row.media_type ?? "IMAGE",
  image_url: row.image_url,
  image_public_id: row.image_public_id ?? null,
  mobile_image_url: row.mobile_image_url ?? null,
  mobile_image_public_id: row.mobile_image_public_id ?? null,
  video_url: row.video_url ?? null,
  video_public_id: row.video_public_id ?? null,
  mobile_video_url: row.mobile_video_url ?? null,
  mobile_video_public_id: row.mobile_video_public_id ?? null,
  alt_text: row.alt_text ?? null,
  link_url: row.link_url ?? null,
  product_id: row.product_id ?? null,
  badge_text: row.badge_text ?? null,
  accent_color: row.accent_color ?? null,
  text_position: row.text_position,
  display_order: Number(row.display_order ?? 0),
  autoplay_seconds: Number(row.autoplay_seconds ?? 6),
  start_date: row.start_date ?? null,
  end_date: row.end_date ?? null,
  is_active: Boolean(row.is_active),
  created_by: row.created_by ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at
});

const assertProductExists = async (productId: string) => {
  const result = await pool.query(
    `SELECT id FROM products WHERE id = $1 AND is_active = TRUE AND COALESCE(in_stock, TRUE) = TRUE`,
    [productId]
  );

  if (!result.rows[0]) {
    throw new Error("Product not found or inactive");
  }
};

export const getPublicHeroSlides = async () => {
  await ensureHeroCarouselSchema();

  const result = await pool.query(`
    SELECT *
    FROM hero_carousel_slides
    WHERE is_active = TRUE
      AND (start_date IS NULL OR start_date <= NOW())
      AND (end_date IS NULL OR end_date >= NOW())
    ORDER BY display_order ASC, created_at DESC
  `);

  return result.rows.map(mapHeroSlide);
};

export const listAdminHeroSlides = async (query: AdminHeroSlidesQuery) => {
  await ensureHeroCarouselSchema();

  const filters: string[] = [];
  const values: unknown[] = [];
  const status: HeroCarouselStatusFilter = query.status ?? "all";

  if (status === "active") {
    filters.push(`is_active = TRUE AND (start_date IS NULL OR start_date <= NOW()) AND (end_date IS NULL OR end_date >= NOW())`);
  } else if (status === "scheduled") {
    filters.push(`is_active = TRUE AND start_date > NOW()`);
  } else if (status === "expired") {
    filters.push(`end_date < NOW()`);
  } else if (status === "inactive") {
    filters.push(`is_active = FALSE`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const limit = query.limit;
  const offset = (query.page - 1) * query.limit;
  values.push(limit, offset);

  const result = await pool.query(
    `
    SELECT *
    FROM hero_carousel_slides
    ${where}
    ORDER BY display_order ASC, created_at DESC
    LIMIT $1 OFFSET $2
    `,
    values
  );

  const countRes = await pool.query(`SELECT COUNT(*)::INT AS total FROM hero_carousel_slides ${where}`);
  const total = Number(countRes.rows[0]?.total ?? 0);

  return {
    slides: result.rows.map(mapHeroSlide),
    pagination: {
      page: query.page,
      limit,
      offset,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / limit),
      has_more: offset + result.rows.length < total,
      has_previous: offset > 0
    }
  };
};

export const getHeroSlideById = async (id: string) => {
  await ensureHeroCarouselSchema();

  const result = await pool.query(`SELECT * FROM hero_carousel_slides WHERE id = $1`, [id]);
  return result.rows[0] ? mapHeroSlide(result.rows[0]) : null;
};

export const createHeroSlide = async (
  input: CreateHeroSlideInput,
  extras: {
    createdBy?: string | null;
    imageUrl?: string | null;
    imagePublicId?: string | null;
    mobileImageUrl?: string | null;
    mobileImagePublicId?: string | null;
    videoUrl?: string | null;
    videoPublicId?: string | null;
    mobileVideoUrl?: string | null;
    mobileVideoPublicId?: string | null;
  } = {}
) => {
  await ensureHeroCarouselSchema();

  if (input.product_id) {
    await assertProductExists(input.product_id);
  }

  const mediaType = input.media_type ?? "IMAGE";
  const imageUrl = extras.imageUrl ?? input.image_url ?? null;
  const videoUrl = extras.videoUrl ?? input.video_url ?? null;

  if (mediaType === "IMAGE" && !imageUrl) {
    throw new Error("Image hero carousel slide requires an uploaded image or image_url");
  }

  if (mediaType === "VIDEO" && !videoUrl) {
    throw new Error("Video hero carousel slide requires an uploaded video or video_url");
  }

  const result = await pool.query(
    `
    INSERT INTO hero_carousel_slides (
      eyebrow, title, subtitle, description, media_type,
      image_url, image_public_id, mobile_image_url, mobile_image_public_id,
      video_url, video_public_id, mobile_video_url, mobile_video_public_id,
      alt_text, link_url, product_id, badge_text, accent_color, text_position,
      display_order, autoplay_seconds, start_date, end_date, is_active, created_by
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
    RETURNING id
    `,
    [
      input.eyebrow ?? null,
      input.title ?? null,
      input.subtitle ?? null,
      input.description ?? null,
      mediaType,
      imageUrl,
      extras.imagePublicId ?? null,
      extras.mobileImageUrl ?? input.mobile_image_url ?? null,
      extras.mobileImagePublicId ?? null,
      videoUrl,
      extras.videoPublicId ?? null,
      extras.mobileVideoUrl ?? input.mobile_video_url ?? null,
      extras.mobileVideoPublicId ?? null,
      input.alt_text ?? null,
      input.link_url ?? null,
      input.product_id ?? null,
      input.badge_text ?? null,
      input.accent_color ?? null,
      input.text_position,
      input.display_order,
      input.autoplay_seconds,
      input.start_date ?? null,
      input.end_date ?? null,
      input.is_active ?? true,
      extras.createdBy ?? null
    ]
  );

  return getHeroSlideById(result.rows[0].id);
};

export const updateHeroSlide = async (
  id: string,
  input: UpdateHeroSlideInput,
  extras: {
    imageUrl?: string | null;
    imagePublicId?: string | null;
    mobileImageUrl?: string | null;
    mobileImagePublicId?: string | null;
    videoUrl?: string | null;
    videoPublicId?: string | null;
    mobileVideoUrl?: string | null;
    mobileVideoPublicId?: string | null;
  } = {}
) => {
  await ensureHeroCarouselSchema();

  const existing = await getHeroSlideById(id);
  if (!existing) throw new Error("Hero carousel slide not found");

  const nextProductId = input.product_id === undefined ? existing.product_id : input.product_id;
  if (nextProductId) {
    await assertProductExists(nextProductId);
  }

  const startDate = input.start_date === undefined ? existing.start_date : input.start_date;
  const endDate = input.end_date === undefined ? existing.end_date : input.end_date;
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    throw new Error("end_date must be on or after start_date");
  }

  const mediaType = input.media_type ?? existing.media_type ?? "IMAGE";
  const imageUrl = extras.imageUrl ?? input.image_url ?? existing.image_url ?? null;
  const videoUrl = extras.videoUrl ?? input.video_url ?? existing.video_url ?? null;

  if (mediaType === "IMAGE" && !imageUrl) {
    throw new Error("Image hero carousel slide requires an image_url");
  }

  if (mediaType === "VIDEO" && !videoUrl) {
    throw new Error("Video hero carousel slide requires a video_url");
  }

  await pool.query(
    `
    UPDATE hero_carousel_slides
    SET
      eyebrow = CASE WHEN $2::BOOLEAN THEN $3 ELSE eyebrow END,
      title = COALESCE($4, title),
      subtitle = CASE WHEN $5::BOOLEAN THEN $6 ELSE subtitle END,
      description = CASE WHEN $7::BOOLEAN THEN $8 ELSE description END,
      media_type = $9,
      image_url = $10,
      image_public_id = COALESCE($11, image_public_id),
      mobile_image_url = CASE WHEN $12::BOOLEAN THEN $13 ELSE mobile_image_url END,
      mobile_image_public_id = COALESCE($14, mobile_image_public_id),
      video_url = $15,
      video_public_id = COALESCE($16, video_public_id),
      mobile_video_url = CASE WHEN $17::BOOLEAN THEN $18 ELSE mobile_video_url END,
      mobile_video_public_id = COALESCE($19, mobile_video_public_id),
      alt_text = CASE WHEN $20::BOOLEAN THEN $21 ELSE alt_text END,
      link_url = CASE WHEN $22::BOOLEAN THEN $23 ELSE link_url END,
      product_id = $24,
      badge_text = CASE WHEN $25::BOOLEAN THEN $26 ELSE badge_text END,
      accent_color = CASE WHEN $27::BOOLEAN THEN $28 ELSE accent_color END,
      text_position = COALESCE($29, text_position),
      display_order = COALESCE($30, display_order),
      autoplay_seconds = COALESCE($31, autoplay_seconds),
      start_date = CASE WHEN $32::BOOLEAN THEN $33 ELSE start_date END,
      end_date = CASE WHEN $34::BOOLEAN THEN $35 ELSE end_date END,
      is_active = COALESCE($36, is_active),
      updated_at = NOW()
    WHERE id = $1
    `,
    [
      id,
      input.eyebrow !== undefined,
      input.eyebrow ?? null,
      input.title ?? null,
      input.subtitle !== undefined,
      input.subtitle ?? null,
      input.description !== undefined,
      input.description ?? null,
      mediaType,
      imageUrl,
      extras.imagePublicId ?? null,
      input.mobile_image_url !== undefined || Boolean(extras.mobileImageUrl),
      extras.mobileImageUrl ?? input.mobile_image_url ?? null,
      extras.mobileImagePublicId ?? null,
      videoUrl,
      extras.videoPublicId ?? null,
      input.mobile_video_url !== undefined || Boolean(extras.mobileVideoUrl),
      extras.mobileVideoUrl ?? input.mobile_video_url ?? null,
      extras.mobileVideoPublicId ?? null,
      input.alt_text !== undefined,
      input.alt_text ?? null,
      input.link_url !== undefined,
      input.link_url ?? null,
      nextProductId ?? null,
      input.badge_text !== undefined,
      input.badge_text ?? null,
      input.accent_color !== undefined,
      input.accent_color ?? null,
      input.text_position ?? null,
      input.display_order ?? null,
      input.autoplay_seconds ?? null,
      input.start_date !== undefined,
      input.start_date ?? null,
      input.end_date !== undefined,
      input.end_date ?? null,
      input.is_active ?? null
    ]
  );

  return getHeroSlideById(id);
};

export const deleteHeroSlide = async (id: string) => {
  await ensureHeroCarouselSchema();

  const existing = await getHeroSlideById(id);
  if (!existing) throw new Error("Hero carousel slide not found");

  await pool.query(`DELETE FROM hero_carousel_slides WHERE id = $1`, [id]);
  return existing;
};

export const setHeroSlideActiveState = async (id: string, isActive: boolean) => {
  await ensureHeroCarouselSchema();

  const existing = await getHeroSlideById(id);
  if (!existing) throw new Error("Hero carousel slide not found");

  await pool.query(
    `UPDATE hero_carousel_slides SET is_active = $2, updated_at = NOW() WHERE id = $1`,
    [id, isActive]
  );

  return getHeroSlideById(id);
};
