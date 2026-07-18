export type ReceiptItem = {
  id: string;
  receipt_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string | Date;
};

export type ReceiptCompanyInfo = {
  name: string;
  tagline: string;
  website: string;
  support_email: string;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
};

export type ReceiptRecord = {
  id: string;
  receipt_number: string;
  invoice_number: string;
  order_id: string;
  payment_id: string;
  customer_id: string;
  amount_paid: number;
  remaining_balance: number;
  order_total: number;
  subtotal: number;
  discount_amount: number;
  delivery_fee: number;
  payment_method: string;
  payment_date: string | Date;
  generated_by: string | null;
  generated_by_name: string | null;
  generated_at: string | Date;
  created_at: string | Date;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  items: ReceiptItem[];
  company: ReceiptCompanyInfo;
};

export type ReceiptListItem = {
  id: string;
  receipt_number: string;
  invoice_number: string;
  order_id: string;
  payment_id: string;
  amount_paid: number;
  remaining_balance: number;
  order_total: number;
  payment_method: string;
  payment_date: string | Date;
  generated_at: string | Date;
  customer_name?: string | null;
  customer_email?: string | null;
};
