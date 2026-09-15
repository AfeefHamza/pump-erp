// frontend/src/features/purchases/types/index.ts

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  tax_number?: string | null;
  gstin?: string | null;
  gst_registration_type?: 'registered' | 'unregistered' | 'composition' | 'overseas' | 'pending_review';
  state?: string | null;
  state_code?: string | null;
  tax_treatment?: string;
  address?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TankerReceiptAttachment {
  id: string;
  attachment_type: 'invoice' | 'challan' | 'dip_sheet' | 'receipt_image' | 'other';
  file_name: string;
  file_size: number;
  content_type: string;
  uploaded_at: string;
  uploaded_by_name?: string | null;
}

export interface TankerReceiptTankAllocation {
  id: string;
  tank: string;
  tank_code: string;
  tank_name: string;
  tank_capacity: string;
  allocated_book_quantity: string;
  pre_unloading_dip_height?: string | null;
  pre_unloading_dip_unit: 'millimetre' | 'centimetre' | 'inch';
  pre_unloading_volume?: string | null;
  post_unloading_dip_height?: string | null;
  post_unloading_dip_unit: 'millimetre' | 'centimetre' | 'inch';
  post_unloading_volume?: string | null;
  physical_dip_gain?: string | null;
  variance?: string | null;
  calibration_chart?: string | null;
  calibration_chart_name?: string | null;
  conversion_method?: string | null;
  variance_status: 'normal' | 'shortage' | 'excess' | 'acknowledged';
  variance_acknowledged_at?: string | null;
  variance_acknowledged_by_name?: string | null;
  variance_acknowledgement_reason?: string | null;
  notes?: string | null;
}

export interface TankerReceiptProductLine {
  id: string;
  product: string;
  product_code: string;
  product_name: string;
  invoice_quantity: string;
  accepted_book_quantity: string;
  unit_rate?: string | null;
  total_value?: string | null;
  invoice_density?: string | null;
  observed_density?: string | null;
  observed_temperature?: string | null;
  quantity_override_reason?: string | null;
  remarks?: string | null;
  allocations: TankerReceiptTankAllocation[];
}

export interface TankerReceiptListItem {
  id: string;
  receipt_number: string;
  supplier: string;
  supplier_name: string;
  supplier_code_snapshot: string;
  invoice_number: string;
  invoice_date: string;
  delivery_challan_number?: string | null;
  vehicle_registration: string;
  driver_name?: string | null;
  unloading_start_time?: string | null;
  unloading_end_time: string;
  status: 'recorded' | 'confirmed' | 'voided';
  products_summary: string[];
  total_invoice_quantity: string;
  total_accepted_quantity: string;
  total_physical_dip_gain?: string | null;
  total_variance?: string | null;
  created_by_name?: string | null;
  confirmed_by_name?: string | null;
  voided_by_name?: string | null;
  confirmed_at?: string | null;
  voided_at?: string | null;
  created_at: string;
}

export interface TankerReceiptDetail extends TankerReceiptListItem {
  driver_phone?: string | null;
  seal_details?: string | null;
  notes?: string | null;
  product_lines: TankerReceiptProductLine[];
  attachments: TankerReceiptAttachment[];
  updated_by_name?: string | null;
  void_reason?: string | null;
  updated_at: string;
}

export interface TankAllocationInput {
  tank_id: string;
  allocated_book_quantity: string;
  pre_unloading_dip_height?: string | null;
  pre_unloading_dip_unit?: 'millimetre' | 'centimetre' | 'inch';
  post_unloading_dip_height?: string | null;
  post_unloading_dip_unit?: 'millimetre' | 'centimetre' | 'inch';
  notes?: string | null;
}

export interface ProductLineInput {
  product_id: string;
  invoice_quantity: string;
  accepted_book_quantity: string;
  unit_rate?: string | null;
  invoice_density?: string | null;
  observed_density?: string | null;
  observed_temperature?: string | null;
  quantity_override_reason?: string | null;
  remarks?: string | null;
  allocations: TankAllocationInput[];
}

export interface TankerReceiptInput {
  receipt_number: string;
  supplier_id: string;
  invoice_number: string;
  invoice_date: string;
  delivery_challan_number?: string | null;
  vehicle_registration: string;
  driver_name?: string | null;
  driver_phone?: string | null;
  seal_details?: string | null;
  unloading_start_time?: string | null;
  unloading_end_time: string;
  notes?: string | null;
  product_lines: ProductLineInput[];
}

export interface PurchaseBillReceiptLink {
  id: string;
  tanker_receipt: string;
  tanker_receipt_number: string;
  delivery_challan_number?: string | null;
  receipt_product_line?: string | null;
  product_name?: string | null;
  product_code?: string | null;
  linked_quantity: string;
  linked_invoice_value?: string | null;
  released_at?: string | null;
  created_at: string;
}

export interface PurchaseTaxCodeComponent {
  id: string;
  name: string;
  component_type: 'vat' | 'additional_tax' | 'cess' | 'excise' | 'other_levy';
  calculation_base: 'discounted_line_value' | 'taxable_value' | 'value_plus_previous_components' | 'quantity' | 'manual_invoice_amount';
  calculation_type: 'percentage' | 'per_unit' | 'fixed_amount';
  rate_value: string;
  is_inclusive: boolean;
  sequence: number;
}

export interface PurchaseTaxCodeRate {
  id: string;
  tax_code: string;
  effective_from: string;
  effective_to?: string | null;
  gst_rate: string;
  cess_rate: string;
  cess_per_unit: string;
  notes?: string | null;
  is_locked: boolean;
  components: PurchaseTaxCodeComponent[];
  created_at: string;
}

export interface PurchaseTaxCode {
  id: string;
  code: string;
  name: string;
  tax_regime: 'gst' | 'non_gst_petroleum' | 'non_gst' | 'exempt' | 'nil_rated' | 'out_of_scope';
  description?: string | null;
  is_active: boolean;
  rates: PurchaseTaxCodeRate[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseItem {
  id: string;
  code: string;
  name: string;
  item_type: 'goods' | 'service';
  unit: string;
  hsn_sac?: string | null;
  purchase_tax_treatment: 'gst' | 'exempt' | 'nil_rated' | 'out_of_scope' | 'non_gst_petroleum';
  default_purchase_tax_code?: string | null;
  default_purchase_tax_code_code?: string | null;
  default_itc_classification: 'not_applicable' | 'pending_review' | 'eligible_inputs' | 'eligible_capital_goods' | 'eligible_input_services' | 'ineligible_blocked' | 'ineligible_other';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductPurchaseTaxMapping {
  id: string;
  fuel_product?: string | null;
  fuel_product_name?: string | null;
  fuel_product_code?: string | null;
  purchase_item?: string | null;
  purchase_item_name?: string | null;
  purchase_item_code?: string | null;
  purchase_tax_treatment: string;
  hsn_sac?: string | null;
  purchase_tax_code?: string | null;
  purchase_tax_code_code?: string | null;
  default_itc_classification: string;
  purchase_unit: string;
  updated_at: string;
}

export interface PurchaseBillOtherCharge {
  id?: string;
  charge_type: 'freight' | 'insurance' | 'packing_handling' | 'other';
  description: string;
  calculation_type: 'fixed_amount' | 'percentage';
  percentage_rate?: string | null;
  amount: string;
  tax_treatment: 'taxable' | 'exempt' | 'nil_rated' | 'non_gst';
  hsn_sac?: string | null;
  tax_code?: string | null;
  tax_code_code?: string | null;
  tax_code_rate_version?: string | null;
  gst_rate?: string;
  cgst_amount?: string;
  sgst_amount?: string;
  igst_amount?: string;
  total_amount?: string;
  sequence?: number;
}

export interface PurchaseBillLine {
  id: string;
  line_number: number;
  receipt_link?: string | null;
  line_type: 'fuel' | 'other';
  description?: string | null;
  product?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  purchase_item?: string | null;
  purchase_item_code?: string | null;
  purchase_item_name?: string | null;
  product_code_snapshot?: string | null;
  product_name_snapshot?: string | null;
  quantity: string;
  unit: string;
  unit_rate: string;
  gross_amount: string;
  discount_method?: 'none' | 'fixed_amount' | 'percentage';
  discount_percentage?: string | null;
  discount_amount: string;
  allocated_transaction_discount?: string;
  taxable_amount: string;
  tax_treatment?: string;
  tax_code?: string | null;
  tax_code_code?: string | null;
  tax_code_rate_version?: string | null;
  tax_code_snapshot?: any;
  hsn_sac?: string | null;
  gst_rate?: string;
  cgst_amount?: string;
  sgst_amount?: string;
  igst_amount?: string;
  cess_rate?: string;
  cess_amount?: string;
  petroleum_tax_total?: string;
  itc_classification?: string;
  is_petroleum_manual_override?: boolean;
  petroleum_manual_override_reason?: string | null;
  line_total: string;
  quantity_override_reason?: string | null;
  notes?: string | null;
}

export interface PurchaseBillAdjustment {
  id: string;
  label: string;
  component_type: 'charge' | 'discount' | 'tax' | 'round_off';
  calculation_type: 'fixed_amount' | 'percentage';
  percentage_rate?: string | null;
  calculated_amount: string;
  sequence: number;
  notes?: string | null;
}

export interface PurchaseBillAttachment {
  id: string;
  attachment_type: 'supplier_invoice' | 'delivery_challan' | 'tax_document' | 'note_reference' | 'other';
  file_name: string;
  file_size: number;
  content_type: string;
  uploaded_at: string;
  uploaded_by_name?: string | null;
}

export interface PurchaseBillAuditLog {
  id: string;
  event_type: string;
  actor: string;
  actor_name?: string | null;
  occurred_at: string;
  changed_fields: string[];
  previous_totals: Record<string, string>;
  new_totals: Record<string, string>;
  reason?: string | null;
  metadata: Record<string, any>;
}

export interface PurchaseBillListItem {
  id: string;
  bill_number: string;
  supplier: string;
  supplier_name: string;
  supplier_code: string;
  supplier_invoice_number: string;
  invoice_date: string;
  received_date?: string | null;
  due_date: string;
  currency: string;
  calculation_version: 'legacy_v1' | 'item_tax_v2';
  purchase_type: 'fuel' | 'goods_services' | 'mixed';
  subtotal: string;
  discount_total: string;
  additional_charges_total: string;
  tax_total: string;
  taxable_value_total?: string;
  cgst_total?: string;
  sgst_total?: string;
  igst_total?: string;
  gst_cess_total?: string;
  petroleum_tax_total?: string;
  other_charges_subtotal?: string;
  other_charges_tax_total?: string;
  round_off_amount: string;
  grand_total: string;
  amount_paid: string;
  outstanding_amount: string;
  payment_status?: 'unpaid' | 'partially_paid' | 'paid' | 'voided';
  status: 'active' | 'voided';
  is_overdue: boolean;
  days_overdue: number;
  linked_tanker_receipts: string[];
  created_by_name?: string | null;
  created_at: string;
}

export interface PurchaseBillDetail extends PurchaseBillListItem {
  payment_allocations?: Array<{
    payment_id: string;
    payment_number: string;
    payment_date: string;
    amount: string;
  }>;
  normalized_supplier_invoice_number: string;
  is_duplicate_override: boolean;
  duplicate_override_reason?: string | null;
  conflicting_bill?: string | null;
  tax_price_mode?: 'exclusive' | 'inclusive';
  discount_mode?: 'line' | 'transaction';
  transaction_discount_method?: 'none' | 'fixed_amount' | 'percentage';
  transaction_discount_amount?: string;
  transaction_discount_percentage?: string | null;
  place_of_supply_state_code?: string | null;
  place_of_supply_state?: string | null;
  is_interstate?: boolean;
  place_of_supply_override?: boolean;
  place_of_supply_override_reason?: string | null;
  tax_override?: boolean;
  tax_override_reason?: string | null;
  notes?: string | null;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  voided_by_name?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  lines: PurchaseBillLine[];
  adjustments: PurchaseBillAdjustment[];
  other_charges?: PurchaseBillOtherCharge[];
  receipt_links: PurchaseBillReceiptLink[];
  attachments: PurchaseBillAttachment[];
  audit_logs: PurchaseBillAuditLog[];
  updated_at: string;
}

export interface PurchaseBillLineInput {
  line_number?: number;
  tanker_receipt_line_id?: string | null;
  line_type?: 'fuel' | 'other';
  description?: string | null;
  product_id?: string | null;
  purchase_item_id?: string | null;
  quantity: string;
  unit?: string;
  unit_rate: string;
  discount_method?: 'none' | 'fixed_amount' | 'percentage';
  discount_amount?: string;
  discount_percentage?: string;
  tax_treatment?: string;
  tax_code_id?: string | null;
  hsn_sac?: string | null;
  itc_classification?: string;
  is_petroleum_manual_override?: boolean;
  petroleum_tax_amount?: string;
  petroleum_manual_override_reason?: string | null;
  quantity_override_reason?: string | null;
  notes?: string | null;
}

export interface PurchaseBillOtherChargeInput {
  charge_type: 'freight' | 'insurance' | 'packing_handling' | 'other';
  description: string;
  calculation_type: 'fixed_amount' | 'percentage';
  percentage_rate?: string | null;
  amount?: string;
  tax_treatment: 'taxable' | 'exempt' | 'nil_rated' | 'non_gst';
  hsn_sac?: string | null;
  tax_code_id?: string | null;
  sequence?: number;
}

export interface PurchaseBillAdjustmentInput {
  label: string;
  component_type: 'charge' | 'discount' | 'tax' | 'round_off';
  calculation_type: 'fixed_amount' | 'percentage';
  percentage_rate?: string | null;
  calculated_amount?: string;
  sequence?: number;
  notes?: string | null;
}

export interface PurchaseBillInput {
  supplier_id: string;
  supplier_invoice_number: string;
  invoice_date: string;
  received_date?: string | null;
  due_date: string;
  bill_number?: string | null;
  currency?: string;
  notes?: string | null;
  calculation_version?: 'legacy_v1' | 'item_tax_v2';
  purchase_type?: 'fuel' | 'goods_services' | 'mixed';
  tax_price_mode?: 'exclusive' | 'inclusive';
  discount_mode?: 'line' | 'transaction';
  transaction_discount_method?: 'none' | 'fixed_amount' | 'percentage';
  transaction_discount_amount?: string;
  transaction_discount_percentage?: string;
  place_of_supply_override?: boolean;
  place_of_supply_state_code?: string;
  place_of_supply_override_reason?: string;
  tax_override?: boolean;
  tax_override_reason?: string;
  is_duplicate_override?: boolean;
  conflicting_bill_id?: string | null;
  duplicate_override_reason?: string | null;
  lines: PurchaseBillLineInput[];
  adjustments?: PurchaseBillAdjustmentInput[];
  other_charges?: PurchaseBillOtherChargeInput[];
}

export interface AvailableTankerReceiptLine {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  invoice_quantity: string;
  accepted_book_quantity: string;
  unit_rate?: string | null;
  total_value?: string | null;
  unit: string;
}

export interface AvailableTankerReceipt {
  id: string;
  receipt_number: string;
  supplier_id: string;
  supplier_name: string;
  supplier_code: string;
  invoice_number: string;
  invoice_date: string;
  delivery_challan_number?: string | null;
  vehicle_registration: string;
  unloading_end_time: string;
  available_lines: AvailableTankerReceiptLine[];
}

export interface SupplierOutstandingItem {
  supplier_id: string;
  supplier_name: string;
  supplier_code: string;
  total_billed: string;
  total_paid: string;
  total_outstanding: string;
  not_due: string;
  overdue_total: string;
  bucket_1_30: string;
  bucket_31_60: string;
  bucket_61_90: string;
  bucket_over_90: string;
  oldest_unpaid_invoice_date?: string | null;
  unpaid_bills_count: number;
  unallocated_advance: string;
}

export interface SupplierOutstandingSummary {
  as_of_date: string;
  total_billed: string;
  total_paid: string;
  total_outstanding: string;
  total_unallocated_advances: string;
  not_due: string;
  overdue_total: string;
  ageing_buckets: {
    not_due: string;
    bucket_1_30: string;
    bucket_31_60: string;
    bucket_61_90: string;
    bucket_over_90: string;
  };
  suppliers: SupplierOutstandingItem[];
}

export interface SupplierStatementLine {
  line_type?: 'purchase_bill' | 'supplier_payment';
  document_id?: string;
  document_number?: string;
  date?: string;
  reference?: string;
  bill_id?: string;
  bill_number?: string;
  supplier_invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  status: 'active' | 'voided';
  debit_amount: string;
  credit_amount: string;
  outstanding_amount: string;
  running_balance: string;
  linked_receipt_numbers?: string[];
  unallocated_amount?: string;
  allocations?: Array<{ bill_id: string; bill_number: string; amount: string }>;
}

export interface SupplierStatement {
  supplier_id: string;
  supplier_name: string;
  supplier_code: string;
  as_of_date: string;
  total_billed: string;
  total_paid: string;
  total_outstanding: string;
  total_unallocated_advances: string;
  ageing_buckets: {
    not_due: string;
    bucket_1_30: string;
    bucket_31_60: string;
    bucket_61_90: string;
    bucket_over_90: string;
  };
  lines: SupplierStatementLine[];
}

export interface PurchaseBillCalculationPreview {
  status: string;
  place_of_supply_state: string;
  place_of_supply_state_code: string;
  is_interstate: boolean;
  subtotal: string;
  discount_total: string;
  taxable_value_total: string;
  cgst_total: string;
  sgst_total: string;
  igst_total: string;
  gst_cess_total: string;
  petroleum_tax_total: string;
  other_charges_subtotal: string;
  other_charges_tax_total: string;
  additional_charges_total: string;
  tax_total: string;
  round_off_amount: string;
  grand_total: string;
  lines: any[];
  other_charges: any[];
}
