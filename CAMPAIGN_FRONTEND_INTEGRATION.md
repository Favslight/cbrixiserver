# Campaign & Announcement System — Frontend Integration

Internal Cbrixi promotions only. No external links, redirect URLs, click tracking, or advertiser accounts.

Base URL: `https://api.cbrixi.com`

Admin auth:

```http
Authorization: Bearer <admin-token>
```

---

## Campaign types

| Type | Media | Notes |
|------|-------|-------|
| `IMAGE` | image upload or `media_url` | countdown + skip |
| `VIDEO` | video upload or `media_url` | autoplay muted, countdown + skip |
| `TEXT` | none | title + description |
| `PROMOTED_PRODUCT` | auto from product | requires `product_id` |

## Placements

`LANDING_POPUP` · `HERO_BANNER` · `TOP_BANNER` · `BOTTOM_BANNER` · `CATEGORY_PAGE` · `PRODUCT_PAGE` · `SIDEBAR` · `FOOTER`

---

## Public API

### Get active campaigns

```http
GET /api/campaigns/homepage
GET /api/campaigns/homepage?placement=LANDING_POPUP
GET /api/campaigns/homepage?placement=HERO_BANNER
```

Rules applied server-side:

- `is_active = true`
- now between `start_date` and `end_date`
- ordered by `priority DESC`

Response:

```json
{
  "success": true,
  "message": "Campaigns retrieved successfully",
  "campaigns": [
    {
      "id": "uuid",
      "title": "Flash Sale",
      "description": "Up to 40% off laptops",
      "campaign_type": "IMAGE",
      "placement": "LANDING_POPUP",
      "media_url": "https://res.cloudinary.com/...",
      "thumbnail_url": "https://res.cloudinary.com/...",
      "product_id": null,
      "popup_delay_seconds": 5,
      "display_duration_seconds": 15,
      "allow_skip_after_seconds": 5,
      "priority": 10,
      "start_date": "2026-07-16T00:00:00.000Z",
      "end_date": "2026-07-31T23:59:59.000Z",
      "is_active": true,
      "view_count": 120,
      "product": null
    }
  ]
}
```

For `PROMOTED_PRODUCT`, `product` is populated:

```json
{
  "product": {
    "id": "uuid",
    "name": "MacBook Air",
    "price": 1200000,
    "image_url": "https://...",
    "discount_enabled": true,
    "discount_percentage": 10,
    "discount_amount": 120000,
    "discounted_price": 1080000,
    "effective_price": 1080000
  }
}
```

### Record impression (views only)

```http
POST /api/campaigns/view
Content-Type: application/json

{
  "campaign_id": "uuid",
  "session_id": "browser-session-id",
  "user_id": "optional-user-uuid"
}
```

Call once when the campaign is shown.

---

## Landing popup UX

1. On homepage load, wait `popup_delay_seconds` (from the first matching campaign, or fetch first then wait).
2. Fetch `GET /api/campaigns/homepage?placement=LANDING_POPUP`.
3. Show highest-priority campaign.
4. Start countdown using `display_duration_seconds`.
5. Enable Skip after `allow_skip_after_seconds`.
6. Auto-close when duration ends or user skips.
7. Record view via `POST /api/campaigns/view`.

### Video popup

- autoplay muted
- show countdown
- Skip after `allow_skip_after_seconds`
- close after `display_duration_seconds`

### Image / Text

- same countdown + skip + auto-close rules

---

## Hero / other banners

```ts
const loadPlacement = async (placement: string) => {
  const res = await fetch(`${API_URL}/api/campaigns/homepage?placement=${placement}`);
  const data = await res.json();
  return data.campaigns ?? [];
};
```

Suggested rotation for `HERO_BANNER`: every 5 seconds by priority order.

Placements to wire:

- Top: `TOP_BANNER`
- Bottom: `BOTTOM_BANNER`
- Category: `CATEGORY_PAGE`
- Product: `PRODUCT_PAGE`
- Sidebar: `SIDEBAR`
- Footer: `FOOTER`

---

## Admin API

### Stats

```http
GET /api/admin/campaigns/stats
```

```json
{
  "success": true,
  "stats": {
    "active_campaigns": 3,
    "scheduled_campaigns": 2,
    "expired_campaigns": 5,
    "inactive_campaigns": 1,
    "total_views": 1840,
    "most_viewed_campaign": {
      "id": "uuid",
      "title": "Flash Sale",
      "placement": "HERO_BANNER",
      "campaign_type": "IMAGE",
      "view_count": 620
    }
  }
}
```

### List campaigns

```http
GET /api/admin/campaigns?status=active&placement=HERO_BANNER&type=IMAGE&page=1&limit=20
```

`status`: `all` | `active` | `scheduled` | `expired` | `inactive`

### Get one

```http
GET /api/admin/campaigns/:id
```

### Create (JSON)

```http
POST /api/admin/campaigns
Content-Type: application/json

{
  "title": "Summer Promo",
  "description": "Shop installment deals",
  "campaign_type": "TEXT",
  "placement": "TOP_BANNER",
  "popup_delay_seconds": 0,
  "display_duration_seconds": 12,
  "allow_skip_after_seconds": 3,
  "priority": 5,
  "start_date": "2026-07-16T00:00:00.000Z",
  "end_date": "2026-08-16T00:00:00.000Z",
  "is_active": true
}
```

### Create with media (multipart)

```http
POST /api/admin/campaigns
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data
```

Fields:

- `title`, `description`, `campaign_type`, `placement`
- `popup_delay_seconds`, `display_duration_seconds`, `allow_skip_after_seconds`
- `priority`, `start_date`, `end_date`, `is_active`
- `product_id` (required for `PROMOTED_PRODUCT`)
- file field `media` (image or video)
- optional file field `thumbnail`

### Promoted product campaign

```json
{
  "title": "Featured Laptop",
  "campaign_type": "PROMOTED_PRODUCT",
  "placement": "HERO_BANNER",
  "product_id": "product-uuid",
  "priority": 20,
  "start_date": "2026-07-16T00:00:00.000Z",
  "end_date": "2026-07-30T00:00:00.000Z",
  "display_duration_seconds": 10,
  "allow_skip_after_seconds": 3,
  "popup_delay_seconds": 0,
  "is_active": true
}
```

Backend auto-loads product image, name, price, and discount.

### Update

```http
PATCH /api/admin/campaigns/:id
```

JSON or multipart (same fields as create; all optional).

### Activate / deactivate

```http
PATCH /api/admin/campaigns/:id/activate
PATCH /api/admin/campaigns/:id/deactivate
```

### Delete

```http
DELETE /api/admin/campaigns/:id
```

---

## Scheduling

No cron required for display:

- becomes visible when `now >= start_date` and `is_active`
- stops when `now > end_date`

Use admin `status=scheduled|active|expired` filters for dashboard tables.

---

## Admin UI checklist

- [ ] Campaign list with filters (status, placement, type)
- [ ] Stats cards: active / scheduled / expired / total views / most viewed
- [ ] Create form with type + placement selectors
- [ ] Image/video upload via multipart `media`
- [ ] Product picker for `PROMOTED_PRODUCT`
- [ ] Schedule start/end dates
- [ ] Preview popup/banner
- [ ] Activate / deactivate / delete actions

## Storefront UI checklist

- [ ] Landing popup component using `LANDING_POPUP`
- [ ] Countdown + Skip using campaign timing fields
- [ ] Hero banner rotator using `HERO_BANNER` (5s)
- [ ] Other placement banners
- [ ] Call `POST /api/campaigns/view` on show
- [ ] Never add external redirect links
