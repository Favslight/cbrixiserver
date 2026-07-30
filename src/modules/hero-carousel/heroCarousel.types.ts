export type HeroCarouselSlide = {
  id: string;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string;
  image_public_id: string | null;
  mobile_image_url: string | null;
  mobile_image_public_id: string | null;
  alt_text: string | null;
  link_url: string | null;
  product_id: string | null;
  badge_text: string | null;
  accent_color: string | null;
  text_position: "LEFT" | "CENTER" | "RIGHT";
  display_order: number;
  autoplay_seconds: number;
  start_date: string | Date | null;
  end_date: string | Date | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export type HeroCarouselStatusFilter = "active" | "scheduled" | "expired" | "inactive" | "all";
