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
