import React, { useState } from 'react';
import { useAppSelector } from '@/app/store';
import { reopenOperationalShift } from '@/api/client';
import { X, AlertTriangle, RotateCcw, AlertCircle } from 'lucide-react';

interface ReopenShiftModalProps {
  isOpen: boolean;
  shiftId: string;
  shiftName: string;
  businessDate: string;
  onClose: () => void;
  onShiftReopened: (reopenedShift: any) => void;
}

export const ReopenShiftModal: React.FC<ReopenShiftModalProps> = ({
  isOpen,
  shiftId,
  shiftName,
  businessDate,
  onClose,
  onShiftReopened,
}) => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId || !shiftId) return;
    if (!reason.trim()) {
      setError('A mandatory justification is required to reopen an operational shift.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const shift = await reopenOperationalShift(selectedOrgId, selectedOutletId, shiftId, reason.trim());
      onShiftReopened(shift);
      onClose();
    } catch (err: any) {
      console.error('Failed to reopen shift:', err);
      setError(err.message || 'Failed to reopen shift.');
    } finally {
      setSubmitting(false);
    }
  };

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
          maxWidth: '520px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          borderRadius: '12px',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
        }}
      >
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
                backgroundColor: 'rgba(217, 119, 6, 0.1)',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RotateCcw size={20} />
            </div>
            <div>
              <h3 className="h4" style={{ margin: 0, fontSize: '1.1rem' }}>Reopen Operational Shift</h3>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                Controlled shift reopening with mandatory audit justification.
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

        <form onSubmit={handleReopen} style={{ padding: '1.5rem' }}>
          <div
            style={{
              padding: '0.85rem 1rem',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              color: '#b45309',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
            }}
          >
            <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Controlled Reopening:</strong>
              <div>
                Only the latest closed shift may be reopened. Reopening allows updating meter readings,
                testing records, and dips. An immutable audit record with your user and justification will be logged.
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <div className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Shift Details</div>
            <div style={{ fontWeight: 600 }}>{shiftName} • Business Date: {businessDate}</div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600 }}>
              Mandatory Justification / Correction Reason <span style={{ color: '#f87171' }}>*</span>
            </label>
            <textarea
              className="form-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Correcting DSM meter entry error verified against physical totalizer photo."
              required
              style={{ width: '100%', padding: '0.6rem' }}
            />
          </div>

          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderRadius: '8px',
                color: '#f87171',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1.25rem',
              }}
            >
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !reason.trim()}
              style={{
                backgroundColor: '#d97706',
                borderColor: '#d97706',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <RotateCcw size={16} />
              {submitting ? 'Reopening...' : 'Confirm Reopen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
