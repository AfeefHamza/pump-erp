import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  type Customer,
  type CustomerCreditPosition,
  type FuelCreditSlip,
  fetchCustomer,
  fetchCustomerCreditPosition,
  fetchCustomerCreditSlips,
  deactivateCustomer,
  voidCreditSlip,
} from '@/api/client';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { ArrowLeft, Edit, UserX, AlertTriangle } from 'lucide-react';

export const CustomerDetailPage: React.FC = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const canView = usePermission('customer.view');
  const canUpdate = usePermission('customer.update');
  const canDeactivate = usePermission('customer.deactivate');
  const canVoidSlip = usePermission('credit_slip.void');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [position, setPosition] = useState<CustomerCreditPosition | null>(null);
  const [slips, setSlips] = useState<FuelCreditSlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [voidingSlip, setVoidingSlip] = useState<FuelCreditSlip | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  const loadData = useCallback(async () => {
    if (!selectedOrgId || !customerId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [custData, posData, slipsData] = await Promise.all([
        fetchCustomer(selectedOrgId, customerId),
        fetchCustomerCreditPosition(selectedOrgId, customerId, selectedOutletId || undefined),
        fetchCustomerCreditSlips(selectedOrgId, customerId),
      ]);
      setCustomer(custData);
      setPosition(posData);
      setSlips(slipsData);
    } catch (err: any) {
      console.error('Failed to load customer details:', err);
      setError(err.message || 'Failed to load customer details.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, customerId, selectedOutletId, canView]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeactivate = async () => {
    if (!selectedOrgId || !customer) return;
    if (window.confirm(`Are you sure you want to deactivate customer '${customer.display_name}'?`)) {
      try {
        await deactivateCustomer(selectedOrgId, customer.id);
        loadData();
      } catch (err: any) {
        alert(err.message || 'Failed to deactivate customer.');
      }
    }
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !voidingSlip || !voidReason.trim()) return;
    setIsVoiding(true);
    try {
      await voidCreditSlip(selectedOrgId, voidingSlip.outlet, voidingSlip.id, voidReason.trim());
      setVoidingSlip(null);
      setVoidReason('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to void credit slip.');
    } finally {
      setIsVoiding(false);
    }
  };

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view customer details.</p>
      </div>
    );
  }

  if (loading && !customer) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
        Loading customer information...
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div style={{ padding: '2rem' }}>
        <button
          onClick={() => navigate('/app/sales/customers')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-accent, #0f766e)', marginBottom: '1rem' }}
        >
          <ArrowLeft size={16} /> Back to Customers
        </button>
        <div className="card" style={{ padding: '2rem', color: 'var(--color-danger-text, #b91c1c)' }}>
          {error || 'Customer not found.'}
        </div>
      </div>
    );
  }

  const isActive = customer.status === 'active';
  const outstandingAmount = Number(position?.outstanding_credit_amount || 0);
  const creditLimitNum = Number(customer.credit_limit || 0);
  const usagePercent = position?.credit_limit_usage_percent ? Number(position.credit_limit_usage_percent) : 0;
  const isExceeded = position?.is_credit_limit_exceeded || false;

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate('/app/sales/customers')}
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
        <span>Back to Customers</span>
      </button>

      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
              {customer.display_name}
            </h1>
            <span
              style={{
                display: 'inline-block',
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                backgroundColor: isActive ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-danger-bg, #fee2e2)',
                color: isActive ? 'var(--color-success-text, #15803d)' : 'var(--color-danger-text, #b91c1c)',
              }}
            >
              {customer.status}
            </span>
          </div>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted, #64748b)', fontSize: '0.9rem' }}>
            Customer Code: <strong style={{ color: 'var(--color-accent, #0f766e)' }}>{customer.customer_code}</strong> | Type:{' '}
            <span style={{ textTransform: 'capitalize' }}>{customer.customer_type}</span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {canUpdate && (
            <button
              className="btn btn-secondary"
              onClick={() => navigate(`/app/sales/customers/${customer.id}/edit`)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem' }}
            >
              <Edit size={16} />
              <span>Edit Customer</span>
            </button>
          )}
          {canDeactivate && isActive && (
            <button
              className="btn"
              onClick={handleDeactivate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1rem',
                backgroundColor: 'var(--color-danger-bg, #fee2e2)',
                color: 'var(--color-danger-text, #b91c1c)',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <UserX size={16} />
              <span>Deactivate</span>
            </button>
          )}
        </div>
      </div>

      {/* Credit Position KPI Cards */}
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
            Outstanding Credit
          </span>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: isExceeded ? 'var(--color-danger-text, #b91c1c)' : 'var(--text-main, #0f172a)',
              marginTop: '0.25rem',
            }}
          >
            ₹{outstandingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
            Across {position?.total_active_slips || 0} active credit slips
          </span>
        </div>

        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
            Approved Credit Limit
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-accent, #0f766e)', marginTop: '0.25rem' }}>
            {creditLimitNum > 0 ? `₹${creditLimitNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Unlimited'}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
            Credit Days: {customer.credit_days ? `${customer.credit_days} days` : 'Not specified'}
          </span>
        </div>

        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
              Limit Utilization
            </span>
            {isExceeded && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: 'var(--color-danger-text, #b91c1c)', fontSize: '0.75rem', fontWeight: 600 }}>
                <AlertTriangle size={12} /> EXCEEDED
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: isExceeded ? 'var(--color-danger-text, #b91c1c)' : 'var(--text-main, #0f172a)',
              marginTop: '0.25rem',
            }}
          >
            {creditLimitNum > 0 ? `${usagePercent}%` : 'N/A'}
          </div>
          {creditLimitNum > 0 && (
            <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', marginTop: '0.5rem', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(usagePercent, 100)}%`,
                  height: '100%',
                  backgroundColor: isExceeded ? 'var(--color-danger-text, #b91c1c)' : 'var(--color-accent, #0f766e)',
                  borderRadius: '3px',
                }}
              />
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
            Oldest Active Slip
          </span>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main, #0f172a)', marginTop: '0.5rem' }}>
            {position?.oldest_credit_date ? new Date(position.oldest_credit_date).toLocaleDateString() : 'None'}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
            Voided Slips: {position?.total_void_slips || 0}
          </span>
        </div>
      </div>

      {/* Profile & Contact Details Card */}
      <div className="card" style={{ padding: '1.5rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
          Profile & Contact Information
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.2rem', fontSize: '0.875rem' }}>
          <div>
            <span style={{ color: 'var(--text-muted, #64748b)', display: 'block', fontSize: '0.8rem' }}>Phone Numbers</span>
            <div style={{ fontWeight: 500, color: 'var(--text-main, #0f172a)', marginTop: '0.2rem' }}>
              {customer.phone_number || '—'} {customer.alternate_phone_number && `(${customer.alternate_phone_number})`}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted, #64748b)', display: 'block', fontSize: '0.8rem' }}>Email Address</span>
            <div style={{ fontWeight: 500, color: 'var(--text-main, #0f172a)', marginTop: '0.2rem' }}>
              {customer.email || '—'}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted, #64748b)', display: 'block', fontSize: '0.8rem' }}>GSTIN</span>
            <div style={{ fontWeight: 500, color: 'var(--text-main, #0f172a)', marginTop: '0.2rem' }}>
              {customer.GSTIN || 'Not registered'}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted, #64748b)', display: 'block', fontSize: '0.8rem' }}>Billing Address</span>
            <div style={{ fontWeight: 500, color: 'var(--text-main, #0f172a)', marginTop: '0.2rem' }}>
              {customer.billing_address || '—'}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted, #64748b)', display: 'block', fontSize: '0.8rem' }}>Authorized Outlets</span>
            <div style={{ fontWeight: 500, color: 'var(--text-main, #0f172a)', marginTop: '0.2rem' }}>
              {customer.assigned_outlets && customer.assigned_outlets.length > 0
                ? customer.assigned_outlets.map((o) => o.name).join(', ')
                : 'All Outlets in Organisation'}
            </div>
          </div>
          {customer.notes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ color: 'var(--text-muted, #64748b)', display: 'block', fontSize: '0.8rem' }}>Internal Notes</span>
              <p style={{ margin: '0.2rem 0 0', color: 'var(--text-main, #0f172a)' }}>{customer.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Credit Slips History Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', background: 'var(--table-header-bg, #f8fafc)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
            Fuel Credit Slips History ({slips.length})
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
            Source documents for meter accountability
          </span>
        </div>

        {slips.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
            No credit slips issued to this customer yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Slip #</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Date & Time</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Shift / Attendant</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Product / Nozzle</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Quantity</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Unit Price</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Amount (₹)</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Vehicle / Driver</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'center' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((slip) => {
                const isVoid = slip.status === 'void';
                return (
                  <tr
                    key={slip.id}
                    style={{
                      borderBottom: '1px solid var(--border-color, #f1f5f9)',
                      backgroundColor: isVoid ? 'rgba(241, 245, 249, 0.4)' : '#fff',
                    }}
                  >
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: isVoid ? 'var(--text-muted, #94a3b8)' : 'var(--color-accent, #0f766e)' }}>
                      {slip.slip_number}
                      {slip.physical_slip_number && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                          Ref: {slip.physical_slip_number}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
                      {new Date(slip.occurred_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-main, #0f172a)' }}>{slip.employee_name || 'Attendant'}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 500 }}>{slip.product_name || 'Fuel'}</div>
                      {slip.nozzle_code && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                          Nozzle {slip.nozzle_code}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 500 }}>
                      {Number(slip.quantity).toFixed(3)} L
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-muted, #64748b)' }}>
                      ₹{Number(slip.unit_price).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: isVoid ? 'var(--text-muted, #94a3b8)' : 'var(--text-main, #0f172a)' }}>
                      ₹{Number(slip.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
                      {slip.vehicle_number && <div>{slip.vehicle_number}</div>}
                      {slip.driver_name && <div style={{ color: 'var(--text-muted, #64748b)' }}>{slip.driver_name}</div>}
                      {!slip.vehicle_number && !slip.driver_name && <span style={{ color: 'var(--text-muted, #94a3b8)' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
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
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      {!isVoid && canVoidSlip && (
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
                            padding: '0.3rem 0.6rem',
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
        )}
      </div>

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
              Voiding this credit slip (₹{Number(voidingSlip.amount).toFixed(2)}) will immediately remove it from customer credit position and attendant accountability. A mandatory reason is required.
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
                  placeholder="e.g. Wrong customer selected, vehicle driver paid cash, etc."
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
