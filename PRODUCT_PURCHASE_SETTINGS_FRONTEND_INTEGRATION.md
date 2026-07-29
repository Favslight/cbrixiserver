# Product Purchase Settings Frontend Integration

Use this handoff for the new admin controls that bulk-update product deposit percentage, turn discounts off globally, and toggle product stock availability.

All admin endpoints require:

```http
Authorization: Bearer <admin-token>
```

Public product, cart, and checkout routes automatically reflect these changes because they read the same product fields.

## Bulk Update Deposit And Discount Settings

Use this endpoint when admin wants to change the installment deposit percentage for all uploaded products, or turn product discounts off without editing products one by one.

```http
PATCH /admin/products/purchase-settings
Content-Type: application/json
Authorization: Bearer <admin-token>
```

Request supports snake_case or camelCase:

```ts
type BulkProductPurchaseSettingsRequest = {
  minimum_deposit_percentage?: number; // integer from 0 to 100
  minimumDepositPercentage?: number;
  discount_enabled?: boolean;
  discountEnabled?: boolean;
  discount_percentage?: number; // only required when enabling discount
  discountPercentage?: number;
};
```

Turn off discounts for every product:

```json
{
  "discount_enabled": false
}
```

Change all products to a 30% deposit:

```json
{
  "minimum_deposit_percentage": 30
}
```

Do both in one request:

```json
{
  "minimum_deposit_percentage": 30,
  "discount_enabled": false
}
```

Response:

```ts
type BulkProductPurchaseSettingsResponse = {
  success: true;
  updated_count: number;
  products: Product[];
};
```

Example:

```json
{
  "success": true,
  "updated_count": 12,
  "products": [
    {
      "id": "product-uuid",
      "name": "Product name",
      "price": "100000.00",
      "discount_enabled": false,
      "discount_percentage": "0.00",
      "discount_amount": "0.00",
      "discounted_price": "100000.00",
      "effective_price": "100000.00",
      "installment_enabled": true,
      "minimum_deposit_percentage": 30,
      "installment_duration_months": 6,
      "is_active": true,
      "variants": []
    }
  ]
}
```

Frontend behavior:

- After success, refresh admin product data or replace local products with `response.products`.
- For user product pages/cards, no new request is needed beyond the normal product refresh. `GET /products` and `GET /products/category/:category` will return the updated deposit and discount values.
- If `discount_enabled === false`, hide discount badges, strikethrough prices, and sale UI.
- If showing installment messaging, use `minimum_deposit_percentage` from the returned product.

Validation errors:

```json
{ "message": "No update fields provided" }
{ "message": "minimum_deposit_percentage must be an integer between 0 and 100" }
{ "message": "discount_enabled must be true or false" }
{ "message": "discount_percentage must be greater than 0 and less than or equal to 100 when discount is active" }
```

## Mark Product Out Of Stock

Use this endpoint when admin wants to stop a product from being sold immediately.

```http
PATCH /admin/products/:id/out-of-stock
Authorization: Bearer <admin-token>
```

Response:

```ts
type MarkProductOutOfStockResponse = {
  success: true;
  product: Product;
};
```

Example:

```json
{
  "success": true,
  "product": {
    "id": "product-uuid",
    "name": "Product name",
    "is_active": true,
    "in_stock": false,
    "variants": []
  }
}
```

Backend behavior:

- Sets `products.in_stock = false`.
- Keeps `products.is_active = true`, so this does not delete/archive the product.
- Keeps product images, variants, price, category, and admin product data intact.
- Removes the product from public `GET /products` and `GET /products/category/:category`.
- Prevents adding that product or its variants to cart.
- Prevents checkout if the user already had that product in cart before it was marked out of stock.

Frontend behavior:

- In admin product lists, show the product as `Out of stock` using `in_stock === false`.
- On success, refresh admin product data or update the changed product locally.
- On public product pages, refresh product data after admin changes; out-of-stock products will no longer appear in public listings.
- Disable buy/add-to-cart buttons if a product object is ever rendered with `in_stock === false`.

## Put Product Back In Stock

Use this endpoint when admin wants to make an out-of-stock product purchasable again.

```http
PATCH /admin/products/:id/in-stock
Authorization: Bearer <admin-token>
```

Response:

```ts
type MarkProductInStockResponse = {
  success: true;
  product: Product;
};
```

Example:

```json
{
  "success": true,
  "product": {
    "id": "product-uuid",
    "name": "Product name",
    "is_active": true,
    "in_stock": true
  }
}
```

Frontend behavior:

- Replace the admin product row with the returned `product`, or refresh the admin product list.
- Once `in_stock === true`, the product can appear again in public product listings.
- Re-enable buy/add-to-cart controls when rendering a product with `in_stock === true`.

Not found response:

```json
{ "message": "Product not found" }
```

## Checkout Error For Old Cart Items

If a user had a product in cart before admin marked it out of stock, checkout now fails instead of allowing payment.

Checkout response:

```json
{
  "success": false,
  "message": "One or more products in your cart are no longer available"
}
```

Recommended UI:

- Show a toast or inline checkout error with the backend message.
- Refresh the cart after this error.
- If the refreshed cart no longer contains the unavailable item, update totals and ask the user to review cart before paying.

## Affected Existing Product Fields

These fields already exist in product responses and should drive UI:

```ts
type ProductPurchaseFields = {
  is_active: boolean;
  in_stock: boolean;
  discount_enabled: boolean;
  discount_percentage: string | number;
  discount_amount: string | number;
  discounted_price: string | number;
  effective_price: string | number;
  installment_enabled: boolean;
  minimum_deposit_percentage: string | number;
  installment_duration_months?: string | number | null;
};
```

Price display rule remains:

```ts
const hasDiscount =
  product.discount_enabled && Number(product.discount_percentage) > 0;

const displayPrice = hasDiscount
  ? product.discounted_price
  : product.price;
```

Installment deposit display:

```ts
const depositPercentage = Number(product.minimum_deposit_percentage ?? 50);
const depositAmount =
  (Number(product.effective_price ?? product.price) * depositPercentage) / 100;
```
