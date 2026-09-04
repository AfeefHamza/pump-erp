import React, { useState } from 'react';
import { transferShiftCashier, type TransferShiftCashierPayload } from '@/api/client';
import { Shield, X, AlertCircle } from 'lucide-react';

interface TransferCashierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orgId: string;
  outletId: string;
  shiftId: string;
  currentCashierName?: string;
  shiftStaff: Array<{
    id: string;
    employee_name_snapshot: string;
    employee_code_snapshot: string;
    designation_snapshot: string;
    is_primary_cashier: boolean;
  }>;
}

export const TransferCashierModal: React.FC<TransferCashierModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  orgId,
  outletId,
  shiftId,
  currentCashierName,
  shiftStaff,
}) => {
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const eligibleStaff = shiftStaff.filter((s) => !s.is_primary_cashier);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId) {
      setError('Please select a staff member to assign as primary cashier.');
      return;
    }
    if (!reason || reason.trim().length < 3) {
      setError('A mandatory reason is required for cashier handover.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: TransferShiftCashierPayload = {
        new_staff_id: selectedStaffId,
        reason: reason.trim(),
      };
      await transferShiftCashier(orgId, outletId, shiftId, payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to transfer cashier responsibility.');
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
          maxWidth: '500px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          borderRadius: '14px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          overflow: 'hidden',
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
            backgroundColor: 'var(--bg-surface, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shield size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                Transfer Primary Cashier
              </h3>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary, #64748b)' }}>
                Hand over settlement and cash collection responsibility
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary, #64748b)',
              padding: '4px',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {error && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#dc2626',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Current Cashier Badge */}
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-surface, #f8fafc)',
                border: '1px solid var(--border-color, #e2e8f0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary, #64748b)' }}>
                Currently Active Cashier:
              </span>
              <strong style={{ fontSize: '0.875rem', color: 'var(--text-primary, #0f172a)' }}>
                {currentCashierName || 'None assigned'}
              </strong>
            </div>

            {/* New Cashier Select */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary, #0f172a)' }}>
                New Primary Cashier <span style={{ color: '#ef4444' }}>*</span>
              </label>
              {eligibleStaff.length === 0 ? (
                <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: 'var(--bg-surface, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', fontSize: '0.8125rem', color: 'var(--text-secondary, #64748b)' }}>
                  No other staff members on this shift. Use <strong>+ Add Staff</strong> to bring another employee onto the shift first.
                </div>
              ) : (
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: 'var(--bg-input, #ffffff)',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="">-- Choose staff member on shift --</option>
                  {eligibleStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.employee_name_snapshot} ({s.employee_code_snapshot}) • {s.designation_snapshot}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Reason */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary, #0f172a)' }}>
                Handover Reason / Handover Notes <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={2}
                placeholder="e.g. Cash drawer changeover at 2 PM, physical cash counted"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  backgroundColor: 'var(--bg-input, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '0.875rem',
                  resize: 'none',
                }}
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border-color, #e2e8f0)',
              backgroundColor: 'var(--bg-surface, #f8fafc)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #cbd5e1)',
                backgroundColor: 'transparent',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.875rem',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedStaffId || !reason.trim()}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#059669',
                color: '#ffffff',
                fontSize: '0.875rem',
                cursor: submitting || !selectedStaffId || !reason.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                opacity: submitting || !selectedStaffId || !reason.trim() ? 0.65 : 1,
              }}
            >
              {submitting ? 'Transferring...' : 'Confirm Cashier Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
