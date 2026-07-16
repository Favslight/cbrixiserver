import { pool } from "../../config/db";
import {
  CampaignPlacement,
  CampaignProductSummary,
  CampaignRecord,
  CampaignStats,
  CampaignStatusFilter,
  CampaignType
} from "./campaign.types";
import {
  AdminCampaignsQuery,
  CreateCampaignInput,
  RecordCampaignViewInput,
  UpdateCampaignInput
} from "./campaign.validation";

let ensureSchemaPromise: Promise<void> | null = null;

export const ensureCampaignSchema = async () => {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        campaign_type VARCHAR(30) NOT NULL,
        placement VARCHAR(30) NOT NULL,
        media_url TEXT,
        thumbnail_url TEXT,
        media_public_id TEXT,
        thumbnail_public_id TEXT,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        popup_delay_seconds INTEGER NOT NULL DEFAULT 0,
        display_duration_seconds INTEGER NOT NULL DEFAULT 15,
        allow_skip_after_seconds INTEGER NOT NULL DEFAULT 5,
        priority INTEGER NOT NULL DEFAULT 0,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT campaigns_type_check CHECK (
          campaign_type IN ('IMAGE', 'VIDEO', 'TEXT', 'PROMOTED_PRODUCT')
        ),
        CONSTRAINT campaigns_placement_check CHECK (
          placement IN (
            'LANDING_POPUP',
            'HERO_BANNER',
            'TOP_BANNER',
            'BOTTOM_BANNER',
            'CATEGORY_PAGE',
            'PRODUCT_PAGE',
            'SIDEBAR',
            'FOOTER'
          )
        ),
        CONSTRAINT campaigns_dates_check CHECK (end_date >= start_date),
        CONSTRAINT campaigns_skip_check CHECK (allow_skip_after_seconds >= 0),
        CONSTRAINT campaigns_duration_check CHECK (display_duration_seconds > 0)
      );

      CREATE TABLE IF NOT EXISTS campaign_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        session_id VARCHAR(255) NOT NULL,
        viewed_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_campaigns_active_dates
      ON campaigns(is_active, start_date, end_date);

      CREATE INDEX IF NOT EXISTS idx_campaigns_placement_priority
      ON campaigns(placement, priority DESC);

      CREATE INDEX IF NOT EXISTS idx_campaigns_product_id
      ON campaigns(product_id);

      CREATE INDEX IF NOT EXISTS idx_campaign_views_campaign_id
      ON campaign_views(campaign_id);

      CREATE INDEX IF NOT EXISTS idx_campaign_views_viewed_at
      ON campaign_views(viewed_at DESC);
    `).then(() => undefined);
  }

  await ensureSchemaPromise;
};

const productSummarySelect = `
  p.id,
  p.name,
  p.price,
  COALESCE(p.image_url, p.image_urls[1]) AS image_url,
  p.image_urls,
  COALESCE(p.discount_enabled, FALSE) AS discount_enabled,
  COALESCE(p.discount_percentage, 0) AS discount_percentage,
  CASE
    WHEN COALESCE(p.discount_enabled, FALSE)
      THEN ROUND((p.price * COALESCE(p.discount_percentage, 0)) / 100, 2)
    ELSE 0
  END AS discount_amount,
  CASE
    WHEN COALESCE(p.discount_enabled, FALSE)
      THEN GREATEST(ROUND(p.price - ((p.price * COALESCE(p.discount_percentage, 0)) / 100), 2), 0)
    ELSE p.price
  END AS discounted_price,
  CASE
    WHEN COALESCE(p.discount_enabled, FALSE)
      THEN GREATEST(ROUND(p.price - ((p.price * COALESCE(p.discount_percentage, 0)) / 100), 2), 0)
    ELSE p.price
  END AS effective_price
`;

const mapProduct = (row: Record<string, any> | null | undefined): CampaignProductSummary | null => {
  if (!row?.id) return null;

  return {
    id: row.id,
    name: row.name,
    price: Number(row.price ?? 0),
    image_url: row.image_url ?? null,
    image_urls: row.image_urls ?? null,
    discount_enabled: Boolean(row.discount_enabled),
    discount_percentage: Number(row.discount_percentage ?? 0),
    discount_amount: Number(row.discount_amount ?? 0),
    discounted_price: Number(row.discounted_price ?? row.price ?? 0),
    effective_price: Number(row.effective_price ?? row.price ?? 0)
  };
};

const mapCampaign = (row: Record<string, any>): CampaignRecord => ({
  id: row.id,
  title: row.title,
  description: row.description ?? null,
  campaign_type: row.campaign_type,
  placement: row.placement,
  media_url: row.media_url ?? null,
  thumbnail_url: row.thumbnail_url ?? null,
  media_public_id: row.media_public_id ?? null,
  thumbnail_public_id: row.thumbnail_public_id ?? null,
  product_id: row.product_id ?? null,
  popup_delay_seconds: Number(row.popup_delay_seconds ?? 0),
  display_duration_seconds: Number(row.display_duration_seconds ?? 15),
  allow_skip_after_seconds: Number(row.allow_skip_after_seconds ?? 5),
  priority: Number(row.priority ?? 0),
  start_date: row.start_date,
  end_date: row.end_date,
  is_active: Boolean(row.is_active),
  created_by: row.created_by ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
  view_count: row.view_count === undefined ? undefined : Number(row.view_count),
  product: mapProduct(
    row.product_id
      ? {
          id: row.product_id,
          name: row.product_name,
          price: row.product_price,
          image_url: row.product_image_url,
          image_urls: row.product_image_urls,
          discount_enabled: row.product_discount_enabled,
          discount_percentage: row.product_discount_percentage,
          discount_amount: row.product_discount_amount,
          discounted_price: row.product_discounted_price,
          effective_price: row.product_effective_price
        }
      : null
  )
});

const assertProductExists = async (productId: string) => {
  const result = await pool.query(
    `
    SELECT ${productSummarySelect}
    FROM products p
    WHERE p.id = $1 AND p.is_active = TRUE
    `,
    [productId]
  );

  if (!result.rows[0]) {
    throw new Error("Product not found or inactive");
  }

  return mapProduct(result.rows[0]);
};

const campaignSelectSql = `
  SELECT
    c.*,
    COALESCE(views.view_count, 0)::INT AS view_count,
    p.name AS product_name,
    p.price AS product_price,
    COALESCE(p.image_url, p.image_urls[1]) AS product_image_url,
    p.image_urls AS product_image_urls,
    COALESCE(p.discount_enabled, FALSE) AS product_discount_enabled,
    COALESCE(p.discount_percentage, 0) AS product_discount_percentage,
    CASE
      WHEN COALESCE(p.discount_enabled, FALSE)
        THEN ROUND((p.price * COALESCE(p.discount_percentage, 0)) / 100, 2)
      ELSE 0
    END AS product_discount_amount,
    CASE
      WHEN COALESCE(p.discount_enabled, FALSE)
        THEN GREATEST(ROUND(p.price - ((p.price * COALESCE(p.discount_percentage, 0)) / 100), 2), 0)
      ELSE p.price
    END AS product_discounted_price,
    CASE
      WHEN COALESCE(p.discount_enabled, FALSE)
        THEN GREATEST(ROUND(p.price - ((p.price * COALESCE(p.discount_percentage, 0)) / 100), 2), 0)
      ELSE p.price
    END AS product_effective_price
  FROM campaigns c
  LEFT JOIN products p ON p.id = c.product_id
  LEFT JOIN (
    SELECT campaign_id, COUNT(*)::INT AS view_count
    FROM campaign_views
    GROUP BY campaign_id
  ) views ON views.campaign_id = c.id
`;

export const getHomepageCampaigns = async (placement?: CampaignPlacement) => {
  await ensureCampaignSchema();

  const values: unknown[] = [];
  let placementFilter = "";

  if (placement) {
    values.push(placement);
    placementFilter = `AND c.placement = $${values.length}`;
  }

  const result = await pool.query(
    `
    ${campaignSelectSql}
    WHERE c.is_active = TRUE
      AND c.start_date <= NOW()
      AND c.end_date >= NOW()
      ${placementFilter}
    ORDER BY c.priority DESC, c.created_at DESC
    `,
    values
  );

  return result.rows.map(mapCampaign);
};

export const recordCampaignView = async (input: RecordCampaignViewInput) => {
  await ensureCampaignSchema();

  const campaignRes = await pool.query(
    `SELECT id FROM campaigns WHERE id = $1`,
    [input.campaign_id]
  );

  if (!campaignRes.rows[0]) {
    throw new Error("Campaign not found");
  }

  const result = await pool.query(
    `
    INSERT INTO campaign_views (campaign_id, user_id, session_id)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [input.campaign_id, input.user_id ?? null, input.session_id]
  );

  return result.rows[0];
};

export const createCampaign = async (
  input: CreateCampaignInput,
  extras: {
    createdBy?: string | null;
    mediaUrl?: string | null;
    thumbnailUrl?: string | null;
    mediaPublicId?: string | null;
    thumbnailPublicId?: string | null;
  } = {}
) => {
  await ensureCampaignSchema();

  let product: CampaignProductSummary | null = null;
  if (input.campaign_type === "PROMOTED_PRODUCT") {
    if (!input.product_id) throw new Error("product_id is required for PROMOTED_PRODUCT campaigns");
    product = await assertProductExists(input.product_id);
  } else if (input.product_id) {
    product = await assertProductExists(input.product_id);
  }

  const mediaUrl = extras.mediaUrl ?? input.media_url ?? product?.image_url ?? null;
  const thumbnailUrl = extras.thumbnailUrl ?? input.thumbnail_url ?? product?.image_url ?? null;

  if (input.campaign_type === "IMAGE" && !mediaUrl) {
    throw new Error("IMAGE campaigns require an uploaded image or media_url");
  }

  if (input.campaign_type === "VIDEO" && !mediaUrl) {
    throw new Error("VIDEO campaigns require an uploaded video or media_url");
  }

  const result = await pool.query(
    `
    INSERT INTO campaigns (
      title,
      description,
      campaign_type,
      placement,
      media_url,
      thumbnail_url,
      media_public_id,
      thumbnail_public_id,
      product_id,
      popup_delay_seconds,
      display_duration_seconds,
      allow_skip_after_seconds,
      priority,
      start_date,
      end_date,
      is_active,
      created_by
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
    )
    RETURNING id
    `,
    [
      input.title,
      input.description ?? null,
      input.campaign_type,
      input.placement,
      mediaUrl,
      thumbnailUrl,
      extras.mediaPublicId ?? null,
      extras.thumbnailPublicId ?? null,
      input.product_id ?? null,
      input.popup_delay_seconds,
      input.display_duration_seconds,
      input.allow_skip_after_seconds,
      input.priority,
      input.start_date,
      input.end_date,
      input.is_active ?? true,
      extras.createdBy ?? null
    ]
  );

  return getCampaignById(result.rows[0].id);
};

export const listAdminCampaigns = async (query: AdminCampaignsQuery) => {
  await ensureCampaignSchema();

  const values: unknown[] = [];
  const filters: string[] = [];

  if (query.placement) {
    values.push(query.placement);
    filters.push(`c.placement = $${values.length}`);
  }

  if (query.type) {
    values.push(query.type);
    filters.push(`c.campaign_type = $${values.length}`);
  }

  const status: CampaignStatusFilter = query.status ?? "all";
  if (status === "active") {
    filters.push(`c.is_active = TRUE AND c.start_date <= NOW() AND c.end_date >= NOW()`);
  } else if (status === "scheduled") {
    filters.push(`c.is_active = TRUE AND c.start_date > NOW()`);
  } else if (status === "expired") {
    filters.push(`c.end_date < NOW()`);
  } else if (status === "inactive") {
    filters.push(`c.is_active = FALSE`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const limit = query.limit;
  const offset = (query.page - 1) * query.limit;

  values.push(limit, offset);

  const result = await pool.query(
    `
    ${campaignSelectSql}
    ${where}
    ORDER BY c.priority DESC, c.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  const countValues = values.slice(0, -2);
  const countRes = await pool.query(
    `
    SELECT COUNT(*)::INT AS total
    FROM campaigns c
    ${where}
    `,
    countValues
  );

  const total = Number(countRes.rows[0]?.total ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    campaigns: result.rows.map(mapCampaign),
    pagination: {
      page: query.page,
      limit,
      offset,
      total,
      total_pages: totalPages,
      has_more: offset + result.rows.length < total,
      has_previous: offset > 0
    }
  };
};

export const getCampaignById = async (id: string) => {
  await ensureCampaignSchema();

  const result = await pool.query(
    `
    ${campaignSelectSql}
    WHERE c.id = $1
    `,
    [id]
  );

  if (!result.rows[0]) return null;
  return mapCampaign(result.rows[0]);
};

export const updateCampaign = async (
  id: string,
  input: UpdateCampaignInput,
  extras: {
    mediaUrl?: string | null;
    thumbnailUrl?: string | null;
    mediaPublicId?: string | null;
    thumbnailPublicId?: string | null;
    clearMedia?: boolean;
    clearThumbnail?: boolean;
  } = {}
) => {
  await ensureCampaignSchema();

  const existing = await getCampaignById(id);
  if (!existing) throw new Error("Campaign not found");

  const nextType = (input.campaign_type ?? existing.campaign_type) as CampaignType;
  const nextProductId = input.product_id === undefined ? existing.product_id : input.product_id;

  let product: CampaignProductSummary | null = existing.product ?? null;
  if (nextType === "PROMOTED_PRODUCT") {
    if (!nextProductId) throw new Error("product_id is required for PROMOTED_PRODUCT campaigns");
    product = await assertProductExists(nextProductId);
  } else if (nextProductId) {
    product = await assertProductExists(nextProductId);
  } else {
    product = null;
  }

  const startDate = input.start_date ?? existing.start_date;
  const endDate = input.end_date ?? existing.end_date;
  if (new Date(endDate) < new Date(startDate)) {
    throw new Error("end_date must be on or after start_date");
  }

  const mediaUrl = extras.clearMedia
    ? null
    : extras.mediaUrl ?? input.media_url ?? existing.media_url ?? product?.image_url ?? null;
  const thumbnailUrl = extras.clearThumbnail
    ? null
    : extras.thumbnailUrl ?? input.thumbnail_url ?? existing.thumbnail_url ?? product?.image_url ?? null;

  if (nextType === "IMAGE" && !mediaUrl) {
    throw new Error("IMAGE campaigns require an uploaded image or media_url");
  }
  if (nextType === "VIDEO" && !mediaUrl) {
    throw new Error("VIDEO campaigns require an uploaded video or media_url");
  }

  await pool.query(
    `
    UPDATE campaigns
    SET
      title = COALESCE($2, title),
      description = CASE WHEN $18::BOOLEAN THEN $3 ELSE description END,
      campaign_type = COALESCE($4, campaign_type),
      placement = COALESCE($5, placement),
      media_url = $6,
      thumbnail_url = $7,
      media_public_id = CASE WHEN $19::BOOLEAN THEN $8 ELSE COALESCE($8, media_public_id) END,
      thumbnail_public_id = CASE WHEN $20::BOOLEAN THEN $9 ELSE COALESCE($9, thumbnail_public_id) END,
      product_id = $10,
      popup_delay_seconds = COALESCE($11, popup_delay_seconds),
      display_duration_seconds = COALESCE($12, display_duration_seconds),
      allow_skip_after_seconds = COALESCE($13, allow_skip_after_seconds),
      priority = COALESCE($14, priority),
      start_date = COALESCE($15, start_date),
      end_date = COALESCE($16, end_date),
      is_active = COALESCE($17, is_active),
      updated_at = NOW()
    WHERE id = $1
    `,
    [
      id,
      input.title ?? null,
      input.description ?? null,
      input.campaign_type ?? null,
      input.placement ?? null,
      mediaUrl,
      thumbnailUrl,
      extras.mediaPublicId ?? null,
      extras.thumbnailPublicId ?? null,
      nextProductId,
      input.popup_delay_seconds ?? null,
      input.display_duration_seconds ?? null,
      input.allow_skip_after_seconds ?? null,
      input.priority ?? null,
      input.start_date ?? null,
      input.end_date ?? null,
      input.is_active ?? null,
      input.description !== undefined,
      Boolean(extras.clearMedia || extras.mediaPublicId),
      Boolean(extras.clearThumbnail || extras.thumbnailPublicId)
    ]
  );

  return getCampaignById(id);
};

export const deleteCampaign = async (id: string) => {
  await ensureCampaignSchema();

  const existing = await getCampaignById(id);
  if (!existing) throw new Error("Campaign not found");

  await pool.query(`DELETE FROM campaigns WHERE id = $1`, [id]);
  return existing;
};

export const setCampaignActiveState = async (id: string, isActive: boolean) => {
  await ensureCampaignSchema();

  const existing = await getCampaignById(id);
  if (!existing) throw new Error("Campaign not found");

  await pool.query(
    `
    UPDATE campaigns
    SET is_active = $2, updated_at = NOW()
    WHERE id = $1
    `,
    [id, isActive]
  );

  return getCampaignById(id);
};

export const getCampaignStats = async (): Promise<CampaignStats> => {
  await ensureCampaignSchema();

  const countsRes = await pool.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE is_active = TRUE AND start_date <= NOW() AND end_date >= NOW()
      )::INT AS active_campaigns,
      COUNT(*) FILTER (
        WHERE is_active = TRUE AND start_date > NOW()
      )::INT AS scheduled_campaigns,
      COUNT(*) FILTER (
        WHERE end_date < NOW()
      )::INT AS expired_campaigns,
      COUNT(*) FILTER (
        WHERE is_active = FALSE
      )::INT AS inactive_campaigns
    FROM campaigns
  `);

  const viewsRes = await pool.query(`
    SELECT COUNT(*)::INT AS total_views FROM campaign_views
  `);

  const mostViewedRes = await pool.query(`
    SELECT
      c.id,
      c.title,
      c.placement,
      c.campaign_type,
      COUNT(cv.id)::INT AS view_count
    FROM campaigns c
    LEFT JOIN campaign_views cv ON cv.campaign_id = c.id
    GROUP BY c.id
    ORDER BY view_count DESC, c.created_at DESC
    LIMIT 1
  `);

  const mostViewed = mostViewedRes.rows[0];

  return {
    active_campaigns: Number(countsRes.rows[0]?.active_campaigns ?? 0),
    scheduled_campaigns: Number(countsRes.rows[0]?.scheduled_campaigns ?? 0),
    expired_campaigns: Number(countsRes.rows[0]?.expired_campaigns ?? 0),
    inactive_campaigns: Number(countsRes.rows[0]?.inactive_campaigns ?? 0),
    total_views: Number(viewsRes.rows[0]?.total_views ?? 0),
    most_viewed_campaign: mostViewed && Number(mostViewed.view_count) > 0
      ? {
          id: mostViewed.id,
          title: mostViewed.title,
          placement: mostViewed.placement,
          campaign_type: mostViewed.campaign_type,
          view_count: Number(mostViewed.view_count)
        }
      : null
  };
};
