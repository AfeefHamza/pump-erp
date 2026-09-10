// frontend/src/features/purchases/components/TransactionTotalsPanel.tsx
import React from 'react';
import { DollarSign, MapPin, Edit3 } from 'lucide-react';

export interface TransactionTotalsPanelProps {
  subtotal: number;
  lineDiscounts: number;
  transactionDiscount?: number;
  taxableValueTotal?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  gstCess?: number;
  petroleumTax?: number;
  otherChargesSubtotal?: number;
  otherChargesTax?: number;
  roundOff: number;
  grandTotal: number;
  amountPaid: number;
  outstanding: number;
  isAuthoritative: boolean;
  isInterstate?: boolean;
  placeOfSupplyState?: string | null;
  placeOfSupplyStateCode?: string | null;
  onOpenPOSOverride?: () => void;
}

export const TransactionTotalsPanel: React.FC<TransactionTotalsPanelProps> = ({
  subtotal,
  lineDiscounts,
  transactionDiscount = 0,
  taxableValueTotal,
  cgst = 0,
  sgst = 0,
  igst = 0,
  gstCess = 0,
  petroleumTax = 0,
  otherChargesSubtotal = 0,
  otherChargesTax = 0,
  roundOff,
  grandTotal,
  amountPaid,
  outstanding,
  isAuthoritative,
  isInterstate = false,
  placeOfSupplyState,
  placeOfSupplyStateCode,
  onOpenPOSOverride
}) => {
  const formatAmount = (val: number) => {
    return val.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="card" style={{ padding: 'var(--space-md)', margin: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-sm)',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: 'var(--space-xs)'
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <DollarSign size={16} color="var(--color-accent)" />
          Financial & Tax Summary
        </span>
        <span
          className={`badge ${isAuthoritative ? 'badge-primary' : 'badge-secondary'}`}
          style={{ fontSize: '0.7rem' }}
        >
          {isAuthoritative ? 'Server Calculated' : 'Client Preview'}
        </span>
      </div>

      {/* Place of Supply Status */}
      <div
        style={{
          padding: '6px 8px',
          background: 'rgba(241, 245, 249, 0.6)',
          borderRadius: '4px',
          marginBottom: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <MapPin size={13} color="var(--text-muted)" />
          <span>
            POS: <strong>{placeOfSupplyState || 'Outlet State'}</strong>{' '}
            {placeOfSupplyStateCode ? `(${placeOfSupplyStateCode})` : ''}
          </span>
          <span
            className={`badge ${isInterstate ? 'badge-warning' : 'badge-info'}`}
            style={{ fontSize: '0.65rem', marginLeft: '4px' }}
          >
            {isInterstate ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)'}
          </span>
        </div>
        {onOpenPOSOverride && (
          <button
            type="button"
            className="btn-icon"
            onClick={onOpenPOSOverride}
            title="Override Place of Supply"
            style={{ padding: '2px 4px', fontSize: '0.7rem' }}
          >
            <Edit3 size={12} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
        {/* Gross Subtotal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
          <span>Subtotal (Gross)</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-main)' }}>
            Rs. {formatAmount(subtotal)}
          </span>
        </div>

        {/* Line Discounts */}
        {lineDiscounts > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-success-text)' }}>
            <span>Line Discounts</span>
            <span style={{ fontFamily: 'monospace' }}>- Rs. {formatAmount(lineDiscounts)}</span>
          </div>
        )}

        {/* Transaction Discount */}
        {transactionDiscount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-success-text)' }}>
            <span>Bill Discount</span>
            <span style={{ fontFamily: 'monospace' }}>- Rs. {formatAmount(transactionDiscount)}</span>
          </div>
        )}

        {/* Taxable Value Total (GST) */}
        {taxableValueTotal !== undefined && taxableValueTotal > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: 'var(--text-main)',
              background: '#f8fafc',
              padding: '2px 4px',
              borderRadius: '2px'
            }}
          >
            <span style={{ fontWeight: 500 }}>GST Taxable Value</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>Rs. {formatAmount(taxableValueTotal)}</span>
          </div>
        )}

        {/* Taxes breakdown */}
        {isInterstate ? (
          igst > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Integrated Tax (IGST)</span>
              <span style={{ fontFamily: 'monospace' }}>+ Rs. {formatAmount(igst)}</span>
            </div>
          )
        ) : (
          <>
            {cgst > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Central Tax (CGST)</span>
                <span style={{ fontFamily: 'monospace' }}>+ Rs. {formatAmount(cgst)}</span>
              </div>
            )}
            {sgst > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>State Tax (SGST)</span>
                <span style={{ fontFamily: 'monospace' }}>+ Rs. {formatAmount(sgst)}</span>
              </div>
            )}
          </>
        )}

        {gstCess > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>GST Compensation Cess</span>
            <span style={{ fontFamily: 'monospace' }}>+ Rs. {formatAmount(gstCess)}</span>
          </div>
        )}

        {/* Petroleum Taxes */}
        {petroleumTax > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Petroleum Taxes (VAT/Cess)</span>
            <span style={{ fontFamily: 'monospace' }}>+ Rs. {formatAmount(petroleumTax)}</span>
          </div>
        )}

        {/* Other Charges */}
        {otherChargesSubtotal > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Other Charges (Net)</span>
            <span style={{ fontFamily: 'monospace' }}>+ Rs. {formatAmount(otherChargesSubtotal)}</span>
          </div>
        )}

        {otherChargesTax > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Tax on Other Charges</span>
            <span style={{ fontFamily: 'monospace' }}>+ Rs. {formatAmount(otherChargesTax)}</span>
          </div>
        )}

        {/* Round Off */}
        {roundOff !== 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Round Off</span>
            <span style={{ fontFamily: 'monospace' }}>
              {roundOff > 0 ? '+ ' : ''}Rs. {formatAmount(roundOff)}
            </span>
          </div>
        )}

        {/* Grand Total */}
        <div
          style={{
            borderTop: '2px solid var(--border-color)',
            paddingTop: '8px',
            marginTop: '4px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Grand Total</span>
          <span
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              fontFamily: 'monospace',
              color: 'var(--color-accent)'
            }}
          >
            Rs. {formatAmount(grandTotal)}
          </span>
        </div>

        {/* Amount Paid (Read-Only) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '4px'
          }}
        >
          <span>Amount Paid</span>
          <span style={{ fontFamily: 'monospace' }}>Rs. {formatAmount(amountPaid)}</span>
        </div>

        {/* Outstanding Balance */}
        <div
          style={{
            background: 'var(--color-warning-bg)',
            border: '1px solid var(--color-warning-text)',
            padding: 'var(--space-xs) var(--space-sm)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '4px'
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--color-warning-text)' }}>Outstanding Balance</span>
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              color: 'var(--color-warning-text)'
            }}
          >
            Rs. {formatAmount(outstanding)}
          </span>
        </div>
      </div>
    </div>
  );
};
