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

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  ledger_account: string;
  ledger_account_code: string;
  ledger_account_name: string;
  description?: string | null;
  display_order: number;
  is_active: boolean;
}

export interface ExpenseCategoryInput {
  code: string;
  name: string;
  ledger_account_id: string;
  description?: string;
  display_order?: number;
  is_active?: boolean;
}

export interface AccountMovement {
  id: string;
  effective_date: string;
  signed_amount: string;
  movement_type: string;
  source_type: string;
  source_id?: string | null;
  reversal_of?: string | null;
  description: string;
  account_name?: string;
}

export interface Expense {
  id: string;
  expense_number: string;
  expense_date: string;
  category: string;
  category_name: string;
  category_code_snapshot: string;
  ledger_account: string;
  ledger_code_snapshot: string;
  ledger_name_snapshot: string;
  payment_account: string;
  payment_account_name: string;
  payment_account_type: PaymentAccountType;
  payee?: string | null;
  amount: string;
  reference_number?: string | null;
  notes?: string | null;
  attachment?: string | null;
  status: 'active' | 'voided';
  accounting_journal_id?: string | null;
  account_movements: AccountMovement[];
  created_by_name?: string | null;
  created_at: string;
  voided_at?: string | null;
  void_reason?: string | null;
}

export interface ExpenseInput {
  client_request_id?: string;
  expense_date: string;
  category_id: string;
  payment_account_id: string;
  payee?: string;
  amount: string;
  reference_number?: string;
  notes?: string;
  attachment?: File | null;
}

export interface ExpenseListResponse {
  results: Expense[];
  summary: { active_total: string };
}

export interface CashBankTransfer {
  id: string;
  transfer_number: string;
  transfer_date: string;
  transfer_type: 'cash_deposit' | 'bank_withdrawal' | 'account_transfer';
  from_account: string;
  from_account_name: string;
  to_account: string;
  to_account_name: string;
  amount: string;
  reference_number?: string | null;
  notes?: string | null;
  status: 'active' | 'voided';
  accounting_journal_id?: string | null;
  account_movements: AccountMovement[];
  created_by_name?: string | null;
  created_at: string;
  voided_at?: string | null;
  void_reason?: string | null;
}

export interface CashBankTransferInput {
  client_request_id?: string;
  transfer_date: string;
  from_account_id: string;
  to_account_id: string;
  amount: string;
  reference_number?: string;
  notes?: string;
}

export interface PaymentAccountBook {
  account: PaymentAccount;
  opening_balance: string;
  closing_balance: string;
  results: Array<{
    id: string;
    effective_date: string;
    movement_type: string;
    description: string;
    source_type: string;
    source_id?: string | null;
    debit: string;
    credit: string;
    running_balance: string;
  }>;
}

export type DigitalCollectionMethod = 'card' | 'upi' | 'fleet_card';

export interface PendingDigitalCollection {
  id: string;
  collection_method: DigitalCollectionMethod;
  amount: string;
  occurred_at: string;
  provider_name?: string | null;
  reference_number?: string | null;
  terminal_or_account_reference?: string | null;
  employee_name: string;
  shift_id: string;
  shift_card_id?: string | null;
}

export interface DigitalSettlementAllocation {
  id: string;
  collection: string;
  amount: string;
  employee_name_snapshot: string;
  collection_reference_snapshot?: string | null;
  occurred_at_snapshot: string;
  collection_method: DigitalCollectionMethod;
  provider_name?: string | null;
}

export interface DigitalSettlement {
  id: string;
  settlement_number: string;
  settlement_date: string;
  collection_method: DigitalCollectionMethod;
  collection_method_display: string;
  provider_name: string;
  batch_reference?: string | null;
  payment_account: string;
  payment_account_name: string;
  gross_amount: string;
  charges_amount: string;
  tds_amount: string;
  net_amount: string;
  bank_reference: string;
  notes?: string | null;
  status: 'active' | 'voided';
  accounting_journal_id?: string | null;
  account_movements: AccountMovement[];
  allocations: DigitalSettlementAllocation[];
  created_by_name?: string | null;
  created_at: string;
  voided_at?: string | null;
  void_reason?: string | null;
}

export interface DigitalSettlementInput {
  client_request_id?: string;
  settlement_date: string;
  payment_account_id: string;
  collection_ids: string[];
  charges_amount: string;
  tds_amount: string;
  batch_reference?: string;
  bank_reference: string;
  notes?: string;
}

export interface DigitalSettlementListResponse {
  results: DigitalSettlement[];
  summary: {
    pending_count: number;
    pending_amount: string;
    settled_gross: string;
    charges_total: string;
    net_received: string;
  };
}
