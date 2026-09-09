// frontend/src/features/purchases/types/index.ts

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  tax_number?: string | null;
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
