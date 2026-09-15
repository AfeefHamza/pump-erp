// frontend/src/features/purchases/pages/PurchaseBillListPage.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchPurchaseBills,
  fetchSuppliers,
  voidPurchaseBill
} from '@/api/client';
import type { PurchaseBillListItem, Supplier } from '@/features/purchases/types';
import {
  ShoppingBag,
  Plus,
  Search,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Calendar,
  DollarSign,
  Clock,
  Ban
} from 'lucide-react';
import { PageHeader } from '@/components/navigation/PageHeader';

export const PurchaseBillListPage: React.FC = () => {
  const navigate = useNavigate();
  const activeOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const activeOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [bills, setBills] = useState<PurchaseBillListItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Void modal state
  const [voidModalBill, setVoidModalBill] = useState<PurchaseBillListItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const loadData = async () => {
    if (!activeOrgId || !activeOutletId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (supplierFilter !== 'all') params.supplier = supplierFilter;
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (search.trim()) params.search = search.trim();
      if (overdueOnly) params.is_overdue = 'true';

      const [billsData, suppliersData] = await Promise.all([
        fetchPurchaseBills(activeOrgId, activeOutletId, params),
        fetchSuppliers(activeOrgId),
      ]);
      setBills(billsData);
      setSuppliers(suppliersData);
    } catch (err: any) {
      console.error(err);
      setError(err?.data?.detail || err.message || 'Failed to load purchase bills.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeOrgId, activeOutletId, statusFilter, supplierFilter, fromDate, toDate, overdueOnly]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleOpenVoidModal = (bill: PurchaseBillListItem) => {
    setVoidModalBill(bill);
    setVoidReason('');
    setVoidError(null);
  };

  const handleConfirmVoid = async () => {
    if (!voidModalBill || !activeOrgId || !activeOutletId) return;
    if (!voidReason.trim() || voidReason.trim().length < 5) {
      setVoidError('Please provide a meaningful reason for voiding (at least 5 characters).');
      return;
    }
    setVoidLoading(true);
    setVoidError(null);
    try {
      await voidPurchaseBill(activeOrgId, activeOutletId, voidModalBill.id, voidReason.trim());
      setVoidModalBill(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
      setVoidError(err?.data?.detail || err?.data?.error || err.message || 'Failed to void bill.');
    } finally {
      setVoidLoading(false);
    }
  };

  // KPI calculations
  const kpis = useMemo(() => {
    let totalBilled = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let activeCount = 0;

    bills.forEach((b) => {
      if (b.status === 'active') {
        activeCount++;
        totalBilled += parseFloat(b.grand_total) || 0;
        totalOutstanding += parseFloat(b.outstanding_amount) || 0;
        if (b.is_overdue) {
          totalOverdue += parseFloat(b.outstanding_amount) || 0;
        }
      }
    });

    return {
      totalBilled: totalBilled.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      totalOutstanding: totalOutstanding.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      totalOverdue: totalOverdue.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      activeCount
    };
  }, [bills]);

  return (
    <div>
      <PageHeader
        title="Purchase Bills"
        subtitle="Record financial invoices from fuel & goods suppliers, link confirmed tanker receipts, and track payables."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <button
              onClick={() => navigate('/app/purchases/supplier-outstanding')}
              className="btn btn-secondary"
            >
              <DollarSign size={16} /> Supplier Outstanding
            </button>
            <button
              onClick={() => navigate('/app/purchases/purchase-bills/new')}
              className="btn btn-primary"
            >
              <Plus size={16} /> Record Purchase Bill
            </button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            <span>Total Billed</span>
            <ShoppingBag size={18} color="var(--color-accent)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 'var(--space-xs)' }}>
            Rs. {kpis.totalBilled}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
            Active bills in filter
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            <span>Total Outstanding</span>
            <DollarSign size={18} color="var(--color-warning-text)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 'var(--space-xs)', color: 'var(--color-warning-text)' }}>
            Rs. {kpis.totalOutstanding}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
            Unpaid balance owed
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            <span>Overdue Amount</span>
            <Clock size={18} color="var(--color-danger-text)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 'var(--space-xs)', color: 'var(--color-danger-text)' }}>
            Rs. {kpis.totalOverdue}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
            Bills past due date
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            <span>Active Bills</span>
            <CheckCircle2 size={18} color="var(--color-success-text)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 'var(--space-xs)' }}>
            {kpis.activeCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
            Excluding voided records
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card" style={{ padding: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              Search
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="input"
                placeholder="Search bill #, invoice #, supplier..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '32px', width: '100%' }}
              />
            </div>
          </div>

          <div style={{ minWidth: '160px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              Supplier
            </label>
            <select className="input" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
              <option value="all">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: '140px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              Status
            </label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="voided">Voided</option>
            </select>
          </div>

          <div style={{ minWidth: '130px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              From Date
            </label>
            <input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>

          <div style={{ minWidth: '130px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              To Date
            </label>
            <input type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-md)', paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--border-color)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-main)' }}>
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span>Show Overdue Invoices Only</span>
          </label>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-md)' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Table Container */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto var(--space-sm)' }} />
            Loading purchase bills...
          </div>
        ) : bills.length === 0 ? (
          <div style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
            <ShoppingBag size={48} color="var(--text-muted)" style={{ opacity: 0.4, margin: '0 auto var(--space-md)' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>No Purchase Bills Found</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 'var(--space-md)' }}>
              No purchase bills match the selected filter criteria. Record a new bill or link an incoming tanker receipt.
            </p>
            <button
              onClick={() => navigate('/app/purchases/purchase-bills/new')}
              className="btn btn-primary"
            >
              <Plus size={16} /> Record First Bill
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Bill Number</th>
                  <th>Supplier</th>
                  <th>Supplier Invoice</th>
                  <th>Linked Receipts</th>
                  <th style={{ textAlign: 'right' }}>Grand Total</th>
                  <th style={{ textAlign: 'right' }}>Outstanding</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id}>
                    <td>
                      <button
                        onClick={() => navigate(`/app/purchases/purchase-bills/${bill.id}`)}
                        className="btn-link"
                        style={{ fontWeight: 600, color: 'var(--color-accent)', cursor: 'pointer', border: 'none', background: 'none', padding: 0, display: 'block', fontSize: '0.875rem' }}
                      >
                        {bill.bill_number}
                      </button>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <Calendar size={12} />
                        {bill.invoice_date}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{bill.supplier_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bill.supplier_code}</div>
                    </td>
                    <td>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>{bill.supplier_invoice_number}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Due: {bill.due_date}</div>
                    </td>
                    <td>
                      {bill.linked_tanker_receipts && bill.linked_tanker_receipts.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {bill.linked_tanker_receipts.map((rcpt, idx) => (
                            <span key={idx} className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                              {rcpt}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Direct / No Receipts</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                      Rs. {parseFloat(bill.grand_total).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {bill.status === 'active' ? (
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: 'monospace', color: bill.is_overdue ? 'var(--color-danger-text)' : 'var(--text-main)' }}>
                            Rs. {parseFloat(bill.outstanding_amount).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          {bill.is_overdue && (
                            <span className="badge badge-danger" style={{ fontSize: '0.65rem', marginTop: '2px' }}>
                              Overdue ({bill.days_overdue}d)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {bill.status === 'active' ? (
                        <span className="badge badge-success">Active</span>
                      ) : (
                        <span className="badge badge-danger">Voided</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-xs)' }}>
                        {bill.status === 'active' && Number(bill.outstanding_amount) > 0 && (
                          <button onClick={() => navigate(`/app/purchases/supplier-payments/new?supplier=${bill.supplier}&bill=${bill.id}`)} className="btn btn-primary btn-sm">Pay</button>
                        )}
                        <button
                          onClick={() => navigate(`/app/purchases/purchase-bills/${bill.id}`)}
                          className="btn btn-secondary btn-sm"
                        >
                          View / Edit
                        </button>
                        {bill.status === 'active' && Number(bill.amount_paid) === 0 && (
                          <button
                            onClick={() => handleOpenVoidModal(bill)}
                            className="btn btn-outline-danger btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            title="Void Bill"
                          >
                            <Ban size={12} /> Void
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

      {/* Void Modal */}
      {voidModalBill && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', padding: 'var(--space-lg)', margin: 'var(--space-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--color-danger-text)', marginBottom: 'var(--space-sm)' }}>
              <AlertCircle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Void Purchase Bill</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
              Voiding <strong>{voidModalBill.bill_number}</strong> ({voidModalBill.supplier_name}) will release all linked tanker receipts back to available stock. Direct deletion is disabled.
            </p>

            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px', textTransform: 'uppercase' }}>
                Void Reason (Mandatory) <span style={{ color: 'var(--color-danger-text)' }}>*</span>
              </label>
              <textarea
                rows={3}
                className="input"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Explain why this bill is being voided (min 5 characters)..."
                style={{ width: '100%', minHeight: '80px' }}
              />
            </div>

            {voidError && (
              <div className="alert alert-danger" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-sm)', fontSize: '0.8rem' }}>
                {voidError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <button
                type="button"
                onClick={() => setVoidModalBill(null)}
                disabled={voidLoading}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={voidLoading}
                className="btn btn-danger"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                {voidLoading && <RefreshCw size={14} className="spin" />}
                <Ban size={14} /> Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
