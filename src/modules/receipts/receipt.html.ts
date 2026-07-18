import { ReceiptRecord } from "./receipt.types";

const money = (amount: number) =>
  `NGN ${Number(amount).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const buildReceiptHtml = (receipt: ReceiptRecord, options: { forEmail?: boolean } = {}) => {
  const company = receipt.company;
  const logoBlock = company.logo_url
    ? `<img src="${escapeHtml(company.logo_url)}" alt="${escapeHtml(company.name)}" style="height:56px;object-fit:contain;" />`
    : `<div style="font-size:28px;font-weight:800;color:#0B5FFF;letter-spacing:0.04em;">${escapeHtml(company.name.toUpperCase())}</div>`;

  const rows = receipt.items
    .map(
      (item) => `
      <tr>
        <td style="padding:12px 10px;border-bottom:1px solid #E8EEF7;">${escapeHtml(item.product_name)}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #E8EEF7;text-align:center;">${item.quantity}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #E8EEF7;text-align:right;">${money(item.unit_price)}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #E8EEF7;text-align:right;font-weight:600;">${money(item.subtotal)}</td>
      </tr>`
    )
    .join("");

  const printCss = options.forEmail
    ? ""
    : `
    @media print {
      body { background: #fff !important; }
      .no-print { display: none !important; }
      .receipt-card { box-shadow: none !important; border: none !important; }
    }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Receipt ${escapeHtml(receipt.receipt_number)}</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: #F4F7FB;
      color: #10233F;
      font-family: Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    }
    .receipt-card {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #D9E4F5;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(16, 35, 63, 0.08);
    }
    .header {
      background: linear-gradient(135deg, #0B5FFF 0%, #0047C7 100%);
      color: #fff;
      padding: 28px 32px;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
    }
    .header-meta { text-align: right; font-size: 13px; line-height: 1.6; opacity: 0.95; }
    .section { padding: 24px 32px; }
    .section-title {
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #6B7C93;
      margin-bottom: 10px;
      font-weight: 700;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .card {
      background: #F8FBFF;
      border: 1px solid #E4EDF8;
      border-radius: 12px;
      padding: 14px 16px;
    }
    .label { color: #6B7C93; font-size: 12px; margin-bottom: 4px; }
    .value { font-size: 14px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #4A5D78;
      background: #EEF4FF;
      padding: 12px 10px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }
    .summary-row.total {
      border-top: 1px solid #D9E4F5;
      margin-top: 8px;
      padding-top: 12px;
      font-size: 16px;
      font-weight: 700;
    }
    .footer {
      background: #0F1F38;
      color: #D7E3F7;
      padding: 22px 32px;
      text-align: center;
      font-size: 13px;
      line-height: 1.7;
    }
    ${printCss}
  </style>
</head>
<body>
  ${options.forEmail ? "" : `<div class="no-print" style="max-width:820px;margin:0 auto 16px;display:flex;gap:10px;justify-content:flex-end;">
    <button onclick="window.print()" style="padding:10px 16px;border:0;border-radius:10px;background:#0B5FFF;color:#fff;font-weight:600;cursor:pointer;">Print Receipt</button>
  </div>`}
  <div class="receipt-card">
    <div class="header">
      <div>
        ${logoBlock}
        <div style="margin-top:8px;font-size:14px;opacity:0.95;">${escapeHtml(company.tagline)}</div>
      </div>
      <div class="header-meta">
        <div><strong>Receipt</strong></div>
        <div>${escapeHtml(receipt.receipt_number)}</div>
        <div>Invoice: ${escapeHtml(receipt.invoice_number)}</div>
      </div>
    </div>

    <div class="section">
      <div class="grid">
        <div class="card">
          <div class="section-title">Customer</div>
          <div class="label">Name</div>
          <div class="value">${escapeHtml(receipt.customer_name || "Customer")}</div>
          <div class="label" style="margin-top:10px;">Email</div>
          <div class="value">${escapeHtml(receipt.customer_email || "—")}</div>
          <div class="label" style="margin-top:10px;">Phone</div>
          <div class="value">${escapeHtml(receipt.customer_phone || "—")}</div>
        </div>
        <div class="card">
          <div class="section-title">Payment</div>
          <div class="label">Payment Date</div>
          <div class="value">${escapeHtml(new Date(receipt.payment_date).toLocaleString("en-NG"))}</div>
          <div class="label" style="margin-top:10px;">Payment Method</div>
          <div class="value">${escapeHtml(receipt.payment_method)}</div>
          <div class="label" style="margin-top:10px;">Generated By</div>
          <div class="value">${escapeHtml(receipt.generated_by_name || "SYSTEM")}</div>
        </div>
      </div>
    </div>

    <div class="section" style="padding-top:0;">
      <div class="section-title">Purchased Items</div>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th style="text-align:center;">Qty</th>
            <th style="text-align:right;">Unit Price</th>
            <th style="text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>

    <div class="section" style="padding-top:0;">
      <div class="card" style="max-width:360px;margin-left:auto;">
        <div class="section-title">Payment Summary</div>
        <div class="summary-row"><span>Subtotal</span><span>${money(receipt.subtotal)}</span></div>
        <div class="summary-row"><span>Discount</span><span>${money(receipt.discount_amount)}</span></div>
        <div class="summary-row"><span>Delivery Fee</span><span>${money(receipt.delivery_fee)}</span></div>
        <div class="summary-row"><span>Total Order Amount</span><span>${money(receipt.order_total)}</span></div>
        <div class="summary-row"><span>Amount Paid</span><span>${money(receipt.amount_paid)}</span></div>
        <div class="summary-row total"><span>Outstanding Balance</span><span>${money(receipt.remaining_balance)}</span></div>
      </div>
    </div>

    <div class="footer">
      <div>Thank you for shopping with ${escapeHtml(company.name)}.</div>
      <div>Your trusted marketplace for smart devices.</div>
      <div style="margin-top:8px;">
        For support, contact: ${escapeHtml(company.support_email)}
        ${company.website ? ` · ${escapeHtml(company.website.replace(/^https?:\/\//, ""))}` : ""}
      </div>
      ${company.address ? `<div>${escapeHtml(company.address)}</div>` : ""}
      ${company.phone ? `<div>${escapeHtml(company.phone)}</div>` : ""}
    </div>
  </div>
</body>
</html>`;
};

export const receiptEmailTemplate = (receipt: ReceiptRecord) => {
  const company = receipt.company;
  return `
Hello ${receipt.customer_name || "there"},

Your payment receipt is ready.

Receipt Number: ${receipt.receipt_number}
Invoice Number: ${receipt.invoice_number}
Amount Paid: ${money(receipt.amount_paid)}
Outstanding Balance: ${money(receipt.remaining_balance)}
Payment Method: ${receipt.payment_method}

You can view your receipt in your Cbrixi dashboard.

Thank you for shopping with ${company.name}.
${company.support_email}
${company.website}
`;
};
