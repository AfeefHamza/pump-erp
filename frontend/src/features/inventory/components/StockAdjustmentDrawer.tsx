// frontend/src/features/inventory/components/StockAdjustmentDrawer.tsx
import React, { useState } from 'react';
import { useAppSelector } from '@/app/store';
import { createStockAdjustment } from '@/api/client';
import type { StockAdjustmentInput, TankStockSummaryItem } from '@/features/inventory/types';
import {
  X,
  Sliders,
  AlertCircle,
  Upload,
  ArrowUpRight,
  ArrowDownRight,
  FileText
} from 'lucide-react';

interface StockAdjustmentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tanks: TankStockSummaryItem[];
  defaultTankId?: string;
}

const REASON_CATEGORIES = [
  { value: 'handling_loss', label: 'Handling / Evaporation Loss' },
  { value: 'calibration_adjustment', label: 'Calibration Adjustment' },
  { value: 'spillage_or_leakage', label: 'Spillage or Leakage' },
  { value: 'system_correction', label: 'System Correction / Dip Offset' },
  { value: 'temperature_variation', label: 'Temperature Variation' },
  { value: 'other', label: 'Other Operational Adjustment' },
];

export const StockAdjustmentDrawer: React.FC<StockAdjustmentDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
  tanks,
  defaultTankId,
}) => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [tankId, setTankId] = useState(defaultTankId || (tanks.length > 0 ? tanks[0].tank_id : ''));
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease'>('decrease');
  const [quantity, setQuantity] = useState('');
  const [effectiveAt, setEffectiveAt] = useState(new Date().toISOString().slice(0, 16));
  const [reasonCategory, setReasonCategory] = useState('handling_loss');
  const [explanation, setExplanation] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedTank = tanks.find((t) => t.tank_id === tankId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId) return;

    if (!tankId) {
      setError('Please select a storage tank.');
      return;
    }
    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setError('Adjustment quantity must be greater than zero.');
      return;
    }
    if (!explanation.trim()) {
      setError('An explanation is mandatory for audit trail compliance.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: StockAdjustmentInput = {
        tank_id: tankId,
        adjustment_type: adjustmentType,
        quantity: qtyNum.toFixed(3),
        effective_at: new Date(effectiveAt).toISOString(),
        reason_category: reasonCategory,
        explanation: explanation.trim(),
        attachment: file || undefined,
      };

      await createStockAdjustment(selectedOrgId, selectedOutletId, payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail || err.message || 'Failed to record stock adjustment.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '500px',
          height: '100%',
          backgroundColor: '#ffffff',
          boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.15))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--table-header-bg, #f8fafc)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={18} style={{ color: 'var(--color-accent)' }} />
              Record Stock Adjustment
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Authorized operational variance corrections, evaporation, or calibration offsets.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.2rem',
          }}
        >
          {error && (
            <div
              style={{
                backgroundColor: 'var(--color-danger-bg, #fee2e2)',
                color: 'var(--color-danger-text, #b91c1c)',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Tank Selection */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Storage Tank <span style={{ color: 'var(--color-danger-text)' }}>*</span>
            </label>
            <select
              value={tankId}
              onChange={(e) => setTankId(e.target.value)}
              className="form-control"
            >
              {tanks.map((t) => (
                <option key={t.tank_id} value={t.tank_id}>
                  {t.tank_name} ({t.tank_code}) — {t.product_name} [Book: {t.current_book_stock} L]
                </option>
              ))}
            </select>
            {selectedTank && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--bg-main, #f8fafc)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span>Capacity: <strong style={{ color: 'var(--text-main)' }}>{selectedTank.capacity} L</strong></span>
                <span>Current Book: <strong style={{ color: 'var(--text-main)' }}>{selectedTank.current_book_stock} L</strong></span>
              </div>
            )}
          </div>

          {/* Adjustment Type Toggle */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Adjustment Type <span style={{ color: 'var(--color-danger-text)' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setAdjustmentType('decrease')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '0.65rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  border: `1.5px solid ${adjustmentType === 'decrease' ? 'var(--color-danger-text, #b91c1c)' : 'var(--border-color, #e2e8f0)'}`,
                  backgroundColor: adjustmentType === 'decrease' ? 'var(--color-danger-bg, #fee2e2)' : '#ffffff',
                  color: adjustmentType === 'decrease' ? 'var(--color-danger-text, #b91c1c)' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                <ArrowDownRight size={16} />
                <span>Stock Loss (Outflow -)</span>
              </button>
              <button
                type="button"
                onClick={() => setAdjustmentType('increase')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '0.65rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  border: `1.5px solid ${adjustmentType === 'increase' ? 'var(--color-success-text, #15803d)' : 'var(--border-color, #e2e8f0)'}`,
                  backgroundColor: adjustmentType === 'increase' ? 'var(--color-success-bg, #dcfce7)' : '#ffffff',
                  color: adjustmentType === 'increase' ? 'var(--color-success-text, #15803d)' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                <ArrowUpRight size={16} />
                <span>Stock Gain (Inflow +)</span>
              </button>
            </div>
          </div>

          {/* Quantity and Effective Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                Quantity (Litres) <span style={{ color: 'var(--color-danger-text)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  placeholder="0.000"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="form-control font-mono"
                  style={{ paddingRight: '2rem' }}
                />
                <span
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                  }}
                >
                  L
                </span>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                Effective Date & Time <span style={{ color: 'var(--color-danger-text)' }}>*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
                className="form-control"
                style={{ fontSize: '0.825rem' }}
              />
            </div>
          </div>

          {/* Reason Category */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Reason Category <span style={{ color: 'var(--color-danger-text)' }}>*</span>
            </label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className="form-control"
            >
              {REASON_CATEGORIES.map((rc) => (
                <option key={rc.value} value={rc.value}>
                  {rc.label}
                </option>
              ))}
            </select>
          </div>

          {/* Explanation */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Explanation & Justification <span style={{ color: 'var(--color-danger-text)' }}>*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Explain the source, calculation, or physical dip observation justifying this adjustment..."
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="form-control"
              style={{ height: 'auto', resize: 'vertical' }}
            />
          </div>

          {/* Protected Attachment Upload */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Supporting Document (Optional)</label>
            <div
              style={{
                border: '2px dashed var(--border-color, #cbd5e1)',
                borderRadius: '8px',
                padding: '1.25rem',
                textAlign: 'center',
                position: 'relative',
                backgroundColor: 'var(--bg-main, #f8fafc)',
                cursor: 'pointer',
              }}
            >
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0,
                  cursor: 'pointer',
                  width: '100%',
                  height: '100%',
                }}
              />
              <Upload size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 0.5rem' }} />
              {file ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-accent)' }}>
                  <FileText size={16} />
                  <span>{file.name}</span>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Click or drag file here (PDF, PNG, JPG up to 5MB)
                </p>
              )}
            </div>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.725rem', color: 'var(--text-muted)' }}>
              Protected storage with permission-gated audit download.
            </p>
          </div>
        </form>

        {/* Drawer Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
            backgroundColor: 'var(--table-header-bg, #f8fafc)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Posting Movement...' : 'Post Adjustment'}
          </button>
        </div>
      </div>
    </div>
  );
};
