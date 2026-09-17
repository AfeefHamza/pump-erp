import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppSelector } from '@/app/store';
import {
  type FuelCreditSlip,
  type Customer,
  fetchOutletCreditSlips,
  fetchCustomers,
  fetchOperationalShifts,
  voidCreditSlip,
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { CreditSlipDrawer } from '../components/CreditSlipDrawer';
import { FileText, Plus, Search } from 'lucide-react';

export const CreditSlipsPage: React.FC = () => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const canView = usePermission('credit_slip.view');
  const canCreate = usePermission('credit_slip.create');
  const canVoid = usePermission('credit_slip.void');

  const [creditSlips, setCreditSlips] = useState<FuelCreditSlip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'void'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [voidingSlip, setVoidingSlip] = useState<FuelCreditSlip | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  const loadData = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [slipsData, custsData, shiftsRes] = await Promise.all([
        fetchOutletCreditSlips(selectedOrgId, selectedOutletId, {
          customer_id: selectedCustomerId || undefined,
          shift_id: selectedShiftId || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        }),
        fetchCustomers(selectedOrgId),
        fetchOperationalShifts(selectedOrgId, selectedOutletId),
      ]);
      setCreditSlips(slipsData);
      setCustomers(custsData);
      setShifts(shiftsRes.shifts || []);
    } catch (err: any) {
      console.error('Failed to load credit slips:', err);
      setError(err.message || 'Failed to load credit slips.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, canView, selectedCustomerId, selectedShiftId, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId || !voidingSlip || !voidReason.trim()) return;
    setIsVoiding(true);
    try {
      await voidCreditSlip(selectedOrgId, selectedOutletId, voidingSlip.id, voidReason.trim());
      setVoidingSlip(null);
      setVoidReason('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to void credit slip.');
    } finally {
      setIsVoiding(false);
    }
  };

  // Filtered slips by search
  const filteredSlips = useMemo(() => {
    if (!searchQuery.trim()) return creditSlips;
    const q = searchQuery.toLowerCase();
    return creditSlips.filter(
      (s) =>
        s.slip_number.toLowerCase().includes(q) ||
        s.customer_name?.toLowerCase().includes(q) ||
        s.vehicle_number?.toLowerCase().includes(q) ||
        s.driver_name?.toLowerCase().includes(q) ||
        s.physical_slip_number?.toLowerCase().includes(q)
    );
  }, [creditSlips, searchQuery]);

  // KPIs
  const activeSlips = filteredSlips.filter((s) => s.status === 'active');
  const totalActiveAmount = activeSlips.reduce((acc, s) => acc + Number(s.amount), 0);
  const totalActiveQty = activeSlips.reduce((acc, s) => acc + Number(s.quantity), 0);

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view fuel credit slips.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <PageHeader
          title="Customer Credit Slips"
          subtitle="Enter fuel credit slips at any time and attribute them to the recorded shift and attendant."
        />
        {canCreate && (
          <button
            className="btn btn-primary"
            onClick={() => setIsDrawerOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'var(--color-accent, #0f766e)',
              color: '#fff',
              border: 'none',
              padding: '0.65rem 1.25rem',
              borderRadius: '6px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Plus size={18} />
            <span>Issue Credit Slip</span>
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
            Active Credit Slips
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-accent, #0f766e)', marginTop: '0.25rem' }}>
            {activeSlips.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>Contributing to attendant accountability</span>
        </div>

        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
            Total Fuel Volume Credited
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginTop: '0.25rem' }}>
            {totalActiveQty.toFixed(3)} L
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>Dispensed via meter sales</span>
        </div>

        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
            Total Credited Amount
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginTop: '0.25rem' }}>
            ₹{totalActiveAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>Across active slips</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        className="card"
        style={{
          padding: '1rem',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '8px',
          background: 'var(--bg-card, #ffffff)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '260px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #64748b)' }} />
            <input
              type="text"
              placeholder="Search slip #, vehicle, driver..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #cbd5e1)',
                fontSize: '0.875rem',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted, #64748b)' }}>Customer:</span>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #cbd5e1)',
                fontSize: '0.825rem',
                background: '#fff',
                maxWidth: '180px',
              }}
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted, #64748b)' }}>Shift:</span>
            <select
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #cbd5e1)',
                fontSize: '0.825rem',
                background: '#fff',
                maxWidth: '180px',
              }}
            >
              <option value="">All Shifts</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.business_date} - {s.shift_definition_name} ({s.status})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted, #64748b)' }}>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #cbd5e1)',
                fontSize: '0.825rem',
                background: '#fff',
              }}
            >
              <option value="all">All</option>
              <option value="active">Active Only</option>
              <option value="void">Void Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
          Loading credit slips...
        </div>
      ) : error ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-danger-text, #b91c1c)' }}>
          {error}
        </div>
      ) : filteredSlips.length === 0 ? (
        <div className="card" style={{ padding: '3.5rem', textAlign: 'center', background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px' }}>
          <FileText size={48} style={{ color: 'var(--text-muted, #94a3b8)', margin: '0 auto 1rem' }} />
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--text-main, #0f172a)' }}>No Credit Slips Found</h3>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
            No credit slips match the selected filters or none have been issued yet.
          </p>
          {canCreate && (
            <button
              className="btn btn-primary"
              onClick={() => setIsDrawerOpen(true)}
              style={{ backgroundColor: 'var(--color-accent, #0f766e)', color: '#fff', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '6px' }}
            >
              Issue Credit Slip
            </button>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Slip Number</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Date & Time</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Customer</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Attendant</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Product / Nozzle</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Quantity</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Rate</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Amount (₹)</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Vehicle / Driver</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'center' }}>Status</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSlips.map((slip) => {
                const isVoid = slip.status === 'void';
                return (
                  <tr
                    key={slip.id}
                    style={{
                      borderBottom: '1px solid var(--border-color, #f1f5f9)',
                      backgroundColor: isVoid ? 'rgba(241, 245, 249, 0.4)' : '#fff',
                    }}
                  >
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: isVoid ? 'var(--text-muted, #94a3b8)' : 'var(--color-accent, #0f766e)' }}>
                      {slip.slip_number}
                      {slip.physical_slip_number && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                          Ref: {slip.physical_slip_number}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
                      {new Date(slip.occurred_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-main, #0f172a)' }}>{slip.customer_name}</div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>{slip.customer_code}</span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-main, #0f172a)' }}>
                      {slip.employee_name}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 500 }}>{slip.product_name}</div>
                      {slip.nozzle_code && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                          Nozzle {slip.nozzle_code}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 500 }}>
                      {Number(slip.quantity).toFixed(3)} L
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: 'var(--text-muted, #64748b)' }}>
                      ₹{Number(slip.unit_price).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600, color: isVoid ? 'var(--text-muted, #94a3b8)' : 'var(--text-main, #0f172a)' }}>
                      ₹{Number(slip.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                      {slip.vehicle_number && <div>{slip.vehicle_number}</div>}
                      {slip.driver_name && <div style={{ color: 'var(--text-muted, #64748b)' }}>{slip.driver_name}</div>}
                      {!slip.vehicle_number && !slip.driver_name && <span style={{ color: 'var(--text-muted, #94a3b8)' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          backgroundColor: !isVoid ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-danger-bg, #fee2e2)',
                          color: !isVoid ? 'var(--color-success-text, #15803d)' : 'var(--color-danger-text, #b91c1c)',
                        }}
                      >
                        {slip.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      {!isVoid && canVoid && (
                        <button
                          type="button"
                          onClick={() => {
                            setVoidingSlip(slip);
                            setVoidReason('');
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-color, #cbd5e1)',
                            borderRadius: '4px',
                            padding: '0.35rem 0.65rem',
                            color: 'var(--color-danger-text, #b91c1c)',
                            fontSize: '0.75rem',
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
        </div>
      )}

      {/* Add Drawer */}
      {selectedOrgId && selectedOutletId && (
        <CreditSlipDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onSuccess={() => loadData()}
          orgId={selectedOrgId}
          outletId={selectedOutletId}
        />
      )}

      {/* Void Modal */}
      {voidingSlip && (
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
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '460px',
              padding: '1.5rem',
              borderRadius: '8px',
              background: '#fff',
              boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.15))',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--color-danger-text, #b91c1c)' }}>
              Void Credit Slip {voidingSlip.slip_number}
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
              Voiding this credit slip (₹{Number(voidingSlip.amount).toFixed(2)}) will immediately recalculate employee reconciliation and shift totals. A mandatory reason is required.
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
                  placeholder="e.g. Wrong customer, payment method changed to cash, etc."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setVoidingSlip(null)}
                  disabled={isVoiding}
                >
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
    </div>
  );
};
