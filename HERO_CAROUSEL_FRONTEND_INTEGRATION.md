# Hero Carousel Frontend Integration

Base URL: `https://api.cbrixi.com`

This is separate from campaigns. Use it for the homepage hero adverts only. Keep the existing static hero buttons, such as `Shop now` and `Explore devices`, in the frontend UI.

## Public homepage endpoint

```http
GET /api/hero-carousel
```

Response:

```json
{
  "success": true,
  "message": "Hero carousel slides retrieved successfully",
  "slides": [
    {
      "id": "uuid",
      "eyebrow": "New arrival",
      "title": "Upgrade your device setup",
      "subtitle": "Phones, laptops, and accessories",
      "description": "Fresh deals selected for the Cbrixi homepage.",
      "image_url": "https://res.cloudinary.com/.../hero.jpg",
      "mobile_image_url": "https://res.cloudinary.com/.../hero-mobile.jpg",
      "alt_text": "Featured devices on Cbrixi",
      "link_url": "/products",
      "product_id": null,
      "badge_text": "Limited offer",
      "accent_color": "#22c55e",
      "text_position": "LEFT",
      "display_order": 1,
      "autoplay_seconds": 6,
      "start_date": null,
      "end_date": null,
      "is_active": true
    }
  ]
}
```

Render only the returned `slides`. They are already filtered to active/current records and ordered by `display_order`.

## Admin endpoints

All admin routes require the existing admin auth.

```http
GET /api/admin/hero-carousel?status=all&page=1&limit=20
GET /api/admin/hero-carousel/:id
POST /api/admin/hero-carousel
PATCH /api/admin/hero-carousel/:id
DELETE /api/admin/hero-carousel/:id
PATCH /api/admin/hero-carousel/:id/activate
PATCH /api/admin/hero-carousel/:id/deactivate
```

Create/update supports JSON with `image_url`, or `multipart/form-data` with file fields:

- `image`: desktop hero image
- `mobile_image`: optional mobile-specific image

Suggested admin fields:

- `title` required
- `image` or `image_url` required on create
- `eyebrow`, `subtitle`, `description`, `badge_text`, `alt_text`
- `link_url` or `product_id`
- `text_position`: `LEFT`, `CENTER`, `RIGHT`
- `display_order`, `autoplay_seconds`
- `start_date`, `end_date`, `is_active`

## Frontend design note

Use the current Cbrixi gradient, fonts, and button styling. The slide content and background image can change from the server; keep `Shop now` and `Explore devices` as persistent hero actions on top of the carousel.
