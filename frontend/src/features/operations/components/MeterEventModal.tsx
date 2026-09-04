import React, { useState } from 'react';
import { useAppSelector } from '@/app/store';
import { recordShiftMeterEvent, type ShiftNozzleMeterItem } from '@/api/client';
import { X, Gauge, AlertCircle } from 'lucide-react';

interface MeterEventModalProps {
  isOpen: boolean;
  shiftId: string;
  meter: ShiftNozzleMeterItem | null;
  onClose: () => void;
  onEventRecorded: () => void;
}

export const MeterEventModal: React.FC<MeterEventModalProps> = ({
  isOpen,
  shiftId,
  meter,
  onClose,
  onEventRecorded,
}) => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [eventType, setEventType] = useState<'meter_reset' | 'meter_replacement' | 'totalizer_rollover' | 'approved_correction'>(
    'totalizer_rollover'
  );
  const [readingBefore, setReadingBefore] = useState('');
  const [readingAfter, setReadingAfter] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !meter) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId) return;

    if (!readingBefore || !readingAfter || !reason.trim()) {
      setError('All fields are mandatory when recording a controlled meter event.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await recordShiftMeterEvent(selectedOrgId, selectedOutletId, shiftId, meter.nozzle, {
        event_type: eventType,
        reading_before: readingBefore,
        reading_after: readingAfter,
        reason: reason.trim(),
      });
      onEventRecorded();
      onClose();
    } catch (err: any) {
      console.error('Failed to record meter event:', err);
      setError(err.message || 'Failed to record meter event.');
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
          maxWidth: '560px',
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
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Gauge size={20} />
            </div>
            <div>
              <h3 className="h4" style={{ margin: 0, fontSize: '1.1rem' }}>Record Meter Event: {meter.nozzle_code}</h3>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                Hardware reset, replacement, rollover, or approved correction.
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

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          <div
            style={{
              padding: '0.85rem 1rem',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '8px',
              color: '#1e40af',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
            }}
          >
            Recording a meter event closes the current continuous meter segment at the <strong>reading before event</strong>,
            and starts a new meter segment at the <strong>reading after event</strong>. This preserves both readings and guarantees
            continuity without negative calculation spikes.
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Event Classification</label>
            <select
              className="form-input"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as any)}
              style={{ width: '100%', padding: '0.6rem' }}
            >
              <option value="totalizer_rollover">Totalizer Rollover (999999 → 000000)</option>
              <option value="meter_reset">Meter Hardware Reset</option>
              <option value="meter_replacement">Dispenser / Meter Replacement</option>
              <option value="approved_correction">Approved Reading Correction</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Reading Before Event</label>
              <input
                type="number"
                step="0.001"
                className="form-input"
                placeholder="e.g. 99999.000"
                value={readingBefore}
                onChange={(e) => setReadingBefore(e.target.value)}
                required
                style={{ width: '100%', padding: '0.6rem' }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Reading After Event</label>
              <input
                type="number"
                step="0.001"
                className="form-input"
                placeholder="e.g. 0.000"
                value={readingAfter}
                onChange={(e) => setReadingAfter(e.target.value)}
                required
                style={{ width: '100%', padding: '0.6rem' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600 }}>
              Mandatory Reason / Work Order Ref <span style={{ color: '#f87171' }}>*</span>
            </label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="e.g. Mechanical counter rollover verified by shift supervisor; counter returned to zero."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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
              disabled={submitting || !readingBefore || !readingAfter || !reason.trim()}
            >
              {submitting ? 'Recording...' : 'Record Meter Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
