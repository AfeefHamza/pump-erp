import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchOperationalShifts,
  type ShiftListResponse,
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  Coins, ArrowRight, Clock, Users
} from 'lucide-react';

export const CashCollectionsPage: React.FC = () => {
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const canView = usePermission('collection.view');

  const [shiftsData, setShiftsData] = useState<ShiftListResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadShifts = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOperationalShifts(selectedOrgId, selectedOutletId, {
        status: statusFilter,
      });
      setShiftsData(res);
    } catch (err: any) {
      console.error('Failed to load shifts for collections:', err);
      setError(err.message || 'Failed to load shifts.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, canView, statusFilter]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view employee collections.</p>
      </div>
    );
  }

  const shifts = shiftsData?.shifts || [];

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <PageHeader
          title="Employee Shift Collections"
          subtitle="Select an operational shift to view employee fuel accountability, enter handovers, and reconcile collections."
        />
      </div>

      {/* Filter Tabs */}
      <div
        className="card"
        style={{
          padding: '0.75rem 1rem',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '8px',
          background: 'var(--bg-card, #ffffff)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['all', 'open', 'closed'] as const).map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: active ? 'var(--color-accent, #0f766e)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-main, #0f172a)',
                  fontWeight: 500,
                  fontSize: '0.825rem',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {s === 'all' ? 'All Shifts' : `${s} Shifts`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Shift Cards / List */}
      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
          Loading operational shifts...
        </div>
      ) : error ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-danger-text, #b91c1c)' }}>
          {error}
        </div>
      ) : shifts.length === 0 ? (
        <div className="card" style={{ padding: '3.5rem', textAlign: 'center', background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px' }}>
          <Coins size={48} style={{ color: 'var(--text-muted, #94a3b8)', margin: '0 auto 1rem' }} />
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--text-main, #0f172a)' }}>No Operational Shifts Found</h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
            Start an operational shift under Operations → Shifts to manage cash collections.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {shifts.map((shift) => {
            const isOpen = shift.status === 'open';
            const reconStatus = shift.reconciliation_status || (shift.shift_reconciliation_complete ? 'reconciled' : 'pending');

            let reconBadgeColor = 'var(--color-warning-bg, #ffedd5)';
            let reconTextColor = 'var(--color-warning-text, #c2410c)';
            if (reconStatus === 'reconciled') {
              reconBadgeColor = 'var(--color-success-bg, #dcfce7)';
              reconTextColor = 'var(--color-success-text, #15803d)';
            } else if (reconStatus === 'partial') {
              reconBadgeColor = 'var(--color-pending-bg, #fef9c3)';
              reconTextColor = 'var(--color-pending-text, #a16207)';
            }

            return (
              <div
                key={shift.id}
                className="card"
                onClick={() => navigate(`/app/employees/cash-collections/${shift.id}`)}
                style={{
                  padding: '1.25rem',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '8px',
                  background: 'var(--bg-card, #ffffff)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent, #0f766e)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color, #e2e8f0)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-accent, #0f766e)' }}>
                      {shift.shift_definition_name}
                    </span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          backgroundColor: isOpen ? 'var(--color-success-bg, #dcfce7)' : '#f1f5f9',
                          color: isOpen ? 'var(--color-success-text, #15803d)' : 'var(--text-muted, #64748b)',
                        }}
                      >
                        {shift.status}
                      </span>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          backgroundColor: reconBadgeColor,
                          color: reconTextColor,
                        }}
                      >
                        {reconStatus}
                      </span>
                    </div>
                  </div>

                  <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                    {new Date(shift.business_date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                  </h3>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', marginBottom: '0.5rem' }}>
                    <Clock size={14} />
                    <span>Opened: {new Date(shift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {shift.closed_at && (
                      <span>• Closed: {new Date(shift.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
                    <Users size={14} />
                    <span>{shift.staff_count || 0} Attendants</span>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '1.25rem',
                    paddingTop: '0.85rem',
                    borderTop: '1px solid var(--border-color, #f1f5f9)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    color: 'var(--color-accent, #0f766e)',
                  }}
                >
                  <span>Open Collection Workspace</span>
                  <ArrowRight size={16} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
