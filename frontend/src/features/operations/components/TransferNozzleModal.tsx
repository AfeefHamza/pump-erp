import React, { useState, useEffect } from 'react';
import { transferShiftNozzle, correctShiftNozzle, type TransferShiftNozzlePayload, type CorrectShiftNozzlePayload } from '@/api/client';
import { ArrowRightLeft, X, AlertCircle, Info, Edit3, Gauge } from 'lucide-react';

interface TransferNozzleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orgId: string;
  outletId: string;
  shiftId: string;
  nozzles: Array<{
    id: string;
    code: string;
    name: string;
    product_name?: string;
    current_attendant_name?: string;
    current_attendant_id?: string;
    opening_reading: string;
    closing_reading?: string | null;
    gross_quantity?: string;
  }>;
  initialNozzleId?: string;
  availableEmployees: Array<{
    id: string;
    employee_code: string;
    display_name: string;
  }>;
}

export const TransferNozzleModal: React.FC<TransferNozzleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  orgId,
  outletId,
  shiftId,
  nozzles,
  initialNozzleId,
  availableEmployees,
}) => {
  const [selectedNozzleId, setSelectedNozzleId] = useState('');
  const [mode, setMode] = useState<'handover' | 'correction'>('handover');
  const [newEmployeeId, setNewEmployeeId] = useState('');
  const [handoverReading, setHandoverReading] = useState('');
  const [handoverTime, setHandoverTime] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialNozzleId) {
      setSelectedNozzleId(initialNozzleId);
    } else if (nozzles.length > 0 && !selectedNozzleId) {
      setSelectedNozzleId(nozzles[0].id);
    }
  }, [initialNozzleId, nozzles]);

  const activeNozzle = nozzles.find((n) => n.id === selectedNozzleId);
  const dispensingOccurred =
    activeNozzle &&
    ((activeNozzle.closing_reading && parseFloat(activeNozzle.closing_reading) > parseFloat(activeNozzle.opening_reading)) ||
      (activeNozzle.gross_quantity && parseFloat(activeNozzle.gross_quantity) > 0));

  // Initialize handover reading default to current opening reading or closing reading
  useEffect(() => {
    if (activeNozzle) {
      setHandoverReading(activeNozzle.closing_reading || activeNozzle.opening_reading || '');
    }
  }, [selectedNozzleId]);

  if (!isOpen) return null;

  const currentAttendantName = activeNozzle?.current_attendant_name || 'Current Attendant';
  const targetEmployee = availableEmployees.find((e) => e.id === newEmployeeId);
  const targetEmployeeName = targetEmployee ? targetEmployee.display_name : 'Selected Employee';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNozzleId) {
      setError('Please select a nozzle.');
      return;
    }
    if (!newEmployeeId) {
      setError('Please select the replacement employee.');
      return;
    }
    if (!reason || reason.trim().length < 3) {
      setError('A mandatory justification reason (min 3 characters) is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (mode === 'handover') {
        const readingNum = parseFloat(handoverReading);
        const openingNum = activeNozzle ? parseFloat(activeNozzle.opening_reading) : 0;
        if (isNaN(readingNum) || readingNum < openingNum) {
          setError(`Handover reading cannot be less than opening reading (${openingNum.toFixed(3)}).`);
          setSubmitting(false);
          return;
        }

        const payload: TransferShiftNozzlePayload = {
          nozzle_id: selectedNozzleId,
          new_employee_id: newEmployeeId,
          handover_reading: handoverReading,
          handover_time: handoverTime ? new Date(handoverTime).toISOString() : null,
          reason: reason.trim(),
        };
        await transferShiftNozzle(orgId, outletId, shiftId, payload);
      } else {
        const payload: CorrectShiftNozzlePayload = {
          nozzle_id: selectedNozzleId,
          new_employee_id: newEmployeeId,
          reason: reason.trim(),
        };
        await correctShiftNozzle(orgId, outletId, shiftId, payload);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Operation failed.');
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
          maxWidth: '580px',
          maxHeight: '92vh',
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
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowRightLeft size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                Nozzle Attendant Handover & Correction
              </h3>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary, #64748b)' }}>
                Transfer nozzle mid-shift with exact interval splitting or correct initial DSM selection
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

        {/* Mode Selector Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            backgroundColor: 'var(--bg-surface, #f1f5f9)',
          }}
        >
          <button
            type="button"
            onClick={() => setMode('handover')}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: 'none',
              borderBottom: mode === 'handover' ? '2px solid #2563eb' : '2px solid transparent',
              backgroundColor: mode === 'handover' ? 'var(--bg-card, #ffffff)' : 'transparent',
              color: mode === 'handover' ? '#2563eb' : 'var(--text-secondary, #64748b)',
              fontWeight: mode === 'handover' ? 600 : 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <Gauge size={16} />
            <span>Handover Nozzle (New Meter Interval)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!dispensingOccurred) {
                setMode('correction');
              }
            }}
            disabled={Boolean(dispensingOccurred)}
            title={dispensingOccurred ? 'Correction unavailable: dispensing has already occurred.' : undefined}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: 'none',
              borderBottom: mode === 'correction' ? '2px solid #2563eb' : '2px solid transparent',
              backgroundColor: mode === 'correction' ? 'var(--bg-card, #ffffff)' : 'transparent',
              color: dispensingOccurred
                ? 'var(--text-muted, #94a3b8)'
                : mode === 'correction'
                ? '#2563eb'
                : 'var(--text-secondary, #64748b)',
              fontWeight: mode === 'correction' ? 600 : 500,
              fontSize: '0.875rem',
              cursor: dispensingOccurred ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              opacity: dispensingOccurred ? 0.6 : 1,
            }}
          >
            <Edit3 size={16} />
            <span>Correct Assignment {dispensingOccurred && '(Locked)'}</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
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

            {/* Nozzle Picker & Status */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary, #0f172a)' }}>
                Target Nozzle <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={selectedNozzleId}
                onChange={(e) => setSelectedNozzleId(e.target.value)}
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
                {nozzles.map((nz) => (
                  <option key={nz.id} value={nz.id}>
                    {nz.code} — {nz.product_name || nz.name} ({nz.current_attendant_name || 'Unassigned'})
                  </option>
                ))}
              </select>
            </div>

            {/* Current Status Box */}
            {activeNozzle && (
              <div
                style={{
                  padding: '0.875rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-surface, #f8fafc)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  fontSize: '0.8125rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-secondary, #64748b)', display: 'block' }}>Current Attendant</span>
                  <strong style={{ color: 'var(--text-primary, #0f172a)', fontSize: '0.875rem' }}>
                    {activeNozzle.current_attendant_name || 'None'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary, #64748b)', display: 'block' }}>Opening Totalizer</span>
                  <strong style={{ color: 'var(--text-primary, #0f172a)', fontSize: '0.875rem' }}>
                    {parseFloat(activeNozzle.opening_reading || '0').toFixed(3)} L
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary, #64748b)', display: 'block' }}>Current Status</span>
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: '2px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      backgroundColor: dispensingOccurred ? 'rgba(234, 88, 12, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                      color: dispensingOccurred ? '#c2410c' : '#15803d',
                    }}
                  >
                    {dispensingOccurred ? 'Dispensed' : 'At Opening Reading'}
                  </span>
                </div>
              </div>
            )}

            {/* New Attendant Selection */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary, #0f172a)' }}>
                Replacement Attendant <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={newEmployeeId}
                onChange={(e) => setNewEmployeeId(e.target.value)}
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
                <option value="">-- Choose active outlet employee --</option>
                {availableEmployees
                  .filter((emp) => emp.id !== activeNozzle?.current_attendant_id)
                  .map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.display_name} ({emp.employee_code})
                    </option>
                  ))}
              </select>
            </div>

            {/* Handover Specific Fields */}
            {mode === 'handover' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary, #0f172a)' }}>
                      Handover Reading (Totalizer) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={handoverReading}
                      onChange={(e) => setHandoverReading(e.target.value)}
                      placeholder={activeNozzle?.opening_reading || '0.000'}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.875rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        backgroundColor: 'var(--bg-input, #ffffff)',
                        color: 'var(--text-primary, #0f172a)',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary, #0f172a)' }}>
                      Handover Time <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>(Defaults to now)</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={handoverTime}
                      onChange={(e) => setHandoverTime(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.875rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        backgroundColor: 'var(--bg-input, #ffffff)',
                        color: 'var(--text-primary, #0f172a)',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                </div>

                {/* Audit & Interval Split Notice */}
                <div
                  style={{
                    padding: '0.875rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(59, 130, 246, 0.06)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    fontSize: '0.8125rem',
                    color: '#1e40af',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.375rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                    <Info size={16} /> Exact Interval Accounting Notice
                  </div>
                  <div>
                    Sales from <strong>{activeNozzle?.opening_reading || '0.000'}</strong> up to{' '}
                    <strong>{handoverReading || '...'}</strong> remain strictly attributed to{' '}
                    <strong>{currentAttendantName}</strong>. <strong>{targetEmployeeName}</strong> will only be credited
                    for volume dispensed from <strong>{handoverReading || '...'}</strong> onwards.
                  </div>
                </div>
              </>
            )}

            {/* Correction Specific Notice */}
            {mode === 'correction' && (
              <div
                style={{
                  padding: '0.875rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(234, 179, 8, 0.08)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  fontSize: '0.8125rem',
                  color: '#854d0e',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.375rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                  <Info size={16} /> In-Place Correction
                </div>
                <div>
                  Because no fuel has been dispensed on this nozzle yet, this operation updates the assignment record in-place
                  without creating an artificial zero-volume sales handover interval.
                </div>
              </div>
            )}

            {/* Mandatory Reason */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary, #0f172a)' }}>
                Mandatory Reason / Justification <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={2}
                placeholder={
                  mode === 'handover'
                    ? 'e.g. Lunch break relief / shift DSM change'
                    : 'e.g. Incorrect DSM assigned accidentally at shift opening'
                }
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
              disabled={submitting || !newEmployeeId || !reason.trim()}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: mode === 'handover' ? '#2563eb' : '#d97706',
                color: '#ffffff',
                fontSize: '0.875rem',
                cursor: submitting || !newEmployeeId || !reason.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                opacity: submitting || !newEmployeeId || !reason.trim() ? 0.65 : 1,
              }}
            >
              {submitting ? 'Submitting...' : mode === 'handover' ? 'Confirm Handover' : 'Save Correction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
