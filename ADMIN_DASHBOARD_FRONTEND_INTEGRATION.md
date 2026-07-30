# Admin Dashboard Frontend Integration

Use this handoff for admin dashboard screens that list users, orders, and payments.

The backend now returns readable order/product details for admin endpoints. The frontend should stop showing only `order_id` as the primary tracking detail. Use the new `order_summary`, `product_names`, `variant_names`, and `order_items` fields to show exactly what the user ordered.

All endpoints below require:

```http
Authorization: Bearer <admin-token>
```

## Admin Users

```ts
GET /admin/users/details?limit=50&offset=0
```

Response:

```ts
type AdminUsersResponse = {
  success: true;
  pagination: {
    limit: number;
    offset: number;
    page: number;
    total: number;
    has_more: boolean;
  };
  users: AdminUser[];
};

type AdminUser = {
  id: string;
  firstname?: string | null;
  lastname?: string | null;
  username?: string | null;
  email: string;
  status?: string | null;
  created_at: string;
  referral_code?: string | null;
  referred_by_user_id?: string | null;
  referral_count: number;
  referral_balance: number;
  available_referral_balance: number;
  pending_referral_payout_balance: number;
  paid_out_referral_balance: number;

  // New display aliases for dashboard tables
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  name?: string | null;

  cbrilliance_email?: string | null;
  cbrilliance_email_verified: boolean;
  cbrilliance_email_verified_at?: string | null;

  orders: AdminOrder[];
};
```

Pagination behavior:

- Default page size is 50 users.
- The backend caps `limit` at 50, even if a larger value is requested.
- Use either `offset` or `page`.
- First page examples: `GET /admin/users/details?limit=50&offset=0` or `GET /admin/users/details?page=1`.
- Next offset: `pagination.offset + pagination.limit`.
- Stop loading more pages when `pagination.has_more === false`.

Referral balance fields:

- `referral_balance` and `available_referral_balance` are the withdrawable referral balance.
- `pending_referral_payout_balance` is referral money currently requested for payout.
- `paid_out_referral_balance` is referral money already paid.
- `referral_count` is the number of users referred by this user.

Frontend user-name rule:

```ts
const userDisplayName =
  user.full_name
  || user.name
  || [user.firstname, user.lastname].filter(Boolean).join(" ")
  || user.username
  || user.email;
```

Use `name` or `full_name` in the admin users table so users no longer appear nameless.

Recommended user table columns:

- Customer: `full_name || name || email`
- Email: `email`
- Referral code: `referral_code`
- Referrals: `referral_count`
- Referral balance: `referral_balance`
- Pending payout: `pending_referral_payout_balance`
- Paid out: `paid_out_referral_balance`
- Status: `status`
- Date joined: `created_at`

## Admin Orders

```ts
GET /admin/orders/pending
GET /admin/orders/approved
GET /admin/orders/rejected
```

These endpoints now return orders with detailed item data:

```ts
type AdminOrder = {
  id: string;
  user_id: string;
  total_amount: string | number;
  deposit_amount?: string | number | null;
  remaining_balance: string | number;
  paid_amount?: string | number;
  payment_mode: "FULL" | "INSTALLMENT";
  status: string;
  external_email?: string | null;
  created_at: string;
  updated_at?: string;

  firstname?: string | null;
  lastname?: string | null;
  email?: string;
  user_email?: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  name?: string | null;

  // New admin tracking fields
  item_count: number;
  total_quantity: number;
  product_names: string[];
  variant_names: string[];
  products_summary: string[];
  order_summary: string;
  order_items: AdminOrderItem[];

  verified_user_id?: string | null;
  verified_firstname?: string | null;
  verified_lastname?: string | null;
  verified_email?: string | null;
  external_email_exists?: boolean;
};
```

Recommended order table columns:

- Customer: `full_name || name || user_email || email`
- Order: `order_summary`
- Products: `product_names.join(", ")`
- Variants: `variant_names.join(", ") || "Default"`
- Quantity: `total_quantity`
- Amount: `total_amount`
- Paid: `paid_amount`
- Balance: `remaining_balance`
- Payment mode: `payment_mode`
- Status: `status`
- Date: `created_at`

Do not use only `id` or `order_id` as the visible order description. Keep the ID available for copying, searching, and API actions, but show `order_summary` as the human-readable tracking label.

## Admin Order Items

`order_items` is returned inside admin users, admin orders, and admin payments.

```ts
type AdminOrderItem = {
  id: string;
  order_item_id: string;
  order_id: string;
  product_id?: string | null;
  variant_id?: string | null;
  quantity: number;
  price_at_purchase: string | number;
  unit_price: string | number;
  effective_price: string | number;
  line_total: string | number;

  // Snapshot-first display fields
  name: string;
  product_name: string;
  product_name_snapshot?: string | null;
  product_description?: string | null;
  product_category?: string | null;

  variant_name?: string | null;
  variant_specs?: Record<string, unknown>;
  variant_name_snapshot?: string | null;
  variant_specs_snapshot?: Record<string, unknown>;
  variant_sku?: string | null;

  discount_enabled: boolean;
  discount_percentage: string | number;
  discount_amount: string | number;

  image_url?: string | null;
  image_urls?: string[];

  installment_enabled?: boolean;
  installment_duration_months?: string | number | null;
  minimum_deposit_percentage?: string | number | null;
};
```

Display item rows from snapshots:

```ts
const productName = item.product_name || item.name || "Unknown product";
const variantName =
  item.variant_name && item.variant_name.toLowerCase() !== "default"
    ? item.variant_name
    : null;
const itemLabel = variantName
  ? `${productName} - ${variantName}`
  : productName;
```

Use `line_total` for line totals and `price_at_purchase` or `unit_price` for the unit price. Do not recalculate historical order rows from the current product price, because product/variant prices may have changed after checkout.

## Admin Payments

```ts
GET /admin/payments/pending
GET /admin/payments/approved
GET /admin/payments/rejected
```

Payment rows now include order/product details at the top level and inside an `order` object.

```ts
type AdminPayment = {
  id: string;
  order_id: string;
  installment_id?: string | null;
  user_id: string;
  amount: string | number;
  payment_method: string;
  reference?: string | null;
  status: "PENDING" | "SUCCESS" | "FAILED";
  created_at: string;

  firstname?: string | null;
  lastname?: string | null;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  name?: string | null;

  payment_mode: "FULL" | "INSTALLMENT";
  total_amount: string | number;
  deposit_amount?: string | number | null;
  paid_amount: string | number;
  remaining_balance: string | number;
  order_status: string;
  external_email?: string | null;

  installment_number?: number | null;
  installment_due_date?: string | null;
  installment_status?: string | null;
  payment_type: "ORDER_PAYMENT" | "INSTALLMENT_DEPOSIT" | "INSTALLMENT_PAYMENT";
  payment_label: string;

  // New admin tracking fields
  item_count: number;
  total_quantity: number;
  product_names: string[];
  variant_names: string[];
  products_summary: string[];
  order_summary: string;
  order_items: AdminOrderItem[];

  order: {
    id: string;
    user_id: string;
    payment_mode: "FULL" | "INSTALLMENT";
    total_amount: string | number;
    deposit_amount?: string | number | null;
    paid_amount: string | number;
    remaining_balance: string | number;
    status: string;
    external_email?: string | null;
    item_count: number;
    total_quantity: number;
    product_names: string[];
    variant_names: string[];
    products_summary: string[];
    order_summary: string;
    order_items: AdminOrderItem[];
  };
};
```

Recommended payment table columns:

- Customer: `full_name || name || email`
- Payment: `payment_label`
- Order: `order_summary`
- Products: `product_names.join(", ")`
- Variants: `variant_names.join(", ") || "Default"`
- Amount paid/requested: `amount`
- Total order: `total_amount`
- Balance: `remaining_balance`
- Method: `payment_method`
- Reference: `reference`
- Status: `status`
- Date: `created_at`

For payment detail modals, render `payment.order.order_items` so admin can confirm exactly which product and variant the payment belongs to before approving or rejecting bank transfer payments.

## Approve And Reject Actions

These action endpoints are unchanged:

```ts
POST /admin/orders/:id/approve
POST /admin/orders/:id/reject
POST /admin/payments/:id/approve
POST /admin/payments/:id/reject
```

Use the same IDs returned by the list endpoints:

- Order actions use `order.id`.
- Payment actions use `payment.id`.

## Delete Actions

Admins can permanently delete approved/rejected payments and any order from the dashboard.

```ts
DELETE /admin/payments/:id
Authorization: Bearer <admin-token>
```

Deletes the payment transaction from the database.

- Use `payment.id` from approved or rejected payment lists.
- Also works for pending payments if needed.
- Related referral rewards for that payment are removed.
- If the payment was `SUCCESS`, the linked order `remaining_balance` and status are recalculated.

Response:

```json
{
  "success": true,
  "deleted_id": "payment-uuid",
  "order_id": "order-uuid"
}
```

```ts
DELETE /admin/orders/:id
Authorization: Bearer <admin-token>
```

Deletes the order and related records from the database:

- order items
- installments
- payment transactions for that order
- referral rewards for that order
- email logs / default events for that order

Use `order.id` from pending, approved, or rejected order lists.

Response:

```json
{
  "success": true,
  "deleted_id": "order-uuid"
}
```

Frontend notes:

- Show a confirmation dialog before calling delete.
- After success, remove the row from the current table state.
- Refresh the list if needed: `GET /admin/payments/approved`, `GET /admin/payments/rejected`, `GET /admin/orders/approved`, or `GET /admin/orders/rejected`.

Example:

```ts
await fetch(`${API_URL}/admin/payments/${payment.id}`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${adminToken}` }
});

await fetch(`${API_URL}/admin/orders/${order.id}`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${adminToken}` }
});
```

## UI Behavior Checklist

- Show customer `full_name` or `name` in the users, orders, and payments tables.
- Show `order_summary` anywhere the UI currently only shows `order_id`.
- Keep `order_id` visible only as a secondary copyable identifier.
- Show variants from `variant_names` or each `order_item.variant_name`.
- In detail drawers/modals, render all `order_items` with product name, variant, quantity, unit price, and line total.
- Use snapshot fields for historical order display. Do not replace old order item names with newly edited product names unless snapshot fields are empty.
- For payment approvals, show `payment_label`, `order_summary`, `reference`, `amount`, `payment_method`, and the full `order_items` list before the admin confirms.
- Add Delete actions on approved/rejected payments and on order lists using `DELETE /admin/payments/:id` and `DELETE /admin/orders/:id`.
- Confirm before delete, then remove the row from the UI after a successful response.
