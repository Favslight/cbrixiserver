# CBRIXI Backend Updates — Frontend Integration Handoff

This document covers five backend changes ready for frontend integration:

1. Referral dashboard pagination and invited friends list
2. Contact support real-time chat (Socket.IO floating widget)
3. Installment checkout remaining amount fix
4. Staff notification emails for orders and payments
5. Cart clearing after checkout

Base API URL examples:

- Local: `http://localhost:<PORT>`
- Production: `https://api.cbrixi.com`

All authenticated user routes use:

```txt
Authorization: Bearer <user-token>
```

All admin routes use the existing admin auth header/cookie pattern.

---

## 1. Referral Dashboard

### Endpoint

```http
GET /referrals/me?limit=20&offset=0
Authorization: Bearer <user-token>
```

### Query params

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `limit` | `20` | `100` | Number of invited friends per page |
| `offset` | `0` | — | Number of records to skip |

### Response

```json
{
  "success": true,
  "referral": {
    "settings": {
      "is_enabled": true,
      "bonus_percentage": "5.00"
    },
    "referral_code": "ADA123ABC",
    "referral_link": "https://cbrixi.com/signup?ref=ADA123ABC",
    "referral_count": 12,
    "stats": {
      "total_referred": 12,
      "total_earned": 7500,
      "available_balance": 5000,
      "pending_payout_balance": 2500,
      "paid_out_balance": 0
    },
    "referred_users": [
      {
        "id": "uuid",
        "firstname": "John",
        "lastname": "Doe",
        "name": "John Doe",
        "email": "john@example.com",
        "created_at": "2026-07-01T10:00:00.000Z",
        "total_purchase_amount": 10000,
        "total_reward_amount": 500,
        "available_reward_amount": 500,
        "reward_count": 2
      }
    ],
    "referred_users_pagination": {
      "limit": 20,
      "offset": 0,
      "total": 12,
      "has_more": false
    },
    "rewards": [],
    "payout_requests": []
  }
}
```

### Frontend notes

- Use `referral_count` and `stats.total_referred` for the total invited count.
- Render invited friends from `referred_users` using `name` and `email`.
- Paginate with `limit` + `offset`. Load more when `referred_users_pagination.has_more` is `true`.
- Example next page: `GET /referrals/me?limit=20&offset=20`

---

## 2. Contact Support (Floating Widget)

Real-time support chat uses **Socket.IO** plus REST fallbacks for history.

### Socket connection

```ts
import { io } from "socket.io-client";

const socket = io("https://api.cbrixi.com", {
  path: "/socket.io",
  auth: {
    token: userAccessToken,
    role: "user" // use "admin" on admin dashboard
  },
  transports: ["polling", "websocket"],
  reconnection: true,
  reconnectionAttempts: 5
});
```

If WebSocket fails on your host/proxy, the client should still connect through polling. You can also send messages through REST without Socket.IO.

### Socket events

| Event | Direction | Payload |
|-------|-----------|---------|
| `support:conversation` | server → client | `{ conversation_id }` on connect (user only) |
| `support:join` | client → server | `{ conversation_id? }` with optional ack callback |
| `support:send` | client → server | `{ conversation_id?, message }` with ack callback |
| `support:message` | server → client | `{ conversation_id, message }` |
| `support:conversation:updated` | server → admin inbox | `{ conversation_id, last_message, last_message_at, unread_count }` |

### Send message example

```ts
socket.emit(
  "support:send",
  { message: "I need help with my installment order" },
  (response) => {
    if (!response.success) {
      console.error(response.message);
    }
  }
);

socket.on("support:message", ({ conversation_id, message }) => {
  // append message to chat UI
});
```

### REST endpoints

#### User

```http
GET /support/conversation
Authorization: Bearer <user-token>
```

Returns the user's open conversation (creates one if none exists).

```http
GET /support/conversation/messages?limit=30&offset=0
Authorization: Bearer <user-token>
```

Returns paginated message history for the user's conversation.

```http
POST /support/conversation/messages
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "message": "I need help with my installment order"
}
```

REST fallback for sending a message when Socket.IO is unavailable.

#### Admin

```http
GET /admin/support/conversations?limit=20&offset=0
```

Lists all support conversations with unread counts.

```http
GET /admin/support/conversations/:id/messages?limit=30&offset=0
```

Returns conversation details and messages. Marks user messages as read.

```http
POST /admin/support/conversations/:id/messages
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "message": "Thanks for reaching out, we are reviewing your order."
}
```

REST fallback for admin replies when Socket.IO is unavailable.

### Message shape

```json
{
  "id": "uuid",
  "conversation_id": "uuid",
  "sender_type": "USER",
  "sender_id": "uuid",
  "message": "Hello, I need help",
  "read_at": null,
  "created_at": "2026-07-13T13:00:00.000Z"
}
```

### Floating widget UX

Recommended user flow:

1. Show a floating chat button on all authenticated pages.
2. On open, call `GET /support/conversation/messages` to load history.
3. Connect socket with user token.
4. Send new messages through `support:send`.
5. Listen for `support:message` for admin replies in real time.
6. Show unread badge if the latest message is from `ADMIN` and widget is closed.

Recommended admin flow:

1. Connect socket with `role: "admin"`.
2. Poll or listen to `support:conversation:updated` for inbox updates.
3. Open a conversation, emit `support:join` with `conversation_id`.
4. Reply with `support:send`.

---

## 3. Installment Checkout Remaining Amount Fix

### Bug fixed

For installment orders, `remaining_balance` was incorrectly set to the full total. It now equals:

```txt
remaining_amount = total_amount - deposit_amount
```

Example:

- Total: ₦144,000
- Required deposit: ₦72,000
- Remaining: ₦72,000

### Checkout endpoint

```http
POST /order/checkout
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "payment_mode": "INSTALLMENT",
  "external_email": "user@cbrilliance.io"
}
```

### Updated response

```json
{
  "success": true,
  "order": {
    "id": "uuid",
    "total_amount": 144000,
    "deposit_amount": 72000,
    "remaining_balance": 72000,
    "remaining_amount": 72000,
    "payment_mode": "INSTALLMENT",
    "status": "PENDING"
  },
  "payment_summary": {
    "total_amount": 144000,
    "deposit_amount": 72000,
    "remaining_amount": 72000,
    "payment_mode": "INSTALLMENT",
    "status": "PENDING"
  }
}
```

### Frontend notes

- On the installment confirmation screen, bind:
  - **Total** → `payment_summary.total_amount`
  - **Required deposit** → `payment_summary.deposit_amount`
  - **Remaining** → `payment_summary.remaining_amount`
- Do **not** use `total_amount` for the remaining field.
- `GET /order/my-orders` already computes live `remaining_balance` after payments.

---

## 4. Staff Notification Emails

Admins can register one or more emails that receive alerts when:

- A new order is placed
- A payment is received (Paystack success / admin approval)
- A bank transfer payment is initiated and awaits review

### Admin endpoints

```http
GET /admin/notification-emails
```

```http
POST /admin/notification-emails
Content-Type: application/json

{
  "email": "owner@cbrixi.com",
  "label": "Primary owner"
}
```

```http
DELETE /admin/notification-emails/:id
```

### Setup notes

- On first boot, if `ADMIN_NOTIFICATION_EMAIL` exists in server env, it is auto-seeded into the table.
- Add more recipients through the POST endpoint.
- No frontend user UI is required unless you want an admin settings page for managing these emails.

---

## 5. Cart Clearing After Checkout

### Behavior change

After a successful `POST /order/checkout`, the user's cart is **fully cleared** (all `cart_items` deleted).

### Frontend notes

- After checkout success, reset local cart state to empty.
- `GET /cart` will return an empty list immediately after checkout.
- Users starting a new purchase get a fresh cart automatically on next `POST /cart/add`.

---

## Quick Integration Checklist

### Referrals page
- [ ] Show total referral count from `referral_count`
- [ ] List invited friends with `name` and `email`
- [ ] Implement load-more or page controls with `limit` and `offset`

### Installment confirmation page
- [ ] Use `payment_summary.remaining_amount` for the Remaining field
- [ ] Verify 50% deposit example shows half of total as remaining

### Checkout flow
- [ ] Clear cart UI after successful checkout response

### Support widget
- [ ] Add floating chat button
- [ ] Connect Socket.IO with user token
- [ ] Load history from `GET /support/conversation/messages`
- [ ] Send/receive messages in real time

### Admin dashboard
- [ ] Add support inbox using `/admin/support/conversations`
- [ ] Connect admin socket with `role: "admin"`
- [ ] Optional: add UI to manage `/admin/notification-emails`

---

## Environment / Deployment Notes

- Socket.IO is served on the same host/port as the API at path `/socket.io`.
- Ensure your reverse proxy (Render, Nginx, etc.) forwards WebSocket upgrades for `/socket.io`.
- CORS already allows configured frontend origins with credentials.

If you need example React components for the support widget or referral list, say the word and we can scaffold those next.
