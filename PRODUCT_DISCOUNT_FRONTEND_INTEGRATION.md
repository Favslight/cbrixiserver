# Product Discount Frontend Integration

Use this handoff for admin product creation/editing and public product cards when a product has a temporary discount.

Backend rule: discount only applies when `discount_enabled === true`. If discount is inactive, the frontend should treat `price` as the selling price and ignore discount display.

## Product Price Shape

Admin, public, cart, order, and partner product payloads now include these fields:

```ts
type ProductDiscountFields = {
  price: string | number; // original normal price
  discount_enabled: boolean;
  discount_percentage: string | number; // for example 15
  discount_amount: string | number; // savings amount, for example 15000
  discounted_price: string | number; // final sale price, for example 85000
  effective_price: string | number; // backend selling price used for checkout
};
```

Display rule:

- If `discount_enabled === true`, show `discounted_price` as the main price.
- Show `price` beside it with a strikethrough.
- Show a percentage badge using `discount_percentage`, for example `15% OFF`.
- Do not show discount UI when `discount_enabled === false`.
- Use `effective_price` for cart totals if the frontend calculates a display total. Checkout itself is calculated by the backend.

## Preview Discount Before Create

Call this endpoint after admin enters product price, activates discount, or changes discount percentage.

```ts
POST /admin/products/discount-preview
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "price": 100000,
  "discount_enabled": true,
  "discount_percentage": 15
}
```

Response:

```ts
{
  "success": true,
  "discount": {
    "price": 100000,
    "discount_enabled": true,
    "discount_percentage": 15,
    "discount_amount": 15000,
    "discounted_price": 85000,
    "effective_price": 85000
  }
}
```

Inactive discount preview:

```ts
{
  "price": 100000,
  "discount_enabled": false
}
```

Returns `discount_amount: 0`, `discounted_price: 100000`, and `effective_price: 100000`.

Validation:

- `price` is required for preview.
- When `discount_enabled` is true, `discount_percentage` must be greater than `0` and less than or equal to `100`.

## Create Product

```ts
POST /admin/products
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data
```

Add these fields to the existing product form:

```ts
discount_enabled: "true" | "false";
discount_percentage?: string; // required when discount_enabled is "true"
```

Example:

```ts
const form = new FormData();
form.append("name", name);
form.append("price", String(price));
form.append("discount_enabled", String(discountEnabled));

if (discountEnabled) {
  form.append("discount_percentage", String(discountPercentage));
}

for (const file of orderedFiles) {
  form.append("images", file);
}
```

Create response returns the product with calculated discount fields.

## Edit Product

Both multipart and JSON update support:

```ts
PUT /admin/products/:id
Authorization: Bearer <admin-token>
```

Send either snake_case or camelCase:

```ts
{
  "price": 100000,
  "discount_enabled": true,
  "discount_percentage": 15
}
```

To remove the discount:

```ts
{
  "discount_enabled": false
}
```

The backend resets the active sale price to the normal `price` when discount is disabled.

## Public Product Card Rule

```ts
const hasDiscount =
  product.discount_enabled && Number(product.discount_percentage) > 0;

const mainPrice = hasDiscount ? product.discounted_price : product.price;
const originalPrice = product.price;
```

Recommended UI:

```tsx
<div>
  <strong>{formatMoney(mainPrice)}</strong>
  {hasDiscount && (
    <>
      <span style={{ textDecoration: "line-through" }}>
        {formatMoney(originalPrice)}
      </span>
      <span>{Number(product.discount_percentage)}% OFF</span>
    </>
  )}
</div>
```

## Checkout And Cart

The backend now uses `effective_price` for checkout totals, first deposit math, and `price_at_purchase`.

Frontend rule:

- Do not send discount calculations during checkout.
- Render the returned cart/product fields.
- If showing a cart subtotal before checkout, multiply `effective_price * quantity`.
