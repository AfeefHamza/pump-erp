import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  type Customer,
  fetchCustomers,
  deactivateCustomer,
  type OutletResponse,
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { CustomerDrawer } from '../components/CustomerDrawer';
import {
  Users, Plus, Search, Filter, Phone, Mail,
  Eye, Edit, UserX
} from 'lucide-react';

export const CustomersPage: React.FC = () => {
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const userOrgs = useAppSelector((state) => state.auth.currentUser?.organisations);

  const currentOrg = useMemo(
    () => userOrgs?.find((o: any) => o.id === selectedOrgId),
    [userOrgs, selectedOrgId]
  );
  const outlets: OutletResponse[] = currentOrg?.outlets || [];

  const canView = usePermission('customer.view');
  const canCreate = usePermission('customer.create');
  const canUpdate = usePermission('customer.update');
  const canDeactivate = usePermission('customer.deactivate');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const loadCustomers = useCallback(async () => {
    if (!selectedOrgId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCustomers(selectedOrgId, {
        search: searchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        customer_type: typeFilter !== 'all' ? typeFilter : undefined,
      });
      setCustomers(data);
    } catch (err: any) {
      console.error('Failed to load customers:', err);
      setError(err.message || 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, canView, searchQuery, statusFilter, typeFilter]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleCreateNew = () => {
    setEditingCustomer(null);
    setIsDrawerOpen(true);
  };

  const handleEdit = (c: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCustomer(c);
    setIsDrawerOpen(true);
  };

  const handleDeactivate = async (c: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedOrgId) return;
    if (window.confirm(`Are you sure you want to deactivate customer '${c.display_name}'? Inactive customers cannot receive new credit slips.`)) {
      try {
        await deactivateCustomer(selectedOrgId, c.id);
        loadCustomers();
      } catch (err: any) {
        alert(err.message || 'Failed to deactivate customer.');
      }
    }
  };

  // KPIs
  const activeCount = customers.filter((c) => c.status === 'active').length;
  const inactiveCount = customers.filter((c) => c.status === 'inactive').length;
  const totalCreditLimit = customers.reduce((acc, c) => acc + (c.credit_limit ? Number(c.credit_limit) : 0), 0);

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view fuel credit customers.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <PageHeader
          title="Customer Master"
          subtitle="Fuel credit accounts, credit limits, operational credit slips and customer records."
        />
        {canCreate && (
          <button
            className="btn btn-primary"
            onClick={handleCreateNew}
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
            <span>Add Customer</span>
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
            Active Customers
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-success-text, #15803d)', marginTop: '0.25rem' }}>
            {activeCount}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>Eligible for fuel credit</span>
        </div>

        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
            Inactive Accounts
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-muted, #64748b)', marginTop: '0.25rem' }}>
            {inactiveCount}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>Suspended / closed</span>
        </div>

        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
            Total Approved Credit Limit
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-accent, #0f766e)', marginTop: '0.25rem' }}>
            ₹{totalCreditLimit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>Across all customers</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #64748b)' }} />
            <input
              type="text"
              placeholder="Search code, name, phone, GSTIN..."
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Filter size={14} style={{ color: 'var(--text-muted, #64748b)' }} />
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted, #64748b)' }}>Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #cbd5e1)',
                fontSize: '0.825rem',
                background: '#fff',
              }}
            >
              <option value="all">All Types</option>
              <option value="business">Business</option>
              <option value="individual">Individual</option>
              <option value="government">Government</option>
              <option value="other">Other</option>
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
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content Table */}
      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
          Loading customers...
        </div>
      ) : error ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-danger-text, #b91c1c)' }}>
          {error}
        </div>
      ) : customers.length === 0 ? (
        <div className="card" style={{ padding: '3.5rem', textAlign: 'center', background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px' }}>
          <Users size={48} style={{ color: 'var(--text-muted, #94a3b8)', margin: '0 auto 1rem' }} />
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--text-main, #0f172a)' }}>No Customers Found</h3>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
            {searchQuery ? 'No customers match your search filters.' : 'Get started by creating your first fuel credit customer.'}
          </p>
          {canCreate && (
            <button
              className="btn btn-primary"
              onClick={handleCreateNew}
              style={{ backgroundColor: 'var(--color-accent, #0f766e)', color: '#fff', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '6px' }}
            >
              Add Customer
            </button>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card, #ffffff)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--table-header-text, #0f172a)' }}>Customer Code</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--table-header-text, #0f172a)' }}>Customer Name</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--table-header-text, #0f172a)' }}>Type</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--table-header-text, #0f172a)' }}>Contact</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--table-header-text, #0f172a)', textAlign: 'right' }}>Credit Limit</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--table-header-text, #0f172a)', textAlign: 'center' }}>Credit Days</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--table-header-text, #0f172a)', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--table-header-text, #0f172a)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const isActive = c.status === 'active';
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/app/sales/customers/${c.id}`)}
                    style={{
                      borderBottom: '1px solid var(--border-color, #f1f5f9)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--table-header-bg, #f8fafc)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--color-accent, #0f766e)' }}>
                      {c.customer_code}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-main, #0f172a)' }}>{c.display_name}</div>
                      {c.GSTIN && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                          GSTIN: {c.GSTIN}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textTransform: 'capitalize', color: 'var(--text-muted, #64748b)' }}>
                      {c.customer_type}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted, #64748b)' }}>
                      {c.phone_number && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                          <Phone size={12} />
                          <span>{c.phone_number}</span>
                        </div>
                      )}
                      {c.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                          <Mail size={12} />
                          <span>{c.email}</span>
                        </div>
                      )}
                      {!c.phone_number && !c.email && <span>—</span>}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 500, color: 'var(--text-main, #0f172a)' }}>
                      {c.credit_limit ? `₹${Number(c.credit_limit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'No limit'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
                      {c.credit_days ? `${c.credit_days} days` : '—'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
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
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/app/sales/customers/${c.id}`);
                          }}
                          title="View Detail"
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-color, #cbd5e1)',
                            borderRadius: '4px',
                            padding: '0.35rem 0.5rem',
                            cursor: 'pointer',
                            color: 'var(--text-main, #0f172a)',
                          }}
                        >
                          <Eye size={14} />
                        </button>
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={(e) => handleEdit(c, e)}
                            title="Edit Customer"
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border-color, #cbd5e1)',
                              borderRadius: '4px',
                              padding: '0.35rem 0.5rem',
                              cursor: 'pointer',
                              color: 'var(--color-accent, #0f766e)',
                            }}
                          >
                            <Edit size={14} />
                          </button>
                        )}
                        {canDeactivate && isActive && (
                          <button
                            type="button"
                            onClick={(e) => handleDeactivate(c, e)}
                            title="Deactivate Customer"
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border-color, #cbd5e1)',
                              borderRadius: '4px',
                              padding: '0.35rem 0.5rem',
                              cursor: 'pointer',
                              color: 'var(--color-danger-text, #b91c1c)',
                            }}
                          >
                            <UserX size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Drawer */}
      {selectedOrgId && (
        <CustomerDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onSuccess={() => loadCustomers()}
          customer={editingCustomer}
          orgId={selectedOrgId}
          outlets={outlets}
        />
      )}
    </div>
  );
};
