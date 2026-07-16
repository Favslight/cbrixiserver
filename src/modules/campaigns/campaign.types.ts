export const CAMPAIGN_TYPES = [
  "IMAGE",
  "VIDEO",
  "TEXT",
  "PROMOTED_PRODUCT"
] as const;

export const CAMPAIGN_PLACEMENTS = [
  "LANDING_POPUP",
  "HERO_BANNER",
  "TOP_BANNER",
  "BOTTOM_BANNER",
  "CATEGORY_PAGE",
  "PRODUCT_PAGE",
  "SIDEBAR",
  "FOOTER"
] as const;

export type CampaignType = (typeof CAMPAIGN_TYPES)[number];
export type CampaignPlacement = (typeof CAMPAIGN_PLACEMENTS)[number];

export type CampaignStatusFilter = "active" | "expired" | "scheduled" | "inactive" | "all";

export type CampaignProductSummary = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  image_urls: string[] | null;
  discount_enabled: boolean;
  discount_percentage: number;
  discount_amount: number;
  discounted_price: number;
  effective_price: number;
};

export type CampaignRecord = {
  id: string;
  title: string;
  description: string | null;
  campaign_type: CampaignType;
  placement: CampaignPlacement;
  media_url: string | null;
  thumbnail_url: string | null;
  media_public_id: string | null;
  thumbnail_public_id: string | null;
  product_id: string | null;
  popup_delay_seconds: number;
  display_duration_seconds: number;
  allow_skip_after_seconds: number;
  priority: number;
  start_date: string | Date;
  end_date: string | Date;
  is_active: boolean;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  view_count?: number;
  product?: CampaignProductSummary | null;
};

export type CampaignStats = {
  active_campaigns: number;
  scheduled_campaigns: number;
  expired_campaigns: number;
  inactive_campaigns: number;
  total_views: number;
  most_viewed_campaign: {
    id: string;
    title: string;
    placement: CampaignPlacement;
    campaign_type: CampaignType;
    view_count: number;
  } | null;
};
