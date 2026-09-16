export type SalesInvoiceType = 'cash' | 'credit';

export interface SalesItemOption {
  id: string; code: string; name: string; item_type: string; unit: string; hsn_sac: string;
  available_quantity?: string | null; tax_treatment_id?: string | null; tax_treatment_name?: string | null;
}
export interface SalesTaxTreatment { id: string; name: string; tax_regime: string }
export interface UnbilledCreditSlip { id: string; slip_number: string; occurred_at: string; product_name: string; quantity: string; unit_price: string; amount: string; vehicle_number: string }
export interface SalesInvoiceLine {
  id: string; source_type: 'item' | 'credit_slip'; item: string; credit_slip?: string | null; credit_slip_number?: string | null;
  item_code_snapshot: string; item_name_snapshot: string; item_type_snapshot: string; hsn_sac_snapshot: string; unit_snapshot: string;
  quantity: string; unit_price: string; gross_amount: string; discount_amount: string; tax_inclusive: boolean;
  tax_treatment_name_snapshot: string; tax_regime_snapshot: string; tax_rate_snapshot: string; taxable_amount: string; tax_amount: string; tax_components_snapshot: Array<{name:string;rate:string;amount:string}>; line_total: string;
}
export interface SalesInvoice {
  id: string; customer?: string | null; customer_name: string; customer_code_snapshot: string; invoice_number: string;
  invoice_date: string; due_date: string; invoice_type: SalesInvoiceType; payment_account?: string | null; payment_account_name?: string | null;
  payment_method: string; payment_reference: string; subtotal: string; discount_total: string; taxable_total: string; tax_total: string;
  grand_total: string; amount_paid: string; outstanding_amount: string; payment_status: string; notes: string; status: 'active'|'voided';
  accounting_journal_id?: string | null;
  void_reason?: string; lines: SalesInvoiceLine[]; audit_logs: Array<{id:string;event_type:string;actor_name?:string;reason?:string;created_at:string}>;
}
export interface SalesPreparation { items: SalesItemOption[]; tax_treatments: SalesTaxTreatment[] }
export interface ItemStockSummary { item_id:string; item_code:string; item_name:string; unit:string; current_quantity:string; reorder_level:string; has_negative_balance_history:boolean }
export interface CustomerOutstandingResponse { total_outstanding:string; total_unbilled_credit:string; customers:Array<{customer_id:string;customer_code:string;customer_name:string;total_invoiced:string;total_paid:string;outstanding:string;unbilled_credit:string}> }
export interface OpenSalesInvoice { id:string; invoice_number:string; invoice_date:string; due_date:string; grand_total:string; outstanding_amount:string }
export interface CustomerReceipt { id:string; customer:string; customer_name:string; customer_code_snapshot:string; receipt_number:string; receipt_date:string; amount:string; payment_account:string; payment_account_name:string; payment_method:string; reference_number:string; notes:string; unallocated_amount:string; status:'active'|'voided'; accounting_journal_id?:string|null; void_reason?:string; allocations:Array<{id:string;sales_invoice:string;invoice_number:string;amount:string}> }
