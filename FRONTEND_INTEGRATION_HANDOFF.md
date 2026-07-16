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

## 2. Contact Support (Floating Widget + Admin Inbox)

Real-time support chat uses **Socket.IO** plus REST fallbacks for history and sending messages.

### Socket connection

```ts
import { io } from "socket.io-client";

const API_URL = "https://api.cbrixi.com";

// User widget
const userSocket = io(API_URL, {
  path: "/socket.io",
  auth: {
    token: userAccessToken,
    role: "user"
  },
  transports: ["polling", "websocket"],
  reconnection: true,
  reconnectionAttempts: 5
});

// Admin dashboard
const adminSocket = io(API_URL, {
  path: "/socket.io",
  auth: {
    token: adminAccessToken,
    role: "admin"
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
| `support:conversation` | server → user | `{ conversation_id, name?, display_name?, email?, ... }` on connect |
| `support:join` | client → server | `{ conversation_id? }` with optional ack callback |
| `support:send` | client → server | `{ conversation_id?, message }` with ack callback |
| `support:message` | server → client | `{ conversation_id, message }` |
| `support:conversation:updated` | server → admin inbox | See payload below |

#### `support:conversation:updated` payload (admin inbox)

```json
{
  "conversation_id": "uuid",
  "user_id": "uuid",
  "firstname": "John",
  "lastname": "Doe",
  "username": "john",
  "email": "john@example.com",
  "full_name": "John Doe",
  "name": "John Doe",
  "display_name": "John Doe",
  "last_message": "Hello, I made a transaction and it has not been approved",
  "last_message_at": "2026-07-13T18:12:14.000Z",
  "unread_count": 1
}
```

### Display name helper (required on admin UI)

**Do not build the customer label from `user_id`.** Use the fields returned by the API/socket:

```ts
type SupportConversation = {
  user_id?: string;
  firstname?: string | null;
  lastname?: string | null;
  username?: string | null;
  email?: string | null;
  full_name?: string | null;
  name?: string | null;
  display_name?: string | null;
};

export const getSupportCustomerName = (conversation: SupportConversation) =>
  conversation.display_name ||
  conversation.name ||
  conversation.full_name ||
  [conversation.firstname, conversation.lastname].filter(Boolean).join(" ") ||
  conversation.username ||
  conversation.email ||
  "Customer";
```

Backend name priority:

```txt
firstname + lastname → username → email → "Customer"
```

### User send message example

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
  // user messages: message.sender_name
  // admin messages: message.sender_name === "CBRIXI Support"
});
```

### Admin inbox update example

```ts
socket.on("support:conversation:updated", (update) => {
  setConversations((prev) => {
    const existing = prev.find((c) => c.id === update.conversation_id);

    if (!existing) {
      return [
        {
          id: update.conversation_id,
          user_id: update.user_id,
          firstname: update.firstname,
          lastname: update.lastname,
          username: update.username,
          email: update.email,
          full_name: update.full_name,
          name: update.name,
          display_name: update.display_name,
          last_message: update.last_message,
          last_message_at: update.last_message_at,
          unread_count: update.unread_count
        },
        ...prev
      ];
    }

    return prev.map((conversation) =>
      conversation.id === update.conversation_id
        ? {
            ...conversation,
            firstname: update.firstname ?? conversation.firstname,
            lastname: update.lastname ?? conversation.lastname,
            username: update.username ?? conversation.username,
            email: update.email ?? conversation.email,
            full_name: update.full_name ?? conversation.full_name,
            name: update.name ?? conversation.name,
            display_name: update.display_name ?? conversation.display_name,
            last_message: update.last_message,
            last_message_at: update.last_message_at,
            unread_count: update.unread_count
          }
        : conversation
    );
  });
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
GET /admin/support/conversations?page=1&limit=50
Authorization: Bearer <admin-token>
```

Also accepts `limit` + `offset` if preferred:

```http
GET /admin/support/conversations?limit=50&offset=0
```

Query params:

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `page` | `1` | — | 1-based page number |
| `limit` | `50` | `100` | Conversations per page |
| `offset` | `0` | — | Alternative to `page` |

Only conversations with **at least one message** are returned (users who actually contacted support). Empty chats created when the widget opened are excluded.

Response:

```json
{
  "success": true,
  "conversations": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "status": "OPEN",
      "firstname": "John",
      "lastname": "Doe",
      "username": "john",
      "email": "john@example.com",
      "full_name": "John Doe",
      "name": "John Doe",
      "display_name": "John Doe",
      "last_message": "Hello, I made a transaction and it has not been approved",
      "unread_count": 1,
      "last_message_at": "2026-07-13T18:12:14.000Z",
      "created_at": "2026-07-13T18:10:00.000Z",
      "updated_at": "2026-07-13T18:12:14.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "offset": 0,
    "total": 87,
    "total_pages": 2,
    "has_more": true,
    "has_previous": false
  }
}
```

Admin conversation list UI with next/previous page:

```tsx
const customerName = getSupportCustomerName(conversation);

<div>
  <strong>{customerName}</strong>
  <small>{conversation.email}</small>
  <p>{conversation.last_message}</p>
</div>

{/* Pagination controls */}
<button
  disabled={!pagination.has_previous}
  onClick={() => loadConversations(pagination.page - 1)}
>
  Previous
</button>

<span>
  Page {pagination.page} of {pagination.total_pages} ({pagination.total} chats)
</span>

<button
  disabled={!pagination.has_more}
  onClick={() => loadConversations(pagination.page + 1)}
>
  Next
</button>
```

```ts
const loadConversations = async (page = 1) => {
  const res = await fetch(
    `${API_URL}/admin/support/conversations?page=${page}&limit=50`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  const data = await res.json();
  setConversations(data.conversations);
  setPagination(data.pagination);
};
```

```http
GET /admin/support/conversations/:id/messages?page=1&limit=50
Authorization: Bearer <admin-token>
```

Messages are returned newest-first by page (still ordered oldest→newest inside the page for chat display). Use `pagination.has_more` to load older messages.

Response:

```json
{
  "success": true,
  "conversation": {
    "id": "uuid",
    "user_id": "uuid",
    "status": "OPEN",
    "firstname": "John",
    "lastname": "Doe",
    "username": "john",
    "email": "john@example.com",
    "full_name": "John Doe",
    "name": "John Doe",
    "display_name": "John Doe",
    "last_message": null,
    "unread_count": 0,
    "last_message_at": null,
    "created_at": "2026-07-13T18:10:00.000Z",
    "updated_at": null
  },
  "messages": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "sender_type": "USER",
      "sender_id": "uuid",
      "message": "Hello, I made a transaction and it has not been approved",
      "read_at": null,
      "created_at": "2026-07-13T18:12:14.000Z",
      "sender_name": "John Doe",
      "sender_display_name": "John Doe",
      "sender_firstname": "John",
      "sender_lastname": "Doe",
      "sender_username": "john",
      "sender_email": "john@example.com"
    },
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "sender_type": "ADMIN",
      "sender_id": "uuid",
      "message": "Thanks for reaching out, we are reviewing your payment.",
      "read_at": "2026-07-13T18:13:00.000Z",
      "created_at": "2026-07-13T18:13:00.000Z",
      "sender_name": "CBRIXI Support",
      "sender_display_name": "CBRIXI Support",
      "sender_firstname": null,
      "sender_lastname": null,
      "sender_username": null,
      "sender_email": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "offset": 0,
    "total": 2,
    "total_pages": 1,
    "has_more": false,
    "has_previous": false
  }
}
```

Conversation header when opened:

```ts
const title = getSupportCustomerName(conversation);
```

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
  "created_at": "2026-07-13T13:00:00.000Z",
  "sender_name": "John Doe",
  "sender_display_name": "John Doe",
  "sender_firstname": "John",
  "sender_lastname": "Doe",
  "sender_username": "john",
  "sender_email": "john@example.com"
}
```

For admin messages, `sender_name` and `sender_display_name` are `"CBRIXI Support"`.

### Floating widget UX (user app)

1. Show a floating chat button on all authenticated pages.
2. On open, call `GET /support/conversation/messages` to load history.
3. Connect socket with user token and `role: "user"`.
4. Send new messages through `support:send` or `POST /support/conversation/messages`.
5. Listen for `support:message` for admin replies in real time.
6. Show unread badge if the latest message is from `ADMIN` and widget is closed.

### Admin inbox UX

1. On page load, call `GET /admin/support/conversations?page=1&limit=50`.
2. Render each row with `getSupportCustomerName(conversation)`.
3. Show **Next / Previous** using `pagination.has_more`, `pagination.has_previous`, `pagination.page`, and `pagination.total_pages`.
4. Connect socket with admin token and `role: "admin"`.
5. Listen for `support:conversation:updated` and update both:
   - `last_message`
   - `display_name` / `name` / `email`
6. When a conversation is opened:
   - call `GET /admin/support/conversations/:id/messages?page=1&limit=50`
   - emit `support:join` with `{ conversation_id }`
7. Reply with `support:send` or `POST /admin/support/conversations/:id/messages`.
8. Show `message.sender_name` above each message bubble.
9. If `pagination.has_more` on messages, load older pages and prepend them.

### Common admin UI mistake

**Wrong:**

```ts
const label = `User ${conversation.user_id.slice(0, 8)}`;
```

**Correct:**

```ts
const label = getSupportCustomerName(conversation);
```

If the UI still shows `User 054fb6bf` after backend deploy, the frontend is still using `user_id` instead of `display_name`.

### Field reference

| UI need | Field to use |
|---------|----------------|
| Conversation list title | `display_name` or `name` |
| Conversation header | `display_name` or `name` |
| Secondary line under name | `email` |
| Message bubble label | `sender_name` or `sender_display_name` |
| Socket inbox refresh | `update.display_name` from `support:conversation:updated` |

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

### Support widget (user app)
- [ ] Add floating chat button
- [ ] Connect Socket.IO with user token and `role: "user"`
- [ ] Load history from `GET /support/conversation/messages`
- [ ] Send messages with `support:send` or `POST /support/conversation/messages`
- [ ] Listen for `support:message` in real time

### Admin support inbox
- [ ] Load conversations from `GET /admin/support/conversations?page=1&limit=50`
- [ ] Show customer name with `display_name` or `name` (not `user_id`)
- [ ] Show `email` as secondary text under the customer name
- [ ] Show Next/Previous using `pagination.has_more` / `pagination.has_previous`
- [ ] On socket `support:conversation:updated`, update `display_name`, `email`, and `last_message`
- [ ] Open conversation with `GET /admin/support/conversations/:id/messages`
- [ ] Show `message.sender_name` on each message bubble
- [ ] Reply with `support:send` or `POST /admin/support/conversations/:id/messages`
- [ ] Connect admin socket with `role: "admin"`

### Admin notification emails
- [ ] Optional: add UI to manage `/admin/notification-emails`

---

## Environment / Deployment Notes

- Socket.IO is served on the same host/port as the API at path `/socket.io`.
- Ensure your reverse proxy (Render, Nginx, etc.) forwards WebSocket upgrades for `/socket.io`.
- CORS already allows configured frontend origins with credentials.
- To verify backend is returning names, inspect `GET /admin/support/conversations` in the browser Network tab and confirm `display_name` is present before changing frontend code.
