import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchOperationalShiftDetail, recordShiftMeterReading,
  fetchShiftActivityLogs, fetchShiftStaffHistory,
  fetchEmployees, fetchDesignations,
  type OperationalShiftDetailResponse, type ShiftNozzleMeterItem,
  type ShiftActivityLogItem, type ShiftStaffHistoryResponse,
  type Employee, type EmployeeDesignation
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { CloseShiftModal } from '../components/CloseShiftModal';
import { ReopenShiftModal } from '../components/ReopenShiftModal';
import { MeterEventModal } from '../components/MeterEventModal';
import { RecordTestingModal } from '../components/RecordTestingModal';
import { RecordDipModal } from '../components/RecordDipModal';
import { PriceChangeModal } from '../components/PriceChangeModal';
import { ManageStaffModal } from '../components/ManageStaffModal';
import { DiscardShiftModal } from '../components/DiscardShiftModal';
import { AddStaffModal } from '../components/AddStaffModal';
import { TransferNozzleModal } from '../components/TransferNozzleModal';
import { TransferCashierModal } from '../components/TransferCashierModal';
import {
  Gauge, Fuel, Droplet, Tag, Users, Activity, Lock,
  RotateCcw, RefreshCw, AlertCircle, Plus, Trash2,
  UserPlus, ArrowRightLeft, Shield, History, ChevronDown, ChevronUp
} from 'lucide-react';

export const LiveShiftWorkspace: React.FC = () => {
  const { shiftId } = useParams<{ shiftId: string }>();
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  // Permissions
  const canCloseShift = usePermission('shift.close');
  const canReopenShift = usePermission('shift.reopen');
  const canRecordMeter = usePermission('meter_reading.record');
  const canRecordEvent = usePermission('meter_event.record');
  const canRecordTesting = usePermission('testing.record');
  const canRecordDip = usePermission('dip_reading.record');
  const canChangePrice = usePermission('product_price.update');
  const canUpdateOpen = usePermission('shift.update_open');
  const canHandoverNozzle = usePermission('shift.nozzle_handover');
  const canTransferCashier = usePermission('shift.cashier_transfer');

  const [shiftData, setShiftData] = useState<OperationalShiftDetailResponse | null>(null);
  const [activityLogs, setActivityLogs] = useState<ShiftActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'meters' | 'testing' | 'dips' | 'segments' | 'staff' | 'activity'>('meters');

  // Modals state
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [isMeterEventModalOpen, setIsMeterEventModalOpen] = useState(false);
  const [selectedMeterForEvent, setSelectedMeterForEvent] = useState<ShiftNozzleMeterItem | null>(null);
  const [isTestingModalOpen, setIsTestingModalOpen] = useState(false);
  const [isDipModalOpen, setIsDipModalOpen] = useState(false);
  const [isPriceChangeModalOpen, setIsPriceChangeModalOpen] = useState(false);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);

  // Live Staff & Handover Modals State
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const [isTransferNozzleModalOpen, setIsTransferNozzleModalOpen] = useState(false);
  const [selectedNozzleForTransfer, setSelectedNozzleForTransfer] = useState<string | undefined>(undefined);
  const [isTransferCashierModalOpen, setIsTransferCashierModalOpen] = useState(false);

  // Staff & History State
  const [outletEmployees, setOutletEmployees] = useState<Employee[]>([]);
  const [designations, setDesignations] = useState<EmployeeDesignation[]>([]);
  const [staffHistory, setStaffHistory] = useState<ShiftStaffHistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistoryTimeline, setShowHistoryTimeline] = useState(false);

  // Inline closing reading state: nozzleId -> string
  const [inlineReadings, setInlineReadings] = useState<Record<string, string>>({});
  const [savingMeterId, setSavingMeterId] = useState<string | null>(null);
  const [readingError, setReadingError] = useState<string | null>(null);

  const loadShift = useCallback(async (isSilent = false) => {
    if (!selectedOrgId || !selectedOutletId || !shiftId) return;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const data = await fetchOperationalShiftDetail(selectedOrgId, selectedOutletId, shiftId);
      setShiftData(data);

      // Populate inline readings
      const initialReadings: Record<string, string> = {};
      data.shift.meters.forEach((m) => {
        if (m.closing_reading !== null) {
          initialReadings[m.nozzle] = m.closing_reading;
        }
      });
      setInlineReadings(initialReadings);

      // Fetch logs
      const logs = await fetchShiftActivityLogs(selectedOrgId, selectedOutletId, shiftId);
      setActivityLogs(logs);
    } catch (err: any) {
      console.error('Failed to load operational shift:', err);
      setError(err.message || 'Failed to fetch operational shift workspace.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedOrgId, selectedOutletId, shiftId]);

  const loadStaffHistory = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId || !shiftId) return;
    try {
      setLoadingHistory(true);
      const hist = await fetchShiftStaffHistory(selectedOrgId, selectedOutletId, shiftId);
      setStaffHistory(hist);
    } catch (err) {
      console.error('Failed to load shift staff history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedOrgId, selectedOutletId, shiftId]);

  useEffect(() => {
    loadShift();
  }, [loadShift]);

  useEffect(() => {
    if (!selectedOrgId || !selectedOutletId) return;
    fetchEmployees(selectedOrgId, { status: 'active' })
      .then((emps) => {
        const filtered = emps.filter((e) =>
          e.outlet_assignments?.some(
            (oa: any) =>
              oa.outlet_id === selectedOutletId ||
              oa.outlet === selectedOutletId ||
              oa.outlet_details?.id === selectedOutletId
          )
        );
        setOutletEmployees(filtered.length > 0 ? filtered : emps);
      })
      .catch((err) => console.error('Failed to load employees:', err));

    fetchDesignations(selectedOrgId)
      .then((d) => setDesignations(d || []))
      .catch((err) => console.error('Failed to load designations:', err));
  }, [selectedOrgId, selectedOutletId]);

  useEffect(() => {
    if (activeTab === 'staff') {
      loadStaffHistory();
    }
  }, [activeTab, loadStaffHistory]);

  const handleSaveClosingReading = async (meter: ShiftNozzleMeterItem) => {
    if (!selectedOrgId || !selectedOutletId || !shiftId) return;
    const val = inlineReadings[meter.nozzle];
    if (val === undefined || val === '') return;

    setSavingMeterId(meter.nozzle);
    setReadingError(null);
    try {
      await recordShiftMeterReading(selectedOrgId, selectedOutletId, shiftId, meter.nozzle, {
        closing_reading: parseFloat(val),
      });
      await loadShift(true);
    } catch (err: any) {
      console.error('Failed to save closing reading:', err);
      setReadingError(`Nozzle ${meter.nozzle_code}: ${err.message || 'Failed to save closing reading.'}`);
    } finally {
      setSavingMeterId(null);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <RefreshCw size={36} className="animate-spin text-primary" style={{ margin: '0 auto 1rem' }} />
        <h3 className="h4">Loading Operational Shift Workspace...</h3>
        <p className="text-muted">Fetching meter totals, staff assignments, and forecourt logs</p>
      </div>
    );
  }

  if (error || !shiftData) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <AlertCircle size={40} className="text-danger" style={{ margin: '0 auto 1rem' }} />
        <h3 className="h4">Shift Workspace Unavailable</h3>
        <p className="text-muted">{error || 'The requested operational shift could not be found.'}</p>
        <button className="btn btn-outline" onClick={() => navigate('/app/operations/shifts')} style={{ marginTop: '1rem' }}>
          Back to Shifts
        </button>
      </div>
    );
  }

  const { shift, totals, can_reopen } = shiftData;
  const isShiftOpen = shift.status === 'open';

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Breadcrumb & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <PageHeader
            title={`${shift.shift_definition_name} (${shift.business_date})`}
            subtitle={`Opened: ${new Date(shift.opened_at).toLocaleString()} • Shift ID: ${shift.id.slice(0, 8)}`}
            backLink={{ to: '/app/operations/shifts', label: 'Back to Shifts List' }}
          />
        </div>

        {/* Action Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => loadShift(true)}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          {isShiftOpen ? (
            <>
              {canRecordTesting && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsTestingModalOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Fuel size={16} /> Record Testing
                </button>
              )}

              {canRecordDip && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsDipModalOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Droplet size={16} /> Record Dip
                </button>
              )}

              {canChangePrice && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsPriceChangeModalOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Tag size={16} /> Change Price
                </button>
              )}

              {canCloseShift && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIsCloseModalOpen(true)}
                  style={{
                    backgroundColor: '#dc2626',
                    borderColor: '#dc2626',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontWeight: 600,
                  }}
                >
                  <Lock size={16} /> Close Shift
                </button>
              )}

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsDiscardModalOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  color: '#dc2626',
                  borderColor: '#fca5a5',
                }}
                title="Discard / delete this live shift"
              >
                <Trash2 size={16} /> Discard Shift
              </button>
            </>
          ) : (
            can_reopen && canReopenShift && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsReopenModalOpen(true)}
                style={{
                  backgroundColor: '#d97706',
                  borderColor: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 600,
                }}
              >
                <RotateCcw size={16} /> Reopen Shift
              </button>
            )
          )}
        </div>
      </div>

      {/* Reopened Banner if applicable */}
      {shift.reopened_at && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '10px',
            color: '#fbbf24',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
          }}
        >
          <RotateCcw size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>Shift Reopened by {shift.reopened_by_name}</strong> on {new Date(shift.reopened_at).toLocaleString()}.
            <span style={{ marginLeft: '0.5rem', color: '#fde68a' }}>Reason: "{shift.reopen_reason}"</span>
          </div>
        </div>
      )}

      {/* KPI Cards Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Shift Status
          </div>
          <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              className="badge"
              style={{
                backgroundColor: isShiftOpen ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                color: isShiftOpen ? '#4ade80' : '#94a3b8',
                border: isShiftOpen ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(100, 116, 139, 0.4)',
                fontSize: '0.9rem',
                padding: '0.35rem 0.75rem',
                fontWeight: 700,
              }}
            >
              {isShiftOpen ? '● LIVE OPEN' : 'CLOSED'}
            </span>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Gross Dispensed Volume
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.4rem' }}>
            {parseFloat(totals?.overall?.total_gross_quantity || '0').toFixed(3)} <span style={{ fontSize: '0.9rem' }}>L</span>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Fuel Testing Deductions
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.4rem', color: '#f59e0b' }}>
            {parseFloat(totals?.overall?.total_testing_quantity || '0').toFixed(3)} <span style={{ fontSize: '0.9rem' }}>L</span>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', backgroundColor: 'rgba(59, 130, 246, 0.06)' }}>
          <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Net Fuel Sold Volume
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.4rem', color: '#60a5fa' }}>
            {parseFloat(totals?.overall?.total_sale_quantity || '0').toFixed(3)} <span style={{ fontSize: '0.9rem' }}>L</span>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', backgroundColor: 'rgba(34, 197, 94, 0.06)' }}>
          <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Fuel Sale Amount
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.4rem', color: '#4ade80' }}>
            ₹{parseFloat(totals?.overall?.total_fuel_sale_amount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {readingError && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#f87171',
            marginBottom: '1.5rem',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertCircle size={18} />
          <span>{readingError}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border-color, #334155)',
          marginBottom: '1.5rem',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('meters')}
          className={`btn ${activeTab === 'meters' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '8px 8px 0 0' }}
        >
          <Gauge size={16} /> Meter Totalizers ({shift.meters.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('testing')}
          className={`btn ${activeTab === 'testing' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '8px 8px 0 0' }}
        >
          <Fuel size={16} /> Fuel Testing ({shift.testing_records.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('dips')}
          className={`btn ${activeTab === 'dips' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '8px 8px 0 0' }}
        >
          <Droplet size={16} /> Tank Dips ({shift.dip_observations.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('segments')}
          className={`btn ${activeTab === 'segments' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '8px 8px 0 0' }}
        >
          <Tag size={16} /> Price Segments
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('staff')}
          className={`btn ${activeTab === 'staff' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '8px 8px 0 0' }}
        >
          <Users size={16} /> Staff & DSMs ({shift.staff_members.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          className={`btn ${activeTab === 'activity' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '8px 8px 0 0' }}
        >
          <Activity size={16} /> Audit Trail ({activityLogs.length})
        </button>
      </div>

      {/* TAB 1: METERS TABLE */}
      {activeTab === 'meters' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="h4" style={{ margin: 0 }}>Nozzle Meter Totalizers</h3>
              <p className="text-muted" style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem' }}>
                Enter closing meter readings for each nozzle. Sales volume and revenue calculate automatically.
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, #f1f5f9)' }}>
                  <th>Nozzle</th>
                  <th>Product</th>
                  <th>Attendant (DSM)</th>
                  <th>Opening Totalizer</th>
                  <th>Closing Totalizer</th>
                  <th>Gross Dispensed</th>
                  <th>Testing (L)</th>
                  <th>Net Sale (L)</th>
                  <th>Sale Revenue (₹)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shift.meters.map((meter) => {
                  const isSaving = savingMeterId === meter.nozzle;
                  return (
                    <tr key={meter.id}>
                      <td>
                        <strong>{meter.nozzle_code}</strong>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>{meter.dispenser_name}</div>
                      </td>
                      <td>
                        <span className="badge" style={{ backgroundColor: '#0284c7' }}>
                          {meter.product_name}
                        </span>
                      </td>
                      <td>
                        <div>{meter.employee_name || 'Unassigned'}</div>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {meter.manual_exception_type ? `Exception: ${meter.manual_exception_type}` : ''}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1rem' }}>
                        {parseFloat(meter.opening_reading).toFixed(3)}
                      </td>
                      <td>
                        {isShiftOpen && canRecordMeter ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                              type="number"
                              step="0.001"
                              placeholder="Closing reading"
                              className="form-input"
                              value={inlineReadings[meter.nozzle] || ''}
                              onChange={(e) =>
                                setInlineReadings({
                                  ...inlineReadings,
                                  [meter.nozzle]: e.target.value,
                                })
                              }
                              onBlur={() => handleSaveClosingReading(meter)}
                              style={{ width: '130px', padding: '0.4rem', fontFamily: 'monospace', fontWeight: 600 }}
                            />
                            {isSaving && <RefreshCw size={14} className="animate-spin text-muted" />}
                          </div>
                        ) : (
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1rem' }}>
                            {meter.closing_reading !== null ? parseFloat(meter.closing_reading).toFixed(3) : 'Pending'}
                          </span>
                        )}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {parseFloat(meter.gross_quantity).toFixed(3)}
                      </td>
                      <td style={{ fontFamily: 'monospace', color: '#f59e0b' }}>
                        {parseFloat(meter.testing_quantity).toFixed(3)}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa' }}>
                        {parseFloat(meter.sale_quantity).toFixed(3)}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4ade80' }}>
                        ₹{parseFloat(meter.sale_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        {isShiftOpen && canRecordEvent && (
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => {
                              setSelectedMeterForEvent(meter);
                              setIsMeterEventModalOpen(true);
                            }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Meter Event
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: FUEL TESTING */}
      {activeTab === 'testing' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="h4" style={{ margin: 0 }}>Fuel Quality & Dispenser Testing Records</h3>
              <p className="text-muted" style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem' }}>
                Calibration test measures deducted from meter dispensing calculations.
              </p>
            </div>
            {isShiftOpen && canRecordTesting && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsTestingModalOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
              >
                <Plus size={16} /> Add Testing Record
              </button>
            )}
          </div>

          {shift.testing_records.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }} className="text-muted">
              No fuel testing records logged for this shift.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', margin: 0 }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg, #f1f5f9)' }}>
                    <th>Time</th>
                    <th>Nozzle</th>
                    <th>Volume (L)</th>
                    <th>Returned to Tank?</th>
                    <th>Destination Tank</th>
                    <th>Recorded By</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {shift.testing_records.map((t) => (
                    <tr key={t.id}>
                      <td>{new Date(t.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>
                        <strong>{t.nozzle_code}</strong> <span className="text-muted">({t.nozzle_name})</span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1.05rem' }}>
                        {parseFloat(t.quantity).toFixed(3)} L
                      </td>
                      <td>
                        {t.returned_to_tank ? (
                          <span className="badge" style={{ backgroundColor: '#16a34a' }}>
                            Yes (Restored to Tank)
                          </span>
                        ) : (
                          <span className="badge" style={{ backgroundColor: '#dc2626' }}>
                            No (Depleted Stock)
                          </span>
                        )}
                      </td>
                      <td>{t.destination_tank_name || '—'}</td>
                      <td>{t.created_by_name || 'Operator'}</td>
                      <td>{t.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TANK DIPS */}
      {activeTab === 'dips' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="h4" style={{ margin: 0 }}>Underground Tank Physical Dip Observations</h3>
              <p className="text-muted" style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem' }}>
                Opening and closing physical dips converted through calibrated dip-volume charts.
              </p>
            </div>
            {isShiftOpen && canRecordDip && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsDipModalOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
              >
                <Plus size={16} /> Record Dip
              </button>
            )}
          </div>

          {shift.dip_observations.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }} className="text-muted">
              No dip observations recorded yet for this shift.
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
                    <th>Density (kg/m³)</th>
                    <th>Conversion Method</th>
                    <th>Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {shift.dip_observations.map((dip) => (
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
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.05rem', color: '#60a5fa' }}>
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

      {/* TAB 4: PRICE SEGMENTS */}
      {activeTab === 'segments' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color, #334155)' }}>
            <h3 className="h4" style={{ margin: 0 }}>Nozzle Price Segments Breakdown</h3>
            <p className="text-muted" style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem' }}>
              Shows continuous meter segments and applicable price rates throughout the shift.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg, #f1f5f9)' }}>
                  <th>Nozzle</th>
                  <th>Seq</th>
                  <th>Started At</th>
                  <th>Ended At</th>
                  <th>Unit Price (₹/L)</th>
                  <th>Opening Reading</th>
                  <th>Closing Reading</th>
                  <th>Segment Sold (L)</th>
                  <th>Segment Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {shift.meters.flatMap((m) =>
                  m.price_segments.map((seg) => (
                    <tr key={seg.id}>
                      <td>
                        <strong>{m.nozzle_code}</strong> <span className="text-muted">({m.product_name})</span>
                      </td>
                      <td>#{seg.sequence}</td>
                      <td>{new Date(seg.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>
                        {seg.ends_at
                          ? new Date(seg.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Active (Current)'}
                      </td>
                      <td style={{ fontWeight: 700, color: '#38bdf8' }}>
                        ₹{parseFloat(seg.unit_price).toFixed(2)}
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{parseFloat(seg.opening_reading).toFixed(3)}</td>
                      <td style={{ fontFamily: 'monospace' }}>
                        {seg.closing_reading !== null ? parseFloat(seg.closing_reading).toFixed(3) : 'Pending'}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {parseFloat(seg.sale_quantity).toFixed(3)}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4ade80' }}>
                        ₹{parseFloat(seg.sale_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: STAFF OPERATIONS & DSMS */}
      {activeTab === 'staff' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div
              style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--border-color, #334155)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div>
                <h3 className="h4" style={{ margin: 0 }}>Shift Staff & Duty Attendants (DSM)</h3>
                <p className="text-muted" style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem' }}>
                  Manage duty designations, primary cashier responsibility, and meter totalizer handovers.
                </p>
              </div>
              {isShiftOpen && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {canUpdateOpen && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setIsAddStaffModalOpen(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', backgroundColor: '#0284c7' }}
                    >
                      <UserPlus size={16} /> + Add Staff
                    </button>
                  )}
                  {canHandoverNozzle && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setSelectedNozzleForTransfer(undefined);
                        setIsTransferNozzleModalOpen(true);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                    >
                      <ArrowRightLeft size={16} /> Handover Nozzle
                    </button>
                  )}
                  {canTransferCashier && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setIsTransferCashierModalOpen(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#059669' }}
                    >
                      <Shield size={16} /> Transfer Cashier
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      setShowHistoryTimeline(!showHistoryTimeline);
                      if (!staffHistory) loadStaffHistory();
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                  >
                    <History size={16} />
                    <span>{showHistoryTimeline ? 'Hide History' : 'Assignment History'}</span>
                    {showHistoryTimeline ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', margin: 0 }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--table-header-bg, #f8fafc)', color: 'var(--table-header-text, #334155)' }}>
                    <th>Employee</th>
                    <th>Duty Designation</th>
                    <th>Effective From</th>
                    <th>Assigned Nozzles</th>
                    <th>Cashier Status</th>
                    <th>Status</th>
                    <th>Gross (L)</th>
                    <th>Testing (L)</th>
                    <th>Net Sold (L)</th>
                    <th>Sales Amount (₹)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(totals?.employees || []).map((emp) => {
                    const staffObj = (shift.staff_members || []).find((s) => s.source_employee === emp.employee_id);
                    const nozzleList = emp.nozzle_codes || (emp as any).assigned_nozzles || [];
                    const isEnded = Boolean((staffObj as any)?.effective_to);
                    const effectiveFrom = (staffObj as any)?.effective_from;
                    return (
                      <tr key={emp.employee_id || emp.employee_name}>
                        <td>
                          <strong>{emp.employee_name}</strong>
                          <div className="text-muted" style={{ fontSize: '0.8rem' }}>{emp.employee_code}</div>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.78125rem',
                              fontWeight: 500,
                              backgroundColor: 'rgba(14, 165, 233, 0.1)',
                              color: '#0369a1',
                            }}
                          >
                            {emp.designation}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8125rem' }}>
                          {effectiveFrom ? new Date(effectiveFrom).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Opening'}
                        </td>
                        <td>
                          {nozzleList.length === 0 ? (
                            <span className="text-muted" style={{ fontSize: '0.78125rem' }}>No Nozzles (Support)</span>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              {nozzleList.map((code: string) => (
                                <span key={code} className="badge" style={{ backgroundColor: '#334155' }}>
                                  {code}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          {staffObj?.is_primary_cashier ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                backgroundColor: 'rgba(34, 197, 94, 0.12)',
                                color: '#15803d',
                              }}
                            >
                              <Shield size={12} /> Active Cashier
                            </span>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '0.8125rem' }}>—</span>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              backgroundColor: isEnded ? 'rgba(100, 116, 139, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                              color: isEnded ? '#64748b' : '#15803d',
                            }}
                          >
                            {isEnded ? 'Ended' : 'Active'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace' }}>{parseFloat(emp.gross_quantity || '0').toFixed(3)}</td>
                        <td style={{ fontFamily: 'monospace', color: '#f59e0b' }}>
                          {parseFloat(emp.testing_quantity || '0').toFixed(3)}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa' }}>
                          {parseFloat(emp.sale_quantity || '0').toFixed(3)}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4ade80' }}>
                          ₹{parseFloat(emp.sale_amount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          {isShiftOpen && nozzleList.length > 0 && canHandoverNozzle && (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              {nozzleList.map((nzCode: string) => {
                                const meterObj = shift.meters.find((m) => m.nozzle_code === nzCode);
                                return (
                                  <button
                                    key={nzCode}
                                    type="button"
                                    onClick={() => {
                                      if (meterObj) setSelectedNozzleForTransfer(meterObj.nozzle);
                                      setIsTransferNozzleModalOpen(true);
                                    }}
                                    style={{
                                      padding: '2px 8px',
                                      fontSize: '0.75rem',
                                      borderRadius: '4px',
                                      border: '1px solid #2563eb',
                                      backgroundColor: 'rgba(37, 99, 235, 0.08)',
                                      color: '#2563eb',
                                      cursor: 'pointer',
                                      fontWeight: 500,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                    }}
                                  >
                                    <ArrowRightLeft size={12} /> Handover {nzCode}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historical Assignment & Cashier Timeline Accordion */}
          {showHistoryTimeline && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Cashier Periods */}
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color, #334155)' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Shield size={16} color="#059669" /> Cashier Responsibility Periods
                  </h4>
                  <p className="text-muted" style={{ margin: '0.2rem 0 0 0', fontSize: '0.8125rem' }}>
                    Chronological audit trail of primary cashiers and cash handover accountability.
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%', margin: 0 }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--table-header-bg, #f8fafc)', color: 'var(--table-header-text, #334155)' }}>
                        <th>Cashier</th>
                        <th>Effective From</th>
                        <th>Effective To</th>
                        <th>Status</th>
                        <th>Changed By</th>
                        <th>Handover Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!staffHistory?.cashier_periods || staffHistory.cashier_periods.length === 0) ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary, #64748b)', padding: '1.5rem' }}>
                            {loadingHistory ? 'Loading cashier periods...' : 'No cashier transitions recorded for this shift.'}
                          </td>
                        </tr>
                      ) : (
                        staffHistory.cashier_periods.map((cp) => (
                          <tr key={cp.id}>
                            <td>
                              <strong>{cp.staff_name}</strong>
                              <span className="text-muted" style={{ fontSize: '0.78125rem', marginLeft: '0.375rem' }}>({cp.staff_code})</span>
                            </td>
                            <td style={{ fontSize: '0.8125rem' }}>{new Date(cp.effective_from).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                            <td style={{ fontSize: '0.8125rem' }}>
                              {cp.effective_to ? new Date(cp.effective_to).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active (Current)'}
                            </td>
                            <td>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  backgroundColor: cp.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                                  color: cp.is_active ? '#15803d' : '#64748b',
                                }}
                              >
                                {cp.is_active ? 'Active' : 'Handed Over'}
                              </span>
                            </td>
                            <td>{cp.changed_by_name || 'System'}</td>
                            <td style={{ fontSize: '0.8125rem' }}>{cp.reason}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Nozzle Assignment & Handover Timeline */}
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color, #334155)' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Gauge size={16} color="#2563eb" /> Nozzle Dispensing Intervals & Handovers
                  </h4>
                  <p className="text-muted" style={{ margin: '0.2rem 0 0 0', fontSize: '0.8125rem' }}>
                    Complete record of attendant meter periods with starting and handover totalizer readings.
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%', margin: 0 }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--table-header-bg, #f8fafc)', color: 'var(--table-header-text, #334155)' }}>
                        <th>Nozzle</th>
                        <th>Attendant (DSM)</th>
                        <th>Effective Period</th>
                        <th>Opening Reading</th>
                        <th>Closing / Handover</th>
                        <th>Handled Volume</th>
                        <th>Type</th>
                        <th>Handover Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!staffHistory?.nozzle_assignments || staffHistory.nozzle_assignments.length === 0) ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary, #64748b)', padding: '1.5rem' }}>
                            {loadingHistory ? 'Loading nozzle handover history...' : 'No nozzle handovers recorded for this shift.'}
                          </td>
                        </tr>
                      ) : (
                        staffHistory.nozzle_assignments.map((na) => {
                          const op = parseFloat(na.opening_reading || '0');
                          const cl = na.closing_reading !== null ? parseFloat(na.closing_reading) : null;
                          const vol = cl !== null ? (cl - op).toFixed(3) : 'In Progress';
                          return (
                            <tr key={na.id}>
                              <td>
                                <strong>{na.nozzle_code}</strong>
                                <span className="text-muted" style={{ fontSize: '0.78125rem', marginLeft: '0.375rem' }}>({na.product_name_snapshot})</span>
                              </td>
                              <td>
                                <strong>{na.employee_name}</strong>
                                <span className="text-muted" style={{ fontSize: '0.78125rem', marginLeft: '0.375rem' }}>({na.employee_code})</span>
                              </td>
                              <td style={{ fontSize: '0.8125rem' }}>
                                {new Date(na.effective_from).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {' → '}
                                {na.effective_to ? new Date(na.effective_to).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                              </td>
                              <td style={{ fontFamily: 'monospace' }}>{op.toFixed(3)}</td>
                              <td style={{ fontFamily: 'monospace' }}>{cl !== null ? cl.toFixed(3) : 'Active'}</td>
                              <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#38bdf8' }}>{vol} {cl !== null ? 'L' : ''}</td>
                              <td>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
                                    backgroundColor: na.assignment_type === 'handover' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                                    color: na.assignment_type === 'handover' ? '#2563eb' : '#64748b',
                                  }}
                                >
                                  {na.assignment_type}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.8125rem' }}>{na.reason || '—'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: AUDIT TRAIL */}
      {activeTab === 'activity' && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 className="h4" style={{ margin: '0 0 1rem 0' }}>Shift Activity Audit Trail</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activityLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color, #334155)',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="badge" style={{ backgroundColor: '#3b82f6' }}>{log.event_type}</span>
                    <span>by {log.actor_name || 'System'}</span>
                  </div>
                  {log.reason && (
                    <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
                      Reason: "{log.reason}"
                    </div>
                  )}
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem', fontFamily: 'monospace' }}>
                      {JSON.stringify(log.metadata)}
                    </div>
                  )}
                </div>
                <div className="text-muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {new Date(log.occurred_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <CloseShiftModal
        isOpen={isCloseModalOpen}
        shiftId={shift.id}
        shiftName={shift.shift_definition_name}
        businessDate={shift.business_date}
        onClose={() => setIsCloseModalOpen(false)}
        onShiftClosed={() => loadShift(false)}
      />

      <ReopenShiftModal
        isOpen={isReopenModalOpen}
        shiftId={shift.id}
        shiftName={shift.shift_definition_name}
        businessDate={shift.business_date}
        onClose={() => setIsReopenModalOpen(false)}
        onShiftReopened={() => loadShift(false)}
      />

      <MeterEventModal
        isOpen={isMeterEventModalOpen}
        shiftId={shift.id}
        meter={selectedMeterForEvent}
        onClose={() => {
          setIsMeterEventModalOpen(false);
          setSelectedMeterForEvent(null);
        }}
        onEventRecorded={() => loadShift(true)}
      />

      <RecordTestingModal
        isOpen={isTestingModalOpen}
        shiftId={shift.id}
        meters={shift.meters}
        onClose={() => setIsTestingModalOpen(false)}
        onTestingSaved={() => loadShift(true)}
      />

      <RecordDipModal
        isOpen={isDipModalOpen}
        shiftId={shift.id}
        onClose={() => setIsDipModalOpen(false)}
        onDipSaved={() => loadShift(true)}
      />

      <PriceChangeModal
        isOpen={isPriceChangeModalOpen}
        shiftId={shift.id}
        meters={shift.meters}
        onClose={() => setIsPriceChangeModalOpen(false)}
        onPriceChanged={() => loadShift(true)}
      />

      {selectedOrgId && selectedOutletId && (
        <ManageStaffModal
          isOpen={isStaffModalOpen}
          onClose={() => setIsStaffModalOpen(false)}
          onSuccess={() => loadShift(true)}
          orgId={selectedOrgId}
          outletId={selectedOutletId}
          shift={shift}
        />
      )}

      {selectedOrgId && selectedOutletId && shift && (
        <>
          <AddStaffModal
            isOpen={isAddStaffModalOpen}
            onClose={() => setIsAddStaffModalOpen(false)}
            onSuccess={() => {
              loadShift(true);
              loadStaffHistory();
            }}
            orgId={selectedOrgId}
            outletId={selectedOutletId}
            shiftId={shift.id}
            availableEmployees={outletEmployees.map((e) => ({
              id: e.id,
              employee_code: e.employee_code,
              display_name: e.display_name,
              designation_id: (e as any).designation || (e as any).designation_details?.id,
              designation_name: (e as any).designation_name || (e as any).designation_details?.name,
            }))}
            designations={designations}
            unassignedNozzles={(shift.meters || [])
              .filter((m) => {
                const assignedCodes = new Set((shift.staff_members || []).flatMap((s) => s.assigned_nozzles || []));
                return !assignedCodes.has(m.nozzle_code);
              })
              .map((m) => ({
                id: m.nozzle,
                code: m.nozzle_code,
                name: m.nozzle_name,
                product_name: m.product_name,
                dispenser_name: m.dispenser_name,
              }))}
          />

          <TransferNozzleModal
            isOpen={isTransferNozzleModalOpen}
            onClose={() => setIsTransferNozzleModalOpen(false)}
            onSuccess={() => {
              loadShift(true);
              loadStaffHistory();
            }}
            orgId={selectedOrgId}
            outletId={selectedOutletId}
            shiftId={shift.id}
            initialNozzleId={selectedNozzleForTransfer}
            nozzles={(shift.meters || []).map((m) => ({
              id: m.nozzle,
              code: m.nozzle_code,
              name: m.nozzle_name,
              product_name: m.product_name,
              current_attendant_name: m.employee_name || undefined,
              current_attendant_id: m.employee_id || undefined,
              opening_reading: m.opening_reading,
              closing_reading: m.closing_reading,
              gross_quantity: m.gross_quantity,
            }))}
            availableEmployees={outletEmployees.map((e) => ({
              id: e.id,
              employee_code: e.employee_code,
              display_name: e.display_name,
            }))}
          />

          <TransferCashierModal
            isOpen={isTransferCashierModalOpen}
            onClose={() => setIsTransferCashierModalOpen(false)}
            onSuccess={() => {
              loadShift(true);
              loadStaffHistory();
            }}
            orgId={selectedOrgId}
            outletId={selectedOutletId}
            shiftId={shift.id}
            currentCashierName={
              (shift.staff_members || []).find((s) => s.is_primary_cashier)?.employee_name_snapshot
            }
            shiftStaff={(shift.staff_members || []).map((s) => ({
              id: s.id,
              employee_name_snapshot: s.employee_name_snapshot,
              employee_code_snapshot: s.employee_code_snapshot,
              designation_snapshot: s.designation_snapshot,
              is_primary_cashier: s.is_primary_cashier,
            }))}
          />

          <DiscardShiftModal
            isOpen={isDiscardModalOpen}
            onClose={() => setIsDiscardModalOpen(false)}
            onSuccess={() => {
              setIsDiscardModalOpen(false);
              navigate('/app/operations/shifts');
            }}
            orgId={selectedOrgId}
            outletId={selectedOutletId}
            shiftId={shift.id}
            shiftName={shift.shift_definition_name}
            businessDate={shift.business_date}
          />
        </>
      )}
    </div>
  );
};
