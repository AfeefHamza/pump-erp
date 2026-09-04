import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchOperationalShifts, fetchShiftDefinitions,
  type ShiftListResponse, type ShiftDefinition
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { OpenShiftWizard } from '../components/OpenShiftWizard';
import { DiscardShiftModal } from '../components/DiscardShiftModal';
import { Clock, Plus, ArrowRight, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';

export const ShiftListPage: React.FC = () => {
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const canOpenShift = usePermission('shift.open');
  const canViewShift = usePermission('shift.view');

  const [shiftsData, setShiftsData] = useState<ShiftListResponse | null>(null);
  const [shiftDefinitions, setShiftDefinitions] = useState<ShiftDefinition[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [selectedShiftDefFilter, setSelectedShiftDefFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [shiftToDiscard, setShiftToDiscard] = useState<any | null>(null);

  const loadShifts = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId || !canViewShift) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOperationalShifts(selectedOrgId, selectedOutletId, {
        status: statusFilter,
        shift_definition_id: selectedShiftDefFilter || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      setShiftsData(res);
    } catch (err: any) {
      console.error('Failed to load operational shifts:', err);
      setError(err.message || 'Failed to fetch operational shifts.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, canViewShift, statusFilter, selectedShiftDefFilter, fromDate, toDate]);

  useEffect(() => {
    if (!selectedOrgId || !selectedOutletId) return;
    fetchShiftDefinitions(selectedOrgId, selectedOutletId)
      .then((res) => setShiftDefinitions(res.shifts || []))
      .catch((err) => console.error('Failed to load shift definitions:', err));
  }, [selectedOrgId, selectedOutletId]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  if (!canViewShift) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view operational shifts.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <PageHeader
          title="Live Operational Shifts"
          subtitle="Real-time shift management, meter totalizers, dip observations, and closing balance workflows."
        />

        {canOpenShift && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsWizardOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
          >
            <Plus size={18} /> Open New Shift
          </button>
        )}
      </div>

      {/* Active Open Shift Hero Banner */}
      {shiftsData?.current_open_shift && (
        <div
          className="card"
          style={{
            padding: '1.5rem 1.75rem',
            marginBottom: '1.75rem',
            backgroundColor: 'rgba(34, 197, 94, 0.08)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
              <span
                className="badge"
                style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.25)',
                  color: '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.5)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  padding: '0.3rem 0.6rem',
                }}
              >
                ● LIVE OPERATIONAL SHIFT
              </span>
              <h3 className="h3" style={{ margin: 0 }}>
                {shiftsData.current_open_shift.shift_definition_name}
              </h3>
            </div>
            <div className="text-muted" style={{ fontSize: '0.9rem' }}>
              Business Date: <strong>{shiftsData.current_open_shift.business_date}</strong> • Started at{' '}
              {new Date(shiftsData.current_open_shift.opened_at).toLocaleTimeString()} • Opened by{' '}
              {shiftsData.current_open_shift.opened_by_name || 'Operator'}
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem' }}>
              <div>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Volume Sold: </span>
                <strong style={{ fontFamily: 'monospace', fontSize: '1rem', color: '#60a5fa' }}>
                  {parseFloat(shiftsData.current_open_shift.totals.total_sale_quantity).toFixed(3)} L
                </strong>
              </div>
              <div>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Revenue: </span>
                <strong style={{ fontFamily: 'monospace', fontSize: '1rem', color: '#4ade80' }}>
                  ₹{parseFloat(shiftsData.current_open_shift.totals.total_fuel_sale_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShiftToDiscard(shiftsData.current_open_shift)}
              style={{
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: '#dc2626',
                borderColor: '#fca5a5',
              }}
              title="Discard / delete this open shift"
            >
              <Trash2 size={16} /> Discard Shift
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/app/operations/shifts/${shiftsData.current_open_shift?.id}`)}
              style={{
                padding: '0.75rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: 600,
                fontSize: '1rem',
                backgroundColor: '#16a34a',
                borderColor: '#16a34a',
              }}
            >
              Enter Live Workspace <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div
        className="card"
        style={{
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Status:</span>
          <select
            className="form-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{ padding: '0.4rem 0.75rem', width: '130px' }}
          >
            <option value="all">All Shifts</option>
            <option value="open">Open Only</option>
            <option value="closed">Closed Only</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Shift:</span>
          <select
            className="form-input"
            value={selectedShiftDefFilter}
            onChange={(e) => setSelectedShiftDefFilter(e.target.value)}
            style={{ padding: '0.4rem 0.75rem', width: '170px' }}
          >
            <option value="">All Definitions</option>
            {shiftDefinitions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>From:</span>
          <input
            type="date"
            className="form-input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ padding: '0.35rem 0.6rem' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>To:</span>
          <input
            type="date"
            className="form-input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ padding: '0.35rem 0.6rem' }}
          />
        </div>

        <button
          type="button"
          className="btn btn-outline"
          onClick={loadShifts}
          disabled={loading}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Shifts History Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <RefreshCw size={32} className="animate-spin text-primary" style={{ margin: '0 auto 1rem' }} />
            <p className="text-muted">Loading shifts...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#f87171' }}>
            <AlertCircle size={32} style={{ margin: '0 auto 0.5rem' }} />
            <p>{error}</p>
          </div>
        ) : !shiftsData || shiftsData.shifts.length === 0 ? (
          <div style={{ padding: '3.5rem', textAlign: 'center' }} className="text-muted">
            <Clock size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
            <h3 className="h4" style={{ marginBottom: '0.5rem' }}>No Operational Shifts Found</h3>
            <p>No operational shifts match your selected filters. Open a new shift to begin operations.</p>
            {canOpenShift && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsWizardOpen(true)}
                style={{ marginTop: '1rem' }}
              >
                Open First Shift
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, #f1f5f9)' }}>
                  <th>Business Date</th>
                  <th>Shift Name</th>
                  <th>Status</th>
                  <th>Timing</th>
                  <th>Attendants</th>
                  <th>Gross Dispensed</th>
                  <th>Testing Deducted</th>
                  <th>Net Sale Volume</th>
                  <th>Total Revenue</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shiftsData.shifts.map((shift) => (
                  <tr
                    key={shift.id}
                    onClick={() => navigate(`/app/operations/shifts/${shift.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <strong>{shift.business_date}</strong>
                    </td>
                    <td>
                      <strong>{shift.shift_definition_name}</strong>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          backgroundColor:
                            shift.status === 'open' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                          color: shift.status === 'open' ? '#4ade80' : '#94a3b8',
                          fontWeight: 700,
                        }}
                      >
                        {shift.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-muted" style={{ fontSize: '0.85rem' }}>
                      {new Date(shift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                      {shift.closed_at
                        ? new Date(shift.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Now'}
                    </td>
                    <td>{shift.staff_count} Staff</td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {parseFloat(shift.totals.total_gross_quantity).toFixed(3)} L
                    </td>
                    <td style={{ fontFamily: 'monospace', color: '#f59e0b' }}>
                      {parseFloat(shift.totals.total_testing_quantity).toFixed(3)} L
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa' }}>
                      {parseFloat(shift.totals.total_sale_quantity).toFixed(3)} L
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4ade80' }}>
                      ₹{parseFloat(shift.totals.total_fuel_sale_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/app/operations/shifts/${shift.id}`);
                          }}
                        >
                          Workspace
                        </button>
                        {shift.status === 'open' && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: '#dc2626' }}
                            title="Discard / delete this live shift"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShiftToDiscard(shift);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Open Shift Wizard Modal */}
      <OpenShiftWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onShiftOpened={(shift) => {
          navigate(`/app/operations/shifts/${shift.id}`);
        }}
      />

      {selectedOrgId && selectedOutletId && shiftToDiscard && (
        <DiscardShiftModal
          isOpen={Boolean(shiftToDiscard)}
          onClose={() => setShiftToDiscard(null)}
          onSuccess={() => {
            setShiftToDiscard(null);
            loadShifts();
          }}
          orgId={selectedOrgId}
          outletId={selectedOutletId}
          shiftId={shiftToDiscard.id}
          shiftName={shiftToDiscard.shift_definition_name || 'Open Shift'}
          businessDate={shiftToDiscard.business_date}
        />
      )}
    </div>
  );
};
