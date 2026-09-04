import React, { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '@/app/store';
import {
  recordShiftDip, previewDipConversion, fetchTanks,
  type Tank
} from '@/api/client';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { X, Droplet, AlertCircle } from 'lucide-react';

interface RecordDipModalProps {
  isOpen: boolean;
  shiftId: string;
  initialTankId?: string;
  initialObsType?: 'opening' | 'closing';
  onClose: () => void;
  onDipSaved: () => void;
}

export const RecordDipModal: React.FC<RecordDipModalProps> = ({
  isOpen,
  shiftId,
  initialTankId,
  initialObsType,
  onClose,
  onDipSaved,
}) => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);
  const canManualOverride = usePermission('dip_reading.correct');

  const [tanks, setTanks] = useState<Tank[]>([]);
  const [tankId, setTankId] = useState<string>('');
  const [observationType, setObservationType] = useState<'opening' | 'closing'>('closing');
  const [rawDipValue, setRawDipValue] = useState<string>('');
  const [rawDipUnit, setRawDipUnit] = useState<string>('millimetre');
  const [density, setDensity] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Live conversion preview
  const [convertedVolume, setConvertedVolume] = useState<string | null>(null);
  const [chartUsed, setChartUsed] = useState<string | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);

  // Manual override
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [manualQuantity, setManualQuantity] = useState<string>('');
  const [manualReason, setManualReason] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load tanks
  useEffect(() => {
    if (!isOpen || !selectedOrgId || !selectedOutletId) return;
    fetchTanks(selectedOrgId, selectedOutletId)
      .then((tList) => {
        setTanks(tList);
        if (initialTankId) {
          setTankId(initialTankId);
        } else if (tList.length > 0) {
          setTankId(tList[0].id);
        }
      })
      .catch((err) => console.error('Failed to load tanks:', err));
  }, [isOpen, selectedOrgId, selectedOutletId, initialTankId]);

  useEffect(() => {
    if (initialObsType) {
      setObservationType(initialObsType);
    }
  }, [initialObsType]);

  // Live conversion query
  const updateConversion = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId || !tankId || !rawDipValue || isManualOverride) {
      setConvertedVolume(null);
      setConversionError(null);
      return;
    }

    const heightNum = parseFloat(rawDipValue);
    if (isNaN(heightNum) || heightNum < 0) return;

    try {
      const res = await previewDipConversion(selectedOrgId, selectedOutletId, {
        tank_id: tankId,
        height: heightNum,
        unit: rawDipUnit,
      });
      setConvertedVolume(res.volume);
      setChartUsed(res.chart_name || 'Active Chart');
      setConversionError(null);
    } catch (err: any) {
      setConvertedVolume(null);
      setChartUsed(null);
      setConversionError(err.message || 'Dip conversion failed. Reading may exceed chart limits.');
    }
  }, [selectedOrgId, selectedOutletId, tankId, rawDipValue, rawDipUnit, isManualOverride]);

  useEffect(() => {
    const timer = setTimeout(updateConversion, 300);
    return () => clearTimeout(timer);
  }, [updateConversion]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId || !tankId) return;

    const dipNum = parseFloat(rawDipValue);
    if (isNaN(dipNum) || dipNum < 0) {
      setError('Raw dip value must be a non-negative number.');
      return;
    }

    if (isManualOverride) {
      const manNum = parseFloat(manualQuantity);
      if (isNaN(manNum) || manNum < 0) {
        setError('Manual quantity must be a non-negative number.');
        return;
      }
      if (!manualReason.trim()) {
        setError('A reason is mandatory when manually overriding physical quantity.');
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      await recordShiftDip(selectedOrgId, selectedOutletId, shiftId, {
        tank_id: tankId,
        observation_type: observationType,
        raw_dip_value: dipNum,
        raw_dip_unit: rawDipUnit,
        density: density ? parseFloat(density) : undefined,
        manual_quantity: isManualOverride ? parseFloat(manualQuantity) : undefined,
        manual_quantity_reason: isManualOverride ? manualReason.trim() : undefined,
        notes,
      });
      onDipSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to record dip:', err);
      setError(err.message || 'Failed to record dip observation.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTank = tanks.find((t) => t.id === tankId);

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
                backgroundColor: 'rgba(2, 132, 199, 0.1)',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Droplet size={20} />
            </div>
            <div>
              <h3 className="h4" style={{ margin: 0, fontSize: '1.1rem' }}>Record Tank Dip Observation</h3>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                Underground tank physical dip reading and volume conversion.
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Storage Tank</label>
              <select
                className="form-input"
                value={tankId}
                onChange={(e) => setTankId(e.target.value)}
                style={{ width: '100%', padding: '0.6rem' }}
              >
                {tanks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} ({t.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Observation Stage</label>
              <select
                className="form-input"
                value={observationType}
                onChange={(e) => setObservationType(e.target.value as any)}
                style={{ width: '100%', padding: '0.6rem' }}
              >
                <option value="opening">Opening Dip (Shift Start)</option>
                <option value="closing">Closing Dip (Shift End)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Raw Physical Dip Level</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 1420.5"
                className="form-input"
                value={rawDipValue}
                onChange={(e) => setRawDipValue(e.target.value)}
                required
                style={{ width: '100%', padding: '0.6rem', fontSize: '1.1rem', fontFamily: 'monospace' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Unit</label>
              <select
                className="form-input"
                value={rawDipUnit}
                onChange={(e) => setRawDipUnit(e.target.value)}
                style={{ width: '100%', padding: '0.6rem' }}
              >
                <option value="millimetre">mm (Millimetres)</option>
                <option value="centimetre">cm (Centimetres)</option>
                <option value="inch">in (Inches)</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Fuel Density @ 15°C (kg/m³)</label>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 745.5"
              className="form-input"
              value={density}
              onChange={(e) => setDensity(e.target.value)}
              style={{ width: '100%', padding: '0.6rem' }}
            />
          </div>

          {/* Converted Volume Card */}
          {!isManualOverride && (
            <div
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '8px',
                marginBottom: '1.25rem',
              }}
            >
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>Converted Stock Volume (Calibration Chart)</div>
              {convertedVolume ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'monospace', color: '#0284c7' }}>
                    {parseFloat(convertedVolume).toFixed(2)} Litres
                  </span>
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                    {chartUsed ? `(${chartUsed})` : ''} {selectedTank?.capacity ? `• ${((parseFloat(convertedVolume) / parseFloat(selectedTank.capacity)) * 100).toFixed(1)}% full` : ''}
                  </span>
                </div>
              ) : conversionError ? (
                <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  {conversionError}
                </div>
              ) : (
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Enter raw dip reading to view converted stock volume.</span>
              )}
            </div>
          )}

          {/* Manual Override Option */}
          {canManualOverride && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isManualOverride}
                  onChange={(e) => setIsManualOverride(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#d97706' }}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Manual Quantity Override (Calibration Exception)</span>
              </label>

              {isManualOverride && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="Manual volume in Litres"
                    className="form-input"
                    value={manualQuantity}
                    onChange={(e) => setManualQuantity(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.6rem' }}
                  />
                  <input
                    type="text"
                    placeholder="Mandatory reason for manual conversion override"
                    className="form-input"
                    value={manualReason}
                    onChange={(e) => setManualReason(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.6rem' }}
                  />
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Notes (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Water paste check negative."
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
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Record Observation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
