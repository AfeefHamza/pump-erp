import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  type EmployeeReconciliationPreview,
  type EmployeeShiftCollection,
  type FuelCreditSlip,
  type EmployeeShiftDeduction,
  fetchEmployeeReconciliationPreview,
  fetchShiftCollections,
  fetchShiftCreditSlips,
  fetchShiftDeductions,
  voidCollection,
  voidCreditSlip,
  voidShiftDeduction,
  reconcileEmployeeSettlement,
  reopenEmployeeSettlement,
  fetchEmployeeAccountabilitySummary,
} from '@/api/client';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { CollectionEntryDrawer } from '../components/CollectionEntryDrawer';
import { DeductionEntryDrawer } from '../components/DeductionEntryDrawer';
import { CreditSlipDrawer } from '@/features/sales/components/CreditSlipDrawer';
import {
  ArrowLeft, Plus, CheckCircle2, AlertCircle,
  Lock, Unlock
} from 'lucide-react';

export const EmployeeCollectionDetailWorkspace: React.FC = () => {
  const { shiftId, employeeId } = useParams<{ shiftId: string; employeeId: string }>();
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const canView = usePermission('collection.view');
  const canCreateCol = usePermission('collection.create');
  const canVoidCol = usePermission('collection.void');
  const canCreateSlip = usePermission('credit_slip.create');
  const canVoidSlip = usePermission('credit_slip.void');
  const canApproveDed = usePermission('shift_deduction.approve');
  const canVoidDed = usePermission('shift_deduction.void');
  const canReconcile = usePermission('reconciliation.reconcile');
  const canReopen = usePermission('reconciliation.reopen');

  const [preview, setPreview] = useState<EmployeeReconciliationPreview | null>(null);
  const [collections, setCollections] = useState<EmployeeShiftCollection[]>([]);
  const [creditSlips, setCreditSlips] = useState<FuelCreditSlip[]>([]);
  const [deductions, setDeductions] = useState<EmployeeShiftDeduction[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawers
  const [isColDrawerOpen, setIsColDrawerOpen] = useState(false);
  const [isSlipDrawerOpen, setIsSlipDrawerOpen] = useState(false);
  const [isDedDrawerOpen, setIsDedDrawerOpen] = useState(false);

  // Voiding state
  const [voidType, setVoidType] = useState<'collection' | 'slip' | 'deduction' | null>(null);
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // Reconcile Dialog
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [reconNotes, setReconNotes] = useState('');
  const [reconAcknowledged, setReconAcknowledged] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconError, setReconError] = useState<string | null>(null);

  // Reopen Dialog
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [isReopening, setIsReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId || !shiftId || !employeeId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [prevData, colData, slipData, dedData] = await Promise.all([
        fetchEmployeeReconciliationPreview(selectedOrgId, selectedOutletId, shiftId, employeeId),
        fetchShiftCollections(selectedOrgId, selectedOutletId, shiftId, { employee_id: employeeId }),
        fetchShiftCreditSlips(selectedOrgId, selectedOutletId, shiftId, employeeId),
        fetchShiftDeductions(selectedOrgId, selectedOutletId, shiftId, employeeId),
      ]);
      setPreview(prevData);
      setCollections(colData);
      setCreditSlips(slipData);
      setDeductions(dedData);
    } catch (err: any) {
      console.error('Failed to load employee workspace:', err);
      setError(err.message || 'Failed to load employee collection workspace.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, shiftId, employeeId, canView]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const isReconciled = preview?.settlement_status === 'reconciled';

  // Handle Void
  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId || !voidTargetId || !voidReason.trim()) return;
    setIsVoiding(true);
    try {
      if (voidType === 'collection') {
        await voidCollection(selectedOrgId, selectedOutletId, voidTargetId, voidReason.trim());
      } else if (voidType === 'slip') {
        await voidCreditSlip(selectedOrgId, selectedOutletId, voidTargetId, voidReason.trim());
      } else if (voidType === 'deduction') {
        await voidShiftDeduction(selectedOrgId, selectedOutletId, voidTargetId, voidReason.trim());
      }
      setVoidType(null);
      setVoidTargetId(null);
      setVoidReason('');
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to void record.');
    } finally {
      setIsVoiding(false);
    }
  };

  // Handle Reconcile
  const handleConfirmReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId || !shiftId || !employeeId) return;

    if (preview?.requires_acknowledgement) {
      if (!reconAcknowledged) {
        setReconError('Please check the acknowledgement checkbox before finalizing.');
        return;
      }
      if (!reconNotes.trim()) {
        setReconError('Reconciliation notes are mandatory to explain the shortage / excess.');
        return;
      }
    }

    setIsReconciling(true);
    setReconError(null);
    try {
      await reconcileEmployeeSettlement(selectedOrgId, selectedOutletId, shiftId, employeeId, {
        notes: reconNotes.trim() || undefined,
        acknowledge_difference: reconAcknowledged,
      });
      setIsReconcileModalOpen(false);
      setReconNotes('');
      setReconAcknowledged(false);
      loadAll();
    } catch (err: any) {
      console.error('Failed to reconcile settlement:', err);
      setReconError(err.message || 'Failed to reconcile settlement.');
    } finally {
      setIsReconciling(false);
    }
  };

  // Handle Reopen
  const handleConfirmReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId || !shiftId || !preview) return;
    if (!reopenReason.trim()) {
      setReopenError('Please enter a reason for reopening.');
      return;
    }
    setIsReopening(true);
    setReopenError(null);
    try {
      // Find settlement ID
      const summary = await fetchEmployeeAccountabilitySummary(selectedOrgId, selectedOutletId, shiftId);
      const empAcc = summary.employees.find((e: any) => e.employee_id === employeeId);
      if (!empAcc?.settlement_id) {
        throw new Error('Settlement ID not found for this employee.');
      }
      await reopenEmployeeSettlement(selectedOrgId, selectedOutletId, shiftId, empAcc.settlement_id, reopenReason.trim());
      setIsReopenModalOpen(false);
      setReopenReason('');
      loadAll();
    } catch (err: any) {
      console.error('Failed to reopen settlement:', err);
      setReopenError(err.message || 'Failed to reopen settlement.');
    } finally {
      setIsReopening(false);
    }
  };

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view employee collections.</p>
      </div>
    );
  }

  if (loading && !preview) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
        Loading employee collection workspace...
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div style={{ padding: '2rem' }}>
        <button
          onClick={() => navigate(`/app/employees/cash-collections/${shiftId}`)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-accent, #0f766e)', marginBottom: '1rem' }}
        >
          <ArrowLeft size={16} /> Back to Shift Workspace
        </button>
        <div className="card" style={{ padding: '2rem', color: 'var(--color-danger-text, #b91c1c)' }}>
          {error || 'Workspace data could not be retrieved.'}
        </div>
      </div>
    );
  }

  const diffAmount = Number(preview.difference_amount);
  const isShortage = diffAmount < 0;
  const isExcess = diffAmount > 0;
  const shortageVal = Number(preview.shortage_amount);
  const excessVal = Number(preview.excess_amount);

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate(`/app/employees/cash-collections/${shiftId}`)}
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
        <span>Back to Shift Attendants</span>
      </button>

      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
              {preview.employee_name}
            </h1>
            <span
              style={{
                padding: '0.2rem 0.65rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                backgroundColor: isReconciled ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-warning-bg, #ffedd5)',
                color: isReconciled ? 'var(--color-success-text, #15803d)' : 'var(--color-warning-text, #c2410c)',
              }}
            >
              {preview.settlement_status}
            </span>
          </div>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted, #64748b)', fontSize: '0.9rem' }}>
            Employee Code: <strong>{preview.employee_code}</strong> • Operational Shift:{' '}
            <strong style={{ textTransform: 'capitalize' }}>{preview.shift_status}</strong>
            {isReconciled && preview.reconciled_by_name && (
              <span> • Reconciled by {preview.reconciled_by_name} at {preview.reconciled_at ? new Date(preview.reconciled_at).toLocaleString() : ''}</span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {!isReconciled ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                setReconNotes('');
                setReconAcknowledged(false);
                setReconError(null);
                setIsReconcileModalOpen(true);
              }}
              disabled={!preview.can_reconcile || !canReconcile}
              title={!preview.can_reconcile ? (preview.blocking_reasons || preview.blocking_errors || []).join(', ') : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.65rem 1.4rem',
                borderRadius: '6px',
                fontWeight: 600,
                backgroundColor: preview.can_reconcile ? 'var(--color-accent, #0f766e)' : '#94a3b8',
                color: '#fff',
                border: 'none',
                cursor: preview.can_reconcile ? 'pointer' : 'not-allowed',
              }}
            >
              <CheckCircle2 size={17} />
              <span>Reconcile Attendant Settlement</span>
            </button>
          ) : (
            canReopen && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setReopenReason('');
                  setReopenError(null);
                  setIsReopenModalOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.65rem 1.25rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  color: 'var(--color-warning-text, #c2410c)',
                  borderColor: 'var(--color-warning-text, #c2410c)',
                }}
              >
                <Unlock size={16} />
                <span>Reopen Settlement</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Reconciled Lock Notice */}
      {isReconciled && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: '8px',
            backgroundColor: 'var(--color-info-bg, #e0f2fe)',
            border: '1px solid var(--color-info-text, #0369a1)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
            color: 'var(--color-info-text, #0369a1)',
          }}
        >
          <Lock size={18} />
          <span>
            This attendant's settlement has been reconciled and finalized. All source collection entries, credit slips, and adjustments are locked. To make corrections, reopen the settlement first.
          </span>
        </div>
      )}

      {/* Blocking Reasons Notice */}
      {!isReconciled && !preview.can_reconcile && ((preview.blocking_reasons?.length || 0) > 0 || (preview.blocking_errors?.length || 0) > 0) && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: '8px',
            backgroundColor: 'var(--color-warning-bg, #ffedd5)',
            border: '1px solid var(--color-warning-text, #c2410c)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
            color: 'var(--color-warning-text, #c2410c)',
          }}
        >
          <AlertCircle size={18} style={{ marginTop: '0.15rem', flexShrink: 0 }} />
          <div>
            <strong>Reconciliation Pending Shift Closure:</strong>
            <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem' }}>
              {(preview.blocking_reasons || preview.blocking_errors || []).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Main Grid: Left Side Data (Breakdown & Collections) | Right Side Live Reconciliation Preview Card */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Section 1: Attributed Sales by Nozzle */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
            <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', background: 'var(--table-header-bg, #f8fafc)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                Attributed Fuel Sales by Nozzle Interval
              </h3>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-accent, #0f766e)' }}>
                Expected: ₹{Number(preview.expected_sale_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {(preview.nozzle_breakdown || []).length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: '0.85rem' }}>
                No nozzle dispensing intervals attributed to this attendant on this shift.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>Nozzle</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>Product</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'right' }}>Net Quantity</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'right' }}>Unit Rate</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'right' }}>Attributed Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.nozzle_breakdown || []).map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                        {item.nozzle_code}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: 'var(--text-muted, #64748b)' }}>{item.product_name}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 500 }}>
                        {Number(item.quantity).toFixed(3)} L
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'right', color: 'var(--text-muted, #64748b)' }}>
                        ₹{Number(item.unit_price).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                        ₹{Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Section 2: Collection Entries (Cash / Card / UPI) */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
            <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', background: 'var(--table-header-bg, #f8fafc)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                Cash, Card & UPI Collections ({collections.length})
              </h3>
              {!isReconciled && canCreateCol && (
                <button
                  type="button"
                  onClick={() => setIsColDrawerOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    backgroundColor: 'var(--color-accent, #0f766e)',
                    color: '#fff',
                    border: 'none',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '4px',
                    fontSize: '0.775rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  <span>Add Collection</span>
                </button>
              )}
            </div>

            {collections.length === 0 ? (
              <div style={{ padding: '1.75rem', textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: '0.85rem' }}>
                No collections recorded for this attendant yet.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>Method</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'right' }}>Amount (₹)</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>Time</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>Provider / Ref</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {collections.map((col) => {
                    const isVoid = col.status === 'void';
                    return (
                      <tr key={col.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isVoid ? 'rgba(241, 245, 249, 0.4)' : '#fff' }}>
                        <td style={{ padding: '0.65rem 1rem', fontWeight: 600, textTransform: 'uppercase' }}>
                          {col.collection_method}
                          {col.denominations && col.denominations.length > 0 && (
                            <span style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-muted, #64748b)', fontWeight: 400 }}>
                              {col.denominations.length} denominations
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 600, color: isVoid ? 'var(--text-muted, #94a3b8)' : 'var(--text-main, #0f172a)' }}>
                          ₹{Number(col.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
                          {new Date(col.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', fontSize: '0.8rem' }}>
                          {col.provider_name && <div>{col.provider_name}</div>}
                          {col.reference_number && <div style={{ color: 'var(--text-muted, #64748b)' }}>{col.reference_number}</div>}
                          {!col.provider_name && !col.reference_number && <span style={{ color: 'var(--text-muted, #94a3b8)' }}>—</span>}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '0.15rem 0.45rem',
                              borderRadius: '10px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              backgroundColor: !isVoid ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-danger-bg, #fee2e2)',
                              color: !isVoid ? 'var(--color-success-text, #15803d)' : 'var(--color-danger-text, #b91c1c)',
                            }}
                          >
                            {col.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                          {!isVoid && !isReconciled && canVoidCol && (
                            <button
                              type="button"
                              onClick={() => {
                                setVoidType('collection');
                                setVoidTargetId(col.id);
                                setVoidReason('');
                              }}
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--border-color, #cbd5e1)',
                                borderRadius: '4px',
                                padding: '0.25rem 0.5rem',
                                color: 'var(--color-danger-text, #b91c1c)',
                                fontSize: '0.725rem',
                                cursor: 'pointer',
                              }}
                            >
                              Void
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Section 3: Customer Credit Slips */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
            <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', background: 'var(--table-header-bg, #f8fafc)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                Attributed Customer Credit Slips ({creditSlips.length})
              </h3>
              {!isReconciled && canCreateSlip && (
                <button
                  type="button"
                  onClick={() => setIsSlipDrawerOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    backgroundColor: 'var(--color-accent, #0f766e)',
                    color: '#fff',
                    border: 'none',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '4px',
                    fontSize: '0.775rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  <span>Issue Credit Slip</span>
                </button>
              )}
            </div>

            {creditSlips.length === 0 ? (
              <div style={{ padding: '1.75rem', textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: '0.85rem' }}>
                No credit slips issued by this attendant.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>Slip #</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>Customer</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>Fuel / Nozzle</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'right' }}>Qty & Rate</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'right' }}>Amount (₹)</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {creditSlips.map((slip) => {
                    const isVoid = slip.status === 'void';
                    return (
                      <tr key={slip.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isVoid ? 'rgba(241, 245, 249, 0.4)' : '#fff' }}>
                        <td style={{ padding: '0.65rem 1rem', fontWeight: 600, color: isVoid ? 'var(--text-muted, #94a3b8)' : 'var(--color-accent, #0f766e)' }}>
                          {slip.slip_number}
                        </td>
                        <td style={{ padding: '0.65rem 1rem' }}>
                          <div style={{ fontWeight: 500 }}>{slip.customer_name}</div>
                          {slip.vehicle_number && <span style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)' }}>{slip.vehicle_number}</span>}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', color: 'var(--text-muted, #64748b)' }}>
                          {slip.product_name} {slip.nozzle_code && `(${slip.nozzle_code})`}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                          {Number(slip.quantity).toFixed(3)} L @ ₹{Number(slip.unit_price).toFixed(2)}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 600, color: isVoid ? 'var(--text-muted, #94a3b8)' : 'var(--text-main, #0f172a)' }}>
                          ₹{Number(slip.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '0.15rem 0.45rem',
                              borderRadius: '10px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              backgroundColor: !isVoid ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-danger-bg, #fee2e2)',
                              color: !isVoid ? 'var(--color-success-text, #15803d)' : 'var(--color-danger-text, #b91c1c)',
                            }}
                          >
                            {slip.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                          {!isVoid && !isReconciled && canVoidSlip && (
                            <button
                              type="button"
                              onClick={() => {
                                setVoidType('slip');
                                setVoidTargetId(slip.id);
                                setVoidReason('');
                              }}
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--border-color, #cbd5e1)',
                                borderRadius: '4px',
                                padding: '0.25rem 0.5rem',
                                color: 'var(--color-danger-text, #b91c1c)',
                                fontSize: '0.725rem',
                                cursor: 'pointer',
                              }}
                            >
                              Void
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Section 4: Approved Deductions & Adjustments */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
            <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', background: 'var(--table-header-bg, #f8fafc)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                Authorized Adjustments & Shift Expenses ({deductions.length})
              </h3>
              {!isReconciled && canApproveDed && (
                <button
                  type="button"
                  onClick={() => setIsDedDrawerOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    backgroundColor: 'var(--color-accent, #0f766e)',
                    color: '#fff',
                    border: 'none',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '4px',
                    fontSize: '0.775rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  <span>Add Adjustment</span>
                </button>
              )}
            </div>

            {deductions.length === 0 ? (
              <div style={{ padding: '1.75rem', textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: '0.85rem' }}>
                No expenses or adjustments recorded for this attendant.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>Description</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>Type / Reason</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'right' }}>Effect</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'right' }}>Amount (₹)</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '0.65rem 1rem', fontWeight: 600, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deductions.map((ded) => {
                    const isVoid = ded.status === 'void';
                    const isIncrease = ded.direction === 'increases_accounted';
                    return (
                      <tr key={ded.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isVoid ? 'rgba(241, 245, 249, 0.4)' : '#fff' }}>
                        <td style={{ padding: '0.65rem 1rem' }}>
                          <div style={{ fontWeight: 500 }}>{ded.description}</div>
                          {ded.payee && <span style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)' }}>Payee: {ded.payee}</span>}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
                          <span style={{ textTransform: 'capitalize' }}>{ded.deduction_type.replace('_', ' ')}</span>
                          <div style={{ fontSize: '0.725rem' }}>Appr: {ded.approved_by_name}</div>
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                          <span style={{ color: isIncrease ? 'var(--color-success-text, #15803d)' : 'var(--color-warning-text, #c2410c)' }}>
                            {isIncrease ? '+ Increases' : '- Decreases'}
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 600, color: isVoid ? 'var(--text-muted, #94a3b8)' : 'var(--text-main, #0f172a)' }}>
                          ₹{Number(ded.amount).toFixed(2)}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '0.15rem 0.45rem',
                              borderRadius: '10px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              backgroundColor: !isVoid ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-danger-bg, #fee2e2)',
                              color: !isVoid ? 'var(--color-success-text, #15803d)' : 'var(--color-danger-text, #b91c1c)',
                            }}
                          >
                            {ded.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                          {!isVoid && !isReconciled && canVoidDed && (
                            <button
                              type="button"
                              onClick={() => {
                                setVoidType('deduction');
                                setVoidTargetId(ded.id);
                                setVoidReason('');
                              }}
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--border-color, #cbd5e1)',
                                borderRadius: '4px',
                                padding: '0.25rem 0.5rem',
                                color: 'var(--color-danger-text, #b91c1c)',
                                fontSize: '0.725rem',
                                cursor: 'pointer',
                              }}
                            >
                              Void
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column: Live Reconciliation Preview Card */}
        <div
          className="card"
          style={{
            padding: '1.5rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #e2e8f0)',
            background: 'var(--bg-card, #ffffff)',
            boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
            position: 'sticky',
            top: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
              Live Reconciliation Preview
            </h3>
            <span
              style={{
                display: 'inline-block',
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                backgroundColor: isReconciled ? 'var(--color-success-bg, #dcfce7)' : 'var(--table-header-bg, #f1f5f9)',
                color: isReconciled ? 'var(--color-success-text, #15803d)' : 'var(--text-muted, #64748b)',
              }}
            >
              {preview.settlement_status}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
            {/* Expected Fuel Sales */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px dashed var(--border-color, #e2e8f0)' }}>
              <span style={{ color: 'var(--text-muted, #64748b)' }}>Attributed Fuel Sales:</span>
              <strong style={{ color: 'var(--text-main, #0f172a)' }}>
                ₹{Number(preview.expected_sale_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </strong>
            </div>

            {/* Accounted Breakdown */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0' }}>
              <span style={{ color: 'var(--text-muted, #64748b)' }}>+ Cash Handover:</span>
              <span>₹{Number(preview.cash_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0' }}>
              <span style={{ color: 'var(--text-muted, #64748b)' }}>+ Card Collections:</span>
              <span>₹{Number(preview.card_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0' }}>
              <span style={{ color: 'var(--text-muted, #64748b)' }}>+ UPI Collections:</span>
              <span>₹{Number(preview.upi_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0' }}>
              <span style={{ color: 'var(--text-muted, #64748b)' }}>+ Customer Credit Slips:</span>
              <span>₹{Number(preview.credit_slip_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', color: 'var(--color-success-text, #15803d)' }}>
              <span>+ Approved Increases (Expenses):</span>
              <span>₹{Number(preview.approved_increase_adjustments).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', color: 'var(--color-danger-text, #b91c1c)' }}>
              <span>− Approved Decreases:</span>
              <span>₹{Number(preview.approved_decrease_adjustments).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>

            {/* Total Accounted */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.65rem 0.75rem',
                backgroundColor: 'var(--table-header-bg, #f8fafc)',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.95rem',
                marginTop: '0.5rem',
                border: '1px solid var(--border-color, #e2e8f0)',
              }}
            >
              <span>Total Accounted:</span>
              <span style={{ color: 'var(--color-accent, #0f766e)' }}>
                ₹{Number(preview.total_accounted_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Difference / Result Card */}
            <div
              style={{
                padding: '1rem',
                borderRadius: '6px',
                marginTop: '0.5rem',
                backgroundColor: isShortage
                  ? 'var(--color-danger-bg, #fee2e2)'
                  : isExcess
                  ? 'var(--color-info-bg, #e0f2fe)'
                  : 'var(--color-success-bg, #dcfce7)',
                border: isShortage
                  ? '1px solid var(--color-danger-text, #b91c1c)'
                  : isExcess
                  ? '1px solid var(--color-info-text, #0369a1)'
                  : '1px solid var(--color-success-text, #15803d)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                  {isShortage ? 'Attendant Shortage' : isExcess ? 'Attendant Excess' : 'Status: Balanced'}
                </span>
                <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                  {isShortage ? `₹${shortageVal.toFixed(2)}` : isExcess ? `+₹${excessVal.toFixed(2)}` : '₹0.00'}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.35rem', opacity: 0.85 }}>
                {isShortage
                  ? 'Total accounted amount is less than expected fuel sales.'
                  : isExcess
                  ? 'Total accounted amount exceeds expected fuel sales.'
                  : 'Total accounted collections match exact fuel sales.'}
              </div>
            </div>

            {/* Reconciliation Button */}
            {!isReconciled && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setReconNotes('');
                  setReconAcknowledged(false);
                  setIsReconcileModalOpen(true);
                }}
                disabled={!preview.can_reconcile || !canReconcile}
                style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  backgroundColor: preview.can_reconcile ? 'var(--color-accent, #0f766e)' : '#94a3b8',
                  color: '#fff',
                  border: 'none',
                  cursor: preview.can_reconcile ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <CheckCircle2 size={18} />
                <span>Finalize & Reconcile Settlement</span>
              </button>
            )}

            {isReconciled && preview.reconciliation_notes && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
                <strong>Reconciliation Notes:</strong> {preview.reconciliation_notes}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drawers */}
      {selectedOrgId && selectedOutletId && shiftId && (
        <>
          <CollectionEntryDrawer
            isOpen={isColDrawerOpen}
            onClose={() => setIsColDrawerOpen(false)}
            onSuccess={() => loadAll()}
            orgId={selectedOrgId}
            outletId={selectedOutletId}
            shiftId={shiftId}
            employeeId={employeeId || ''}
            employeeName={preview.employee_name}
          />

          <CreditSlipDrawer
            isOpen={isSlipDrawerOpen}
            onClose={() => setIsSlipDrawerOpen(false)}
            onSuccess={() => loadAll()}
            orgId={selectedOrgId}
            outletId={selectedOutletId}
            shiftId={shiftId}
            preselectedEmployeeId={employeeId}
          />

          <DeductionEntryDrawer
            isOpen={isDedDrawerOpen}
            onClose={() => setIsDedDrawerOpen(false)}
            onSuccess={() => loadAll()}
            orgId={selectedOrgId}
            outletId={selectedOutletId}
            shiftId={shiftId}
            employeeId={employeeId || ''}
            employeeName={preview.employee_name}
          />
        </>
      )}

      {/* Void Modal */}
      {voidTargetId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '1.5rem', borderRadius: '8px', background: '#fff' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--color-danger-text, #b91c1c)' }}>
              Void {voidType ? voidType.toUpperCase() : 'Entry'}
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
              Voiding this record will immediately recalculate employee reconciliation. A mandatory reason is required.
            </p>
            <form onSubmit={handleConfirmVoid}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                  Reason for Voiding *
                </label>
                <textarea
                  className="input"
                  rows={3}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                  placeholder="Mandatory reason..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setVoidTargetId(null)} disabled={isVoiding}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={isVoiding || !voidReason.trim()}
                  style={{ backgroundColor: 'var(--color-danger-text, #b91c1c)', color: '#fff', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '6px' }}
                >
                  {isVoiding ? 'Voiding...' : 'Confirm Void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reconcile Modal */}
      {isReconcileModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '1.5rem', borderRadius: '8px', background: '#fff' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text-main, #0f172a)' }}>
              Confirm Reconciliation: {preview.employee_name}
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
              Review the final settlement snapshot below before locking this attendant's records.
            </p>

            <div style={{ padding: '0.85rem', backgroundColor: 'var(--table-header-bg, #f8fafc)', borderRadius: '6px', border: '1px solid var(--border-color, #e2e8f0)', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span>Expected Fuel:</span>
                <strong>₹{Number(preview.expected_sale_amount).toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span>Total Accounted:</span>
                <strong style={{ color: 'var(--color-accent, #0f766e)' }}>₹{Number(preview.total_accounted_amount).toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: isShortage ? 'var(--color-danger-text, #b91c1c)' : isExcess ? 'var(--color-info-text, #0369a1)' : 'var(--color-success-text, #15803d)' }}>
                <span>Difference:</span>
                <span>{isShortage ? `Shortage: ₹${shortageVal.toFixed(2)}` : isExcess ? `Excess: +₹${excessVal.toFixed(2)}` : 'Balanced (₹0)'}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmReconcile}>
              {reconError && (
                <div
                  style={{
                    backgroundColor: 'var(--color-danger-bg, #fee2e2)',
                    color: 'var(--color-danger-text, #b91c1c)',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{reconError}</span>
                </div>
              )}

              {preview.requires_acknowledgement && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.825rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={reconAcknowledged}
                      onChange={(e) => {
                        setReconAcknowledged(e.target.checked);
                        if (reconError) setReconError(null);
                      }}
                      style={{ marginTop: '0.2rem' }}
                    />
                    <span style={{ fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                      I acknowledge the {isShortage ? `shortage of ₹${shortageVal.toFixed(2)}` : `excess of ₹${excessVal.toFixed(2)}`} and confirm this settlement reconciliation.
                    </span>
                  </label>
                  <p style={{ margin: '0.35rem 0 0 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                    Note: No automated payroll deduction or permanent accounting posting occurs at this stage.
                  </p>
                </div>
              )}

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                  Reconciliation Notes {preview.requires_acknowledgement ? '*' : '(Optional)'}
                </label>
                <textarea
                  className="input"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    borderRadius: '6px',
                    border: reconError && preview.requires_acknowledgement && !reconNotes.trim() ? '1px solid #ef4444' : '1px solid var(--border-color, #cbd5e1)',
                  }}
                  placeholder={preview.requires_acknowledgement ? "Mandatory explanation for shortage / excess..." : "Optional reviewer notes..."}
                  value={reconNotes}
                  onChange={(e) => {
                    setReconNotes(e.target.value);
                    if (reconError) setReconError(null);
                  }}
                />
                {preview.requires_acknowledgement && (
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                    Explanation is mandatory when finalizing with a shortage or excess.
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsReconcileModalOpen(false)} disabled={isReconciling}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isReconciling}
                  style={{
                    backgroundColor: isReconciling ? '#94a3b8' : 'var(--color-accent, #0f766e)',
                    color: '#fff',
                    border: 'none',
                    padding: '0.6rem 1.4rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: isReconciling ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isReconciling ? 'Reconciling...' : 'Confirm & Finalize'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reopen Modal */}
      {isReopenModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '1.5rem', borderRadius: '8px', background: '#fff' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--color-warning-text, #c2410c)' }}>
              Reopen Attendant Settlement
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
              Reopening returns the settlement to 'preparing' and unlocks source records for authorized corrections. A mandatory reason is required.
            </p>
            <form onSubmit={handleConfirmReopen}>
              {reopenError && (
                <div
                  style={{
                    backgroundColor: 'var(--color-danger-bg, #fee2e2)',
                    color: 'var(--color-danger-text, #b91c1c)',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{reopenError}</span>
                </div>
              )}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                  Reason for Reopening *
                </label>
                <textarea
                  className="input"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    borderRadius: '6px',
                    border: reopenError && !reopenReason.trim() ? '1px solid #ef4444' : '1px solid var(--border-color, #cbd5e1)',
                  }}
                  placeholder="e.g. Cash recounted, missed credit slip added..."
                  value={reopenReason}
                  onChange={(e) => {
                    setReopenReason(e.target.value);
                    if (reopenError) setReopenError(null);
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsReopenModalOpen(false)} disabled={isReopening}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isReopening}
                  style={{
                    backgroundColor: isReopening ? '#94a3b8' : 'var(--color-warning-text, #c2410c)',
                    color: '#fff',
                    border: 'none',
                    padding: '0.6rem 1.4rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: isReopening ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isReopening ? 'Reopening...' : 'Confirm Reopen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
