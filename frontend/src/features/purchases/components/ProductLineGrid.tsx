import React, { useRef, useEffect, useMemo } from 'react';
import { SearchableCombobox, type ComboboxOption } from '@/components/forms/SearchableCombobox';
import type { PurchaseBillLineInput, PurchaseTaxCode, PurchaseItem } from '@/features/purchases/types';
import type { FuelProduct, ItemOption, TaxTreatment } from '@/api/client';
import { Trash2, AlertCircle, Plus } from 'lucide-react';

export interface InternalLineItem extends PurchaseBillLineInput {
  _id: string;
  original_receipt_quantity?: string | null;
  receipt_number?: string | null;
  delivery_challan_number?: string | null;
  calculated_tax?: string;
  calculated_total?: string;
  product_name_snapshot?: string | null;
}

export interface ProductLineGridProps {
  lines: InternalLineItem[];
  products?: FuelProduct[];
  purchaseItems?: PurchaseItem[];
  canonicalItems?: ItemOption[];
  taxCodes?: PurchaseTaxCode[];
  taxTreatments?: TaxTreatment[];
  isVoided: boolean;
  taxPriceMode?: 'exclusive' | 'inclusive';
  onUpdateLine: (index: number, field: keyof InternalLineItem, value: any) => void;
  onRemoveLine: (index: number) => void;
  onAddLine: () => void;
  onCreateItem?: () => void;
}

export const ProductLineGrid: React.FC<ProductLineGridProps> = ({
  lines,
  products = [],
  purchaseItems = [],
  canonicalItems = [],
  taxCodes = [],
  taxTreatments = [],
  isVoided,
  taxPriceMode = 'exclusive',
  onUpdateLine,
  onRemoveLine,
  onAddLine,
  onCreateItem
}) => {
  const activeRowRef = useRef<number>(0);

  // Map Canonical Items, FuelProducts and PurchaseItems to combobox options
  const itemOptions: ComboboxOption[] = useMemo(() => {
    if (canonicalItems && canonicalItems.length > 0) {
      return canonicalItems.map((ci) => ({
        id: ci.id,
        label: ci.name,
        subLabel: `${ci.item_type.toUpperCase().replace('_', ' ')} | Code: ${ci.code} | Unit: ${ci.base_unit_code} | HSN: ${ci.hsn_sac || 'N/A'}`,
        tags: [ci.code, ci.name, ci.item_type, ci.hsn_sac || '', ci.base_unit_code]
      }));
    }

    const fuelOpts: ComboboxOption[] = products.map((p) => ({
      id: `fuel:${p.id}`,
      label: p.name,
      subLabel: `Fuel Code: ${p.code} (Petroleum)`,
      tags: [p.code, p.name, 'fuel', 'petroleum', 'diesel', 'petrol']
    }));

    const purchaseItemOpts: ComboboxOption[] = purchaseItems.map((item) => ({
      id: `item:${item.id}`,
      label: item.name,
      subLabel: `${item.item_type === 'goods' ? 'Goods' : 'Service'} | Code: ${item.code} | HSN: ${item.hsn_sac || 'N/A'}`,
      tags: [item.code, item.name, item.item_type, item.hsn_sac || '', 'goods', 'service', 'item']
    }));

    return [...fuelOpts, ...purchaseItemOpts];
  }, [canonicalItems, products, purchaseItems]);

  // Handle Alt+R shortcut to add row, and Alt+Delete to delete row
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isVoided) return;

      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        onAddLine();
      } else if (e.altKey && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        const activeIdx = activeRowRef.current;
        if (activeIdx >= 0 && activeIdx < lines.length && lines.length > 1) {
          const line = lines[activeIdx];
          const hasData = parseFloat(line.quantity || '0') > 0 || parseFloat(line.unit_rate || '0') > 0;
          if (hasData) {
            if (window.confirm(`Remove line ${activeIdx + 1}?`)) {
              onRemoveLine(activeIdx);
            }
          } else {
            onRemoveLine(activeIdx);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lines, isVoided, onAddLine, onRemoveLine]);

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    currentField: 'quantity' | 'unit' | 'rate' | 'discount'
  ) => {
    activeRowRef.current = rowIndex;

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      const isLastRow = rowIndex === lines.length - 1;

      if (currentField === 'quantity') {
        const rateInput = document.getElementById(`line-rate-${rowIndex}`);
        rateInput?.focus();
      } else if (currentField === 'unit') {
        const rateInput = document.getElementById(`line-rate-${rowIndex}`);
        rateInput?.focus();
      } else if (currentField === 'rate') {
        const discountInput = document.getElementById(`line-discount-${rowIndex}`);
        discountInput?.focus();
      } else if (currentField === 'discount') {
        if (isLastRow) {
          onAddLine();
        } else {
          const nextProduct = document.getElementById(`line-product-${rowIndex + 1}`);
          nextProduct?.focus();
        }
      }
    }
  };

  return (
    <div className="card purchase-line-grid" style={{ padding: 0, overflow: 'visible', margin: 0 }}>
      <div
        className="card-header"
        style={{
          padding: '8px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'rgba(248, 250, 252, 0.8)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Line Items</span>
          <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
            {taxPriceMode === 'inclusive' ? 'Rates Tax-Inclusive' : 'Rates Tax-Exclusive'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {onCreateItem && !isVoided && (
            <button
              type="button"
              onClick={onCreateItem}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.75rem' }}
              title="Create a new Canonical Item in Item Master"
            >
              <Plus size={13} />
              <span>New Item</span>
            </button>
          )}
          {!isVoided && (
            <button
              type="button"
              onClick={onAddLine}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.75rem' }}
              title="Add product row (Alt+R)"
            >
              <Plus size={13} />
              <span>Add Row (Alt+R)</span>
            </button>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ width: '32px', textAlign: 'center', padding: '6px' }}>#</th>
              <th style={{ minWidth: '220px', padding: '6px 8px' }}>Item / Product</th>
              <th style={{ width: '120px', padding: '6px 8px' }}>Tanker Receipt</th>
              <th style={{ width: '90px', padding: '6px 8px' }}>HSN/SAC</th>
              <th style={{ width: '95px', textAlign: 'right', padding: '6px 8px' }}>Qty</th>
              <th style={{ width: '65px', padding: '6px 8px' }}>Unit</th>
              <th style={{ width: '100px', textAlign: 'right', padding: '6px 8px' }}>
                Rate {taxPriceMode === 'inclusive' ? '(Incl.)' : ''}
              </th>
              <th style={{ width: '130px', padding: '6px 8px' }}>Discount</th>
              <th style={{ width: '130px', padding: '6px 8px' }}>Tax Treatment</th>
              <th style={{ width: '85px', textAlign: 'right', padding: '6px 8px' }}>Tax</th>
              <th style={{ width: '105px', textAlign: 'right', padding: '6px 8px' }}>Amount</th>
              <th style={{ width: '36px', textAlign: 'center', padding: '6px' }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const isLinked = !!line.tanker_receipt_line_id;
              const isQtyOverridden =
                isLinked &&
                line.original_receipt_quantity &&
                line.quantity !== line.original_receipt_quantity;

              const gross = (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_rate) || 0);

              // Discount calculation based on explicit discount_method
              let discount = 0;
              const dMethod = line.discount_method || 'none';
              if (dMethod === 'fixed_amount') {
                discount = parseFloat(line.discount_amount || '0') || 0;
              } else if (dMethod === 'percentage') {
                const pct = parseFloat(line.discount_percentage || '0') || 0;
                discount = (gross * pct) / 100;
              }

              const lineTax = parseFloat(line.calculated_tax || '0') || 0;
              const lineAmount =
                parseFloat(line.calculated_total || '0') ||
                (taxPriceMode === 'inclusive'
                  ? Math.max(0, gross - discount)
                  : Math.max(0, gross - discount) + lineTax);

              const selectedOptionValue = (line as any).item_id
                ? (line as any).item_id
                : line.product_id
                ? `fuel:${line.product_id}`
                : line.purchase_item_id
                ? `item:${line.purchase_item_id}`
                : '';

              const isPetroleum = line.tax_treatment === 'non_gst_petroleum';

              return (
                <React.Fragment key={line._id}>
                  <tr
                    style={{
                      borderBottom: isQtyOverridden || line.is_petroleum_manual_override ? 'none' : '1px solid var(--border-color)',
                      background: idx % 2 === 0 ? '#ffffff' : 'rgba(248, 250, 252, 0.5)'
                    }}
                    onFocus={() => {
                      activeRowRef.current = idx;
                    }}
                  >
                    {/* Row Index */}
                    <td style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', padding: '4px' }}>
                      {idx + 1}
                    </td>

                    {/* Product / Item Combobox */}
                    <td style={{ padding: '4px 6px' }}>
                      <SearchableCombobox
                        id={`line-product-${idx}`}
                        value={selectedOptionValue}
                        options={itemOptions}
                        placeholder="Select canonical item..."
                        disabled={isVoided}
                        onChange={(selectedId) => {
                          if (!selectedId) {
                            onUpdateLine(idx, 'product_id', null);
                            onUpdateLine(idx, 'purchase_item_id', null);
                            onUpdateLine(idx, 'item_id' as any, null);
                            return;
                          }

                          const canonicalItem = canonicalItems.find((ci) => ci.id === selectedId);
                          if (canonicalItem) {
                            const cId = selectedId;
                            const cItem = canonicalItem;
                            onUpdateLine(idx, 'item_id' as any, cId);
                            onUpdateLine(idx, 'product_id', null);
                            onUpdateLine(idx, 'purchase_item_id', null);
                            onUpdateLine(idx, 'line_type', cItem?.item_type === 'fuel' ? 'fuel' : 'other');
                            if (cItem) {
                              onUpdateLine(idx, 'description', cItem.name);
                              onUpdateLine(idx, 'unit', cItem.base_unit_code || 'LTR');
                              onUpdateLine(idx, 'hsn_sac', cItem.hsn_sac || '');
                              if (cItem.current_purchase_tax_treatment) {
                                onUpdateLine(idx, 'tax_treatment_id' as any, cItem.current_purchase_tax_treatment.tax_treatment_id);
                                onUpdateLine(idx, 'tax_code_id', cItem.current_purchase_tax_treatment.tax_treatment_id);
                                onUpdateLine(idx, 'tax_treatment', cItem.current_purchase_tax_treatment.tax_regime);
                                onUpdateLine(idx, 'itc_classification', cItem.current_purchase_tax_treatment.default_itc_classification);
                              } else if (cItem.item_type === 'fuel') {
                                onUpdateLine(idx, 'tax_treatment', 'non_gst_petroleum');
                                const allTreatments = taxTreatments.length > 0 ? taxTreatments : taxCodes;
                                const petroCode = allTreatments.find((tc) => tc.tax_regime === 'non_gst_petroleum');
                                if (petroCode) {
                                  onUpdateLine(idx, 'tax_code_id', petroCode.id);
                                  onUpdateLine(idx, 'tax_treatment_id' as any, petroCode.id);
                                }
                              }
                            }
                          } else if (selectedId.startsWith('fuel:')) {
                            const fId = selectedId.replace('fuel:', '');
                            const fuel = products.find((p) => p.id === fId);
                            onUpdateLine(idx, 'product_id', fId);
                            onUpdateLine(idx, 'purchase_item_id', null);
                            onUpdateLine(idx, 'item_id' as any, null);
                            onUpdateLine(idx, 'line_type', 'fuel');
                            onUpdateLine(idx, 'tax_treatment', 'non_gst_petroleum');
                            onUpdateLine(idx, 'unit', 'LTR');
                            if (fuel) onUpdateLine(idx, 'description', fuel.name);

                            // Auto-set petroleum tax code if available
                            const petroCode = (taxTreatments.length > 0 ? taxTreatments : taxCodes).find((tc) => tc.tax_regime === 'non_gst_petroleum');
                            if (petroCode) {
                              onUpdateLine(idx, 'tax_code_id', petroCode.id);
                              onUpdateLine(idx, 'tax_treatment_id' as any, petroCode.id);
                            }
                          } else if (selectedId.startsWith('item:')) {
                            const pId = selectedId.replace('item:', '');
                            const item = purchaseItems.find((i) => i.id === pId);
                            onUpdateLine(idx, 'purchase_item_id', pId);
                            onUpdateLine(idx, 'product_id', null);
                            onUpdateLine(idx, 'item_id' as any, null);
                            onUpdateLine(idx, 'line_type', 'other');
                            if (item) {
                              onUpdateLine(idx, 'description', item.name);
                              onUpdateLine(idx, 'unit', item.unit);
                              onUpdateLine(idx, 'hsn_sac', item.hsn_sac || '');
                              onUpdateLine(idx, 'tax_treatment', item.purchase_tax_treatment);
                              onUpdateLine(idx, 'tax_code_id', item.default_purchase_tax_code || null);
                              onUpdateLine(idx, 'tax_treatment_id' as any, item.default_purchase_tax_code || null);
                              onUpdateLine(idx, 'itc_classification', item.default_itc_classification);
                            }
                          }
                        }}
                      />
                    </td>

                    {/* Tanker Receipt Ref */}
                    <td style={{ padding: '4px 6px' }}>
                      {isLinked ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span
                            className="badge badge-info"
                            style={{
                              fontSize: '0.7rem',
                              fontFamily: 'monospace',
                              whiteSpace: 'nowrap',
                              display: 'inline-block'
                            }}
                            title={`Receipt: ${line.receipt_number || 'Linked'}`}
                          >
                            {line.receipt_number || 'Linked'}
                          </span>
                          {line.delivery_challan_number && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              DC: {line.delivery_challan_number}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Direct</span>
                      )}
                    </td>

                    {/* HSN/SAC */}
                    <td style={{ padding: '4px 6px' }}>
                      <input
                        type="text"
                        className="input"
                        style={{ height: '32px', fontSize: '0.75rem', padding: '2px 6px', fontFamily: 'monospace' }}
                        value={line.hsn_sac || ''}
                        disabled={isVoided}
                        placeholder="HSN/SAC"
                        onChange={(e) => onUpdateLine(idx, 'hsn_sac', e.target.value)}
                      />
                    </td>

                    {/* Quantity */}
                    <td style={{ padding: '4px 6px' }}>
                      <input
                        id={`line-qty-${idx}`}
                        type="number"
                        step="0.01"
                        className="input"
                        style={{ textAlign: 'right', padding: '4px 8px', height: '32px', fontSize: '0.85rem' }}
                        value={line.quantity}
                        disabled={isVoided}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => onUpdateLine(idx, 'quantity', e.target.value)}
                        onKeyDown={(e) => handleCellKeyDown(e, idx, 'quantity')}
                      />
                    </td>

                    {/* Unit */}
                    <td style={{ padding: '4px 6px' }}>
                      <input
                        id={`line-unit-${idx}`}
                        type="text"
                        className="input"
                        style={{ padding: '4px 6px', height: '32px', fontSize: '0.8rem' }}
                        value={line.unit || 'LTR'}
                        disabled={isVoided}
                        onChange={(e) => onUpdateLine(idx, 'unit', e.target.value)}
                        onKeyDown={(e) => handleCellKeyDown(e, idx, 'unit')}
                      />
                    </td>

                    {/* Unit Rate */}
                    <td style={{ padding: '4px 6px' }}>
                      <input
                        id={`line-rate-${idx}`}
                        type="number"
                        step="0.01"
                        className="input"
                        style={{ textAlign: 'right', padding: '4px 8px', height: '32px', fontSize: '0.85rem', fontFamily: 'monospace' }}
                        value={line.unit_rate}
                        disabled={isVoided}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => onUpdateLine(idx, 'unit_rate', e.target.value)}
                        onKeyDown={(e) => handleCellKeyDown(e, idx, 'rate')}
                      />
                    </td>

                    {/* Discount with Explicit Method */}
                    <td style={{ padding: '4px 6px' }}>
                      <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                        <select
                          className="input"
                          style={{ width: '48px', height: '32px', fontSize: '0.75rem', padding: '2px' }}
                          value={dMethod}
                          disabled={isVoided}
                          onChange={(e: any) => {
                            const newMethod = e.target.value as 'none' | 'fixed_amount' | 'percentage';
                            onUpdateLine(idx, 'discount_method', newMethod);
                            if (newMethod === 'none') {
                              onUpdateLine(idx, 'discount_amount', '0.00');
                              onUpdateLine(idx, 'discount_percentage', '');
                            } else if (newMethod === 'percentage') {
                              onUpdateLine(idx, 'discount_amount', '0.00');
                            } else if (newMethod === 'fixed_amount') {
                              onUpdateLine(idx, 'discount_percentage', '');
                            }
                          }}
                        >
                          <option value="none">--</option>
                          <option value="fixed_amount">Rs.</option>
                          <option value="percentage">%</option>
                        </select>

                        {dMethod === 'percentage' ? (
                          <input
                            id={`line-discount-${idx}`}
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            className="input"
                            style={{ textAlign: 'right', padding: '4px 6px', height: '32px', fontSize: '0.85rem', flex: 1 }}
                            placeholder="0%"
                            value={line.discount_percentage || ''}
                            disabled={isVoided}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => onUpdateLine(idx, 'discount_percentage', e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, idx, 'discount')}
                          />
                        ) : dMethod === 'none' ? (
                          <input
                            id={`line-discount-${idx}`}
                            type="text"
                            className="input"
                            style={{ textAlign: 'right', padding: '4px 6px', height: '32px', fontSize: '0.85rem', flex: 1, color: 'var(--text-muted)' }}
                            value="0.00"
                            readOnly
                            disabled={isVoided}
                            onKeyDown={(e) => handleCellKeyDown(e, idx, 'discount')}
                          />
                        ) : (
                          <input
                            id={`line-discount-${idx}`}
                            type="number"
                            step="0.01"
                            min="0"
                            className="input"
                            style={{ textAlign: 'right', padding: '4px 6px', height: '32px', fontSize: '0.85rem', flex: 1, fontFamily: 'monospace' }}
                            placeholder="0.00"
                            value={line.discount_amount || ''}
                            disabled={isVoided}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => onUpdateLine(idx, 'discount_amount', e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, idx, 'discount')}
                          />
                        )}
                      </div>
                    </td>

                    {/* Tax Treatment */}
                    <td style={{ padding: '4px 6px' }}>
                      <select
                        className="input"
                        style={{ height: '32px', fontSize: '0.8rem', padding: '2px 4px' }}
                        value={line.tax_code_id || (line as any).tax_treatment_id || ''}
                        disabled={isVoided}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          onUpdateLine(idx, 'tax_code_id', val);
                          onUpdateLine(idx, 'tax_treatment_id' as any, val);
                          const allTreatments = taxTreatments.length > 0 ? taxTreatments : taxCodes;
                          const matched = allTreatments.find((t) => t.id === val);
                          if (matched) {
                            onUpdateLine(idx, 'tax_treatment', matched.tax_regime);
                          }
                        }}
                      >
                        <option value="">-- Tax Treatment --</option>
                        {(taxTreatments.length > 0 ? taxTreatments : taxCodes).map((tc) => (
                          <option key={tc.id} value={tc.id}>
                            {tc.name || tc.code} ({tc.tax_regime.replace(/_/g, ' ')})
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Calculated Tax Display */}
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {lineTax > 0 ? `Rs. ${lineTax.toFixed(2)}` : '—'}
                    </td>

                    {/* Calculated Line Amount */}
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {lineAmount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'center', padding: '4px' }}>
                      {!isVoided && lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onRemoveLine(idx)}
                          className="btn-icon"
                          style={{ color: 'var(--color-danger-text)', padding: '4px' }}
                          title="Remove line (Alt+Delete)"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Fuel Petroleum Manual Tax Override Bar */}
                  {isPetroleum && (
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem' }}>
                      <td colSpan={2}></td>
                      <td colSpan={10} style={{ padding: '4px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-xs btn-outline-secondary"
                            disabled={isVoided}
                            onClick={() => onUpdateLine(idx, 'is_petroleum_manual_override', !line.is_petroleum_manual_override)}
                          >
                            {line.is_petroleum_manual_override ? 'Cancel Fuel Tax Override' : 'Override Fuel Tax'}
                          </button>

                          {line.is_petroleum_manual_override && (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>Tax Amount: Rs.</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="input"
                                  style={{ width: '90px', height: '26px', fontSize: '0.75rem', padding: '2px 6px', textAlign: 'right' }}
                                  value={line.petroleum_tax_amount || ''}
                                  disabled={isVoided}
                                  placeholder="0.00"
                                  onChange={(e) => onUpdateLine(idx, 'petroleum_tax_amount', e.target.value)}
                                />
                              </div>
                              <input
                                type="text"
                                className="input"
                                style={{ flex: 1, height: '26px', fontSize: '0.75rem', padding: '2px 8px' }}
                                placeholder="Mandatory override reason (min 5 chars)..."
                                value={line.petroleum_manual_override_reason || ''}
                                disabled={isVoided}
                                onChange={(e) => onUpdateLine(idx, 'petroleum_manual_override_reason', e.target.value)}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Inline Quantity Override Warning & Reason */}
                  {isQtyOverridden && (
                    <tr style={{ background: 'var(--color-warning-bg)', borderBottom: '1px solid var(--border-color)' }}>
                      <td colSpan={2}></td>
                      <td colSpan={10} style={{ padding: '4px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--color-warning-text)' }}>
                          <AlertCircle size={14} style={{ flexShrink: 0 }} />
                          <span>
                            Receipt Qty was {line.original_receipt_quantity} {line.unit}. Reason:
                          </span>
                          <input
                            type="text"
                            className="input"
                            style={{ height: '26px', fontSize: '0.75rem', padding: '2px 8px', flex: 1 }}
                            placeholder="Mandatory variance explanation (min 5 chars)..."
                            value={line.quantity_override_reason || ''}
                            disabled={isVoided}
                            onChange={(e) => onUpdateLine(idx, 'quantity_override_reason', e.target.value)}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
