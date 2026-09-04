import React, { useState, useEffect } from 'react';
import { useAppSelector } from '@/app/store';
import {
  recordShiftTesting, updateShiftTesting, fetchTanks,
  type ShiftNozzleMeterItem, type ShiftTestingRecordItem, type Tank
} from '@/api/client';
import { X, Fuel, AlertCircle } from 'lucide-react';

interface RecordTestingModalProps {
  isOpen: boolean;
  shiftId: string;
  meters: ShiftNozzleMeterItem[];
  recordToEdit?: ShiftTestingRecordItem | null;
  onClose: () => void;
  onTestingSaved: () => void;
}

export const RecordTestingModal: React.FC<RecordTestingModalProps> = ({
  isOpen,
  shiftId,
  meters,
  recordToEdit,
  onClose,
  onTestingSaved,
}) => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [tanks, setTanks] = useState<Tank[]>([]);
  const [nozzleId, setNozzleId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('5.000');
  const [returnedToTank, setReturnedToTank] = useState<boolean>(true);
  const [destinationTankId, setDestinationTankId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load tanks for outlet
  useEffect(() => {
    if (!isOpen || !selectedOrgId || !selectedOutletId) return;
    fetchTanks(selectedOrgId, selectedOutletId)
      .then((tList) => {
        setTanks(tList);
      })
      .catch((err) => console.error('Failed to load tanks:', err));
  }, [isOpen, selectedOrgId, selectedOutletId]);

  // Sync state on open/edit
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (recordToEdit) {
      const foundMeter = meters.find((m) => m.id === recordToEdit.shift_nozzle_meter);
      setNozzleId(foundMeter ? foundMeter.nozzle : '');
      setQuantity(recordToEdit.quantity);
      setReturnedToTank(recordToEdit.returned_to_tank);
      setDestinationTankId(recordToEdit.destination_tank || '');
      setNotes(recordToEdit.notes || '');
    } else {
      if (meters.length > 0) {
        setNozzleId(meters[0].nozzle);
      }
      setQuantity('5.000');
      setReturnedToTank(true);
      setDestinationTankId('');
      setNotes('');
    }
  }, [isOpen, recordToEdit, meters]);

  // Selected nozzle object to filter destination tanks
  const selectedMeter = meters.find((m) => m.nozzle === nozzleId);
  const matchingTanks = selectedMeter
    ? tanks.filter((t) => t.product === selectedMeter.product_id)
    : tanks;

  // Auto-set destination tank when nozzle changes
  useEffect(() => {
    if (returnedToTank && matchingTanks.length > 0 && !destinationTankId) {
      setDestinationTankId(matchingTanks[0].id);
    }
  }, [returnedToTank, matchingTanks, destinationTankId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId) return;

    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setError('Testing quantity must be a positive number.');
      return;
    }

    if (returnedToTank && !destinationTankId) {
      setError('Destination tank is required when testing is returned to tank.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (recordToEdit) {
        await updateShiftTesting(selectedOrgId, selectedOutletId, shiftId, recordToEdit.id, {
          quantity: qtyNum,
          returned_to_tank: returnedToTank,
          destination_tank_id: returnedToTank ? destinationTankId : undefined,
          notes,
        });
      } else {
        await recordShiftTesting(selectedOrgId, selectedOutletId, shiftId, {
          nozzle_id: nozzleId,
          quantity: qtyNum,
          returned_to_tank: returnedToTank,
          destination_tank_id: returnedToTank ? destinationTankId : undefined,
          notes,
        });
      }
      onTestingSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to save testing record:', err);
      setError(err.message || 'Failed to save testing record.');
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
          maxWidth: '540px',
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
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Fuel size={20} />
            </div>
            <div>
              <h3 className="h4" style={{ margin: 0, fontSize: '1.1rem' }}>
                {recordToEdit ? 'Edit Testing Record' : 'Record Fuel Testing'}
              </h3>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                Nozzle measure testing deductions and tank return verification.
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
          {!recordToEdit && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ fontWeight: 600 }}>Tested Nozzle</label>
              <select
                className="form-input"
                value={nozzleId}
                onChange={(e) => {
                  setNozzleId(e.target.value);
                  setDestinationTankId('');
                }}
                style={{ width: '100%', padding: '0.6rem' }}
              >
                {meters.map((m) => (
                  <option key={m.nozzle} value={m.nozzle}>
                    {m.nozzle_code} ({m.nozzle_name}) • {m.product_name} • {m.dispenser_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Testing Volume (Litres)</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              className="form-input"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              style={{ width: '100%', padding: '0.6rem', fontSize: '1.1rem', fontFamily: 'monospace' }}
            />
            <span className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              Deducted from gross meter totalizer sales calculation.
            </span>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={returnedToTank}
                onChange={(e) => setReturnedToTank(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
              />
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Fuel Returned to Storage Tank</span>
            </label>
            <div className="text-muted" style={{ fontSize: '0.8rem', marginLeft: '26px', marginTop: '0.2rem' }}>
              If returned to tank, stock is restored and not counted as depletion. If unreturned (e.g. lab sample or spill), stock remains depleted.
            </div>
          </div>

          {returnedToTank && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ fontWeight: 600 }}>Destination Storage Tank</label>
              <select
                className="form-input"
                value={destinationTankId}
                onChange={(e) => setDestinationTankId(e.target.value)}
                style={{ width: '100%', padding: '0.6rem' }}
              >
                {matchingTanks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} - {t.name} ({t.product_name || 'Fuel'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Notes / Calibration Inspector Ref</label>
            <input
              type="text"
              placeholder="e.g. Daily 5L measure testing witnessed by DSM."
              className="form-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : recordToEdit ? 'Update Testing' : 'Record Testing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
