export interface ManagementDashboard {
  business_date: string;
  outlet: { id: string; code: string; name: string };
  basis: string;
  recorded: {
    recorded_shift_count: number;
    fuel_sales: string; product_sales: string; service_sales: string; non_fuel_sales: string;
    sales_total: string; sales_tax: string; cash_collections: string; cash_invoice_sales: string;
    card_collections: string; upi_collections: string; fleet_card_collections: string;
    digital_collections: string; credit_sales: string; shift_expenses: string;
    general_expenses: string; purchase_total: string; shortage: string; excess: string;
  };
  fuel_products: Array<{
    product_id: string; product_code: string; product_name: string;
    unit: string; quantity: string; amount: string;
  }>;
  operations: {
    recorded_shift_count: number; open_shift_count: number; awaiting_recording_count: number;
    open_shifts: Array<{
      shift_id: string; business_date: string; shift_name: string; is_stale: boolean;
    }>;
  };
  stock: {
    total_tanks: number; total_book_stock: string; low_stock_count: number; conflict_count: number;
    tanks: Array<{
      tank_id: string; tank_code: string; tank_name: string; product_name: string;
      capacity: string; book_stock: string; utilization_pct: string;
      level: 'normal' | 'low' | 'critical'; status: string;
    }>;
  };
  receivables: { customer_outstanding: string; unbilled_credit: string };
  payables: { supplier_outstanding: string; supplier_overdue: string };
  settlements: { pending_count: number; pending_amount: string };
  alerts: Array<{
    type: string; severity: 'warning' | 'danger'; title: string; detail: string; path: string;
  }>;
}
