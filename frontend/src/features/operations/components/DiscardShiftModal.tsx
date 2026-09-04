import React, { useState } from 'react';
import { discardOperationalShift } from '@/api/client';
import { AlertTriangle, Trash2, X, AlertCircle } from 'lucide-react';

interface DiscardShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orgId: string;
  outletId: string;
  shiftId: string;
  shiftName: string;
  businessDate: string;
}

export const DiscardShiftModal: React.FC<DiscardShiftModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  orgId,
  outletId,
  shiftId,
  shiftName,
  businessDate,
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDiscard = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await discardOperationalShift(orgId, outletId, shiftId, reason.trim());
      onSuccess();
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to discard shift.');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        padding: '1rem',
      }}
    >
      <div
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
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="h4" style={{ margin: 0, fontSize: '1.1rem', color: '#dc2626' }}>
                Discard Live Shift
              </h3>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                {shiftName} • {businessDate}
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

        <form onSubmit={handleDiscard} style={{ padding: '1.5rem' }}>
          {/* Warning Banner */}
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#991b1b',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              fontSize: '0.875rem',
              marginBottom: '1.25rem',
              lineHeight: 1.5,
            }}
          >
            <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px', color: '#dc2626' }} />
            <div>
              <strong>Warning: This action cannot be undone.</strong>
              <div style={{ marginTop: '0.25rem' }}>
                Discarding this live shift will remove all meter snapshots, temporary readings, staff assignments, and in-shift logs. The shift definition and business date will be freed to allow a clean reopening.
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600 }}>
              Reason for Discarding (Optional)
            </label>
            <textarea
              className="form-input"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Shift opened with wrong date or staff roster test."
              style={{ width: '100%', padding: '0.6rem' }}
            />
          </div>

          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderRadius: '8px',
                color: '#ef4444',
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
              Keep Shift
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{
                backgroundColor: '#dc2626',
                borderColor: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Trash2 size={16} />
              {submitting ? 'Discarding...' : 'Confirm & Discard Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
