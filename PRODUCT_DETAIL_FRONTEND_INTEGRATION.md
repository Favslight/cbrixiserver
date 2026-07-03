# Product Detail Frontend Integration

Use this handoff for the public product page and admin product upload/edit UI.

The product page must render the values returned by the backend. Do not hardcode `20%` first payment or `12 months`; those are only fallback examples and should not override product data uploaded by admin.

## Public Product Endpoints

```ts
GET /products
GET /products/category/:category
```

Both responses return:

```ts
type Product = {
  id: string;
  name: string;
  description?: string | null;
  specifications: ProductSpecificationSection[];
  category?: string | null;
  price: string | number;
  discount_enabled: boolean;
  discount_percentage: string | number;
  discount_amount: string | number;
  discounted_price: string | number;
  effective_price: string | number;
  image_url?: string | null; // selected thumbnail / primary image
  image_urls: string[]; // ordered gallery images
  display_order?: number | null; // homepage display position; null products appear after ordered products
  installment_enabled: boolean;
  minimum_deposit_percentage?: string | number | null;
  installment_duration_months?: string | number | null;
  has_variants: boolean;
  default_variant_id?: string | null;
  variant_price_min?: string | number;
  variant_price_max?: string | number;
  variants: ProductVariant[];
};

type ProductSpecificationSection = {
  section: string; // admin-created, for example "Display"; do not hardcode section names
  items: ProductSpecificationItem[];
};

type ProductSpecificationItem = {
  key: string; // feature name, for example "Display Size"
  value: string | number | boolean; // feature value, for example "6.78-inch"
};

type ProductVariant = {
  id: string;
  name: string;
  specs: Record<string, string | number | boolean>;
  price: string | number;
  discount_amount: string | number;
  discounted_price: string | number;
  effective_price: string | number;
};
```

## Installment Display Rule

Render installment values from the selected variant when variants exist:

```ts
const selectedVariant =
  product.variants?.find((variant) => variant.id === selectedVariantId)
  ?? product.variants?.[0];
const depositPercent = Number(product.minimum_deposit_percentage);
const months = Number(product.installment_duration_months);
const price = Number(selectedVariant?.effective_price ?? product.effective_price);

const canShowInstallment =
  product.installment_enabled === true
  && Number.isFinite(depositPercent)
  && depositPercent > 0
  && Number.isFinite(months)
  && months > 0;

const firstPayment = canShowInstallment
  ? Math.round((price * depositPercent) / 100)
  : null;
```

UI rule:

- If `canShowInstallment` is true, show something like `First payment: NGN 30,000 (30%)` and `Duration: 6 months`.
- If it is false, hide installment terms or show `Installment unavailable`.
- Never use a frontend default like `20%` or `12 months` when the backend returns a different value.
- When `variants` exists, never calculate installment from the parent product price after a user selected a variant.

## Admin Upload Fields

```ts
POST /admin/products
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data
```

```ts
const form = new FormData();
form.append("name", name);
form.append("price", String(price));
if (displayPosition !== undefined && displayPosition !== null) {
  form.append("display_order", String(displayPosition));
}
form.append("category", category);
form.append("description", description); // rich marketing content
form.append("specifications", JSON.stringify(specifications)); // structured specs table data
form.append("variants", JSON.stringify(variants)); // see PRODUCT_VARIANT_FRONTEND_INTEGRATION.md

form.append("installment_enabled", String(installmentEnabled));
if (installmentEnabled) {
  form.append("minimum_deposit_percentage", String(minimumDepositPercentage));
  form.append("installment_duration_months", String(installmentDurationMonths));
}

form.append("thumbnail_index", String(thumbnailIndex));
orderedFiles.forEach((file) => form.append("images", file));
```

For edits, `PUT /admin/products/:id` accepts the same installment fields and `display_order` in multipart or JSON. Send `display_order: null` in JSON to remove a product from the manually ordered homepage group.

## Product Specifications

`description` and `specifications` are separate fields.

- Use `description` for rich marketing content: paragraphs, highlights, formatted copy, and product story content.
- Use `specifications` for structured technical rows. Do not ask admins to type one long specification paragraph.
- Do not hardcode sections like General, Display, Camera, or Battery. They are examples only; the admin creates section names dynamically.
- Existing products that only have `description` return `specifications: []`; the frontend should hide the specs tab/table when there are no rows.

Backend storage shape:

```ts
type ProductSpecificationSection = {
  section: string;
  items: Array<{
    key: string;
    value: string | number | boolean;
  }>;
};
```

Example admin state:

```ts
const specifications = [
  {
    section: "Display",
    items: [
      { key: "Size", value: "6.78-inch" },
      { key: "Resolution", value: "720 x 1576 pixels" },
      { key: "Type", value: "IPS LCD, 120Hz" }
    ]
  },
  {
    section: "Battery",
    items: [
      { key: "Capacity", value: "5200mAh" },
      { key: "Charging", value: "18W wired" }
    ]
  }
];
```

Admin dynamic-builder rule:

```tsx
form.append("specifications", JSON.stringify(specifications));
```

For JSON edits:

```ts
PUT /admin/products/:id
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "specifications": [
    {
      "section": "Performance",
      "items": [
        { "key": "Chipset", "value": "Mediatek Helio G81 Ultimate" },
        { "key": "CPU", "value": "Octa-core" }
      ]
    }
  ]
}
```

Validation rules:

- `specifications` must be an array.
- Each section must have a non-empty `section`.
- Each section must have `items` as an array.
- Empty item keys or empty values are ignored.
- Send `specifications: []` to clear product specs.

## Product Display Order

Homepage product order is admin-controlled when `display_order` is set.

Public homepage endpoint:

```ts
GET /products
```

Sort rule:

```sql
ORDER BY display_order ASC NULLS LAST, created_at DESC
```

Category endpoint:

```ts
GET /products/category/:category
```

Category pages intentionally stay newest first for now:

```sql
ORDER BY created_at DESC
```

Admin product table should show a `Display Order` column from `product.display_order`.

Manual number input:

```ts
PUT /admin/products/:id
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "display_order": 2
}
```

The backend inserts that product at the requested 1-based position and rewrites other active ordered products to prevent duplicate positions. Example: changing Bike from `5` to `2` moves Bike into position 2 and shifts the affected products down.

To clear the manual homepage position:

```ts
PUT /admin/products/:id
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "display_order": null
}
```

Drag-and-drop ordering:

```ts
PATCH /admin/products/display-order
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "product_ids": [
    "bike-product-id",
    "iphone-product-id",
    "laptop-product-id",
    "tv-product-id",
    "smart-watch-product-id"
  ]
}
```

This endpoint rewrites the homepage order exactly as sent: first ID becomes `display_order = 1`, second becomes `2`, and so on. Active products omitted from `product_ids` are cleared to `display_order = null`, so they appear after manually ordered products by newest first.

## Description Rendering

The backend stores `description` separately from specifications. If the admin uses a rich text editor, send the rich text value in `description` and sanitize before rendering on the frontend.

Plain textarea fallback:

```tsx
<textarea
  value={description}
  onChange={(event) => setDescription(event.target.value)}
/>
```

Do not call `.replace(/\s+/g, " ")`, `.trim().split(...)`, or any formatter that removes `\n`.

Product page rendering:

```tsx
<section className="product-description">
  {product.description}
</section>
```

```css
.product-description {
  white-space: pre-line;
  line-height: 1.65;
}
```

## Specifications Rendering

Render `product.specifications` in the product details modal/page as a clean table. Use section titles as subheadings and show each feature name on the left with its value on the right.

```tsx
const specificationSections = product.specifications ?? [];
const hasSpecifications = specificationSections.some(
  (section) => section.items?.length
);

return hasSpecifications ? (
  <section className="product-specifications">
    {specificationSections.map((section) => (
      <div className="spec-section" key={section.section}>
        <h3>{section.section}</h3>
        <div className="spec-grid">
          {section.items.map((item) => (
            <div className="spec-row" key={`${section.section}-${item.key}`}>
              <span className="spec-key">{item.key}</span>
              <span className="spec-value">{String(item.value)}</span>
            </div>
          ))}
        </div>
      </div>
    ))}
  </section>
) : null;
```

```css
.product-specifications {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px 32px;
}

.spec-section h3 {
  margin: 0;
  padding: 0 0 10px;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  border-bottom: 1px solid #e5e7eb;
}

.spec-row {
  display: grid;
  grid-template-columns: minmax(120px, 38%) minmax(0, 1fr);
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid #e5e7eb;
  line-height: 1.45;
}

.spec-key {
  color: #4b5563;
  text-align: left;
}

.spec-value {
  color: #111827;
  text-align: right;
}

@media (max-width: 768px) {
  .product-specifications {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .spec-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .spec-value {
    text-align: left;
  }
}
```

## Image Rendering

Use `image_urls` for the gallery order and `image_url` as the selected/primary thumbnail. Product images can have different sizes and aspect ratios, so the frontend must not stretch, crop, or force them to look like the same image frame.

Recommended product detail CSS:

```css
.product-image-stage {
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}

.product-image-stage img {
  max-width: 100%;
  max-height: 520px;
  width: auto;
  height: auto;
  object-fit: contain;
}
```

Recommended card/thumbnail CSS:

```css
.product-thumb {
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}

.product-thumb img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}
```

Avoid `object-fit: cover` for these product images unless the user explicitly wants cropped images.
