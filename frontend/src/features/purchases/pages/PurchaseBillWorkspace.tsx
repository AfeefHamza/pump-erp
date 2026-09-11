// frontend/src/features/purchases/pages/PurchaseBillWorkspace.tsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import {
  fetchPurchaseBillDetail,
  createPurchaseBill,
  updatePurchaseBill,
  voidPurchaseBill,
  fetchSuppliers,
  createSupplier,
  fetchFuelProducts,
  fetchPurchaseItems,
  fetchPurchaseTaxCodes,
  previewPurchaseBillCalculation,
  fetchAvailableTankerReceipts,
  uploadPurchaseBillAttachment,
  getPurchaseBillAttachmentDownloadUrl,
  fetchItemOptions,
  fetchTaxTreatments,
  type FuelProduct,
  type ItemOption,
  type TaxTreatment
} from '@/api/client';
import { ItemDrawer } from '@/features/inventory/components/ItemDrawer';
import type {
  Supplier,
  PurchaseBillDetail,
  PurchaseBillInput,
  PurchaseItem,
  PurchaseTaxCode,
  PurchaseBillCalculationPreview,
  AvailableTankerReceipt,
  AvailableTankerReceiptLine
} from '@/features/purchases/types';
import { SearchableCombobox, type ComboboxOption } from '@/components/forms/SearchableCombobox';
import { TankerReceiptSelectorModal } from '@/features/purchases/components/TankerReceiptSelectorModal';
import { ProductLineGrid, type InternalLineItem } from '@/features/purchases/components/ProductLineGrid';
import { AdjustmentSection, type InternalAdjustmentItem } from '@/features/purchases/components/AdjustmentSection';
import { OtherChargesSection, type InternalOtherCharge } from '@/features/purchases/components/OtherChargesSection';
import { TransactionTotalsPanel } from '@/features/purchases/components/TransactionTotalsPanel';
import { TransactionStickyFooter } from '@/features/purchases/components/TransactionStickyFooter';
import { KeyboardShortcutsModal } from '@/features/purchases/components/KeyboardShortcutsModal';
import {
  ArrowLeft,
  Link as LinkIcon,
  Ban,
  Upload,
  Download,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
  MapPin
} from 'lucide-react';

export const PurchaseBillWorkspace: React.FC = () => {
  const { billId } = useParams<{ billId?: string }>();
  const navigate = useNavigate();
  const activeOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const activeOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const isNew = !billId || billId === 'new';

  // Functional permissions
  const canCreateSupplier = usePermission('supplier.create');

  // Core data states
  const [bill, setBill] = useState<PurchaseBillDetail | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [fuelProducts, setFuelProducts] = useState<FuelProduct[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [taxCodes, setTaxCodes] = useState<PurchaseTaxCode[]>([]);
  const [canonicalItems, setCanonicalItems] = useState<ItemOption[]>([]);
  const [taxTreatments, setTaxTreatments] = useState<TaxTreatment[]>([]);
  const [availableReceipts, setAvailableReceipts] = useState<AvailableTankerReceipt[]>([]);
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modals state
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  // Quick Create Supplier Modal State
  const [showQuickSupplierModal, setShowQuickSupplierModal] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState('');
  const [quickSupplierCode, setQuickSupplierCode] = useState('');
  const [quickSupplierPhone, setQuickSupplierPhone] = useState('');
  const [quickSupplierTaxNumber, setQuickSupplierTaxNumber] = useState('');
  const [quickSupplierLoading, setQuickSupplierLoading] = useState(false);
  const [quickSupplierError, setQuickSupplierError] = useState<string | null>(null);

  // Form Fields
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [receivedDate, setReceivedDate] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [billNumber, setBillNumber] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [notes, setNotes] = useState('');

  // V2 Taxation & Pricing Controls
  const [taxPriceMode, setTaxPriceMode] = useState<'exclusive' | 'inclusive'>('exclusive');
  const [discountMode, setDiscountMode] = useState<'line' | 'transaction'>('line');
  const [transactionDiscountMethod, setTransactionDiscountMethod] = useState<'none' | 'fixed_amount' | 'percentage'>('none');
  const [transactionDiscountAmount, setTransactionDiscountAmount] = useState('0.00');
  const [transactionDiscountPercentage, setTransactionDiscountPercentage] = useState('');

  // Place of Supply & Tax Override states
  const [isPOSOverridden, setIsPOSOverridden] = useState(false);
  const [posState, setPosState] = useState('');
  const [posStateCode, setPosStateCode] = useState('');
  const [posOverrideReason, setPosOverrideReason] = useState('');
  const [showPOSOverrideModal, setShowPOSOverrideModal] = useState(false);

  const [isTaxOverridden, setIsTaxOverridden] = useState(false);
  const [taxOverrideReason, setTaxOverrideReason] = useState('');

  // Duplicate Override state
  const [isDuplicateOverride, setIsDuplicateOverride] = useState(false);
  const [conflictingBillId, setConflictingBillId] = useState('');
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState('');
  const [duplicateDetected, setDuplicateDetected] = useState(false);

  // Lines, Adjustments (legacy), & Other Charges (V2)
  const [lines, setLines] = useState<InternalLineItem[]>([]);
  const [adjustments, setAdjustments] = useState<InternalAdjustmentItem[]>([]);
  const [otherCharges, setOtherCharges] = useState<InternalOtherCharge[]>([]);

  // Server Calculation Preview state (authoritative live tax calculation)
  const [serverPreview, setServerPreview] = useState<PurchaseBillCalculationPreview | null>(null);

  // Attachments
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentType, setAttachmentType] = useState<string>('supplier_invoice');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Validation error highlights
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Dirty state tracking for navigation guard
  const [isDirty, setIsDirty] = useState(false);
  const isVoided = bill?.status === 'voided';
  const isLegacy = bill?.calculation_version === 'legacy_v1';

  // Navigation guard
  const { confirmNavigation } = useUnsavedChanges(isDirty && !isVoided);

  const showToast = useCallback((message: any, type: 'success' | 'error') => {
    let msgStr = '';
    if (typeof message === 'string') {
      msgStr = message;
    } else if (message && typeof message === 'object') {
      if (message.detail) {
        msgStr = typeof message.detail === 'string'
          ? message.detail
          : Object.entries(message.detail).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ');
      } else {
        msgStr = Object.entries(message).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ');
      }
    } else {
      msgStr = String(message || 'An error occurred');
    }
    setToast({ message: msgStr, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Supplier options for combobox
  const supplierOptions: ComboboxOption[] = useMemo(() => {
    return suppliers.map((s) => ({
      id: s.id,
      label: s.name,
      subLabel: `Code: ${s.code}${s.gstin ? ` | GSTIN: ${s.gstin}` : ''}${s.phone ? ` | ${s.phone}` : ''}`,
      tags: [s.code, s.name, s.gstin || '', s.phone || '']
    }));
  }, [suppliers]);

  // Track already linked receipt lines across current bill lines
  const alreadyLinkedLineIds = useMemo(() => {
    return lines
      .map((l) => l.tanker_receipt_line_id)
      .filter((id): id is string => Boolean(id));
  }, [lines]);

  // Linked tanker receipts summary chips
  const linkedReceiptChips = useMemo(() => {
    const chips: Array<{
      receiptNumber: string;
      product: string;
      quantity: string;
      unit: string;
      receiptLineId: string;
    }> = [];

    lines.forEach((l) => {
      if (l.tanker_receipt_line_id && l.receipt_number) {
        chips.push({
          receiptNumber: l.receipt_number,
          product: l.description || 'Fuel',
          quantity: l.quantity,
          unit: l.unit || 'LTR',
          receiptLineId: l.tanker_receipt_line_id
        });
      }
    });

    return chips;
  }, [lines]);

  // Load initial data
  const loadInitialData = useCallback(async () => {
    if (!activeOrgId || !activeOutletId) return;
    setLoading(true);
    try {
      const [suppliersData, productsData, itemsData, taxCodesData, canonicalItemsData, taxTreatmentsData] = await Promise.all([
        fetchSuppliers(activeOrgId).catch(() => []),
        fetchFuelProducts(activeOrgId, { status: 'active' }).catch(() => []),
        fetchPurchaseItems(activeOrgId, { is_active: 'true' }).catch(() => []),
        fetchPurchaseTaxCodes(activeOrgId).catch(() => []),
        fetchItemOptions(activeOrgId, { purchasable_only: 'true' }).catch(() => []),
        fetchTaxTreatments(activeOrgId, { purchase_only: 'true' }).catch(() => [])
      ]);
      setSuppliers(suppliersData);
      setFuelProducts(productsData);
      setPurchaseItems(itemsData);
      setTaxCodes(taxCodesData);
      setCanonicalItems(canonicalItemsData);
      setTaxTreatments(taxTreatmentsData);

      if (!isNew && billId) {
        const billData = await fetchPurchaseBillDetail(activeOrgId, activeOutletId, billId);
        setBill(billData);

        const sId = typeof billData.supplier === 'object' && billData.supplier !== null
          ? (billData.supplier as any).id
          : billData.supplier;
        setSupplierId(sId || '');

        setSupplierInvoiceNumber(billData.supplier_invoice_number || '');
        setInvoiceDate(billData.invoice_date);
        setReceivedDate(billData.received_date || '');
        setDueDate(billData.due_date);
        setBillNumber(billData.bill_number);
        setCurrency(billData.currency || 'PKR');
        setNotes(billData.notes || '');
        setIsDuplicateOverride(billData.is_duplicate_override);
        setConflictingBillId(billData.conflicting_bill || '');
        setDuplicateOverrideReason(billData.duplicate_override_reason || '');

        // V2 Fields
        setTaxPriceMode(billData.tax_price_mode || 'exclusive');
        setDiscountMode(billData.discount_mode || 'line');
        setTransactionDiscountMethod(billData.transaction_discount_method || 'none');
        setTransactionDiscountAmount(billData.transaction_discount_amount || '0.00');
        setTransactionDiscountPercentage(billData.transaction_discount_percentage || '');

        setIsPOSOverridden(!!billData.place_of_supply_override);
        setPosState(billData.place_of_supply_state || '');
        setPosStateCode(billData.place_of_supply_state_code || '');
        setPosOverrideReason(billData.place_of_supply_override_reason || '');
        setIsTaxOverridden(!!billData.tax_override);
        setTaxOverrideReason(billData.tax_override_reason || '');

        const loadedLines: InternalLineItem[] = (billData.lines || []).map((l) => {
          const pId = typeof l.product === 'object' && l.product !== null ? (l.product as any).id : l.product;
          const piId = typeof l.purchase_item === 'object' && l.purchase_item !== null ? (l.purchase_item as any).id : l.purchase_item;

          const taxAmt = (
            parseFloat(l.cgst_amount || '0') +
            parseFloat(l.sgst_amount || '0') +
            parseFloat(l.igst_amount || '0') +
            parseFloat(l.cess_amount || '0') +
            parseFloat(l.petroleum_tax_total || '0')
          ).toFixed(2);

          return {
            _id: l.id,
            line_number: l.line_number,
            tanker_receipt_line_id: l.receipt_link || null,
            line_type: l.line_type,
            description: l.description || '',
            product_id: pId || null,
            purchase_item_id: piId || null,
            quantity: l.quantity,
            unit: l.unit,
            unit_rate: l.unit_rate,
            discount_method: l.discount_method || 'none',
            discount_amount: l.discount_amount || '0.00',
            discount_percentage: l.discount_percentage || '',
            tax_treatment: l.tax_treatment || 'gst',
            tax_code_id: l.tax_code || null,
            hsn_sac: l.hsn_sac || '',
            itc_classification: l.itc_classification || 'not_applicable',
            is_petroleum_manual_override: !!l.is_petroleum_manual_override,
            petroleum_tax_amount: l.petroleum_tax_total || '0.00',
            petroleum_manual_override_reason: l.petroleum_manual_override_reason || '',
            quantity_override_reason: l.quantity_override_reason || '',
            notes: l.notes || '',
            calculated_tax: taxAmt,
            calculated_total: l.line_total,
            receipt_number: billData.receipt_links?.find((r) => r.id === l.receipt_link)?.tanker_receipt_number || null,
            delivery_challan_number: billData.receipt_links?.find((r) => r.id === l.receipt_link)?.delivery_challan_number || null,
          };
        });
        setLines(loadedLines);

        // Adjustments (for legacy bills)
        const loadedAdjustments: InternalAdjustmentItem[] = (billData.adjustments || []).map((a) => ({
          _id: a.id,
          label: a.label,
          component_type: a.component_type,
          calculation_type: a.calculation_type,
          percentage_rate: a.percentage_rate || '',
          calculated_amount: a.calculated_amount,
          sequence: a.sequence,
          notes: a.notes || '',
        }));
        setAdjustments(loadedAdjustments);

        // Other Charges (for V2 bills)
        const loadedOtherCharges: InternalOtherCharge[] = (billData.other_charges || []).map((c) => {
          const taxAmt = (
            parseFloat(c.cgst_amount || '0') +
            parseFloat(c.sgst_amount || '0') +
            parseFloat(c.igst_amount || '0')
          ).toFixed(2);

          return {
            _id: c.id || `charge_${Date.now()}`,
            charge_type: c.charge_type,
            description: c.description,
            calculation_type: c.calculation_type,
            percentage_rate: c.percentage_rate || '',
            amount: c.amount || '0.00',
            tax_treatment: c.tax_treatment,
            tax_code_id: c.tax_code || null,
            sequence: c.sequence || 1,
            calculated_tax: taxAmt,
            calculated_total: c.total_amount || c.amount
          };
        });
        setOtherCharges(loadedOtherCharges);
      } else {
        // Initial empty line for rapid keyboard entry
        const defaultProduct = productsData[0];
        setLines([
          {
            _id: `temp_${Date.now()}`,
            line_type: 'fuel',
            product_id: defaultProduct?.id || null,
            quantity: '1',
            unit: 'LTR',
            unit_rate: '0.00',
            discount_method: 'none',
            discount_amount: '0.00',
            description: defaultProduct?.name || '',
            tax_treatment: 'non_gst_petroleum',
            tax_code_id: taxCodesData.find((tc) => tc.tax_regime === 'non_gst_petroleum')?.id || null,
            notes: '',
          },
        ]);
      }
      setIsDirty(false);
    } catch (err: any) {
      console.error(err);
      showToast(err?.data?.detail || err.message || 'Failed to load purchase bill data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, activeOutletId, billId, isNew, showToast]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Load available tanker receipts when supplier changes
  const loadAvailableReceipts = useCallback(async () => {
    if (!activeOrgId || !activeOutletId || !supplierId) return;
    setLoadingReceipts(true);
    try {
      const data = await fetchAvailableTankerReceipts(activeOrgId, activeOutletId, supplierId);
      setAvailableReceipts(data);
    } catch (err: any) {
      console.error(err);
      showToast('Failed to load available tanker receipts for supplier.', 'error');
    } finally {
      setLoadingReceipts(false);
    }
  }, [activeOrgId, activeOutletId, supplierId, showToast]);

  const handleOpenReceiptModal = useCallback(() => {
    if (!supplierId) {
      showToast('Select a supplier first to view available tanker receipts.', 'error');
      return;
    }
    loadAvailableReceipts();
    setShowReceiptModal(true);
  }, [supplierId, loadAvailableReceipts, showToast]);

  // Global Alt+T keyboard shortcut to open receipt selector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        handleOpenReceiptModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleOpenReceiptModal]);

  // Import selected receipt lines into bill grid
  const handleImportReceiptLines = (
    selected: Array<{ receipt: AvailableTankerReceipt; line: AvailableTankerReceiptLine }>
  ) => {
    const petroCode = taxCodes.find((tc) => tc.tax_regime === 'non_gst_petroleum')?.id || null;

    const newLines: InternalLineItem[] = selected.map(({ receipt, line }) => ({
      _id: `linked_${line.id}_${Date.now()}`,
      tanker_receipt_line_id: line.id,
      line_type: 'fuel',
      product_id: line.product_id,
      purchase_item_id: null,
      quantity: line.accepted_book_quantity || line.invoice_quantity || '0.00',
      original_receipt_quantity: line.accepted_book_quantity || line.invoice_quantity || '0.00',
      unit: line.unit || 'LTR',
      unit_rate: line.unit_rate || '0.00',
      discount_method: 'none',
      discount_amount: '0.00',
      tax_treatment: 'non_gst_petroleum',
      tax_code_id: petroCode,
      description: line.product_name,
      receipt_number: receipt.receipt_number,
      delivery_challan_number: receipt.delivery_challan_number || null,
      notes: `Receipt vehicle: ${receipt.vehicle_registration}`,
    }));

    setLines((prev) => {
      // If current lines has only one default empty row, replace it
      if (
        prev.length === 1 &&
        (!prev[0].quantity || prev[0].quantity === '0' || prev[0].unit_rate === '0.00') &&
        !prev[0].tanker_receipt_line_id
      ) {
        return newLines;
      }
      return [...prev, ...newLines];
    });

    setIsDirty(true);
    showToast(`${newLines.length} line(s) imported from tanker receipts.`, 'success');
  };

  // Unlink receipt from bill line
  const handleUnlinkReceiptLine = (receiptLineId: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.tanker_receipt_line_id === receiptLineId) {
          return {
            ...l,
            tanker_receipt_line_id: null,
            original_receipt_quantity: null,
            receipt_number: null,
            quantity_override_reason: null
          };
        }
        return l;
      })
    );
    setIsDirty(true);
  };

  // Product Line Grid actions
  const handleAddProductLine = () => {
    const defaultProduct = fuelProducts[0];
    const newIndex = lines.length;
    setLines((prev) => [
      ...prev,
      {
        _id: `temp_${Date.now()}`,
        line_type: 'fuel',
        product_id: defaultProduct?.id || null,
        purchase_item_id: null,
        quantity: '1',
        unit: 'LTR',
        unit_rate: '0.00',
        discount_method: 'none',
        discount_amount: '0.00',
        tax_treatment: 'non_gst_petroleum',
        tax_code_id: taxCodes.find((tc) => tc.tax_regime === 'non_gst_petroleum')?.id || null,
        description: defaultProduct?.name || '',
        notes: '',
      },
    ]);
    setIsDirty(true);
    setTimeout(() => {
      const el = document.getElementById(`line-product-${newIndex}`);
      el?.focus();
    }, 50);
  };

  const handleUpdateProductLine = (index: number, field: keyof InternalLineItem, value: any) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
    setIsDirty(true);
  };

  const handleRemoveProductLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  // Adjustments actions (legacy)
  const handleAddAdjustment = (type: 'charge' | 'discount' | 'tax' | 'round_off') => {
    const labels = {
      charge: 'Freight & Handling',
      discount: 'Volume Rebate / Discount',
      tax: 'Sales Tax / GST',
      round_off: 'Round Off',
    };
    setAdjustments((prev) => [
      ...prev,
      {
        _id: `adj_${Date.now()}`,
        label: labels[type],
        component_type: type,
        calculation_type: 'fixed_amount',
        percentage_rate: '',
        calculated_amount: '0.00',
        sequence: prev.length + 1,
      },
    ]);
    setIsDirty(true);
  };

  const handleUpdateAdjustment = (index: number, field: keyof InternalAdjustmentItem, value: any) => {
    setAdjustments((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
    setIsDirty(true);
  };

  const handleRemoveAdjustment = (index: number) => {
    setAdjustments((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  // Other Charges actions (V2)
  const handleAddOtherCharge = () => {
    setOtherCharges((prev) => [
      ...prev,
      {
        _id: `charge_${Date.now()}`,
        charge_type: 'freight',
        description: 'Freight & Transport',
        calculation_type: 'fixed_amount',
        amount: '0.00',
        percentage_rate: '',
        tax_treatment: 'taxable',
        tax_code_id: taxCodes.find((tc) => tc.tax_regime === 'gst')?.id || null,
        sequence: prev.length + 1
      }
    ]);
    setIsDirty(true);
  };

  const handleUpdateOtherCharge = (index: number, field: keyof InternalOtherCharge, value: any) => {
    setOtherCharges((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
    setIsDirty(true);
  };

  const handleRemoveOtherCharge = (index: number) => {
    setOtherCharges((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  // Live Server Calculation Preview (debounced)
  const runCalculatePreview = useCallback(async () => {
    if (!activeOrgId || !activeOutletId || !supplierId || isVoided) return;
    if (isLegacy) return; // Legacy bills use client calculations

    try {
      const validLines = lines.filter(
        (l) => (l.product_id || l.purchase_item_id) && parseFloat(l.quantity || '0') > 0
      );
      if (validLines.length === 0) return;

      const previewPayload: Partial<PurchaseBillInput> = {
        supplier_id: supplierId,
        supplier_invoice_number: supplierInvoiceNumber.trim() || 'DRAFT',
        invoice_date: invoiceDate,
        due_date: dueDate,
        tax_price_mode: taxPriceMode,
        discount_mode: discountMode,
        transaction_discount_method: transactionDiscountMethod,
        transaction_discount_amount: transactionDiscountMethod === 'fixed_amount' ? transactionDiscountAmount : undefined,
        transaction_discount_percentage: transactionDiscountMethod === 'percentage' ? transactionDiscountPercentage : undefined,
        place_of_supply_override: isPOSOverridden,
        place_of_supply_state_code: isPOSOverridden ? posStateCode : undefined,
        place_of_supply_override_reason: isPOSOverridden ? posOverrideReason : undefined,
        tax_override: isTaxOverridden,
        tax_override_reason: isTaxOverridden ? taxOverrideReason : undefined,
        lines: lines.map((l, idx) => ({
          line_number: idx + 1,
          line_type: l.line_type || 'fuel',
          item_id: (l as any).item_id || null,
          product_id: l.product_id || null,
          purchase_item_id: l.purchase_item_id || null,
          quantity: l.quantity,
          unit: l.unit || 'LTR',
          unit_rate: l.unit_rate,
          discount_method: l.discount_method || 'none',
          discount_amount: l.discount_method === 'fixed_amount' ? l.discount_amount : undefined,
          discount_percentage: l.discount_method === 'percentage' ? l.discount_percentage : undefined,
          tax_treatment: l.tax_treatment || 'gst',
          tax_code_id: l.tax_code_id || (l as any).tax_treatment_id || null,
          tax_treatment_id: (l as any).tax_treatment_id || l.tax_code_id || null,
          hsn_sac: l.hsn_sac || null,
          itc_classification: l.itc_classification || 'not_applicable',
          is_petroleum_manual_override: l.is_petroleum_manual_override,
          petroleum_tax_amount: l.is_petroleum_manual_override ? l.petroleum_tax_amount : undefined,
          petroleum_manual_override_reason: l.is_petroleum_manual_override ? l.petroleum_manual_override_reason : undefined,
        })),
        other_charges: otherCharges.map((c, idx) => ({
          sequence: idx + 1,
          charge_type: c.charge_type,
          description: c.description,
          calculation_type: c.calculation_type,
          percentage_rate: c.calculation_type === 'percentage' ? c.percentage_rate : null,
          amount: c.calculation_type === 'fixed_amount' ? c.amount : undefined,
          tax_treatment: c.tax_treatment,
          tax_code_id: c.tax_code_id || null,
        }))
      };

      const result = await previewPurchaseBillCalculation(activeOrgId, activeOutletId, previewPayload);
      setServerPreview(result);

      // Populate calculated tax on lines from preview
      if (result.lines && result.lines.length > 0) {
        setLines((prev) =>
          prev.map((line, idx) => {
            const sLine = result.lines[idx];
            if (sLine) {
              const tax = (
                parseFloat(sLine.cgst_amount || '0') +
                parseFloat(sLine.sgst_amount || '0') +
                parseFloat(sLine.igst_amount || '0') +
                parseFloat(sLine.cess_amount || '0') +
                parseFloat(sLine.petroleum_tax_amount || '0')
              ).toFixed(2);
              return {
                ...line,
                calculated_tax: tax,
                calculated_total: sLine.line_total
              };
            }
            return line;
          })
        );
      }

      // Populate calculated tax on other charges
      if (result.other_charges && result.other_charges.length > 0) {
        setOtherCharges((prev) =>
          prev.map((c, idx) => {
            const sc = result.other_charges[idx];
            if (sc) {
              const tax = (
                parseFloat(sc.cgst_amount || '0') +
                parseFloat(sc.sgst_amount || '0') +
                parseFloat(sc.igst_amount || '0')
              ).toFixed(2);
              return {
                ...c,
                calculated_tax: tax,
                calculated_total: sc.total_amount
              };
            }
            return c;
          })
        );
      }
    } catch (err) {
      console.warn('Live preview calculation warning:', err);
    }
  }, [
    activeOrgId,
    activeOutletId,
    supplierId,
    supplierInvoiceNumber,
    invoiceDate,
    dueDate,
    taxPriceMode,
    discountMode,
    transactionDiscountMethod,
    transactionDiscountAmount,
    transactionDiscountPercentage,
    isPOSOverridden,
    posStateCode,
    posOverrideReason,
    isTaxOverridden,
    taxOverrideReason,
    lines,
    otherCharges,
    isVoided,
    isLegacy
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      runCalculatePreview();
    }, 350);
    return () => clearTimeout(timer);
  }, [runCalculatePreview]);

  // Fallback client totals (used for legacy bills or before preview responds)
  const previewTotals = useMemo(() => {
    let grossSubtotal = 0;
    let lineDiscountsTotal = 0;

    lines.forEach((l) => {
      const q = parseFloat(l.quantity) || 0;
      const r = parseFloat(l.unit_rate) || 0;
      let d = 0;
      if (l.discount_method === 'fixed_amount') {
        d = parseFloat(l.discount_amount || '0') || 0;
      } else if (l.discount_method === 'percentage') {
        d = (q * r * (parseFloat(l.discount_percentage || '0') || 0)) / 100;
      } else {
        d = parseFloat(l.discount_amount || '0') || 0;
      }
      grossSubtotal += q * r;
      lineDiscountsTotal += d;
    });

    const percentageBase = Math.max(0, grossSubtotal - lineDiscountsTotal);
    let additionalCharges = 0;
    let taxes = 0;
    let billDiscounts = 0;
    let roundOff = 0;

    adjustments.forEach((adj) => {
      const amount =
        adj.calculation_type === 'percentage'
          ? (percentageBase * (parseFloat(adj.percentage_rate || '0') || 0)) / 100
          : parseFloat(adj.calculated_amount || '0') || 0;

      if (adj.component_type === 'charge') additionalCharges += amount;
      else if (adj.component_type === 'tax') taxes += amount;
      else if (adj.component_type === 'discount') billDiscounts += amount;
      else if (adj.component_type === 'round_off') roundOff += amount;
    });

    const grandTotal = Math.max(
      0,
      grossSubtotal - lineDiscountsTotal + additionalCharges + taxes - billDiscounts + roundOff
    );
    const amountPaid = 0;
    const outstanding = grandTotal - amountPaid;

    return {
      grossSubtotal,
      lineDiscountsTotal,
      percentageBase,
      additionalCharges,
      taxes,
      billDiscounts,
      roundOff,
      grandTotal,
      amountPaid,
      outstanding,
    };
  }, [lines, adjustments]);

  // Quick Create Supplier Handler
  const handleOpenQuickSupplier = (nameQuery: string) => {
    setQuickSupplierName(nameQuery);
    setQuickSupplierCode(nameQuery.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase() || 'SUP');
    setQuickSupplierPhone('');
    setQuickSupplierTaxNumber('');
    setQuickSupplierError(null);
    setShowQuickSupplierModal(true);
  };

  const handleCreateSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId) return;
    if (!quickSupplierName.trim()) {
      setQuickSupplierError('Supplier name is required.');
      return;
    }
    if (!quickSupplierCode.trim()) {
      setQuickSupplierError('Supplier code is required.');
      return;
    }

    setQuickSupplierLoading(true);
    setQuickSupplierError(null);
    try {
      const created = await createSupplier(activeOrgId, {
        name: quickSupplierName.trim(),
        code: quickSupplierCode.trim(),
        phone: quickSupplierPhone.trim() || null,
        tax_number: quickSupplierTaxNumber.trim() || null,
        gst_registration_type: 'pending_review',
        is_active: true,
      });

      setSuppliers((prev) => [...prev, created]);
      setSupplierId(created.id);
      setIsDirty(true);
      setShowQuickSupplierModal(false);
      showToast(`Supplier "${created.name}" created and selected.`, 'success');

      setTimeout(() => {
        const invInput = document.getElementById('field-invoice-number');
        invInput?.focus();
      }, 100);
    } catch (err: any) {
      console.error(err);
      setQuickSupplierError(err?.data?.detail || err?.data?.code?.[0] || err.message || 'Failed to create supplier.');
    } finally {
      setQuickSupplierLoading(false);
    }
  };

  // Save / Save & New Handler
  const handleSave = async (isSaveAndNew: boolean = false) => {
    if (!activeOrgId || !activeOutletId) return;
    setFieldErrors({});

    if (!supplierId) {
      setFieldErrors({ supplier: 'Supplier is required' });
      showToast('Please select a supplier.', 'error');
      const el = document.getElementById('combobox-field-supplier') || document.getElementById('field-supplier');
      el?.focus();
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!supplierInvoiceNumber.trim()) {
      setFieldErrors({ invoiceNumber: 'Invoice number is required' });
      showToast('Supplier Invoice Number is required.', 'error');
      const el = document.getElementById('field-invoice-number');
      el?.focus();
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!invoiceDate) {
      setFieldErrors({ invoiceDate: 'Invoice date is required' });
      showToast('Invoice Date is required.', 'error');
      const el = document.getElementById('field-invoice-date');
      el?.focus();
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!dueDate) {
      setFieldErrors({ dueDate: 'Due date is required' });
      showToast('Due Date is required.', 'error');
      const el = document.getElementById('field-due-date');
      el?.focus();
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (lines.length === 0) {
      showToast('At least one product line item is required.', 'error');
      return;
    }

    // Determine purchase type
    const hasFuel = lines.some((l) => l.line_type === 'fuel' || l.product_id);
    const hasOther = lines.some((l) => l.line_type === 'other' || l.purchase_item_id);
    let determinedPurchaseType: 'fuel' | 'goods_services' | 'mixed' = 'fuel';
    if (hasFuel && hasOther) determinedPurchaseType = 'mixed';
    else if (hasOther) determinedPurchaseType = 'goods_services';

    // Validate duplicate override
    if (isDuplicateOverride) {
      if (!conflictingBillId.trim()) {
        showToast('Conflicting Bill ID is required when performing duplicate override.', 'error');
        return;
      }
      if (!duplicateOverrideReason.trim() || duplicateOverrideReason.trim().length < 5) {
        showToast('Override reason (min 5 characters) is required.', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const payload: PurchaseBillInput = {
        supplier_id: supplierId,
        supplier_invoice_number: supplierInvoiceNumber.trim(),
        invoice_date: invoiceDate,
        received_date: receivedDate || null,
        due_date: dueDate,
        bill_number: billNumber.trim() || null,
        currency: currency || 'PKR',
        notes: notes.trim() || null,
        calculation_version: isLegacy ? 'legacy_v1' : 'item_tax_v2',
        purchase_type: determinedPurchaseType,
        tax_price_mode: taxPriceMode,
        discount_mode: discountMode,
        transaction_discount_method: transactionDiscountMethod,
        transaction_discount_amount: transactionDiscountMethod === 'fixed_amount' ? transactionDiscountAmount : undefined,
        transaction_discount_percentage: transactionDiscountMethod === 'percentage' ? transactionDiscountPercentage : undefined,
        place_of_supply_override: isPOSOverridden,
        place_of_supply_state_code: isPOSOverridden ? posStateCode : undefined,
        place_of_supply_override_reason: isPOSOverridden ? posOverrideReason : undefined,
        tax_override: isTaxOverridden,
        tax_override_reason: isTaxOverridden ? taxOverrideReason : undefined,
        is_duplicate_override: isDuplicateOverride,
        conflicting_bill_id: isDuplicateOverride ? conflictingBillId.trim() : null,
        duplicate_override_reason: isDuplicateOverride ? duplicateOverrideReason.trim() : null,
        lines: lines.map((l, idx) => ({
          line_number: idx + 1,
          tanker_receipt_line_id: l.tanker_receipt_line_id || null,
          line_type: l.line_type || 'fuel',
          description: l.description || null,
          item_id: (l as any).item_id || null,
          product_id: l.product_id || null,
          purchase_item_id: l.purchase_item_id || null,
          quantity: l.quantity,
          unit: l.unit || 'LTR',
          unit_rate: l.unit_rate,
          discount_method: l.discount_method || 'none',
          discount_amount: l.discount_method === 'fixed_amount' ? l.discount_amount : undefined,
          discount_percentage: l.discount_method === 'percentage' ? l.discount_percentage : undefined,
          tax_treatment: l.tax_treatment || 'gst',
          tax_code_id: l.tax_code_id || (l as any).tax_treatment_id || null,
          tax_treatment_id: (l as any).tax_treatment_id || l.tax_code_id || null,
          hsn_sac: l.hsn_sac || null,
          itc_classification: l.itc_classification || 'not_applicable',
          is_petroleum_manual_override: l.is_petroleum_manual_override,
          petroleum_tax_amount: l.is_petroleum_manual_override ? l.petroleum_tax_amount : undefined,
          petroleum_manual_override_reason: l.is_petroleum_manual_override ? l.petroleum_manual_override_reason : undefined,
          quantity_override_reason: l.quantity_override_reason || null,
          notes: l.notes || null,
        })),
        adjustments: isLegacy
          ? adjustments.map((a, idx) => ({
              label: a.label,
              component_type: a.component_type,
              calculation_type: a.calculation_type,
              percentage_rate: a.calculation_type === 'percentage' ? a.percentage_rate : null,
              calculated_amount: a.calculation_type === 'fixed_amount' ? a.calculated_amount : undefined,
              sequence: idx + 1,
              notes: a.notes || null,
            }))
          : undefined,
        other_charges: !isLegacy
          ? otherCharges.map((c, idx) => ({
              sequence: idx + 1,
              charge_type: c.charge_type,
              description: c.description,
              calculation_type: c.calculation_type,
              percentage_rate: c.calculation_type === 'percentage' ? c.percentage_rate : null,
              amount: c.calculation_type === 'fixed_amount' ? c.amount : undefined,
              tax_treatment: c.tax_treatment,
              tax_code_id: c.tax_code_id || null,
            }))
          : undefined,
      };

      if (isNew) {
        const created = await createPurchaseBill(activeOrgId, activeOutletId, payload);
        setIsDirty(false);

        if (isSaveAndNew) {
          setSupplierId('');
          setSupplierInvoiceNumber('');
          setInvoiceDate(new Date().toISOString().split('T')[0]);
          setReceivedDate('');
          const d = new Date();
          d.setDate(d.getDate() + 30);
          setDueDate(d.toISOString().split('T')[0]);
          setBillNumber('');
          setNotes('');
          setIsDuplicateOverride(false);
          setConflictingBillId('');
          setDuplicateOverrideReason('');
          setDuplicateDetected(false);
          setServerPreview(null);
          setOtherCharges([]);
          setLines([
            {
              _id: `temp_${Date.now()}`,
              line_type: 'fuel',
              product_id: fuelProducts[0]?.id || null,
              quantity: '1',
              unit: 'LTR',
              unit_rate: '0.00',
              discount_method: 'none',
              discount_amount: '0.00',
              tax_treatment: 'non_gst_petroleum',
              tax_code_id: taxCodes.find((tc) => tc.tax_regime === 'non_gst_petroleum')?.id || null,
              description: fuelProducts[0]?.name || '',
              notes: '',
            },
          ]);
          showToast(`Purchase bill ${created.bill_number} recorded! Ready for next bill.`, 'success');

          setTimeout(() => {
            const el = document.getElementById('field-supplier');
            el?.focus();
          }, 100);
        } else {
          showToast(`Purchase bill ${created.bill_number} recorded successfully!`, 'success');
          setTimeout(() => {
            navigate(`/app/purchases/purchase-bills/${created.id}`);
          }, 500);
        }
      } else if (billId) {
        const updated = await updatePurchaseBill(activeOrgId, activeOutletId, billId, payload);
        setBill(updated);
        setIsDirty(false);
        showToast(`Purchase bill ${updated.bill_number} updated successfully!`, 'success');
      }
    } catch (err: any) {
      console.error(err);
      let errMsg = 'Failed to save purchase bill.';
      if (typeof err?.message === 'string') {
        errMsg = err.message;
      } else if (typeof err?.data?.detail === 'string') {
        errMsg = err.data.detail;
      } else if (err?.data?.detail && typeof err.data.detail === 'object') {
        errMsg = Object.entries(err.data.detail).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ');
      } else if (err?.data?.error) {
        errMsg = typeof err.data.error === 'string' ? err.data.error : JSON.stringify(err.data.error);
      }
      showToast(errMsg, 'error');

      if (
        (err?.data?.conflicting_bill || errMsg.toLowerCase().includes('duplicate') || errMsg.toLowerCase().includes('already exists')) &&
        !isDuplicateOverride
      ) {
        setDuplicateDetected(true);
        if (err?.data?.conflicting_bill) {
          setConflictingBillId(err.data.conflicting_bill);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  // Void Bill Handler
  const handleVoidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || !activeOutletId || !billId) return;
    if (!voidReason.trim() || voidReason.trim().length < 5) {
      setVoidError('A mandatory reason for voiding (min 5 characters) is required.');
      return;
    }

    setVoidLoading(true);
    setVoidError(null);
    try {
      const voided = await voidPurchaseBill(activeOrgId, activeOutletId, billId, voidReason.trim());
      setBill(voided);
      setShowVoidModal(false);
      showToast(`Purchase bill ${voided.bill_number} has been voided.`, 'success');
    } catch (err: any) {
      console.error(err);
      setVoidError(err?.data?.detail || err.message || 'Failed to void purchase bill.');
    } finally {
      setVoidLoading(false);
    }
  };

  // Attachment upload handler
  const handleUploadAttachment = async () => {
    if (!activeOrgId || !activeOutletId || !billId || !selectedFile) return;
    setUploadingAttachment(true);
    try {
      const att = await uploadPurchaseBillAttachment(
        activeOrgId,
        activeOutletId,
        billId,
        selectedFile,
        attachmentType
      );
      setBill((prev) => (prev ? { ...prev, attachments: [...prev.attachments, att] } : prev));
      setSelectedFile(null);
      showToast('Attachment uploaded successfully.', 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err?.data?.detail || err.message || 'Failed to upload attachment.', 'error');
    } finally {
      setUploadingAttachment(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto var(--space-sm)' }} />
        <span>Loading purchase bill workspace...</span>
      </div>
    );
  }

  // Authoritative display totals: Prefer serverPreview if available, else bill or previewTotals
  const displayedSubtotal = serverPreview ? parseFloat(serverPreview.subtotal) : (bill ? parseFloat(bill.subtotal) : previewTotals.grossSubtotal);
  const displayedLineDiscounts = serverPreview ? parseFloat(serverPreview.discount_total) : (bill ? parseFloat(bill.discount_total) : previewTotals.lineDiscountsTotal);
  const displayedTransactionDiscount = transactionDiscountMethod !== 'none'
    ? (serverPreview ? parseFloat(serverPreview.discount_total) : 0)
    : 0;
  const displayedTaxableValue = serverPreview ? parseFloat(serverPreview.taxable_value_total) : (bill?.taxable_value_total ? parseFloat(bill.taxable_value_total) : undefined);
  const displayedCgst = serverPreview ? parseFloat(serverPreview.cgst_total) : (bill?.cgst_total ? parseFloat(bill.cgst_total) : 0);
  const displayedSgst = serverPreview ? parseFloat(serverPreview.sgst_total) : (bill?.sgst_total ? parseFloat(bill.sgst_total) : 0);
  const displayedIgst = serverPreview ? parseFloat(serverPreview.igst_total) : (bill?.igst_total ? parseFloat(bill.igst_total) : 0);
  const displayedGstCess = serverPreview ? parseFloat(serverPreview.gst_cess_total) : (bill?.gst_cess_total ? parseFloat(bill.gst_cess_total) : 0);
  const displayedPetroTax = serverPreview ? parseFloat(serverPreview.petroleum_tax_total) : (bill?.petroleum_tax_total ? parseFloat(bill.petroleum_tax_total) : (isLegacy ? previewTotals.taxes : 0));
  const displayedOtherChargesSubtotal = serverPreview ? parseFloat(serverPreview.other_charges_subtotal) : (bill?.other_charges_subtotal ? parseFloat(bill.other_charges_subtotal) : 0);
  const displayedOtherChargesTax = serverPreview ? parseFloat(serverPreview.other_charges_tax_total) : (bill?.other_charges_tax_total ? parseFloat(bill.other_charges_tax_total) : 0);
  const displayedRoundOff = serverPreview ? parseFloat(serverPreview.round_off_amount) : (bill ? parseFloat(bill.round_off_amount) : previewTotals.roundOff);
  const displayedGrandTotal = serverPreview ? parseFloat(serverPreview.grand_total) : (bill ? parseFloat(bill.grand_total) : previewTotals.grandTotal);
  const displayedOutstanding = serverPreview ? parseFloat(serverPreview.grand_total) : (bill ? parseFloat(bill.outstanding_amount) : previewTotals.outstanding);
  const displayedIsInterstate = serverPreview ? serverPreview.is_interstate : (bill?.is_interstate || false);
  const displayedPOSState = serverPreview ? serverPreview.place_of_supply_state : (bill?.place_of_supply_state || posState || null);
  const displayedPOSStateCode = serverPreview ? serverPreview.place_of_supply_state_code : (bill?.place_of_supply_state_code || posStateCode || null);

  return (
    <div
      className="purchase-bill-workspace"
      style={{
        padding: 'var(--space-md) var(--space-lg) 80px var(--space-lg)',
        maxWidth: '1440px',
        margin: '0 auto',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-main)'
      }}
    >
      {/* Toast Notification */}
      {toast && (
        <div
          className={`toast toast-${toast.type}`}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-xs)',
            padding: 'var(--space-sm) var(--space-md)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            background: toast.type === 'success' ? '#10b981' : '#ef4444',
            color: '#ffffff',
            fontWeight: 500,
            fontSize: '0.875rem'
          }}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{typeof toast.message === 'string' ? toast.message : JSON.stringify(toast.message)}</span>
        </div>
      )}

      {/* Workspace Sub-header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <button
            type="button"
            onClick={() => confirmNavigation(() => navigate('/app/purchases/purchase-bills'))}
            className="btn-icon"
            title="Back to Purchase Bills"
          >
            <ArrowLeft size={18} />
          </button>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
            {isNew ? 'New Unified Purchase Bill' : `Edit Purchase Bill — ${bill?.bill_number}`}
          </h2>
          {isVoided ? (
            <span className="badge badge-danger">Voided</span>
          ) : !isNew ? (
            <span className="badge badge-success">Active</span>
          ) : null}

          {isLegacy ? (
            <span className="badge badge-secondary" title="Historical bill using original Milestone 12 calculation">
              Legacy V1 Bill
            </span>
          ) : (
            <span className="badge badge-info" title="Unified GST & Petroleum engine">
              Unified V2
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isNew && !isVoided && (
            <button
              type="button"
              onClick={() => {
                setShowVoidModal(true);
                setVoidReason('');
                setVoidError(null);
              }}
              className="btn btn-outline-danger btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Ban size={14} />
              <span>Void Bill</span>
            </button>
          )}
        </div>
      </div>

      {/* Legacy Mode Notice */}
      {isLegacy && (
        <div className="alert alert-info" style={{ marginBottom: 'var(--space-sm)', padding: '8px 12px', fontSize: '0.8rem' }}>
          <strong>Legacy Purchase Bill:</strong> This historical bill is opened in legacy compatibility mode with original adjustment components to preserve exact accounting numbers.
        </div>
      )}

      {/* Void Warning Banner */}
      {isVoided && bill && (
        <div className="alert alert-danger" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-sm) var(--space-md)' }}>
          <strong>Bill Voided: </strong> Voided on {bill.voided_at ? new Date(bill.voided_at).toLocaleString() : ''} by {bill.voided_by_name || 'Staff'}. Reason: <em>{bill.void_reason || 'N/A'}</em>
        </div>
      )}

      {/* 1. Compact Transaction Header */}
      <div className="card" style={{ padding: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
        {/* Row 1: Supplier, Supplier Invoice Number, Invoice Date, Due Date */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-sm)',
            alignItems: 'start'
          }}
        >
          <div>
            <label className="label" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
              Supplier <span style={{ color: 'var(--color-danger-text)' }}>*</span>
            </label>
            <SearchableCombobox
              id="field-supplier"
              value={supplierId}
              options={supplierOptions}
              placeholder="Search or select supplier..."
              disabled={isVoided || (!isNew && lines.some((l) => l.tanker_receipt_line_id))}
              autoFocus={isNew}
              tabIndex={1}
              error={fieldErrors.supplier}
              onAddNew={canCreateSupplier ? handleOpenQuickSupplier : undefined}
              addNewLabel="Add Supplier"
              onSelectAdvance={() => {
                document.getElementById('field-invoice-number')?.focus();
              }}
              onChange={(id) => {
                setSupplierId(id);
                setIsDirty(true);
                setFieldErrors((prev) => ({ ...prev, supplier: '' }));
              }}
            />
          </div>

          <div>
            <label className="label" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
              Supplier Invoice # <span style={{ color: 'var(--color-danger-text)' }}>*</span>
            </label>
            <input
              id="field-invoice-number"
              type="text"
              className={`input ${fieldErrors.invoiceNumber ? 'input-error' : ''}`}
              style={{ height: '36px', fontSize: '0.85rem', fontFamily: 'monospace' }}
              placeholder="e.g. INV-98124"
              value={supplierInvoiceNumber}
              disabled={isVoided}
              tabIndex={2}
              onChange={(e) => {
                setSupplierInvoiceNumber(e.target.value);
                setIsDirty(true);
                setFieldErrors((prev) => ({ ...prev, invoiceNumber: '' }));
              }}
            />
          </div>

          <div>
            <label className="label" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
              Invoice Date <span style={{ color: 'var(--color-danger-text)' }}>*</span>
            </label>
            <input
              id="field-invoice-date"
              type="date"
              className="input"
              style={{ height: '36px', fontSize: '0.85rem' }}
              value={invoiceDate}
              disabled={isVoided}
              tabIndex={3}
              onChange={(e) => {
                setInvoiceDate(e.target.value);
                setIsDirty(true);
              }}
            />
          </div>

          <div>
            <label className="label" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
              Due Date <span style={{ color: 'var(--color-danger-text)' }}>*</span>
            </label>
            <input
              id="field-due-date"
              type="date"
              className="input"
              style={{ height: '36px', fontSize: '0.85rem' }}
              value={dueDate}
              disabled={isVoided}
              tabIndex={4}
              onChange={(e) => {
                setDueDate(e.target.value);
                setIsDirty(true);
              }}
            />
          </div>
        </div>

        {/* Row 2: Received Date, Internal Bill Number, Link Tanker Receipt Action */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-sm)',
            alignItems: 'flex-end',
            marginTop: 'var(--space-sm)',
            paddingTop: 'var(--space-sm)',
            borderTop: '1px solid var(--border-color)'
          }}
        >
          <div>
            <label className="label" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
              Received Date (Office Entry)
            </label>
            <input
              id="field-received-date"
              type="date"
              className="input"
              style={{ height: '34px', fontSize: '0.85rem' }}
              value={receivedDate}
              disabled={isVoided}
              tabIndex={5}
              onChange={(e) => {
                setReceivedDate(e.target.value);
                setIsDirty(true);
              }}
            />
          </div>

          <div>
            <label className="label" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
              Internal Bill #
            </label>
            <input
              type="text"
              className="input"
              style={{ height: '34px', fontSize: '0.85rem', fontFamily: 'monospace', background: 'var(--bg-main)', color: 'var(--text-muted)' }}
              value={isNew ? 'Assigned when recorded' : bill?.bill_number || ''}
              readOnly
              disabled
              tabIndex={-1}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', height: '34px' }}>
            <button
              type="button"
              onClick={handleOpenReceiptModal}
              disabled={isVoided || !supplierId}
              className="btn btn-secondary btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '34px',
                width: '100%',
                justifyContent: 'center',
                borderColor: 'var(--color-accent)'
              }}
              tabIndex={6}
              title="Link confirmed tanker receipt fuel drops (Alt+T)"
            >
              <LinkIcon size={14} color="var(--color-accent)" />
              <span style={{ fontWeight: 600 }}>Link Tanker Receipt (Alt+T)</span>
              {linkedReceiptChips.length > 0 && (
                <span className="badge badge-primary" style={{ padding: '1px 6px', fontSize: '0.7rem' }}>
                  {linkedReceiptChips.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Row 3 (V2 Unified Settings): Tax Price Mode & Transaction Discount */}
        {!isLegacy && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              alignItems: 'center',
              marginTop: 'var(--space-sm)',
              paddingTop: 'var(--space-sm)',
              borderTop: '1px dashed var(--border-color)',
              fontSize: '0.8rem'
            }}
          >
            {/* Tax Price Mode Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Item Rates:</span>
              <div style={{ display: 'flex', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  disabled={isVoided}
                  className={`btn btn-xs ${taxPriceMode === 'exclusive' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '2px 8px', fontSize: '0.75rem', borderRadius: 0 }}
                  onClick={() => {
                    setTaxPriceMode('exclusive');
                    setIsDirty(true);
                  }}
                >
                  Tax Exclusive
                </button>
                <button
                  type="button"
                  disabled={isVoided}
                  className={`btn btn-xs ${taxPriceMode === 'inclusive' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '2px 8px', fontSize: '0.75rem', borderRadius: 0 }}
                  onClick={() => {
                    setTaxPriceMode('inclusive');
                    setIsDirty(true);
                  }}
                >
                  Tax Inclusive
                </button>
              </div>
            </div>

            {/* Bill-Level Transaction Discount */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Bill Discount:</span>
              <select
                className="input"
                style={{ height: '28px', fontSize: '0.75rem', padding: '2px 6px' }}
                value={transactionDiscountMethod}
                disabled={isVoided}
                onChange={(e: any) => {
                  const m = e.target.value as 'none' | 'fixed_amount' | 'percentage';
                  setTransactionDiscountMethod(m);
                  if (m === 'none') {
                    setTransactionDiscountAmount('0.00');
                    setTransactionDiscountPercentage('');
                  } else if (m === 'percentage') {
                    setTransactionDiscountAmount('0.00');
                  } else if (m === 'fixed_amount') {
                    setTransactionDiscountPercentage('');
                  }
                  setIsDirty(true);
                }}
              >
                <option value="none">None</option>
                <option value="fixed_amount">Fixed Amount (Rs.)</option>
                <option value="percentage">Percentage (%)</option>
              </select>

              {transactionDiscountMethod === 'fixed_amount' && (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  style={{ width: '90px', height: '28px', fontSize: '0.8rem', padding: '2px 6px', textAlign: 'right', fontFamily: 'monospace' }}
                  placeholder="0.00"
                  value={transactionDiscountAmount}
                  disabled={isVoided}
                  onChange={(e) => {
                    setTransactionDiscountAmount(e.target.value);
                    setIsDirty(true);
                  }}
                />
              )}

              {transactionDiscountMethod === 'percentage' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="input"
                    style={{ width: '70px', height: '28px', fontSize: '0.8rem', padding: '2px 6px', textAlign: 'right' }}
                    placeholder="0%"
                    value={transactionDiscountPercentage}
                    disabled={isVoided}
                    onChange={(e) => {
                      setTransactionDiscountPercentage(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                  <span>%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Duplicate Invoice Override Panel */}
        {(duplicateDetected || isDuplicateOverride) && (
          <div
            style={{
              marginTop: 'var(--space-sm)',
              padding: 'var(--space-sm) var(--space-md)',
              background: 'var(--color-warning-bg)',
              border: '1px solid var(--color-warning-text)',
              borderRadius: 'var(--radius-md)'
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                color: 'var(--color-warning-text)',
                fontSize: '0.8rem'
              }}
            >
              <input
                type="checkbox"
                checked={isDuplicateOverride}
                onChange={(e) => {
                  setIsDuplicateOverride(e.target.checked);
                  setIsDirty(true);
                }}
                disabled={isVoided}
                style={{ width: '15px', height: '15px' }}
              />
              <span>Authorise Duplicate Invoice Override</span>
            </label>

            {isDuplicateOverride && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 2fr',
                  gap: 'var(--space-sm)',
                  marginTop: 'var(--space-xs)',
                  paddingTop: 'var(--space-xs)',
                  borderTop: '1px solid rgba(194, 65, 12, 0.2)'
                }}
              >
                <div>
                  <label className="label" style={{ fontSize: '0.7rem', marginBottom: '2px' }}>
                    Conflicting Bill ID / # <span style={{ color: 'var(--color-danger-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    style={{ height: '30px', fontSize: '0.8rem' }}
                    value={conflictingBillId}
                    onChange={(e) => setConflictingBillId(e.target.value)}
                    disabled={isVoided}
                  />
                </div>
                <div>
                  <label className="label" style={{ fontSize: '0.7rem', marginBottom: '2px' }}>
                    Override Reason (Mandatory, min 5 chars) <span style={{ color: 'var(--color-danger-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    style={{ height: '30px', fontSize: '0.8rem' }}
                    value={duplicateOverrideReason}
                    onChange={(e) => setDuplicateOverrideReason(e.target.value)}
                    disabled={isVoided}
                    placeholder="e.g. Supplementary debit invoice issued by supplier..."
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Linked Tanker Receipts Chips */}
      {linkedReceiptChips.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px',
            marginBottom: 'var(--space-xs)',
            padding: '4px 8px',
            background: 'var(--bg-main)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)'
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            Linked Deliveries:
          </span>
          {linkedReceiptChips.map((chip, idx) => (
            <span
              key={`${chip.receiptLineId}-${idx}`}
              className="badge badge-info"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 8px',
                fontSize: '0.75rem',
                fontFamily: 'monospace'
              }}
            >
              <FileCheck size={12} />
              <span>
                {chip.receiptNumber} &bull; {chip.product} &bull; {chip.quantity} {chip.unit}
              </span>
              {!isVoided && (
                <button
                  type="button"
                  onClick={() => handleUnlinkReceiptLine(chip.receiptLineId)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'inherit',
                    padding: 0,
                    marginLeft: '2px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Unlink receipt from bill"
                  aria-label={`Unlink ${chip.receiptNumber}`}
                >
                  &times;
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* 2. Unified Product Line Grid */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <ProductLineGrid
          lines={lines}
          products={fuelProducts}
          purchaseItems={purchaseItems}
          canonicalItems={canonicalItems}
          taxCodes={taxCodes}
          taxTreatments={taxTreatments}
          isVoided={isVoided}
          taxPriceMode={taxPriceMode}
          onUpdateLine={handleUpdateProductLine}
          onRemoveLine={handleRemoveProductLine}
          onAddLine={handleAddProductLine}
          onCreateItem={() => setItemDrawerOpen(true)}
        />
      </div>

      {/* 3. Legacy Adjustments Section (for legacy bills) OR V2 Other Charges Section */}
      {isLegacy ? (
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <AdjustmentSection
            adjustments={adjustments}
            percentageBase={previewTotals.percentageBase}
            isVoided={isVoided}
            onAddAdjustment={handleAddAdjustment}
            onUpdateAdjustment={handleUpdateAdjustment}
            onRemoveAdjustment={handleRemoveAdjustment}
          />
        </div>
      ) : (
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <OtherChargesSection
            charges={otherCharges}
            taxCodes={taxCodes}
            isVoided={isVoided}
            onAddCharge={handleAddOtherCharge}
            onUpdateCharge={handleUpdateOtherCharge}
            onRemoveCharge={handleRemoveOtherCharge}
          />
        </div>
      )}

      {/* 4. Lower Two-Column Section: Left (Notes & Attachments), Right (Totals) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'var(--space-md)',
          alignItems: 'start'
        }}
      >
        {/* Left Column: Notes & Attachments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {/* Notes Card */}
          <div className="card" style={{ padding: 'var(--space-md)', margin: 0 }}>
            <label className="label" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>
              Internal Notes &amp; Remarks
            </label>
            <textarea
              rows={2}
              className="input"
              style={{ width: '100%', minHeight: '50px', fontSize: '0.8rem', resize: 'vertical' }}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setIsDirty(true);
              }}
              disabled={isVoided}
              placeholder="Optional notes, driver references, or purchase remarks..."
            />
          </div>

          {/* Attachments Card */}
          {!isNew && (
            <div className="card" style={{ padding: 'var(--space-md)', margin: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--space-xs)',
                  borderBottom: '1px solid var(--border-color)',
                  paddingBottom: 'var(--space-xs)'
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>Bill Attachments &amp; Scans</span>
              </div>

              {!isVoided && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                  <select
                    className="input"
                    style={{ height: '30px', fontSize: '0.75rem', width: '140px' }}
                    value={attachmentType}
                    onChange={(e) => setAttachmentType(e.target.value)}
                  >
                    <option value="supplier_invoice">Invoice Scan</option>
                    <option value="delivery_challan">Delivery Challan</option>
                    <option value="tax_document">Tax Document</option>
                    <option value="note_reference">Note / Reference</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    type="file"
                    style={{ fontSize: '0.75rem', flex: 1 }}
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={handleUploadAttachment}
                    disabled={!selectedFile || uploadingAttachment}
                    className="btn btn-secondary btn-sm"
                    style={{ height: '30px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                  >
                    <Upload size={12} /> Upload
                  </button>
                </div>
              )}

              {bill?.attachments && bill.attachments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {bill.attachments.map((att) => (
                    <div
                      key={att.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 8px',
                        background: 'var(--bg-main)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem'
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {att.file_name} ({(att.file_size / 1024).toFixed(1)} KB)
                      </span>
                      <a
                        href={getPurchaseBillAttachmentDownloadUrl(activeOrgId!, activeOutletId!, bill.id, att.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-link"
                        style={{ fontSize: '0.75rem' }}
                      >
                        <Download size={13} />
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No attachments uploaded.</span>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Authoritative Totals Panel */}
        <div>
          <TransactionTotalsPanel
            subtotal={displayedSubtotal}
            lineDiscounts={displayedLineDiscounts}
            transactionDiscount={displayedTransactionDiscount}
            taxableValueTotal={displayedTaxableValue}
            cgst={displayedCgst}
            sgst={displayedSgst}
            igst={displayedIgst}
            gstCess={displayedGstCess}
            petroleumTax={displayedPetroTax}
            otherChargesSubtotal={displayedOtherChargesSubtotal}
            otherChargesTax={displayedOtherChargesTax}
            roundOff={displayedRoundOff}
            grandTotal={displayedGrandTotal}
            amountPaid={bill ? parseFloat(bill.amount_paid) : 0}
            outstanding={displayedOutstanding}
            isAuthoritative={!isNew && !!bill || !!serverPreview}
            isInterstate={displayedIsInterstate}
            placeOfSupplyState={displayedPOSState}
            placeOfSupplyStateCode={displayedPOSStateCode}
            onOpenPOSOverride={() => setShowPOSOverrideModal(true)}
          />
        </div>
      </div>

      {/* Sticky Action Footer */}
      <TransactionStickyFooter
        onSave={() => handleSave(false)}
        onSaveAndNew={() => handleSave(true)}
        onCancel={() => confirmNavigation(() => navigate('/app/purchases/purchase-bills'))}
        onOpenHelp={() => setShowShortcutsModal(true)}
        saving={saving}
        isVoided={isVoided}
        isNew={isNew}
      />

      {/* Tanker Receipt Linker Modal (Alt+T) */}
      <TankerReceiptSelectorModal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        receipts={availableReceipts}
        loading={loadingReceipts}
        onImportLines={handleImportReceiptLines}
        alreadyLinkedLineIds={alreadyLinkedLineIds}
      />

      {/* Keyboard Shortcuts Reference Dialog (Ctrl+/) */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* Place of Supply Override Modal */}
      {showPOSOverrideModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="modal-card" style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={18} color="var(--color-accent)" /> Place of Supply Override
              </h3>
              <button type="button" onClick={() => setShowPOSOverrideModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Overriding Place of Supply will change statutory tax resolution between Intra-State (CGST+SGST) and Inter-State (IGST).
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '12px', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={isPOSOverridden}
                onChange={(e) => {
                  setIsPOSOverridden(e.target.checked);
                  setIsDirty(true);
                }}
              />
              <span>Enable Place of Supply Override</span>
            </label>

            {isPOSOverridden && (
              <>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    Destination State Code (2 Digits) *
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    className="form-control"
                    placeholder="e.g. 27, 29, 07"
                    value={posStateCode}
                    onChange={(e) => {
                      setPosStateCode(e.target.value);
                      setIsDirty(true);
                    }}
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    Override Reason (Mandatory, min 5 chars) *
                  </label>
                  <textarea
                    rows={2}
                    className="form-control"
                    placeholder="e.g. Destination of supply delivery is at off-site project depot..."
                    value={posOverrideReason}
                    onChange={(e) => {
                      setPosOverrideReason(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowPOSOverrideModal(false);
                }}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setShowPOSOverrideModal(false);
                  runCalculatePreview();
                }}
              >
                Apply &amp; Recalculate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Create Supplier Modal */}
      {showQuickSupplierModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: 'var(--space-md)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-md)',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: 'var(--space-xs)'
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Add New Supplier</h3>
              <button
                type="button"
                onClick={() => setShowQuickSupplierModal(false)}
                className="btn-icon"
                style={{ padding: '2px' }}
              >
                &times;
              </button>
            </div>

            {quickSupplierError && (
              <div
                className="alert alert-danger"
                style={{ marginBottom: 'var(--space-sm)', padding: 'var(--space-xs) var(--space-sm)' }}
              >
                {quickSupplierError}
              </div>
            )}

            <form onSubmit={handleCreateSupplierSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                <div>
                  <label className="label" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
                    Supplier Name <span style={{ color: 'var(--color-danger-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    required
                    style={{ height: '34px', fontSize: '0.85rem' }}
                    value={quickSupplierName}
                    onChange={(e) => setQuickSupplierName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="label" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
                    Supplier Code <span style={{ color: 'var(--color-danger-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    required
                    placeholder="e.g. SHELL-PK"
                    style={{ height: '34px', fontSize: '0.85rem', fontFamily: 'monospace' }}
                    value={quickSupplierCode}
                    onChange={(e) => setQuickSupplierCode(e.target.value.toUpperCase())}
                  />
                </div>

                <div>
                  <label className="label" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
                    Phone Number
                  </label>
                  <input
                    type="text"
                    className="input"
                    style={{ height: '34px', fontSize: '0.85rem' }}
                    value={quickSupplierPhone}
                    onChange={(e) => setQuickSupplierPhone(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
                    Tax / GSTIN Number
                  </label>
                  <input
                    type="text"
                    className="input"
                    style={{ height: '34px', fontSize: '0.85rem', fontFamily: 'monospace' }}
                    value={quickSupplierTaxNumber}
                    onChange={(e) => setQuickSupplierTaxNumber(e.target.value)}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 'var(--space-sm)',
                  marginTop: 'var(--space-md)',
                  paddingTop: 'var(--space-sm)',
                  borderTop: '1px solid var(--border-color)'
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowQuickSupplierModal(false)}
                  className="btn btn-secondary btn-sm"
                  disabled={quickSupplierLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={quickSupplierLoading}
                >
                  {quickSupplierLoading ? 'Saving...' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Void Confirmation Modal */}
      {showVoidModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: 'var(--space-md)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-md)',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: 'var(--space-xs)'
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-danger-text)' }}>
                Void Purchase Bill
              </h3>
              <button
                type="button"
                onClick={() => setShowVoidModal(false)}
                className="btn-icon"
                style={{ padding: '2px' }}
              >
                &times;
              </button>
            </div>

            {voidError && (
              <div
                className="alert alert-danger"
                style={{ marginBottom: 'var(--space-sm)', padding: 'var(--space-xs) var(--space-sm)' }}
              >
                {voidError}
              </div>
            )}

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
              Voiding will reverse all supplier payables liabilities and release linked tanker receipt quantities. This action is irreversible.
            </p>

            <form onSubmit={handleVoidSubmit}>
              <div>
                <label className="label" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
                  Void Reason (Mandatory, min 5 chars) <span style={{ color: 'var(--color-danger-text)' }}>*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  className="input"
                  style={{ width: '100%', fontSize: '0.85rem', resize: 'vertical' }}
                  placeholder="Explanation for voiding this purchase bill (min 5 characters)..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  autoFocus
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 'var(--space-sm)',
                  marginTop: 'var(--space-md)',
                  paddingTop: 'var(--space-sm)',
                  borderTop: '1px solid var(--border-color)'
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowVoidModal(false)}
                  className="btn btn-secondary btn-sm"
                  disabled={voidLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger btn-sm"
                  disabled={voidLoading}
                >
                  {voidLoading ? 'Voiding...' : 'Confirm Void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Canonical Item Drawer (Quick Create without losing bill state) */}
      <ItemDrawer
        isOpen={itemDrawerOpen}
        onClose={() => setItemDrawerOpen(false)}
        onSaved={async () => {
          if (activeOrgId) {
            const updated = await fetchItemOptions(activeOrgId, { purchasable_only: 'true' }).catch(() => []);
            setCanonicalItems(updated);
          }
        }}
      />
    </div>
  );
};
