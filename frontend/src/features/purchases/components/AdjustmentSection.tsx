// frontend/src/features/purchases/components/AdjustmentSection.tsx
import React, { useState, useEffect, useRef } from 'react';
import type { PurchaseBillAdjustmentInput } from '@/features/purchases/types';
import { Plus, Trash2, ChevronDown } from 'lucide-react';

export interface InternalAdjustmentItem extends PurchaseBillAdjustmentInput {
  _id: string;
}

export interface AdjustmentSectionProps {
  adjustments: InternalAdjustmentItem[];
  percentageBase: number;
  isVoided: boolean;
  onAddAdjustment: (type: 'charge' | 'discount' | 'tax' | 'round_off') => void;
  onUpdateAdjustment: (index: number, field: keyof InternalAdjustmentItem, value: any) => void;
  onRemoveAdjustment: (index: number) => void;
}

export const AdjustmentSection: React.FC<AdjustmentSectionProps> = ({
  adjustments,
  percentageBase,
  isVoided,
  onAddAdjustment,
  onUpdateAdjustment,
  onRemoveAdjustment
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Alt+A keyboard shortcut to toggle adjustment dropdown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isVoided) return;
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setDropdownOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVoided]);

  const handleSelectType = (type: 'charge' | 'discount' | 'tax' | 'round_off') => {
    onAddAdjustment(type);
    setDropdownOpen(false);
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', margin: 0 }}>
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
        <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>
          Additional Charges, Taxes & Discounts
        </span>

        {!isVoided && (
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              id="btn-add-adjustment"
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.75rem' }}
              title="Add adjustment (Alt+A)"
            >
              <Plus size={13} />
              <span>Add Adjustment (Alt+A)</span>
              <ChevronDown size={12} />
            </button>

            {dropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 4px)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                  zIndex: 50,
                  minWidth: '180px',
                  padding: '4px 0'
                }}
              >
                <div
                  onClick={() => handleSelectType('charge')}
                  style={{ padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer' }}
                  className="dropdown-item"
                >
                  + Additional Charge (Freight/Handling)
                </div>
                <div
                  onClick={() => handleSelectType('tax')}
                  style={{ padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer' }}
                  className="dropdown-item"
                >
                  + Tax (GST / VAT)
                </div>
                <div
                  onClick={() => handleSelectType('discount')}
                  style={{ padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer' }}
                  className="dropdown-item"
                >
                  - Bill-Level Discount
                </div>
                <div
                  onClick={() => handleSelectType('round_off')}
                  style={{ padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer' }}
                  className="dropdown-item"
                >
                  ± Round Off
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {adjustments.length === 0 ? (
        <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          No adjustments added. Click &quot;Add Adjustment (Alt+A)&quot; to add freight charges, taxes, discounts, or round-off.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ width: '130px', padding: '6px 8px' }}>Type</th>
                <th style={{ minWidth: '180px', padding: '6px 8px' }}>Description</th>
                <th style={{ width: '130px', padding: '6px 8px' }}>Calculation</th>
                <th style={{ width: '110px', textAlign: 'right', padding: '6px 8px' }}>Rate / Value</th>
                <th style={{ width: '120px', textAlign: 'right', padding: '6px 8px' }}>Amount (Rs.)</th>
                <th style={{ width: '40px', textAlign: 'center', padding: '6px' }}></th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((adj, idx) => {
                const isPct = adj.calculation_type === 'percentage';
                const calculatedAmount = isPct
                  ? (percentageBase * (parseFloat(adj.percentage_rate || '0') || 0)) / 100
                  : parseFloat(adj.calculated_amount || '0') || 0;

                return (
                  <tr key={adj._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {/* Component Type Select */}
                    <td style={{ padding: '4px 6px' }}>
                      <select
                        value={adj.component_type}
                        disabled={isVoided}
                        onChange={(e) => onUpdateAdjustment(idx, 'component_type', e.target.value)}
                        className="input"
                        style={{ height: '28px', fontSize: '0.75rem', padding: '2px 6px' }}
                      >
                        <option value="charge">Charge (+)</option>
                        <option value="tax">Tax (+)</option>
                        <option value="discount">Discount (-)</option>
                        <option value="round_off">Round Off (±)</option>
                      </select>
                    </td>

                    {/* Label / Description */}
                    <td style={{ padding: '4px 6px' }}>
                      <input
                        type="text"
                        className="input"
                        style={{ height: '28px', fontSize: '0.8rem', padding: '2px 8px' }}
                        value={adj.label}
                        disabled={isVoided}
                        placeholder="Description (e.g. Freight, Sales Tax)..."
                        onChange={(e) => onUpdateAdjustment(idx, 'label', e.target.value)}
                      />
                    </td>

                    {/* Calculation Type */}
                    <td style={{ padding: '4px 6px' }}>
                      <select
                        value={adj.calculation_type}
                        disabled={isVoided}
                        onChange={(e) => onUpdateAdjustment(idx, 'calculation_type', e.target.value)}
                        className="input"
                        style={{ height: '28px', fontSize: '0.75rem', padding: '2px 6px' }}
                      >
                        <option value="fixed_amount">Fixed Amount</option>
                        <option value="percentage">Percentage (%)</option>
                      </select>
                    </td>

                    {/* Rate / Value */}
                    <td style={{ padding: '4px 6px' }}>
                      {isPct ? (
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            type="number"
                            step="0.01"
                            className="input"
                            style={{ height: '28px', fontSize: '0.8rem', textAlign: 'right', padding: '2px 18px 2px 6px', fontFamily: 'monospace' }}
                            value={adj.percentage_rate || ''}
                            disabled={isVoided}
                            placeholder="0.00"
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => onUpdateAdjustment(idx, 'percentage_rate', e.target.value)}
                          />
                          <span style={{ position: 'absolute', right: '6px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>%</span>
                        </div>
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          className="input"
                          style={{ height: '28px', fontSize: '0.8rem', textAlign: 'right', padding: '2px 6px', fontFamily: 'monospace' }}
                          value={adj.calculated_amount || ''}
                          disabled={isVoided}
                          placeholder="0.00"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => onUpdateAdjustment(idx, 'calculated_amount', e.target.value)}
                        />
                      )}
                    </td>

                    {/* Calculated Amount */}
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {adj.component_type === 'discount' ? '- ' : ''}
                      {calculatedAmount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Action */}
                    <td style={{ textAlign: 'center', padding: '4px' }}>
                      {!isVoided && (
                        <button
                          type="button"
                          onClick={() => onRemoveAdjustment(idx)}
                          className="btn-icon"
                          style={{ color: 'var(--color-danger-text)', padding: '4px' }}
                          title="Remove adjustment"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
