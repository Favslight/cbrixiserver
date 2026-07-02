# Product Variant Frontend Integration

Use this handoff when one product has multiple specs with different prices, for example `Redmi Note 13` with `4GB / 128GB` and `6GB / 128GB`.

The backend now supports one product with many `variants`. The frontend should not upload duplicate products just because the RAM, ROM, color, or storage price is different.

## Backend Rule

- `products` stores the shared product data: name, description, category, images, installment settings, and discount settings.
- `product_variants` stores selectable specs: variant name/specs, price, stock, SKU, active state, and display order.
- Discount is product-level, but the backend calculates discount fields per variant using each variant price.
- Installment is product-level, but first deposit/monthly schedule must be calculated from the selected variant `effective_price`.

Existing products are migrated with one `Default` variant, so old product cards and older cart calls still work.

## Admin Product Shape

`GET /admin/products` returns each product with `variants`:

```ts
type ProductVariant = {
  id: string;
  product_id: string;
  name: string; // example "4GB RAM / 128GB ROM"
  specs: Record<string, string | number | boolean>;
  sku?: string | null;
  price: string | number; // variant base price
  discount_enabled: boolean;
  discount_percentage: string | number;
  discount_amount: string | number; // calculated from this variant price
  discounted_price: string | number; // calculated from this variant price
  effective_price: string | number; // price frontend should display/buy with
  stock: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
};

type AdminProduct = {
  id: string;
  name: string;
  price: string | number; // lowest active variant price when variants exist
  effective_price: string | number; // lowest active variant effective price
  has_variants: boolean;
  default_variant_id?: string | null;
  variant_price_min?: string | number;
  variant_price_max?: string | number;
  variants: ProductVariant[];
};
```

## Admin Create Product

Send variants as a JSON string in the same multipart product upload request:

```ts
POST /admin/products
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data
```

```ts
const variants = [
  {
    name: "4GB RAM / 128GB ROM",
    specs: { ram: "4GB", rom: "128GB" },
    price: 120000,
    stock: 10,
    sku: "REDMI-4-128"
  },
  {
    name: "6GB RAM / 128GB ROM",
    specs: { ram: "6GB", rom: "128GB" },
    price: 145000,
    stock: 7,
    sku: "REDMI-6-128"
  }
];

const form = new FormData();
form.append("name", name);
form.append("description", description);
form.append("category", category);
form.append("variants", JSON.stringify(variants));

form.append("installment_enabled", String(installmentEnabled));
if (installmentEnabled) {
  form.append("minimum_deposit_percentage", String(minimumDepositPercentage));
  form.append("installment_duration_months", String(installmentDurationMonths));
}

form.append("discount_enabled", String(discountEnabled));
if (discountEnabled) {
  form.append("discount_percentage", String(discountPercentage));
}

form.append("thumbnail_index", String(thumbnailIndex));
orderedFiles.forEach((file) => form.append("images", file));
```

If `price` and `stock` are omitted, the backend derives product-level display values from the active variants.

## Admin Edit Variants

`PUT /admin/products/:id` accepts `variants` in multipart or JSON.

For edits, send the full active variant list the admin wants to keep:

```ts
{
  "variants": [
    {
      "id": "existing-variant-id",
      "name": "4GB RAM / 128GB ROM",
      "specs": { "ram": "4GB", "rom": "128GB" },
      "price": 120000,
      "stock": 10,
      "sku": "REDMI-4-128"
    },
    {
      "name": "8GB RAM / 256GB ROM",
      "specs": { "ram": "8GB", "rom": "256GB" },
      "price": 180000,
      "stock": 4,
      "sku": "REDMI-8-256"
    }
  ]
}
```

Rules:

- Existing variant with `id` is updated.
- Variant without `id` is created.
- Existing variants omitted from the submitted list are deactivated, not hard deleted.
- At least one active variant is required.
- The first active variant becomes the default.

## Public Product Page

`GET /products` and `GET /products/category/:category` include `variants`.

Render the product page from one product, then let the user choose a variant:

```tsx
const [selectedVariantId, setSelectedVariantId] = useState(
  product.default_variant_id ?? product.variants?.[0]?.id
);

const selectedVariant =
  product.variants.find((variant) => variant.id === selectedVariantId)
  ?? product.variants[0];

const displayPrice = selectedVariant?.effective_price ?? product.effective_price;
const displayStock = selectedVariant?.stock ?? product.stock;
```

When the variant changes:

- update displayed price from `selectedVariant.effective_price`;
- update original/discount price from selected variant discount fields;
- update stock availability from `selectedVariant.stock`;
- update installment first payment from selected variant price.

## Add To Cart

New frontend should send both IDs:

```ts
POST /cart/add
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "product_id": product.id,
  "variant_id": selectedVariant.id,
  "quantity": 1
}
```

Older clients that send only `product_id` still work because the backend uses the product default variant.

`GET /cart` returns:

```ts
type CartItem = {
  cart_item_id: string;
  product_id: string;
  variant_id: string;
  name: string;
  variant_name: string;
  variant_specs: Record<string, string | number | boolean>;
  variant_sku?: string | null;
  price: string | number;
  discounted_price: string | number;
  effective_price: string | number;
  stock: number;
  installment_enabled: boolean;
  minimum_deposit_percentage?: string | number | null;
  installment_duration_months?: string | number | null;
};
```

## Checkout And Orders

Frontend should not send variant prices during checkout. The backend calculates totals from cart items and the selected variant.

Order items now include:

```ts
variant_id?: string | null;
variant_name?: string | null;
variant_specs?: Record<string, unknown>;
price_at_purchase: string | number;
```

Use `price_at_purchase` and the snapshot fields for order history. Do not replace old order history text with a newly edited variant name.

## Installment And Discount

For selected variants:

```ts
const price = Number(selectedVariant.effective_price);
const depositPercent = Number(product.minimum_deposit_percentage);
const firstPayment = product.installment_enabled
  ? Math.round((price * depositPercent) / 100)
  : null;
```

Do not calculate discount from the parent product price when a variant is selected. Use the selected variant fields:

- `selectedVariant.price`
- `selectedVariant.discount_amount`
- `selectedVariant.discounted_price`
- `selectedVariant.effective_price`
