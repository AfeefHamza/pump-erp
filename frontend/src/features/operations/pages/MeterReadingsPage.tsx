import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchOperationalShifts, fetchOperationalShiftDetail, recordShiftMeterReading,
  type ShiftNozzleMeterItem, type OperationalShiftListItem
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { Clock, RefreshCw, ArrowRight } from 'lucide-react';

export const MeterReadingsPage: React.FC = () => {
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const canRecord = usePermission('meter_reading.record');
  const canView = usePermission('meter_reading.view');

  const [activeShiftSummary, setActiveShiftSummary] = useState<OperationalShiftListItem | null>(null);
  const [meters, setMeters] = useState<ShiftNozzleMeterItem[]>([]);
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [savingMeterId, setSavingMeterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOperationalShifts(selectedOrgId, selectedOutletId, { status: 'open' });
      if (res.current_open_shift) {
        setActiveShiftSummary(res.current_open_shift);
        const detail = await fetchOperationalShiftDetail(selectedOrgId, selectedOutletId, res.current_open_shift.id);
        setMeters(detail.shift.meters);
        const map: Record<string, string> = {};
        detail.shift.meters.forEach((m) => {
          if (m.closing_reading !== null) {
            map[m.nozzle] = m.closing_reading;
          }
        });
        setReadings(map);
      } else {
        setActiveShiftSummary(null);
        setMeters([]);
      }
    } catch (err: any) {
      console.error('Failed to load meter readings data:', err);
      setError(err.message || 'Failed to fetch meter readings.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, canView]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (meter: ShiftNozzleMeterItem) => {
    if (!selectedOrgId || !selectedOutletId || !activeShiftSummary) return;
    const val = readings[meter.nozzle];
    if (val === undefined || val === '') return;

    setSavingMeterId(meter.nozzle);
    setError(null);
    try {
      await recordShiftMeterReading(selectedOrgId, selectedOutletId, activeShiftSummary.id, meter.nozzle, {
        closing_reading: parseFloat(val),
      });
      // Refresh
      const detail = await fetchOperationalShiftDetail(selectedOrgId, selectedOutletId, activeShiftSummary.id);
      setMeters(detail.shift.meters);
    } catch (err: any) {
      console.error('Failed to save reading:', err);
      setError(`Nozzle ${meter.nozzle_code}: ${err.message || 'Failed to save meter reading.'}`);
    } finally {
      setSavingMeterId(null);
    }
  };

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view meter readings.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <PageHeader
          title="Forecourt Meter Readings"
          subtitle="Record and update closing meter readings on active nozzles."
        />
        {activeShiftSummary && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate(`/app/operations/shifts/${activeShiftSummary.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            Live Shift Workspace <ArrowRight size={16} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <RefreshCw size={32} className="animate-spin text-primary" style={{ margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading live nozzle totalizers...</p>
        </div>
      ) : !activeShiftSummary ? (
        <div className="card" style={{ padding: '3.5rem', textAlign: 'center' }}>
          <Clock size={48} className="text-muted" style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
          <h3 className="h4">No Operational Shift Currently Open</h3>
          <p className="text-muted" style={{ maxWidth: '480px', margin: '0.5rem auto 1.5rem' }}>
            Meter totalizer readings can only be recorded during an active operational shift.
            Open a shift to start recording readings.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/app/operations/shifts')}
          >
            Go to Operational Shifts
          </button>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div
            style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid var(--border-color, #334155)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'rgba(34, 197, 94, 0.05)',
            }}
          >
            <div>
              <span className="badge" style={{ backgroundColor: '#16a34a', marginRight: '0.5rem' }}>
                Active Shift
              </span>
              <strong>{activeShiftSummary.shift_definition_name}</strong> • Business Date: {activeShiftSummary.business_date}
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={loadData}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {error && (
            <div
              style={{
                padding: '0.75rem 1.25rem',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                fontSize: '0.85rem',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, #f1f5f9)' }}>
                  <th>Nozzle</th>
                  <th>Product</th>
                  <th>Attendant (DSM)</th>
                  <th>Opening Reading</th>
                  <th>Closing Reading</th>
                  <th>Gross Sold</th>
                  <th>Testing Deducted</th>
                  <th>Net Sale Quantity</th>
                  <th>Revenue (₹)</th>
                </tr>
              </thead>
              <tbody>
                {meters.map((meter) => (
                  <tr key={meter.id}>
                    <td>
                      <strong>{meter.nozzle_code}</strong> <span className="text-muted">({meter.dispenser_name})</span>
                    </td>
                    <td>
                      <span className="badge" style={{ backgroundColor: '#0284c7' }}>
                        {meter.product_name}
                      </span>
                    </td>
                    <td>{meter.employee_name || 'Staff'}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {parseFloat(meter.opening_reading).toFixed(3)}
                    </td>
                    <td>
                      {canRecord ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="number"
                            step="0.001"
                            className="form-input"
                            value={readings[meter.nozzle] || ''}
                            onChange={(e) =>
                              setReadings({
                                ...readings,
                                [meter.nozzle]: e.target.value,
                              })
                            }
                            onBlur={() => handleSave(meter)}
                            placeholder="Enter closing"
                            style={{ width: '140px', padding: '0.4rem', fontFamily: 'monospace', fontWeight: 600 }}
                          />
                          {savingMeterId === meter.nozzle && <RefreshCw size={14} className="animate-spin text-muted" />}
                        </div>
                      ) : (
                        <span style={{ fontFamily: 'monospace' }}>
                          {meter.closing_reading ? parseFloat(meter.closing_reading).toFixed(3) : 'Pending'}
                        </span>
                      )}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{parseFloat(meter.gross_quantity).toFixed(3)} L</td>
                    <td style={{ fontFamily: 'monospace', color: '#f59e0b' }}>
                      {parseFloat(meter.testing_quantity).toFixed(3)} L
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa' }}>
                      {parseFloat(meter.sale_quantity).toFixed(3)} L
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4ade80' }}>
                      ₹{parseFloat(meter.sale_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
