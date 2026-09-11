// frontend/src/features/inventory/types/index.ts

export interface LatestDipDetails {
  volume: string;
  dip_height: string;
  dip_unit: string;
  measured_at: string;
  source_type: string;
  source_reference: string;
  chart_name?: string | null;
}

export interface TankStockSummaryItem {
  tank_id: string;
  tank_code: string;
  tank_name: string;
  product_id: string;
  product_name: string;
  product_code: string;
  product_category: string;
  capacity: string;
  safe_fill_capacity: string;
  current_book_stock: string;
  latest_physical_stock?: string | null;
  latest_dip_details?: LatestDipDetails | null;
  variance?: string | null;
  status: 'balanced' | 'shortage' | 'excess' | 'conflict' | 'no_dip';
  available_capacity: string;
  capacity_utilization_pct: string;
  last_movement_at?: string | null;
  has_chronology_conflict: boolean;
  has_negative_balance_history: boolean;
  first_negative_balance_at?: string | null;
}

export interface TankStockSummaryResponse {
  outlet_id: string;
  outlet_name: string;
  tanks: TankStockSummaryItem[];
  metrics: {
    total_tanks: number;
    total_book_stock: string;
    total_physical_stock?: string | null;
    net_variance?: string | null;
    conflict_alert_count: number;
  };
}

export interface TankStockMovementItem {
  id: string;
  effective_at: string;
  created_at: string;
  movement_type:
    | 'initial_opening_balance'
    | 'tanker_receipt'
    | 'nozzle_dispensing'
    | 'testing_return'
    | 'stock_adjustment_increase'
    | 'stock_adjustment_decrease'
    | 'reversal';
  direction: 'IN' | 'OUT';
  in_quantity: string;
  out_quantity: string;
  running_balance: string;
  is_negative_balance: boolean;
  source_type: string;
  source_id: string;
  source_line_id?: string | null;
  reversal_of_id?: string | null;
  is_reversal: boolean;
  reason?: string | null;
  created_by_name: string;
  metadata?: Record<string, unknown>;
}

export interface TankMovementLedgerResponse {
  tank_id: string;
  tank_code: string;
  tank_name: string;
  product_name: string;
  product_code: string;
  capacity: string;
  current_book_stock: string;
  has_chronology_conflict: boolean;
  movements: TankStockMovementItem[];
  total_movements: number;
}

export interface StockAdjustmentAttachmentItem {
  id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  uploaded_at: string;
  uploaded_by_name?: string | null;
}

export interface StockAdjustmentItem {
  id: string;
  tank: string;
  tank_code: string;
  tank_name: string;
  product_name: string;
  adjustment_type: 'increase' | 'decrease';
  quantity: string;
  effective_at: string;
  reason_category:
    | 'calibration_adjustment'
    | 'spillage_or_leakage'
    | 'temperature_variation'
    | 'handling_loss'
    | 'system_correction'
    | 'other';
  explanation: string;
  is_reversed: boolean;
  reversed_at?: string | null;
  reversal_reason?: string | null;
  created_by_name: string;
  reversed_by_name?: string | null;
  attachments: StockAdjustmentAttachmentItem[];
  created_at: string;
}

export interface StockAdjustmentInput {
  tank_id: string;
  adjustment_type: 'increase' | 'decrease';
  quantity: string;
  effective_at: string;
  reason_category: string;
  explanation: string;
  attachment?: File | null;
}

export type ItemType = 'fuel' | 'stock_item' | 'non_stock_item' | 'service';
export type InventoryTrackingMode = 'tank' | 'quantity' | 'none';

export interface UnitMaster {
  id: string;
  code: string;
  name: string;
  unit_type: 'volume' | 'weight' | 'quantity' | 'service';
  is_active: boolean;
  created_at: string;
}

export interface UnitConversion {
  id: string;
  item?: string | null;
  from_unit: string;
  from_unit_code?: string;
  from_unit_name?: string;
  to_unit: string;
  to_unit_code?: string;
  to_unit_name?: string;
  multiplier: string;
  inverse_multiplier?: string;
  is_active: boolean;
}

export interface FuelItemProfile {
  id?: string;
  fuel_type: 'motor_spirit' | 'high_speed_diesel' | 'cng' | 'lpg' | 'other';
  density_standard?: string | null;
  color_code?: string | null;
}

export interface StockItemProfile {
  id?: string;
  reorder_level?: string | null;
  reorder_quantity?: string | null;
  barcode?: string | null;
  storage_location?: string | null;
}

export interface ResolvedTaxTreatment {
  tax_treatment_id: string;
  tax_treatment_name: string;
  tax_regime: string;
  default_itc_classification: string;
  effective_from?: string;
  effective_to?: string | null;
}

export interface Item {
  id: string;
  code: string;
  name: string;
  item_type: ItemType;
  inventory_tracking_mode: InventoryTrackingMode;
  base_unit: string;
  base_unit_code?: string;
  base_unit_name?: string;
  base_unit_type?: string;
  hsn_sac?: string | null;
  description?: string | null;
  is_active: boolean;
  is_purchasable: boolean;
  is_sellable: boolean;
  fuel_profile?: FuelItemProfile | null;
  stock_profile?: StockItemProfile | null;
  current_purchase_tax_treatment?: ResolvedTaxTreatment | null;
  created_at: string;
  updated_at: string;
}

export interface ItemOption {
  id: string;
  code: string;
  name: string;
  item_type: ItemType;
  inventory_tracking_mode: InventoryTrackingMode;
  base_unit_id: string;
  base_unit_code: string;
  base_unit_name: string;
  hsn_sac?: string | null;
  is_purchasable: boolean;
  is_sellable: boolean;
  fuel_profile?: FuelItemProfile | null;
  current_purchase_tax_treatment?: ResolvedTaxTreatment | null;
}

export interface TaxTreatmentComponent {
  id?: string;
  name: string;
  component_type: 'vat' | 'additional_tax' | 'cess' | 'excise' | 'other_levy';
  calculation_base: 'discounted_line_value' | 'taxable_value' | 'value_plus_previous_components' | 'quantity' | 'manual_invoice_amount';
  calculation_type: 'percentage' | 'per_unit' | 'fixed_amount';
  rate_value: string;
  is_inclusive: boolean;
  sequence: number;
}

export interface TaxTreatmentRate {
  id: string;
  tax_treatment?: string;
  tax_code?: string;
  effective_from: string;
  effective_to?: string | null;
  gst_rate: string;
  cess_rate: string;
  cess_per_unit: string;
  notes?: string | null;
  is_locked: boolean;
  components: TaxTreatmentComponent[];
  created_at: string;
}

export interface TaxTreatment {
  id: string;
  code: string;
  name: string;
  tax_regime: 'gst' | 'non_gst_petroleum' | 'exempt' | 'nil_rated' | 'out_of_scope';
  description?: string | null;
  is_active: boolean;
  is_purchase_applicable: boolean;
  is_sales_applicable: boolean;
  rates: TaxTreatmentRate[];
  created_at: string;
  updated_at: string;
}

export interface ItemPurchaseTaxTreatment {
  id: string;
  item: string;
  tax_treatment: string;
  tax_treatment_name?: string;
  tax_treatment_code?: string;
  tax_regime?: string;
  default_itc_classification: 'not_applicable' | 'pending_review' | 'eligible_inputs' | 'eligible_capital_goods' | 'eligible_input_services' | 'ineligible_blocked' | 'ineligible_other';
  effective_from: string;
  effective_to?: string | null;
}

