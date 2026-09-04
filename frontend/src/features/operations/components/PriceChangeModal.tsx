import React, { useState, useEffect } from 'react';
import { useAppSelector } from '@/app/store';
import {
  confirmShiftPriceChange, previewShiftPriceChange, fetchFuelProducts,
  type FuelProduct, type ShiftNozzleMeterItem
} from '@/api/client';
import { X, Tag, AlertCircle, CheckCircle2 } from 'lucide-react';

interface PriceChangeModalProps {
  isOpen: boolean;
  shiftId: string;
  meters: ShiftNozzleMeterItem[];
  onClose: () => void;
  onPriceChanged: () => void;
}

export const PriceChangeModal: React.FC<PriceChangeModalProps> = ({
  isOpen,
  shiftId,
  meters,
  onClose,
  onPriceChanged,
}) => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [products, setProducts] = useState<FuelProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [newPrice, setNewPrice] = useState<string>('');
  const [snapshotReadings, setSnapshotReadings] = useState<Record<string, string>>({});

  const [previewData, setPreviewData] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load products
  useEffect(() => {
    if (!isOpen || !selectedOrgId) return;
    setError(null);
    setPreviewData(null);
    fetchFuelProducts(selectedOrgId)
      .then((pList) => {
        const active = pList.filter((p) => p.is_active);
        setProducts(active);
        if (active.length > 0) {
          setSelectedProductId(active[0].id);
        }
      })
      .catch((err) => console.error('Failed to load fuel products:', err));
  }, [isOpen, selectedOrgId]);

  // Meters dispensing selected product
  const productMeters = meters.filter((m) => m.product_id === selectedProductId);

  // Initialize snapshot readings when product changes
  useEffect(() => {
    const initialSnap: Record<string, string> = {};
    productMeters.forEach((m) => {
      // Default to closing reading if entered, or active opening reading
      initialSnap[m.nozzle] = m.closing_reading || m.opening_reading || '';
    });
    setSnapshotReadings(initialSnap);
    setPreviewData(null);
  }, [selectedProductId, meters]);

  if (!isOpen) return null;

  const handlePreview = async () => {
    if (!selectedOrgId || !selectedOutletId || !selectedProductId || !newPrice) return;
    setError(null);

    // Verify all nozzles have a reading
    for (const m of productMeters) {
      if (!snapshotReadings[m.nozzle]) {
        setError(`Meter snapshot reading is required for nozzle ${m.nozzle_code}.`);
        return;
      }
    }

    try {
      const res = await previewShiftPriceChange(selectedOrgId, selectedOutletId, shiftId, {
        product_id: selectedProductId,
        new_price: parseFloat(newPrice),
        nozzle_snapshot_readings: snapshotReadings,
      });
      setPreviewData(res);
      if (!res.is_valid && res.errors.length > 0) {
        setError(res.errors.join('; '));
      }
    } catch (err: any) {
      console.error('Failed to preview price change:', err);
      setError(err.message || 'Failed to preview price change.');
    }
  };

  const handleConfirm = async () => {
    if (!selectedOrgId || !selectedOutletId || !selectedProductId || !newPrice) return;
    setSubmitting(true);
    setError(null);

    try {
      await confirmShiftPriceChange(selectedOrgId, selectedOutletId, shiftId, {
        product_id: selectedProductId,
        new_price: parseFloat(newPrice),
        nozzle_snapshot_readings: snapshotReadings,
      });
      onPriceChanged();
      onClose();
    } catch (err: any) {
      console.error('Failed to apply price change:', err);
      setError(err.message || 'Failed to apply in-shift price change.');
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
              <Tag size={20} />
            </div>
            <div>
              <h3 className="h4" style={{ margin: 0, fontSize: '1.1rem' }}>In-Shift Fuel Price Change</h3>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                Snapshot current meters and segment revenue by product pricing.
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

        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
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
            When fuel price changes during a live shift, every active nozzle dispensing that product must record a snapshot reading.
            The current price segment closes at that reading, and a new segment opens with the new selling price.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>Fuel Product</label>
              <select
                className="form-input"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                style={{ width: '100%', padding: '0.6rem' }}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>New Selling Price (₹/L)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 104.50"
                className="form-input"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                required
                style={{ width: '100%', padding: '0.6rem', fontSize: '1.1rem', fontFamily: 'monospace' }}
              />
            </div>
          </div>

          {/* Nozzles Snapshot Table */}
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 600 }}>
              Active Nozzle Snapshot Readings ({productMeters.length})
            </h4>
            {productMeters.length === 0 ? (
              <div className="text-muted" style={{ padding: '1rem', textAlign: 'center' }}>
                No active nozzles are currently dispensing this product on this shift.
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border-color, #334155)', borderRadius: '8px', overflow: 'hidden' }}>
                <table className="table" style={{ margin: 0, width: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg, #f1f5f9)' }}>
                      <th>Nozzle</th>
                      <th>Attendant</th>
                      <th>Current Price</th>
                      <th>Opening Reading</th>
                      <th>Snapshot Reading <span style={{ color: '#f87171' }}>*</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productMeters.map((m) => (
                      <tr key={m.nozzle}>
                        <td>
                          <strong>{m.nozzle_code}</strong> <span className="text-muted">({m.dispenser_name})</span>
                        </td>
                        <td>{m.employee_name || 'Staff'}</td>
                        <td>
                          ₹{m.price_segments[0]?.unit_price ? parseFloat(m.price_segments[0].unit_price).toFixed(2) : '0.00'}
                        </td>
                        <td style={{ fontFamily: 'monospace' }}>
                          {parseFloat(m.opening_reading).toFixed(3)}
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.001"
                            placeholder="Snapshot reading"
                            className="form-input"
                            value={snapshotReadings[m.nozzle] || ''}
                            onChange={(e) =>
                              setSnapshotReadings({
                                ...snapshotReadings,
                                [m.nozzle]: e.target.value,
                              })
                            }
                            required
                            style={{ width: '140px', padding: '0.4rem', fontFamily: 'monospace', fontWeight: 600 }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {previewData && previewData.is_valid && (
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: '8px',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ fontWeight: 600, color: '#4ade80', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircle2 size={18} /> Price Segments Verified
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                Current segments will close at snapshot readings. Subsequent sales on {productMeters.length} nozzle{productMeters.length > 1 ? 's' : ''} will calculate at ₹{parseFloat(newPrice).toFixed(2)}/L.
              </div>
            </div>
          )}

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
        </div>

        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            backgroundColor: 'var(--bg-main, #f8fafc)',
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          {!previewData?.is_valid ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePreview}
              disabled={!selectedProductId || !newPrice || productMeters.length === 0}
            >
              Preview Price Segments
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={submitting}
              style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
            >
              {submitting ? 'Applying...' : 'Confirm & Apply Price Change'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
