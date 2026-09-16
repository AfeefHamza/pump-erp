import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchParentShiftSummary,
  fetchPaymentAccountOptions,
  lockShift,
  unlockShift,
  approveShiftDeduction,
  rejectShiftDeduction
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import type { PaymentAccount } from '@/features/finance/types';
import {
  Lock,
  Unlock,
  CheckCircle,
  AlertTriangle,
  Plus,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';

export const ShiftCardParentOverview: React.FC = () => {
  const { shiftId } = useParams<{ shiftId: string }>();
  const navigate = useNavigate();

  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const hasShiftLock = usePermission('shift.lock');
  const hasShiftClose = usePermission('shift.close');
  const canLockShift = hasShiftLock || hasShiftClose;
  const canUnlockShift = usePermission('shift.unlock');
  const canApproveDeduction = usePermission('shift_deduction.approve');
  const canOpenShiftCard = usePermission('shift.open');

  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Controlled Unlock Modal State
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  // Controlled Lock Modal State
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockReason, setLockReason] = useState('');
  const [locking, setLocking] = useState(false);
  const [cashAccounts, setCashAccounts] = useState<PaymentAccount[]>([]);
  const [cashAccountId, setCashAccountId] = useState('');

  // Reject Deduction Modal
  const [rejectingDeductionId, setRejectingDeductionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId || !shiftId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchParentShiftSummary(selectedOrgId, selectedOutletId, shiftId);
      setSummary(data);
    } catch (err: any) {
      console.error('Failed to load parent shift summary:', err);
      setError(err.message || 'Failed to load shift summary.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, shiftId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!selectedOrgId || !selectedOutletId) return;
    fetchPaymentAccountOptions(selectedOrgId, selectedOutletId)
      .then((rows) => {
        const cash = rows.filter((row) => row.account_type === 'cash' && row.is_active);
        setCashAccounts(cash);
        if (cash.length === 1) setCashAccountId(cash[0].id);
      })
      .catch(() => setCashAccounts([]));
  }, [selectedOrgId, selectedOutletId]);

  // Handle Controlled Lock
  const handleConfirmLock = async () => {
    if (!selectedOrgId || !selectedOutletId || !shiftId) return;
    setLocking(true);
    setError(null);
    try {
      await lockShift(selectedOrgId, selectedOutletId, shiftId, lockReason || 'Manual financial lock', cashAccountId || undefined);
      setShowLockModal(false);
      setLockReason('');
      setActionMsg('Shift locked successfully. Data entry is now protected.');
      loadSummary();
    } catch (err: any) {
      setError(err.message || 'Failed to lock shift.');
    } finally {
      setLocking(false);
    }
  };

  // Handle Controlled Unlock
  const handleConfirmUnlock = async () => {
    if (!selectedOrgId || !selectedOutletId || !shiftId) return;
    if (!unlockReason.trim() || unlockReason.trim().length < 5) {
      setError('A mandatory reason (minimum 5 characters) is required to unlock financial records.');
      return;
    }
    setUnlocking(true);
    setError(null);
    try {
      await unlockShift(selectedOrgId, selectedOutletId, shiftId, unlockReason.trim());
      setShowUnlockModal(false);
      setUnlockReason('');
      setActionMsg('Shift unlocked. Controlled corrections may now be recorded.');
      loadSummary();
    } catch (err: any) {
      setError(err.message || 'Failed to unlock shift.');
    } finally {
      setUnlocking(false);
    }
  };

  // Handle Deduction Approval
  const handleApproveDeduction = async (deductionId: string) => {
    if (!selectedOrgId || !selectedOutletId) return;
    try {
      await approveShiftDeduction(selectedOrgId, selectedOutletId, deductionId);
      setActionMsg('Expense approved. Accounted amount updated.');
      loadSummary();
    } catch (err: any) {
      setError(err.message || 'Failed to approve expense.');
    }
  };

  // Handle Deduction Rejection
  const handleConfirmRejectDeduction = async () => {
    if (!selectedOrgId || !selectedOutletId || !rejectingDeductionId) return;
    if (!rejectReason.trim()) {
      setError('A mandatory reason is required to reject an expense.');
      return;
    }
    setRejecting(true);
    try {
      await rejectShiftDeduction(selectedOrgId, selectedOutletId, rejectingDeductionId, rejectReason.trim());
      setRejectingDeductionId(null);
      setRejectReason('');
      setActionMsg('Expense rejected.');
      loadSummary();
    } catch (err: any) {
      setError(err.message || 'Failed to reject expense.');
    } finally {
      setRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="management-page" style={{ padding: '2rem', textAlign: 'center' }}>
        <p className="text-muted">Loading parent shift overview...</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="management-page" style={{ padding: '2rem', textAlign: 'center' }}>
        <AlertTriangle size={36} color="#ef4444" style={{ marginBottom: '1rem' }} />
        <h3>Shift Not Found</h3>
        <button type="button" className="btn btn-outline" onClick={() => navigate('/app/operations/shift-cards')}>
          Back to Shift Cards
        </button>
      </div>
    );
  }

  const shift = summary?.shift || {
    id: summary?.shift_id || summary?.id || shiftId || '',
    shift_id: summary?.shift_id || summary?.id || shiftId || '',
    outlet_id: summary?.outlet_id || selectedOutletId || '',
    outlet_name: summary?.outlet_name || '',
    shift_definition_id: summary?.shift_definition_id || '',
    shift_definition_name: summary?.shift_definition_name || 'Shift',
    business_date: summary?.business_date || '',
    scheduled_starts_at: summary?.scheduled_starts_at || '',
    scheduled_ends_at: summary?.scheduled_ends_at || '',
    starts_at: summary?.starts_at || '',
    ends_at: summary?.ends_at || '',
    status: summary?.status || 'closed',
    is_locked: !!summary?.is_locked,
    locked_at: summary?.locked_at || null,
    locked_by: summary?.locked_by || null,
    lock_source: summary?.lock_source || null,
  };

  const cards = summary?.cards || [];

  const coverage = summary?.coverage || {
    covered_nozzles: [],
    missing_nozzles: summary?.missing_nozzles || [],
    total_historical_nozzles: (summary?.covered_nozzles_count || 0) + (summary?.missing_nozzles?.length || 0),
  };

  const totals = summary?.totals || {
    total_litres_sold: parseFloat(summary?.net_sale_litres || summary?.total_litres_sold || '0'),
    total_sale_amount: parseFloat(summary?.expected_amount || summary?.total_sale_amount || '0'),
    total_collected_amount: parseFloat(summary?.accounted_amount || summary?.total_collected_amount || '0'),
    difference_amount: parseFloat(summary?.net_difference || summary?.difference_amount || '0'),
    gross_shortage: parseFloat(summary?.gross_shortage || '0'),
    gross_excess: parseFloat(summary?.gross_excess || '0'),
  };

  const deductions = summary?.deductions || [];
  const totalCash = cards.reduce((sum: number, card: any) => sum + Number(card.cash_total || 0), 0);
  const accounting = summary?.accounting;

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Breadcrumbs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => navigate('/app/operations/shift-cards')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <ArrowLeft size={16} /> Back to Shift Cards
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {shift?.is_locked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
                <Lock size={14} /> Shift Locked
              </span>
              {canUnlockShift && (
                <button
                  type="button"
                  className="btn btn-outline-warning btn-sm"
                  onClick={() => setShowUnlockModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Unlock size={14} /> Request Unlock
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
                <Unlock size={14} /> Unlocked (Editable)
              </span>
              {canLockShift && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowLockModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Lock size={14} /> Lock Shift
                </button>
              )}
            </div>
          )}

          {canOpenShiftCard && !shift?.is_locked && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/app/operations/shift-cards/entry?date=${shift.business_date}&shift_def=${shift.shift_definition_id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Plus size={16} /> Add Employee Shift Card
            </button>
          )}
        </div>
      </div>

      <PageHeader
        title={`${shift?.shift_definition_name || 'Shift'} • ${shift?.business_date || ''}`}
        subtitle={`Parent Shift Overview • Scheduled ${shift?.starts_at || ''} - ${shift?.ends_at || ''} • Status: ${(shift?.status || '').toUpperCase()}`}
      />

      {actionMsg && (
        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.85rem 1.25rem', borderRadius: '6px', marginBottom: '1.25rem' }}>
          {actionMsg}
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#991b1b', padding: '0.85rem 1.25rem', borderRadius: '6px', marginBottom: '1.25rem' }}>
          {error}
        </div>
      )}

      {accounting && (
        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <strong>Shift Accounting · Version {accounting.version}</strong>
            <div className="text-muted">
              {accounting.status === 'active' ? 'Posted to the General Ledger and Cash Book' : `Reversed: ${accounting.reversal_reason || 'Shift unlocked'}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
            <span><span className="text-muted">Sales </span><strong>₹{Number(accounting.fuel_sales_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></span>
            <span><span className="text-muted">Digital Clearing </span><strong>₹{Number(accounting.digital_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></span>
            {accounting.journal_id && <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/app/finance/vouchers/${accounting.journal_id}`)}>View Journal</button>}
          </div>
        </div>
      )}

      {/* Hero Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem', background: '#fff' }}>
          <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Active Shift Cards</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', marginTop: '0.25rem' }}>
            {cards.length}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', background: '#fff' }}>
          <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Fuel Sold</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-primary, #2563eb)', marginTop: '0.25rem' }}>
            {(totals?.total_litres_sold ?? 0).toFixed(3)} L
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', background: '#fff' }}>
          <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Expected Fuel Sales</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', marginTop: '0.25rem' }}>
            ₹{(totals?.total_sale_amount ?? 0).toFixed(2)}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', background: '#fff' }}>
          <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Accounted Collections</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
            ₹{(totals?.total_collected_amount ?? 0).toFixed(2)}
          </div>
        </div>

        {/* Net Discrepancy Box: Amber for Excess (Never green!), Red for Shortage, Green for Balanced */}
        {(() => {
          const diff = totals?.difference_amount ?? 0;
          const isBal = Math.abs(diff) < 0.01;
          const isExcess = diff > 0;
          const bg = isBal ? '#ecfdf5' : (isExcess ? '#fffbeb' : '#fef2f2');
          const border = isBal ? '#10b981' : (isExcess ? '#f59e0b' : '#ef4444');
          const text = isBal ? '#065f46' : (isExcess ? '#92400e' : '#991b1b');
          return (
            <div className="card" style={{ padding: '1.25rem', background: bg, border: `1px solid ${border}` }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', color: text }}>Net Discrepancy</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: text, marginTop: '0.25rem' }}>
                {isBal ? 'Balanced (₹0.00)' : (isExcess ? `+₹${diff.toFixed(2)} Excess` : `-₹${Math.abs(diff).toFixed(2)} Shortage`)}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Equipment Coverage Status Banner */}
      <div className="card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
            Equipment & Nozzle Coverage ({coverage.covered_nozzles?.length || 0} / {coverage.total_historical_nozzles || 0} Covered)
          </h3>
          {coverage.missing_nozzles && coverage.missing_nozzles.length > 0 ? (
            <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
              {coverage.missing_nozzles.length} Missing Nozzle(s)
            </span>
          ) : (
            <span className="badge badge-success" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>
              All Operating Nozzles Covered
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {coverage.covered_nozzles?.map((n: any) => (
            <div
              key={n.id}
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                borderRadius: '6px',
                padding: '0.35rem 0.65rem',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <CheckCircle size={14} />
              <strong>{n.code}</strong> ({n.product_name}) - {n.employee_name}
            </div>
          ))}

          {coverage.missing_nozzles?.map((n: any) => (
            <div
              key={n.id}
              style={{
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                color: '#991b1b',
                borderRadius: '6px',
                padding: '0.35rem 0.65rem',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <AlertTriangle size={14} />
              <strong>{n.code}</strong> ({n.product_name}) - <em>Missing Shift Card</em>
            </div>
          ))}
        </div>
      </div>

      {/* Employee Shift Cards Table */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', background: '#fff' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem 0' }}>
          Employee Shift Cards
        </h3>

        {cards.length === 0 ? (
          <div className="text-muted" style={{ textAlign: 'center', padding: '2.5rem' }}>
            No Shift Cards entered yet for this shift. Click "+ Add Employee Shift Card" to enter data.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Seq #</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Attendant (DSM)</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Assigned Nozzles</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Litres Sold</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Fuel Sales (₹)</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Accounted (₹)</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Discrepancy (₹)</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Status</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((c: any) => {
                  const diff = c.difference_amount || 0;
                  const isBal = Math.abs(diff) < 0.01;
                  const isExcess = diff > 0;
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 700 }}>#{c.sequence}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontWeight: 600 }}>{c.employee_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.employee_code}</div>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {c.nozzles?.join(', ') || 'None'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>
                        {c.total_litres_sold?.toFixed(3) || '0.000'} L
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        ₹{c.total_sale_amount?.toFixed(2) || '0.00'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>
                        ₹{c.total_collected_amount?.toFixed(2) || '0.00'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        {isBal ? (
                          <span style={{ color: '#065f46', fontWeight: 600 }}>Balanced</span>
                        ) : isExcess ? (
                          <span style={{ color: '#d97706', fontWeight: 700 }}>+₹{diff.toFixed(2)} Excess</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 700 }}>-₹{Math.abs(diff).toFixed(2)} Shortage</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span className={`badge ${c.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                          {(c.status || '').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => navigate(`/app/operations/shift-cards/entry/${c.id}`)}
                        >
                          View / Edit Card
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expenses / Deductions Approval Panel */}
      <div className="card" style={{ padding: '1.25rem', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Manager Expense Approvals</h3>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
              Shift operator expenses require separate manager approval to reduce cash accountability.
            </span>
          </div>
        </div>

        {deductions.length === 0 ? (
          <div className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
            No expenses recorded for this shift.
          </div>
        ) : (
          <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th>Attendant</th>
                <th>Expense Description</th>
                <th>Payee</th>
                <th>Amount (₹)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deductions.map((d: any) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.employee_name}</td>
                  <td>{d.description}</td>
                  <td>{d.payee || '-'}</td>
                  <td style={{ fontWeight: 700 }}>₹{parseFloat(d.amount || '0').toFixed(2)}</td>
                  <td>
                    {d.approval_status === 'approved' && (
                      <span className="badge badge-success">Approved</span>
                    )}
                    {d.approval_status === 'rejected' && (
                      <span className="badge badge-danger">Rejected</span>
                    )}
                    {d.approval_status === 'pending' && (
                      <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                        Pending Approval
                      </span>
                    )}
                  </td>
                  <td>
                    {d.approval_status === 'pending' && canApproveDeduction && !shift?.is_locked && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() => handleApproveDeduction(d.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          <ThumbsUp size={14} /> Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => {
                            setRejectingDeductionId(d.id);
                            setShowUnlockModal(false);
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          <ThumbsDown size={14} /> Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Controlled Unlock Modal */}
      {showUnlockModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '480px', padding: '1.5rem', background: '#fff' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Unlock size={20} /> Controlled Shift Unlock
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
              Unlocking financial records is restricted and strictly audited. Provide an explicit reason for why this shift is being unlocked for corrections.
            </p>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Reason for Unlock (Minimum 5 characters) *
              </label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="e.g. Correcting DSM meter reading typo from physical slip"
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => setShowUnlockModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-warning"
                onClick={handleConfirmUnlock}
                disabled={unlocking || unlockReason.trim().length < 5}
              >
                {unlocking ? 'Unlocking...' : 'Confirm Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controlled Lock Modal */}
      {showLockModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '450px', padding: '1.5rem', background: '#fff' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Lock size={20} /> Lock Financial Shift
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
              Locking this shift prevents further modifications to shift cards and meter totalizers.
            </p>
            <div style={{ marginBottom: '1.25rem' }}>
              {totalCash > 0 && <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.75rem' }}>
                Cash Account Receiving ₹{totalCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })} *
                <select className="form-control" required value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)} style={{ marginTop: '0.35rem' }}>
                  <option value="">Select cash account</option>
                  {cashAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.code}</option>)}
                </select>
              </label>}
              <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Lock Note (Optional)
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Audit verified and reconciled"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => setShowLockModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmLock}
                disabled={locking || (totalCash > 0 && !cashAccountId)}
              >
                {locking ? 'Locking...' : 'Confirm Lock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Deduction Modal */}
      {rejectingDeductionId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '450px', padding: '1.5rem', background: '#fff' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#991b1b' }}>
              Reject Expense
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
              Provide a mandatory reason for rejecting this expense claim.
            </p>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Rejection Reason *
              </label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => setRejectingDeductionId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmRejectDeduction}
                disabled={rejecting || !rejectReason.trim()}
              >
                {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
