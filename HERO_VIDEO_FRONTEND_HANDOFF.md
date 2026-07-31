# Hero Video Frontend Handoff

Use this handoff for the homepage hero carousel video update.

Base URL: `https://api.cbrixi.com`

## What Changed

- Hero slides now support image or video media.
- `title` is now optional. Some slides can be pure visual adverts with no headline.
- Existing image slides continue to work.
- Public and admin hero responses now include video fields.

## Public Endpoint

```http
GET /api/hero-carousel
```

Response slide shape:

```ts
type HeroCarouselSlide = {
  id: string;
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  media_type: "IMAGE" | "VIDEO";

  image_url: string | null;
  image_public_id: string | null;
  mobile_image_url: string | null;
  mobile_image_public_id: string | null;

  video_url: string | null;
  video_public_id: string | null;
  mobile_video_url: string | null;
  mobile_video_public_id: string | null;

  alt_text: string | null;
  link_url: string | null;
  product_id: string | null;
  badge_text: string | null;
  accent_color: string | null;
  text_position: "LEFT" | "CENTER" | "RIGHT";
  display_order: number;
  autoplay_seconds: number;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
};
```

## Rendering Logic

If `slide.media_type === "VIDEO"`, render a background video:

```tsx
<video
  src={isMobile && slide.mobile_video_url ? slide.mobile_video_url : slide.video_url}
  autoPlay
  muted
  loop
  playsInline
  poster={isMobile && slide.mobile_image_url ? slide.mobile_image_url : slide.image_url || undefined}
/>
```

If `slide.media_type === "IMAGE"`, render the current image behavior:

```tsx
const imageSrc = isMobile && slide.mobile_image_url
  ? slide.mobile_image_url
  : slide.image_url;
```

Only render text elements when their values exist. Do not reserve empty space for missing hero copy:

```tsx
{slide.eyebrow && <p>{slide.eyebrow}</p>}
{slide.title && <h1>{slide.title}</h1>}
{slide.subtitle && <h2>{slide.subtitle}</h2>}
{slide.description && <p>{slide.description}</p>}
```

## Admin Create And Update

All admin routes require:

```http
Authorization: Bearer <admin-token>
```

Endpoints:

```http
POST /api/admin/hero-carousel
PATCH /api/admin/hero-carousel/:id
```

JSON image slide:

```json
{
  "media_type": "IMAGE",
  "title": null,
  "image_url": "https://res.cloudinary.com/.../hero.jpg",
  "mobile_image_url": "https://res.cloudinary.com/.../hero-mobile.jpg",
  "alt_text": "Featured devices",
  "is_active": true
}
```

JSON video slide:

```json
{
  "media_type": "VIDEO",
  "title": null,
  "video_url": "https://res.cloudinary.com/.../hero.mp4",
  "mobile_video_url": "https://res.cloudinary.com/.../hero-mobile.mp4",
  "image_url": "https://res.cloudinary.com/.../poster.jpg",
  "mobile_image_url": "https://res.cloudinary.com/.../poster-mobile.jpg",
  "alt_text": "Cbrixi homepage promotion",
  "is_active": true
}
```

Multipart fields:

- `image`: desktop image or video poster image
- `mobile_image`: optional mobile image or mobile poster image
- `video`: desktop hero video
- `mobile_video`: optional mobile hero video

Required media rules:

- For `media_type: "IMAGE"`, send `image` or `image_url`.
- For `media_type: "VIDEO"`, send `video` or `video_url`.
- `title` is optional for both image and video slides.
- For video slides, `image_url` is optional but recommended as a poster/fallback.

## Frontend Notes

- Videos should be muted, autoplaying, looping, and `playsInline`.
- Use `poster` for videos when `image_url` or `mobile_image_url` exists.
- Keep the existing persistent hero actions such as `Shop now` and `Explore devices`.
- Admin previews should support both media types.
- If a browser blocks or fails video loading, fall back to `image_url` if provided.
