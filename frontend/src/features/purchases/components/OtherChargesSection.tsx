// frontend/src/features/purchases/components/OtherChargesSection.tsx
import React from 'react';
import type { PurchaseBillOtherChargeInput, PurchaseTaxCode } from '@/features/purchases/types';
import { Plus, Trash2 } from 'lucide-react';

export interface InternalOtherCharge extends PurchaseBillOtherChargeInput {
  _id: string;
  calculated_tax?: string;
  calculated_total?: string;
}

export interface OtherChargesSectionProps {
  charges: InternalOtherCharge[];
  taxCodes: PurchaseTaxCode[];
  isVoided: boolean;
  onUpdateCharge: (index: number, field: keyof InternalOtherCharge, value: any) => void;
  onRemoveCharge: (index: number) => void;
  onAddCharge: () => void;
}

export const OtherChargesSection: React.FC<OtherChargesSectionProps> = ({
  charges,
  taxCodes,
  isVoided,
  onUpdateCharge,
  onRemoveCharge,
  onAddCharge
}) => {
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
          Other Charges (Freight, Insurance, Handling)
        </span>
        {!isVoided && (
          <button
            type="button"
            onClick={onAddCharge}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.75rem' }}
          >
            <Plus size={13} />
            <span>Add Charge</span>
          </button>
        )}
      </div>

      {charges.length === 0 ? (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          No additional freight, insurance, or incidental charges. Click "Add Charge" if applicable.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ width: '30px', textAlign: 'center', padding: '6px' }}>#</th>
                <th style={{ width: '140px', padding: '6px 8px' }}>Type</th>
                <th style={{ minWidth: '160px', padding: '6px 8px' }}>Description</th>
                <th style={{ width: '110px', padding: '6px 8px' }}>Method</th>
                <th style={{ width: '110px', textAlign: 'right', padding: '6px 8px' }}>Amount / Rate</th>
                <th style={{ width: '110px', padding: '6px 8px' }}>Tax Treatment</th>
                <th style={{ width: '130px', padding: '6px 8px' }}>Tax Code</th>
                <th style={{ width: '90px', textAlign: 'right', padding: '6px 8px' }}>Tax</th>
                <th style={{ width: '100px', textAlign: 'right', padding: '6px 8px' }}>Total</th>
                <th style={{ width: '40px', textAlign: 'center', padding: '6px' }}></th>
              </tr>
            </thead>
            <tbody>
              {charges.map((charge, idx) => {
                const isPct = charge.calculation_type === 'percentage';
                const baseAmount = parseFloat(charge.amount || '0') || 0;
                const taxAmt = parseFloat(charge.calculated_tax || '0') || 0;
                const totalAmt = parseFloat(charge.calculated_total || '0') || (baseAmount + taxAmt);

                return (
                  <tr
                    key={charge._id}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: idx % 2 === 0 ? '#ffffff' : 'rgba(248, 250, 252, 0.5)'
                    }}
                  >
                    <td style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', padding: '4px' }}>
                      {idx + 1}
                    </td>

                    {/* Charge Type */}
                    <td style={{ padding: '4px 6px' }}>
                      <select
                        className="input"
                        style={{ height: '32px', fontSize: '0.8rem', padding: '2px 6px' }}
                        value={charge.charge_type}
                        disabled={isVoided}
                        onChange={(e: any) => onUpdateCharge(idx, 'charge_type', e.target.value)}
                      >
                        <option value="freight">Freight / Transport</option>
                        <option value="insurance">Insurance</option>
                        <option value="packing_handling">Handling & Loading</option>
                        <option value="other">Other Charge</option>
                      </select>
                    </td>

                    {/* Description */}
                    <td style={{ padding: '4px 6px' }}>
                      <input
                        type="text"
                        className="input"
                        style={{ height: '32px', fontSize: '0.8rem', padding: '2px 8px' }}
                        value={charge.description}
                        disabled={isVoided}
                        placeholder="Description..."
                        onChange={(e) => onUpdateCharge(idx, 'description', e.target.value)}
                      />
                    </td>

                    {/* Method */}
                    <td style={{ padding: '4px 6px' }}>
                      <select
                        className="input"
                        style={{ height: '32px', fontSize: '0.8rem', padding: '2px 6px' }}
                        value={charge.calculation_type}
                        disabled={isVoided}
                        onChange={(e: any) => onUpdateCharge(idx, 'calculation_type', e.target.value)}
                      >
                        <option value="fixed_amount">Fixed (Rs.)</option>
                        <option value="percentage">% of Subtotal</option>
                      </select>
                    </td>

                    {/* Amount / Rate */}
                    <td style={{ padding: '4px 6px' }}>
                      {isPct ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="input"
                            style={{ textAlign: 'right', height: '32px', fontSize: '0.85rem', padding: '2px 8px' }}
                            value={charge.percentage_rate || ''}
                            disabled={isVoided}
                            placeholder="0.00"
                            onChange={(e) => onUpdateCharge(idx, 'percentage_rate', e.target.value)}
                          />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>%</span>
                        </div>
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input"
                          style={{ textAlign: 'right', height: '32px', fontSize: '0.85rem', padding: '2px 8px', fontFamily: 'monospace' }}
                          value={charge.amount || ''}
                          disabled={isVoided}
                          placeholder="0.00"
                          onChange={(e) => onUpdateCharge(idx, 'amount', e.target.value)}
                        />
                      )}
                    </td>

                    {/* Tax Treatment */}
                    <td style={{ padding: '4px 6px' }}>
                      <select
                        className="input"
                        style={{ height: '32px', fontSize: '0.8rem', padding: '2px 6px' }}
                        value={charge.tax_treatment}
                        disabled={isVoided}
                        onChange={(e: any) => onUpdateCharge(idx, 'tax_treatment', e.target.value)}
                      >
                        <option value="taxable">Taxable</option>
                        <option value="exempt">Exempt</option>
                        <option value="nil_rated">Nil Rated</option>
                        <option value="non_gst">Non-GST</option>
                      </select>
                    </td>

                    {/* Tax Code */}
                    <td style={{ padding: '4px 6px' }}>
                      <select
                        className="input"
                        style={{ height: '32px', fontSize: '0.8rem', padding: '2px 6px' }}
                        value={charge.tax_code_id || ''}
                        disabled={isVoided || charge.tax_treatment !== 'taxable'}
                        onChange={(e) => onUpdateCharge(idx, 'tax_code_id', e.target.value || null)}
                      >
                        <option value="">Default (18%)</option>
                        {taxCodes
                          .filter((tc) => tc.tax_regime === 'gst')
                          .map((tc) => (
                            <option key={tc.id} value={tc.id}>
                              {tc.code} ({tc.name})
                            </option>
                          ))}
                      </select>
                    </td>

                    {/* Tax Amount Display */}
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {taxAmt > 0 ? `Rs. ${taxAmt.toFixed(2)}` : '—'}
                    </td>

                    {/* Total Amount Display */}
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {totalAmt.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'center', padding: '4px' }}>
                      {!isVoided && (
                        <button
                          type="button"
                          onClick={() => onRemoveCharge(idx)}
                          className="btn-icon"
                          style={{ color: 'var(--color-danger-text)', padding: '4px' }}
                          title="Remove charge"
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
