export interface DailyBusinessSummary {
  filters: { from_date: string; to_date: string };
  basis: string;
  summary: {
    recorded_shift_count: number;
    fuel_sales: string;
    product_sales: string;
    service_sales: string;
    non_fuel_sales: string;
    sales_total: string;
    sales_tax: string;
    cash_collections: string;
    cash_invoice_sales: string;
    card_collections: string;
    upi_collections: string;
    fleet_card_collections: string;
    digital_collections: string;
    credit_sales: string;
    shift_expenses: string;
    general_expenses: string;
    purchase_total: string;
    shortage: string;
    excess: string;
  };
  fuel_products: Array<{
    product_id: string; product_code: string; product_name: string; unit: string;
    quantity: string; amount: string;
  }>;
  shifts: Array<{
    shift_id: string; posting_id: string; posting_version: number;
    business_date: string; shift_name: string; shift_code: string;
    cash_account_name: string | null; fuel_sales: string; cash: string;
    card: string; upi: string; fleet_card: string; digital: string;
    credit: string; shift_expenses: string; decreasing_adjustments: string;
    shortage: string; excess: string;
  }>;
}

export interface EmployeeAccountabilityReport {
  filters: { from_date: string; to_date: string; employee_id: string | null };
  basis: string;
  summary: { employee_count: number; shift_settlement_count: number; shortage: string; excess: string };
  employees: Array<{
    employee_id: string; employee_code: string; employee_name: string; shift_count: number;
    expected_sales: string; cash: string; card: string; upi: string; fleet_card: string;
    digital: string; credit: string; approved_increases: string; approved_decreases: string;
    accounted: string; shortage: string; excess: string;
  }>;
  details: Array<{
    settlement_id: string; shift_id: string; shift_card_id: string; employee_id: string;
    employee_code: string; employee_name: string; business_date: string; shift_name: string;
    expected_sales: string; cash: string; card: string; upi: string; fleet_card: string;
    credit: string; approved_increases: string; approved_decreases: string; accounted: string;
    shortage: string; excess: string; result: 'balanced' | 'shortage' | 'excess';
  }>;
}

export interface CoreReportPack {
  filters: { from_date: string; to_date: string };
  basis: { sales: string; purchases: string; stock: string; payments: string };
  sales: {
    count: number; truncated: boolean;
    totals: { subtotal: string; tax: string; total: string; paid: string; outstanding: string };
    rows: Array<{
      invoice_id: string; invoice_number: string; invoice_date: string; due_date: string;
      invoice_type: string; customer_name: string; payment_method: string | null;
      subtotal: string; tax_total: string; grand_total: string; amount_paid: string;
      outstanding: string; contains_credit_slips: boolean;
    }>;
  };
  purchases: {
    count: number; truncated: boolean;
    totals: { taxable: string; tax: string; total: string; paid: string; outstanding: string };
    rows: Array<{
      bill_id: string; bill_number: string; supplier_invoice_number: string;
      invoice_date: string; due_date: string; supplier_name: string; purchase_type: string;
      taxable_value: string; tax_total: string; grand_total: string;
      amount_paid: string; outstanding: string;
    }>;
  };
  stock: {
    count: number; truncated: boolean;
    totals: { inward: string; outward: string; net: string };
    rows: Array<{
      movement_id: string; tank_id: string; business_date: string | null; effective_at: string;
      tank_code: string; product_name: string; movement_type: string; movement_label: string;
      direction: 'IN' | 'OUT'; quantity: string; source_type: string; source_id: string; reason: string;
    }>;
  };
  payments: {
    count: number; truncated: boolean;
    totals: { cash: string; card: string; upi: string; fleet_card: string; credit: string; digital: string; total: string };
    rows: Array<{
      posting_id: string; shift_id: string; business_date: string; shift_name: string;
      cash: string; card: string; upi: string; fleet_card: string; credit: string; total: string;
    }>;
  };
}
