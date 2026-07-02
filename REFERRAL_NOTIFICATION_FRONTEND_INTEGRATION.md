# Referral And Notification Frontend Integration

Use this file for the signup referral field, customer referral dashboard, admin referral settings/payout dashboard, and in-app notifications.

## Signup Referral Field

Referral input is optional.

```ts
POST /user/signup
Content-Type: application/json

{
  "firstname": "Ada",
  "lastname": "Okafor",
  "username": "ada",
  "email": "ada@example.com",
  "password": "password123",
  "referral_code": "JOHNABC123"
}
```

Accepted referral field names:

- `referral_code`
- `referralCode`
- `ref`

If the user opens a link like:

```txt
https://cbrixi.com/signup?ref=JOHNABC123
```

the frontend should route to the signup page and auto-fill the referral input with `JOHNABC123`.

## User Referral Dashboard

```ts
GET /referrals/me
Authorization: Bearer <user-token>
```

Response:

```ts
{
  "success": true,
  "referral": {
    "settings": {
      "is_enabled": true,
      "bonus_percentage": "5.00"
    },
    "referral_code": "ADA123ABC",
    "referral_link": "https://cbrixi.com/signup?ref=ADA123ABC",
    "referral_count": 3,
    "stats": {
      "total_referred": 3,
      "total_earned": 7500,
      "available_balance": 5000,
      "pending_payout_balance": 2500,
      "paid_out_balance": 0
    },
    "referred_users": [],
    "rewards": [],
    "payout_requests": []
  }
}
```

Frontend display:

- Show `referral_code`.
- Show `referral_link` with copy/share buttons.
- Show balances from `stats`.
- Show referred users from `referred_users`.
- Show earned reward history from `rewards`.
- Show payout history from `payout_requests`.

Reward rule:

- Backend creates rewards only after a payment is confirmed successful.
- If a product discount is active, rewards are based on the discounted/effective amount because checkout/payment uses `effective_price`.
- For installment orders, rewards are earned as each successful deposit/installment payment is approved or verified.

## Request Referral Payout

```ts
POST /referrals/payout
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "account_name": "Ada Okafor",
  "account_number": "0123456789",
  "bank_name": "Access Bank"
}
```

Response:

```ts
{
  "success": true,
  "payout": {
    "id": "uuid",
    "amount": "5000.00",
    "status": "PENDING",
    "account_name": "Ada Okafor",
    "account_number": "0123456789",
    "bank_name": "Access Bank"
  }
}
```

Frontend behavior:

- Disable payout button when `available_balance <= 0`.
- Show pending state after submit.
- Backend emails the user and creates admin/user notifications.

## Admin Referral Settings

```ts
GET /admin/referrals/settings
Authorization: Bearer <admin-token>
```

```ts
PATCH /admin/referrals/settings
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "is_enabled": true,
  "bonus_percentage": 5
}
```

Rules:

- `bonus_percentage` can be `0`.
- Backend only creates rewards when `is_enabled === true` and `bonus_percentage > 0`.
- Use a toggle for `is_enabled` and numeric input for `bonus_percentage`.

## Admin Payout Dashboard

```ts
GET /admin/referrals/payouts?status=PENDING
Authorization: Bearer <admin-token>
```

Status filter is optional. Supported values:

- `PENDING`
- `APPROVED`

Approve after admin has sent the money:

```ts
POST /admin/referrals/payouts/:id/approve
Authorization: Bearer <admin-token>
```

The backend marks the payout as `APPROVED`, marks included rewards as `PAID`, emails the user, and creates a user notification.

Admin can also inspect reward rows:

```ts
GET /admin/referrals/rewards
Authorization: Bearer <admin-token>
```

## Notifications

User notifications:

```ts
GET /notifications?status=all|read|unread
GET /notifications/unread-count
PATCH /notifications/:id/read
PATCH /notifications/read-all
DELETE /notifications/:id
Authorization: Bearer <user-token>
```

Admin notifications:

```ts
GET /admin/notifications?status=all|read|unread
GET /admin/notifications/unread-count
PATCH /admin/notifications/:id/read
PATCH /admin/notifications/read-all
DELETE /admin/notifications/:id
Authorization: Bearer <admin-token>
```

Notification shape:

```ts
type Notification = {
  id: string;
  target_type: "USER" | "ADMIN";
  user_id: string | null;
  title: string;
  message: string;
  type: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};
```

UI rules:

- Use unread count for dashboard badge.
- Soft-delete notifications after successful `DELETE`.
- Do not remove a notification from the UI until the delete call succeeds.
