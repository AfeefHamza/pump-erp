import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchOperationalShifts, fetchOperationalShiftDetail,
  type ShiftTankDipObservationItem, type OperationalShiftListItem
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { RecordDipModal } from '../components/RecordDipModal';
import { Droplet, Clock, Plus, RefreshCw, ArrowRight } from 'lucide-react';

export const DipReadingsPage: React.FC = () => {
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const canRecord = usePermission('dip_reading.record');
  const canView = usePermission('dip_reading.view');

  const [activeShiftSummary, setActiveShiftSummary] = useState<OperationalShiftListItem | null>(null);
  const [dips, setDips] = useState<ShiftTankDipObservationItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTankForDip, setSelectedTankForDip] = useState<string | undefined>();

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
        setDips(detail.shift.dip_observations);
      } else {
        setActiveShiftSummary(null);
        setDips([]);
      }
    } catch (err: any) {
      console.error('Failed to load dip readings data:', err);
      setError(err.message || 'Failed to fetch dip observations.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, canView]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view dip readings.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <PageHeader
          title="Tank Dip Observations"
          subtitle="Physical fuel stock dip observations converted through calibration charts."
        />
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {activeShiftSummary && canRecord && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setSelectedTankForDip(undefined);
                setIsModalOpen(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Plus size={16} /> Record Dip
            </button>
          )}
          {activeShiftSummary && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => navigate(`/app/operations/shifts/${activeShiftSummary.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              Live Shift Workspace <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <RefreshCw size={32} className="animate-spin text-primary" style={{ margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading tank dip observations...</p>
        </div>
      ) : !activeShiftSummary ? (
        <div className="card" style={{ padding: '3.5rem', textAlign: 'center' }}>
          <Clock size={48} className="text-muted" style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
          <h3 className="h4">No Operational Shift Currently Open</h3>
          <p className="text-muted" style={{ maxWidth: '480px', margin: '0.5rem auto 1.5rem' }}>
            Shift opening and closing physical dips are associated with an active operational shift.
            Please open an operational shift to record dips.
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
                color: '#f87171',
                fontSize: '0.85rem',
              }}
            >
              {error}
            </div>
          )}

          {dips.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }} className="text-muted">
              <Droplet size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
              <p>No dip observations recorded yet for this active shift.</p>
              {canRecord && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIsModalOpen(true)}
                  style={{ marginTop: '0.5rem' }}
                >
                  Record First Dip
                </button>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', margin: 0 }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg, #f1f5f9)' }}>
                    <th>Tank</th>
                    <th>Product</th>
                    <th>Stage</th>
                    <th>Raw Dip Level</th>
                    <th>Converted Volume (L)</th>
                    <th>Fuel Density (kg/m³)</th>
                    <th>Calibration Conversion</th>
                    <th>Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {dips.map((dip) => (
                    <tr key={dip.id}>
                      <td>
                        <strong>{dip.tank_code}</strong> <span className="text-muted">({dip.tank_name})</span>
                      </td>
                      <td>{dip.product_name}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            backgroundColor: dip.observation_type === 'opening' ? '#0284c7' : '#7c3aed',
                          }}
                        >
                          {dip.observation_type.toUpperCase()} DIP
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {parseFloat(dip.raw_dip_value).toFixed(2)} {dip.raw_dip_unit}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa', fontSize: '1.05rem' }}>
                        {dip.converted_quantity !== null ? `${parseFloat(dip.converted_quantity).toFixed(2)} L` : 'Pending'}
                      </td>
                      <td>{dip.density ? `${parseFloat(dip.density).toFixed(1)}` : '—'}</td>
                      <td>
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                          {dip.calibration_chart_name ? `${dip.calibration_chart_name} (${dip.conversion_method})` : dip.conversion_method}
                        </span>
                      </td>
                      <td>{dip.recorded_by_name || 'Staff'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Record Dip Modal */}
      <RecordDipModal
        isOpen={isModalOpen}
        shiftId={activeShiftSummary?.id || ''}
        initialTankId={selectedTankForDip}
        initialObsType="closing"
        onClose={() => setIsModalOpen(false)}
        onDipSaved={loadData}
      />
    </div>
  );
};
