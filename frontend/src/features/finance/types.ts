export type PaymentAccountType = 'cash' | 'bank';
export type SupplierPaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'other';

export interface PaymentAccount {
  id: string;
  organisation: string;
  outlet?: string | null;
  outlet_name?: string | null;
  code: string;
  name: string;
  account_type: PaymentAccountType;
  bank_name?: string | null;
  account_number_last4?: string | null;
  ifsc?: string | null;
  opening_balance: string;
  opening_balance_date?: string | null;
  current_balance: string;
  ledger_account?: string | null;
  ledger_account_code?: string | null;
  ledger_account_name?: string | null;
  notes?: string | null;
  display_order: number;
  is_active: boolean;
  movements?: Array<{ id: string; effective_date: string; signed_amount: string; movement_type: string; description: string }>;
}

export interface PaymentAccountInput {
  outlet_id?: string | null;
  code: string;
  name: string;
  account_type: PaymentAccountType;
  bank_name?: string;
  account_number_last4?: string;
  ifsc?: string;
  opening_balance?: string;
  opening_balance_date?: string | null;
  notes?: string;
}

export interface OpenPurchaseBill {
  id: string;
  bill_number: string;
  supplier_invoice_number: string;
  invoice_date: string;
  due_date: string;
  grand_total: string;
  amount_paid: string;
  outstanding_amount: string;
  payment_status: 'unpaid' | 'partially_paid' | 'paid';
}

export interface SupplierPaymentAllocation {
  id: string;
  purchase_bill: string;
  bill_number: string;
  supplier_invoice_number: string;
  invoice_date: string;
  amount: string;
}

export interface SupplierPayment {
  id: string;
  supplier: string;
  supplier_name: string;
  supplier_code: string;
  payment_number: string;
  payment_date: string;
  amount: string;
  payment_account: string;
  payment_account_name: string;
  payment_method: SupplierPaymentMethod;
  reference_number?: string | null;
  cheque_number?: string | null;
  cheque_date?: string | null;
  notes?: string | null;
  allocated_amount: string;
  unallocated_amount: string;
  status: 'active' | 'voided';
  accounting_journal_id?: string | null;
  created_by_name?: string | null;
  created_at: string;
  voided_at?: string | null;
  void_reason?: string | null;
  allocations: SupplierPaymentAllocation[];
  account_movements: Array<{
    id: string;
    effective_date: string;
    signed_amount: string;
    movement_type: string;
    description: string;
  }>;
  audit_logs: Array<{
    id: string;
    event_type: string;
    actor_name?: string | null;
    reason?: string | null;
    created_at: string;
  }>;
}

export interface SupplierPaymentInput {
  client_request_id?: string;
  supplier_id: string;
  payment_account_id: string;
  payment_date: string;
  amount: string;
  payment_method: SupplierPaymentMethod;
  reference_number?: string;
  cheque_number?: string;
  cheque_date?: string | null;
  notes?: string;
  allocations: Array<{ purchase_bill_id: string; amount: string }>;
}

export interface SupplierPaymentListResponse {
  results: SupplierPayment[];
  summary: {
    total_active_payments: string;
    total_allocated: string;
    total_unallocated: string;
  };
}
