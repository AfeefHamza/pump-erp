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
