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
  category?: string | null;
  price: string | number;
  discount_enabled: boolean;
  discount_percentage: string | number;
  discount_amount: string | number;
  discounted_price: string | number;
  effective_price: string | number;
  image_url?: string | null; // selected thumbnail / primary image
  image_urls: string[]; // ordered gallery images
  stock: number;
  installment_enabled: boolean;
  minimum_deposit_percentage?: string | number | null;
  installment_duration_months?: string | number | null;
  fine_percentage_on_default?: string | number | null;
  minimum_wallet_balance_required?: string | number | null;
  grace_period_days?: string | number | null;
  has_variants: boolean;
  default_variant_id?: string | null;
  variant_price_min?: string | number;
  variant_price_max?: string | number;
  variants: ProductVariant[];
};

type ProductVariant = {
  id: string;
  name: string;
  specs: Record<string, string | number | boolean>;
  price: string | number;
  discount_amount: string | number;
  discounted_price: string | number;
  effective_price: string | number;
  stock: number;
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
form.append("stock", String(stock));
form.append("category", category);
form.append("description", description); // raw textarea value, newlines preserved
form.append("variants", JSON.stringify(variants)); // see PRODUCT_VARIANT_FRONTEND_INTEGRATION.md

form.append("installment_enabled", String(installmentEnabled));
if (installmentEnabled) {
  form.append("minimum_deposit_percentage", String(minimumDepositPercentage));
  form.append("installment_duration_months", String(installmentDurationMonths));
  form.append("fine_percentage_on_default", String(finePercentageOnDefault ?? 0));
  form.append("minimum_wallet_balance_required", String(minimumWalletBalanceRequired ?? 0));
  form.append("grace_period_days", String(gracePeriodDays ?? 0));
}

form.append("thumbnail_index", String(thumbnailIndex));
orderedFiles.forEach((file) => form.append("images", file));
```

For edits, `PUT /admin/products/:id` accepts the same installment fields in multipart or JSON.

## Description Formatting

The backend stores `description` as text and preserves newline characters. The frontend should not collapse the text into one continuous sentence.

Admin textarea rule:

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

If the design needs the photo-style feature rows, ask admin to enter one feature per line, then render each non-empty line separately:

```tsx
const featureLines = (product.description ?? "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

return featureLines.map((line) => (
  <div className="feature-row" key={line}>{line}</div>
));
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
