# Receipt Management System — Frontend Integration

Backend-only delivery. Build the Next.js receipt UI against these APIs.

Base URL: `https://api.cbrixi.com` (local: your API host)

Auth:

```http
# Customer
Authorization: Bearer <user-token>

# Admin
Authorization: Bearer <admin-token>
```

---

## Behaviour (backend already enforces)

- A receipt is created **only** when a payment becomes `SUCCESS` (admin approve, Paystack verify, or Paystack webhook).
- **One receipt per payment** (`payment_id` unique). Partial payments → multiple receipts on the same invoice/order.
- Pending / rejected payments never get receipts.
- Receipt numbers look like `CBX-RCP-20260717-000001` and never change.
- Customers can only access their own receipts; admins can access all.

Approve payment response now includes the receipt (when generation succeeds):

```http
POST /admin/payments/:id/approve
```

```json
{
  "success": true,
  "receipt": {
    "id": "uuid",
    "receipt_number": "CBX-RCP-20260717-000001",
    "invoice_number": "INV-2026-000123",
    "amount_paid": 300000,
    "remaining_balance": 500000,
    "order_total": 800000,
    "items": [ ... ],
    "company": { ... }
  }
}
```

If receipt generation fails, approval still succeeds (`receipt` may be `null`); use `GET /admin/receipts/payment/:paymentId` to backfill.

---

## Customer APIs

### List my receipts

```http
GET /receipts/me?page=1&limit=20
GET /receipts/me?order_id=<uuid>&page=1&limit=20
```

```json
{
  "success": true,
  "message": "Receipts retrieved successfully",
  "receipts": [
    {
      "id": "uuid",
      "receipt_number": "CBX-RCP-20260717-000001",
      "invoice_number": "INV-2026-000123",
      "order_id": "uuid",
      "payment_id": "uuid",
      "amount_paid": 300000,
      "remaining_balance": 500000,
      "order_total": 800000,
      "payment_method": "BANK_TRANSFER",
      "payment_date": "2026-07-17T10:00:00.000Z",
      "generated_at": "2026-07-17T10:00:01.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "offset": 0,
    "total": 2,
    "total_pages": 1,
    "has_more": false,
    "has_previous": false
  }
}
```

### Receipts for one order (payment history)

```http
GET /receipts/me/order/:orderId?page=1&limit=20
```

Use this inside **Order History → Payment History**.

### Get receipt JSON

```http
GET /receipts/me/:receiptNumber
```

Returns full `receipt` including `items` and `company`.

### View branded HTML (print-ready)

```http
GET /receipts/me/:receiptNumber/html
```

Returns `text/html`. Open in a new tab or iframe; call `window.print()` for print.

### Download PDF

```http
GET /receipts/me/:receiptNumber/pdf
```

Returns `application/pdf` with `Content-Disposition: attachment`.

---

## Admin APIs

### List receipts

```http
GET /admin/receipts?page=1&limit=20
GET /admin/receipts?order_id=<uuid>
GET /admin/receipts?payment_id=<uuid>
```

List items also include `customer_name` and `customer_email`.

### Get by payment (with auto-backfill)

```http
GET /admin/receipts/payment/:paymentId
```

If the payment is `SUCCESS` but has no receipt yet, the backend generates one.

### Get / HTML / PDF

```http
GET /admin/receipts/:receiptNumber
GET /admin/receipts/:receiptNumber/html
GET /admin/receipts/:receiptNumber/pdf
```

### Resend receipt email (PDF attached)

```http
POST /admin/receipts/:receiptNumber/resend
```

```json
{
  "success": true,
  "message": "Receipt emailed successfully",
  "receipt_number": "CBX-RCP-20260717-000001",
  "emailed_to": "customer@example.com"
}
```

Email includes customer name, receipt number, invoice number, amount paid, outstanding balance, and the PDF attachment.

---

## Receipt payload (detail)

```json
{
  "receipt": {
    "id": "uuid",
    "receipt_number": "CBX-RCP-20260717-000001",
    "invoice_number": "INV-2026-000123",
    "order_id": "uuid",
    "payment_id": "uuid",
    "customer_id": "uuid",
    "amount_paid": 300000,
    "remaining_balance": 500000,
    "order_total": 800000,
    "subtotal": 800000,
    "discount_amount": 0,
    "delivery_fee": 0,
    "payment_method": "BANK_TRANSFER",
    "payment_date": "2026-07-17T10:00:00.000Z",
    "generated_by": "uuid-or-null",
    "generated_by_name": "admin@cbrixi.com",
    "generated_at": "2026-07-17T10:00:01.000Z",
    "created_at": "2026-07-17T10:00:01.000Z",
    "customer_name": "Ada Okafor",
    "customer_email": "ada@example.com",
    "customer_phone": null,
    "items": [
      {
        "id": "uuid",
        "receipt_id": "uuid",
        "product_id": "uuid",
        "product_name": "MacBook Air (Space Grey)",
        "quantity": 1,
        "unit_price": 800000,
        "subtotal": 800000,
        "created_at": "2026-07-17T10:00:01.000Z"
      }
    ],
    "company": {
      "name": "Cbrixi",
      "tagline": "Smart Devices Marketplace",
      "website": "https://www.cbrixi.com",
      "support_email": "support@cbrixi.com",
      "phone": null,
      "address": null,
      "logo_url": null
    }
  }
}
```

`customer_phone` is `null` until a phone field exists on users.

---

## Partial payments UI

For an ₦800,000 order:

| Payment | Amount | Receipt shows |
|---------|--------|---------------|
| 1st SUCCESS | ₦300,000 | Amount Paid 300k · Outstanding 500k |
| 2nd SUCCESS | ₦200,000 | Amount Paid 200k · Outstanding 300k |

Each row is its own receipt; never overwrite.

---

## Suggested Next.js pages

| Page | Route | Data |
|------|-------|------|
| Customer receipt | `/dashboard/receipts/[receiptNumber]` | `GET /receipts/me/:receiptNumber` + buttons to HTML/PDF |
| Customer order history | under order detail | `GET /receipts/me/order/:orderId` |
| Admin receipt | `/admin/receipts/[receiptNumber]` | `GET /admin/receipts/:receiptNumber` |
| Admin payment detail | on approved payment | `GET /admin/receipts/payment/:paymentId` |

### Buttons to wire

**Admin (approved payment):** View Receipt · Download PDF · Print · Resend Receipt  

**Customer (payment history):** View · Download PDF · Print  

Print: open HTML endpoint (or render from JSON) then `window.print()`. Backend HTML already hides `.no-print` via `@media print`.

Optional: render your own React receipt from JSON for brand-perfect UI; still use `/pdf` for download/email consistency, or generate client PDF from the same layout.

---

## Company branding env (backend)

Set on the API server:

| Env | Purpose |
|-----|---------|
| `COMPANY_NAME` | default `Cbrixi` |
| `COMPANY_TAGLINE` | default `Smart Devices Marketplace` |
| `COMPANY_WEBSITE` / `FRONTEND_URL` | website |
| `SUPPORT_EMAIL` / `EMAIL_FROM` | support email |
| `COMPANY_PHONE` | phone |
| `COMPANY_ADDRESS` | address |
| `COMPANY_LOGO_URL` | logo on HTML receipt |

---

## Errors

| Status | When |
|--------|------|
| `400` | Zod validation / business rule (e.g. payment not SUCCESS) |
| `403` | Customer accessing another user’s receipt |
| `404` | Receipt not found |

---

## Frontend checklist

- [ ] Customer payment history table with receipt actions
- [ ] Customer receipt page (`/dashboard/receipts/:receiptNumber`)
- [ ] Admin approved-payment actions (view / PDF / print / resend)
- [ ] Admin receipt page
- [ ] Print via HTML endpoint or local print CSS
- [ ] Handle multiple receipts per order
- [ ] After admin approve, use `receipt` from response or refetch by `paymentId`
