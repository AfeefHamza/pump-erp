import React, { useState, useEffect } from 'react';
import { useAppSelector } from '@/app/store';
import {
  previewShiftClosing, closeOperationalShift,
  type ShiftClosingPreviewResponse
} from '@/api/client';
import {
  X, CheckCircle2, AlertCircle, ShieldAlert,
  Lock, Loader2, AlertTriangle
} from 'lucide-react';

interface CloseShiftModalProps {
  isOpen: boolean;
  shiftId: string;
  shiftName: string;
  businessDate: string;
  onClose: () => void;
  onShiftClosed: (closedShift: any) => void;
}

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({
  isOpen,
  shiftId,
  shiftName,
  businessDate,
  onClose,
  onShiftClosed,
}) => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<ShiftClosingPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !selectedOrgId || !selectedOutletId || !shiftId) return;
    setLoading(true);
    setError(null);
    setSubmitError(null);
    previewShiftClosing(selectedOrgId, selectedOutletId, shiftId)
      .then((data) => {
        setPreview(data);
      })
      .catch((err) => {
        console.error('Failed to preview shift closing:', err);
        setError(err.message || 'Failed to preview shift closing data.');
      })
      .finally(() => setLoading(false));
  }, [isOpen, selectedOrgId, selectedOutletId, shiftId]);

  const handleConfirmClose = async () => {
    if (!selectedOrgId || !selectedOutletId || !shiftId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const closed = await closeOperationalShift(selectedOrgId, selectedOutletId, shiftId);
      onShiftClosed(closed);
      onClose();
    } catch (err: any) {
      console.error('Failed to close shift:', err);
      setSubmitError(err.message || 'Failed to close operational shift.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          borderRadius: '12px',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Lock size={20} />
            </div>
            <div>
              <h2 className="h4" style={{ margin: 0, fontSize: '1.1rem' }}>
                Close Shift: {shiftName}
              </h2>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                Business Date: {businessDate} • Validating Closing Readings & Balances
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <Loader2 size={36} className="animate-spin text-primary" style={{ margin: '0 auto 1rem' }} />
              <p className="text-muted">Evaluating meter readings, testing quantities, and tank dips...</p>
            </div>
          ) : error ? (
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderRadius: '8px',
                color: '#f87171',
                display: 'flex',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          ) : preview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Status Banner */}
              {preview.can_close ? (
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: 'rgba(34, 197, 94, 0.12)',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    borderRadius: '8px',
                    color: '#4ade80',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <CheckCircle2 size={24} style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Shift Ready to Close</div>
                    <div style={{ fontSize: '0.85rem', color: '#bbf7d0' }}>
                      All {preview.meters_summary?.total ?? (preview.totals?.nozzles?.length || '')} nozzles have valid closing readings. Meter sequences and testing balances verified.
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '8px',
                    color: '#f87171',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                  }}
                >
                  <ShieldAlert size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Closing Blocked ({preview.blocking_errors.length} issue{preview.blocking_errors.length > 1 ? 's' : ''})</div>
                    <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0, fontSize: '0.85rem' }}>
                      {preview.blocking_errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    borderRadius: '8px',
                    color: '#fbbf24',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.6rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Warnings:</strong>
                    <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                      {preview.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Shift Totals Summary */}
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600 }}>
                  Calculated Shift Totals Summary
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '0.75rem',
                  }}
                >
                  <div
                    style={{
                      padding: '0.85rem 1rem',
                      backgroundColor: '#f8fafc',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: '8px',
                    }}
                  >
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>Gross Totalizer Volume</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace' }}>
                      {parseFloat(preview.totals?.overall?.total_gross_quantity || '0').toFixed(3)} L
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '0.85rem 1rem',
                      backgroundColor: '#f8fafc',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: '8px',
                    }}
                  >
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>Testing Quantity Deducted</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace' }}>
                      {parseFloat(preview.totals?.overall?.total_testing_quantity || '0').toFixed(3)} L
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '0.85rem 1rem',
                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      borderRadius: '8px',
                    }}
                  >
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>Net Fuel Sold Volume</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, fontFamily: 'monospace', color: '#2563eb' }}>
                      {parseFloat(preview.totals?.overall?.total_sale_quantity || '0').toFixed(3)} L
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '0.85rem 1rem',
                      backgroundColor: 'rgba(34, 197, 94, 0.08)',
                      border: '1px solid rgba(34, 197, 94, 0.25)',
                      borderRadius: '8px',
                    }}
                  >
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>Total Fuel Sale Amount</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, fontFamily: 'monospace', color: '#16a34a' }}>
                      ₹{parseFloat(preview.totals?.overall?.total_fuel_sale_amount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>

              {submitError && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    borderRadius: '8px',
                    color: '#ef4444',
                    fontSize: '0.85rem',
                  }}
                >
                  {submitError}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '0.75rem',
            backgroundColor: 'var(--bg-main, #f8fafc)',
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirmClose}
            disabled={!preview?.can_close || submitting}
            style={{
              backgroundColor: preview?.can_close ? '#dc2626' : undefined,
              borderColor: preview?.can_close ? '#dc2626' : undefined,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 600,
            }}
          >
            <Lock size={16} />
            {submitting ? 'Closing Shift...' : 'Confirm & Close Shift'}
          </button>
        </div>
      </div>
    </div>
  );
};
