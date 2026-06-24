export interface PartnerApp {
  id: string;
  name: string;
  is_active: boolean;
}

export interface PartnerProductFilters {
  category?: string;
  search?: string;
  min_price?: number;
  max_price?: number;
  page: number;
  limit: number;
}

export interface PartnerSalesRecordItemInput {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface PartnerSalesRecordInput {
  external_order_id: string;
  invoice_number?: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  payment_status: string;
  order_status: string;
  total_amount: number;
  items: PartnerSalesRecordItemInput[];
}
