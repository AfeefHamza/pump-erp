import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  type EmployeeAccountabilityItem,
  type ShiftReconciliationSummary,
  fetchEmployeeAccountabilitySummary,
} from '@/api/client';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  ArrowLeft, ArrowRight, BarChart3
} from 'lucide-react';

export const ShiftCollectionsWorkspace: React.FC = () => {
  const { shiftId } = useParams<{ shiftId: string }>();
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const canView = usePermission('collection.view');

  const [summaryData, setSummaryData] = useState<{
    shift_id: string;
    business_date: string;
    operational_status: string;
    reconciliation_status: string;
    shift_reconciliation_complete: boolean;
    employees: EmployeeAccountabilityItem[];
    reconciliation: ShiftReconciliationSummary;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId || !shiftId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEmployeeAccountabilitySummary(selectedOrgId, selectedOutletId, shiftId);
      setSummaryData(data);
    } catch (err: any) {
      console.error('Failed to load employee accountability summary:', err);
      setError(err.message || 'Failed to load shift collection workspace.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, shiftId, canView]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view employee collections.</p>
      </div>
    );
  }

  if (loading && !summaryData) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
        Loading employee collection workspace...
      </div>
    );
  }

  if (error || !summaryData) {
    return (
      <div style={{ padding: '2rem' }}>
        <button
          onClick={() => navigate('/app/employees/cash-collections')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-accent, #0f766e)', marginBottom: '1rem' }}
        >
          <ArrowLeft size={16} /> Back to Shifts
        </button>
        <div className="card" style={{ padding: '2rem', color: 'var(--color-danger-text, #b91c1c)' }}>
          {error || 'Workspace data could not be retrieved.'}
        </div>
      </div>
    );
  }

  const recon = summaryData.reconciliation;
  const employees = summaryData.employees || [];
  const isOpen = summaryData.operational_status === 'open';

  let reconBadgeBg = 'var(--color-warning-bg, #ffedd5)';
  let reconBadgeText = 'var(--color-warning-text, #c2410c)';
  if (summaryData.reconciliation_status === 'reconciled') {
    reconBadgeBg = 'var(--color-success-bg, #dcfce7)';
    reconBadgeText = 'var(--color-success-text, #15803d)';
  } else if (summaryData.reconciliation_status === 'partial') {
    reconBadgeBg = 'var(--color-pending-bg, #fef9c3)';
    reconBadgeText = 'var(--color-pending-text, #a16207)';
  }

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate('/app/employees/cash-collections')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          background: 'transparent',
          border: 'none',
          color: 'var(--color-accent, #0f766e)',
          fontWeight: 500,
          cursor: 'pointer',
          marginBottom: '1rem',
          fontSize: '0.875rem',
        }}
      >
        <ArrowLeft size={16} />
        <span>Back to Shifts</span>
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
              Shift Collection Workspace
            </h1>
            <span
              style={{
                padding: '0.25rem 0.65rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                backgroundColor: isOpen ? 'var(--color-success-bg, #dcfce7)' : '#f1f5f9',
                color: isOpen ? 'var(--color-success-text, #15803d)' : 'var(--text-muted, #64748b)',
              }}
            >
              {summaryData.operational_status}
            </span>
            <span
              style={{
                padding: '0.25rem 0.65rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                backgroundColor: reconBadgeBg,
                color: reconBadgeText,
              }}
            >
              Reconciliation: {summaryData.reconciliation_status}
            </span>
          </div>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted, #64748b)', fontSize: '0.9rem' }}>
            Business Date: <strong>{new Date(summaryData.business_date).toLocaleDateString()}</strong> • {employees.length} Attendants accountable for nozzle intervals
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/app/operations/shifts/${shiftId}/reconciliation`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1.25rem',
              borderRadius: '6px',
              fontWeight: 500,
            }}
          >
            <BarChart3 size={16} />
            <span>Shift Reconciliation Summary</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <span style={{ fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
            Expected Attributed Sales
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginTop: '0.25rem' }}>
            ₹{Number(recon?.expected_sale_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>From meter sale intervals</span>
        </div>

        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <span style={{ fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
            Total Accounted
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-accent, #0f766e)', marginTop: '0.25rem' }}>
            ₹{Number(recon?.total_accounted_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>Cash, Card, UPI, Credit & Adj</span>
        </div>

        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <span style={{ fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
            Gross Shortage
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: Number(recon?.shortage_amount || 0) > 0 ? 'var(--color-danger-text, #b91c1c)' : 'var(--text-muted, #94a3b8)', marginTop: '0.25rem' }}>
            ₹{Number(recon?.shortage_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>Sum of employee shortages</span>
        </div>

        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <span style={{ fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
            Gross Excess
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: Number(recon?.excess_amount || 0) > 0 ? 'var(--color-info-text, #0369a1)' : 'var(--text-muted, #94a3b8)', marginTop: '0.25rem' }}>
            ₹{Number(recon?.excess_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>Sum of employee excesses</span>
        </div>

        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <span style={{ fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
            Settlement Progress
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginTop: '0.25rem' }}>
            {recon?.reconciled_employee_count || 0} / {recon?.required_employee_count || 0}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>Attendants reconciled</span>
        </div>
      </div>

      {/* Attendants Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', background: 'var(--table-header-bg, #f8fafc)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
            Attendant Accountability & Collections
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
            Individual attendant settlement chain
          </span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Attendant</th>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Nozzles</th>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Expected Fuel (₹)</th>
              <th style={{ padding: '0.85rem 0.75rem', fontWeight: 600, textAlign: 'right' }}>Cash (₹)</th>
              <th style={{ padding: '0.85rem 0.75rem', fontWeight: 600, textAlign: 'right' }}>Card (₹)</th>
              <th style={{ padding: '0.85rem 0.75rem', fontWeight: 600, textAlign: 'right' }}>UPI (₹)</th>
              <th style={{ padding: '0.85rem 0.75rem', fontWeight: 600, textAlign: 'right' }}>Credit (₹)</th>
              <th style={{ padding: '0.85rem 0.75rem', fontWeight: 600, textAlign: 'right' }}>Adj (₹)</th>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Accounted Total (₹)</th>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Shortage / Excess</th>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'center' }}>Status</th>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const diff = Number(emp.difference_amount);
              const isReconciled = emp.settlement_status === 'reconciled';
              const netAdj = Number(emp.approved_increase_adjustments) - Number(emp.approved_decrease_adjustments);

              let diffColor = 'var(--text-muted, #64748b)';
              let diffText = 'Balanced (₹0)';
              if (diff < 0) {
                diffColor = 'var(--color-danger-text, #b91c1c)';
                diffText = `Shortage: ₹${Math.abs(diff).toFixed(2)}`;
              } else if (diff > 0) {
                diffColor = 'var(--color-info-text, #0369a1)';
                diffText = `Excess: +₹${diff.toFixed(2)}`;
              }

              return (
                <tr
                  key={emp.employee_id}
                  onClick={() => navigate(`/app/employees/cash-collections/${shiftId}/${emp.employee_id}`)}
                  style={{
                    borderBottom: '1px solid var(--border-color, #f1f5f9)',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--table-header-bg, #f8fafc)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>{emp.employee_name}</div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>{emp.employee_code}</span>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {emp.nozzle_codes?.length > 0 ? (
                        emp.nozzle_codes.map((nz) => (
                          <span
                            key={nz}
                            style={{
                              backgroundColor: 'var(--table-header-bg, #f1f5f9)',
                              border: '1px solid var(--border-color, #cbd5e1)',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                            }}
                          >
                            {nz}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-muted, #94a3b8)' }}>None</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                    ₹{Number(emp.expected_sale_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', color: 'var(--text-main, #0f172a)' }}>
                    ₹{Number(emp.cash_amount).toFixed(2)}
                  </td>
                  <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', color: 'var(--text-main, #0f172a)' }}>
                    ₹{Number(emp.card_amount).toFixed(2)}
                  </td>
                  <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', color: 'var(--text-main, #0f172a)' }}>
                    ₹{Number(emp.upi_amount).toFixed(2)}
                  </td>
                  <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', color: 'var(--text-main, #0f172a)' }}>
                    ₹{Number(emp.credit_slip_amount).toFixed(2)}
                  </td>
                  <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', color: netAdj >= 0 ? 'var(--color-success-text, #15803d)' : 'var(--color-danger-text, #b91c1c)' }}>
                    {netAdj >= 0 ? `+₹${netAdj.toFixed(2)}` : `-₹${Math.abs(netAdj).toFixed(2)}`}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--color-accent, #0f766e)' }}>
                    ₹{Number(emp.total_accounted_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600, color: diffColor }}>
                    {diffText}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '12px',
                        fontSize: '0.725rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        backgroundColor: isReconciled ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-warning-bg, #ffedd5)',
                        color: isReconciled ? 'var(--color-success-text, #15803d)' : 'var(--color-warning-text, #c2410c)',
                      }}
                    >
                      {emp.settlement_status}
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/app/employees/cash-collections/${shiftId}/${emp.employee_id}`);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '4px',
                        border: '1px solid var(--color-accent, #0f766e)',
                        backgroundColor: '#fff',
                        color: 'var(--color-accent, #0f766e)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <span>Workspace</span>
                      <ArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
