import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchEmployeeAccountabilitySummary,
  fetchCollectionActivityTimeline,
  type EmployeeAccountabilityItem,
  type ShiftReconciliationSummary,
  type CollectionAuditLogItem,
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  Coins, CheckCircle, AlertCircle, Clock,
  Users, ShieldCheck, RefreshCw, History, ArrowRight
} from 'lucide-react';

export const ShiftReconciliationPage: React.FC = () => {
  const { shiftId } = useParams<{ shiftId: string }>();
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const canView = usePermission('reconciliation.view');

  const [summaryData, setSummaryData] = useState<{
    shift_id: string;
    business_date: string;
    operational_status: string;
    reconciliation_status: string;
    shift_reconciliation_complete: boolean;
    employees: EmployeeAccountabilityItem[];
    reconciliation: ShiftReconciliationSummary;
  } | null>(null);

  const [timeline, setTimeline] = useState<CollectionAuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!selectedOrgId || !selectedOutletId || !shiftId || !canView) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [accSummary, logs] = await Promise.all([
        fetchEmployeeAccountabilitySummary(selectedOrgId, selectedOutletId, shiftId),
        fetchCollectionActivityTimeline(selectedOrgId, selectedOutletId, shiftId).catch(() => []),
      ]);
      setSummaryData(accSummary);
      setTimeline(logs);
    } catch (err: any) {
      console.error('Failed to load shift reconciliation:', err);
      setError(err.message || 'Failed to load shift reconciliation summary.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedOrgId, selectedOutletId, shiftId, canView]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view shift reconciliation.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <RefreshCw size={36} className="animate-spin text-primary" style={{ margin: '0 auto 1rem' }} />
        <h3 className="h4">Loading Shift Financial Reconciliation...</h3>
        <p className="text-muted">Calculating employee meter attributions, collections, and settlement statuses</p>
      </div>
    );
  }

  if (error || !summaryData) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <AlertCircle size={40} className="text-danger" style={{ margin: '0 auto 1rem' }} />
        <h3 className="h4">Reconciliation Data Unavailable</h3>
        <p className="text-muted">{error || 'Could not load reconciliation data for this shift.'}</p>
        <button
          className="btn btn-outline"
          onClick={() => navigate(`/app/operations/shifts/${shiftId}`)}
          style={{ marginTop: '1rem' }}
        >
          Back to Shift
        </button>
      </div>
    );
  }

  const { reconciliation, employees, operational_status, shift_reconciliation_complete, business_date } = summaryData;
  const isShiftOpen = operational_status === 'open';

  const pendingCount = reconciliation.required_employee_count - reconciliation.reconciled_employee_count;
  const grossShortageNum = parseFloat(String(reconciliation.shortage_amount || 0));
  const grossExcessNum = parseFloat(String(reconciliation.excess_amount || 0));
  const netDiffNum = parseFloat(String(reconciliation.net_difference_amount || 0));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'reconciled':
        return (
          <span
            className="badge"
            style={{
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              color: '#4ade80',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <CheckCircle size={14} /> RECONCILED
          </span>
        );
      case 'partial':
        return (
          <span
            className="badge"
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Clock size={14} /> PARTIAL ({reconciliation.reconciled_employee_count}/{reconciliation.required_employee_count})
          </span>
        );
      default:
        return (
          <span
            className="badge"
            style={{
              backgroundColor: 'rgba(100, 116, 139, 0.2)',
              color: '#94a3b8',
              border: '1px solid rgba(100, 116, 139, 0.3)',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <AlertCircle size={14} /> PENDING SETTLEMENT
          </span>
        );
    }
  };

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <PageHeader
            title="Shift Financial Reconciliation"
            subtitle={`Business Date: ${business_date} • Operational Status: ${operational_status.toUpperCase()}`}
            backLink={{ to: `/app/operations/shifts/${shiftId}`, label: 'Back to Operational Shift' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {getStatusBadge(reconciliation.status)}

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => loadData(true)}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <Link
            to={`/app/employees/cash-collections/${shiftId}`}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Coins size={16} /> Collections Workspace
          </Link>
        </div>
      </div>

      {/* Operational Shift Open Alert */}
      {isShiftOpen && (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            color: '#93c5fd',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <Clock size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>Operational Shift is currently OPEN.</strong> Handover collections, credit slips, and shift expenses may be recorded in real-time. Final attendant settlements can only be confirmed and locked once the shift is closed and meter readings are finalized.
          </div>
        </div>
      )}

      {/* Day Close Status Hero Banner */}
      <div
        className="card"
        style={{
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
          backgroundColor: shift_reconciliation_complete
            ? 'rgba(34, 197, 94, 0.08)'
            : reconciliation.status === 'partial'
            ? 'rgba(245, 158, 11, 0.08)'
            : 'rgba(30, 41, 59, 0.5)',
          borderLeft: `4px solid ${
            shift_reconciliation_complete ? '#22c55e' : reconciliation.status === 'partial' ? '#f59e0b' : '#64748b'
          }`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {shift_reconciliation_complete ? (
            <ShieldCheck size={28} style={{ color: '#4ade80' }} />
          ) : (
            <AlertCircle size={28} style={{ color: reconciliation.status === 'partial' ? '#fbbf24' : '#94a3b8' }} />
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: shift_reconciliation_complete ? '#4ade80' : '#f8fafc' }}>
              {shift_reconciliation_complete
                ? 'Day-Close Readiness: READY (Shift Fully Reconciled)'
                : `Day-Close Readiness: BLOCKED (${pendingCount} Attendant Settlement${pendingCount === 1 ? '' : 's'} Pending)`}
            </div>
            <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
              {shift_reconciliation_complete
                ? 'All required attendant collections and credit slips have been reviewed, differences acknowledged, and settlements locked.'
                : 'Day Close requires all operational shifts on this date to have their financial reconciliations completed.'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="badge" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', padding: '0.4rem 0.8rem' }}>
            Flag: <code>shift_reconciliation_complete = {shift_reconciliation_complete ? 'true' : 'false'}</code>
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Expected Fuel Sales
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.4rem', color: '#60a5fa' }}>
            ₹{parseFloat(String(reconciliation.expected_sale_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Net nozzle meter attributions
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Accounted
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.4rem', color: '#4ade80' }}>
            ₹{parseFloat(String(reconciliation.total_accounted_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Cash + Digital + Slips ± Adjustments
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', backgroundColor: grossShortageNum > 0 ? 'rgba(239, 68, 68, 0.06)' : undefined }}>
          <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Gross Shortage
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.4rem', color: grossShortageNum > 0 ? '#f87171' : '#94a3b8' }}>
            ₹{grossShortageNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Attendant collection deficits
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', backgroundColor: grossExcessNum > 0 ? 'rgba(245, 158, 11, 0.06)' : undefined }}>
          <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Gross Excess
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.4rem', color: grossExcessNum > 0 ? '#fbbf24' : '#94a3b8' }}>
            ₹{grossExcessNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Surplus cash / collections
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Net Difference
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              fontFamily: 'monospace',
              marginTop: '0.4rem',
              color: netDiffNum === 0 ? '#4ade80' : netDiffNum < 0 ? '#f87171' : '#fbbf24',
            }}
          >
            {netDiffNum > 0 ? `+₹${netDiffNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : `₹${netDiffNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          </div>
          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {netDiffNum === 0 ? 'Balanced' : netDiffNum < 0 ? 'Net Deficit' : 'Net Surplus'}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Attendant Progress
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.4rem', color: '#e2e8f0' }}>
            {reconciliation.reconciled_employee_count} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>/ {reconciliation.required_employee_count}</span>
          </div>
          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {pendingCount === 0 ? 'All reconciled' : `${pendingCount} pending settlement`}
          </div>
        </div>
      </div>

      {/* Attendants Accountability Table */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-color, #334155)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 className="h4" style={{ margin: 0 }}>Attendant Accountability Breakdown</h3>
            <p className="text-muted" style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem' }}>
              Individual attendants must reconcile their meter sales against cash, digital collections, and credit slips.
            </p>
          </div>
        </div>

        {(employees || []).length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Users size={36} className="text-muted" style={{ margin: '0 auto 1rem' }} />
            <div style={{ fontWeight: 600 }}>No Attendants Assigned</div>
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>
              This shift had no attendant nozzle assignments or recorded sales.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #334155)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Attendant</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Nozzles</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Expected Sales</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Cash</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Card</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>UPI</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Credit Slips</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Adjustments</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Accounted</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Diff / Shortage</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(employees || []).map((emp) => {
                  const isReconciled = emp.settlement_status === 'reconciled';
                  const diffNum = parseFloat(String(emp.difference_amount || 0));
                  const shortageNum = parseFloat(String(emp.shortage_amount || 0));
                  const excessNum = parseFloat(String(emp.excess_amount || 0));

                  const netAdj =
                    parseFloat(String(emp.approved_increase_adjustments || 0)) -
                    parseFloat(String(emp.approved_decrease_adjustments || 0));

                  return (
                    <tr
                      key={emp.employee_id}
                      style={{
                        borderBottom: '1px solid var(--border-color, rgba(51, 65, 85, 0.4))',
                        backgroundColor: isReconciled ? 'rgba(34, 197, 94, 0.02)' : undefined,
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{emp.employee_name}</div>
                        <div className="text-muted" style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {emp.employee_code}
                        </div>
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          {(emp.nozzle_codes || emp.assigned_nozzles || []).length > 0 ? (
                            (emp.nozzle_codes || emp.assigned_nozzles || []).map((nz) => (
                              <span
                                key={nz}
                                className="badge"
                                style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                  fontSize: '0.7rem',
                                  padding: '0.15rem 0.4rem',
                                }}
                              >
                                {nz}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted" style={{ fontSize: '0.75rem' }}>None</span>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                        ₹{parseFloat(String(emp.expected_sale_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        ₹{parseFloat(String(emp.cash_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        ₹{parseFloat(String(emp.card_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        ₹{parseFloat(String(emp.upi_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        ₹{parseFloat(String(emp.credit_slip_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontFamily: 'monospace',
                          color: netAdj > 0 ? '#4ade80' : netAdj < 0 ? '#f87171' : undefined,
                        }}
                      >
                        {netAdj > 0 ? `+₹${netAdj.toFixed(2)}` : netAdj < 0 ? `-₹${Math.abs(netAdj).toFixed(2)}` : '₹0.00'}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa' }}>
                        ₹{parseFloat(String(emp.total_accounted_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        {diffNum === 0 ? (
                          <span style={{ color: '#4ade80', fontWeight: 600 }}>₹0.00 (Balanced)</span>
                        ) : diffNum < 0 ? (
                          <span style={{ color: '#f87171', fontWeight: 600 }}>
                            -₹{shortageNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Shortage)
                          </span>
                        ) : (
                          <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                            +₹{excessNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Excess)
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {isReconciled ? (
                          <span
                            className="badge"
                            style={{
                              backgroundColor: 'rgba(34, 197, 94, 0.15)',
                              color: '#4ade80',
                              border: '1px solid rgba(34, 197, 94, 0.3)',
                              fontSize: '0.75rem',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontWeight: 600,
                            }}
                          >
                            <CheckCircle size={12} style={{ display: 'inline', marginRight: '0.25rem' }} /> Reconciled
                          </span>
                        ) : (
                          <span
                            className="badge"
                            style={{
                              backgroundColor: 'rgba(245, 158, 11, 0.15)',
                              color: '#fbbf24',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              fontSize: '0.75rem',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontWeight: 600,
                            }}
                          >
                            <Clock size={12} style={{ display: 'inline', marginRight: '0.25rem' }} /> Pending
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <Link
                          to={`/app/employees/cash-collections/${shiftId}/${emp.employee_id}`}
                          className={`btn ${isReconciled ? 'btn-ghost' : 'btn-outline'}`}
                          style={{
                            padding: '0.25rem 0.6rem',
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          {isReconciled ? (
                            <>View <ArrowRight size={12} /></>
                          ) : (
                            <>Resolve <ArrowRight size={12} /></>
                          )}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity Timeline Section */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={18} className="text-primary" />
            <h3 className="h5" style={{ margin: 0 }}>Collection & Settlement Activity Timeline</h3>
            <span className="badge" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', fontSize: '0.75rem' }}>
              {(timeline || []).length} Events
            </span>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowTimeline(!showTimeline)}
            style={{ fontSize: '0.85rem' }}
          >
            {showTimeline ? 'Hide Timeline' : 'Show Timeline'}
          </button>
        </div>

        {showTimeline && (
          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color, #334155)', paddingTop: '1rem' }}>
            {(timeline || []).length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.5rem 0' }}>
                No collection or reconciliation events recorded for this shift yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(timeline || []).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      padding: '0.65rem 0.85rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      borderRadius: '6px',
                      borderLeft: '3px solid #3b82f6',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ textTransform: 'capitalize' }}>
                          {item.event_type.replace(/_/g, ' ')}
                        </strong>
                        {item.employee_name && (
                          <span className="text-muted">• Attendant: {item.employee_name}</span>
                        )}
                        {item.customer_name && (
                          <span className="text-muted">• Customer: {item.customer_name}</span>
                        )}
                      </div>

                      {item.reason && (
                        <div style={{ color: '#fbbf24', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                          Reason: "{item.reason}"
                        </div>
                      )}

                      {item.metadata && Object.keys(item.metadata).length > 0 && (
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            color: '#94a3b8',
                            marginTop: '0.2rem',
                          }}
                        >
                          {JSON.stringify(item.metadata)}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                        {new Date(item.occurred_at).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                        By {item.actor_name || 'System'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
