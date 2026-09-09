// frontend/src/features/purchases/pages/TankerReceiptListPage.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchTankerReceipts,
  fetchSuppliers,
  voidTankerReceipt
} from '@/api/client';
import type { TankerReceiptListItem, Supplier } from '@/features/purchases/types';
import {
  Truck,
  Plus,
  Search,
  Filter,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
  RefreshCw
} from 'lucide-react';
import { PageHeader } from '@/components/navigation/PageHeader';

export const TankerReceiptListPage: React.FC = () => {
  const navigate = useNavigate();
  const activeOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const activeOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [receipts, setReceipts] = useState<TankerReceiptListItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Void modal state
  const [voidModalReceipt, setVoidModalReceipt] = useState<TankerReceiptListItem | null>(null);
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
      if (supplierFilter !== 'all') params.supplier_id = supplierFilter;
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (search.trim()) params.search = search.trim();

      const [receiptsData, suppliersData] = await Promise.all([
        fetchTankerReceipts(activeOrgId, activeOutletId, params),
        fetchSuppliers(activeOrgId),
      ]);
      setReceipts(receiptsData);
      setSuppliers(suppliersData);
    } catch (err) {
      console.error(err);
      setError('Failed to load tanker receipts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeOrgId, activeOutletId, statusFilter, supplierFilter, fromDate, toDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleOpenVoidModal = (receipt: TankerReceiptListItem) => {
    setVoidModalReceipt(receipt);
    setVoidReason('');
    setVoidError(null);
  };

  const handleConfirmVoid = async () => {
    if (!voidModalReceipt || !activeOrgId || !activeOutletId) return;
    if (!voidReason.trim()) {
      setVoidError('Please provide a mandatory reason for voiding this receipt.');
      return;
    }
    setVoidLoading(true);
    setVoidError(null);
    try {
      await voidTankerReceipt(activeOrgId, activeOutletId, voidModalReceipt.id, voidReason.trim());
      setVoidModalReceipt(null);
      await loadData();
    } catch (err: any) {
      setVoidError(err?.message || 'Failed to void tanker receipt.');
    } finally {
      setVoidLoading(false);
    }
  };

  // Metrics
  const metrics = useMemo(() => {
    const totalReceipts = receipts.length;
    const confirmedReceipts = receipts.filter((r) => r.status === 'confirmed');
    const totalConfirmedLitres = confirmedReceipts.reduce(
      (acc, r) => acc + parseFloat(r.total_accepted_quantity || '0'),
      0
    );
    const netVariance = confirmedReceipts.reduce((acc, r) => {
      const v = parseFloat(r.total_variance || '0');
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
    return {
      totalReceipts,
      confirmedCount: confirmedReceipts.length,
      totalConfirmedLitres,
      netVariance,
    };
  }, [receipts]);

  const formatNumber = (val?: string | number | null, decimals = 2) => {
    if (val === null || val === undefined || val === '') return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '—';
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={12} /> Confirmed
          </span>
        );
      case 'voided':
        return (
          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <XCircle size={12} /> Voided
          </span>
        );
      default:
        return (
          <span className="badge badge-pending" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <FileText size={12} /> Recorded
          </span>
        );
    }
  };

  const renderVarianceBadge = (varianceStr?: string | null) => {
    if (!varianceStr) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    const v = parseFloat(varianceStr);
    if (isNaN(v)) return <span>—</span>;
    if (Math.abs(v) <= 0.001) {
      return <span style={{ color: 'var(--color-success-text)', fontWeight: 600 }}>0.00 L</span>;
    }
    if (v < 0) {
      return (
        <span style={{ color: 'var(--color-danger-text)', fontWeight: 600 }}>
          {formatNumber(v, 2)} L (Shortage)
        </span>
      );
    }
    return (
      <span style={{ color: 'var(--color-warning-text)', fontWeight: 600 }}>
        +{formatNumber(v, 2)} L (Excess)
      </span>
    );
  };

  return (
    <div className="page-container" style={{ padding: 'var(--space-lg)', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Header */}
      <PageHeader
        title="Tanker Receipts"
        subtitle="Document-based fuel decanting records, accepted book quantities, calibrated dip observations, and variance accountability."
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button
              onClick={() => navigate('/app/purchases/suppliers')}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
            >
              Manage Suppliers
            </button>
            <button
              onClick={() => navigate('/app/purchases/tanker-receipts/new')}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
            >
              <Plus size={16} /> Record Tanker Receipt
            </button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Receipts
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 'var(--space-xs)' }}>
            {metrics.totalReceipts}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
            {metrics.confirmedCount} confirmed
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Confirmed Delivered Volume
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 'var(--space-xs)', color: 'var(--color-accent)' }}>
            {formatNumber(metrics.totalConfirmedLitres, 0)} L
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
            Added to tank book stock
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Net Dip Variance
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              marginTop: 'var(--space-xs)',
              color: metrics.netVariance < -0.01 ? 'var(--color-danger-text)' : metrics.netVariance > 0.01 ? 'var(--color-warning-text)' : 'var(--color-success-text)'
            }}
          >
            {metrics.netVariance > 0 ? '+' : ''}{formatNumber(metrics.netVariance, 2)} L
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
            Physical gain vs accepted book stock
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
                placeholder="Receipt #, Invoice, Vehicle, Supplier..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '32px', width: '100%' }}
              />
            </div>
          </div>

          <div style={{ minWidth: '140px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              Status
            </label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="recorded">Recorded (Draft)</option>
              <option value="confirmed">Confirmed</option>
              <option value="voided">Voided</option>
            </select>
          </div>

          <div style={{ minWidth: '160px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              Supplier
            </label>
            <select className="input" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
              <option value="all">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
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

          <div>
            <button type="submit" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Filter size={14} /> Filter
            </button>
          </div>
        </form>
      </div>

      {/* Table Container */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto var(--space-sm)' }} />
            Loading tanker receipts...
          </div>
        ) : error ? (
          <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-danger-text)' }}>
            <AlertCircle size={24} style={{ margin: '0 auto var(--space-sm)' }} />
            {error}
          </div>
        ) : receipts.length === 0 ? (
          <div style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
            <Truck size={48} color="var(--text-muted)" style={{ opacity: 0.4, margin: '0 auto var(--space-md)' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>No Tanker Receipts Found</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 'var(--space-md)' }}>
              No tanker deliveries have been recorded matching the selected filter criteria.
            </p>
            <button
              onClick={() => navigate('/app/purchases/tanker-receipts/new')}
              className="btn btn-primary"
            >
              Record First Tanker Receipt
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Receipt #</th>
                  <th>Unloading Time</th>
                  <th>Supplier / Invoice</th>
                  <th>Vehicle</th>
                  <th>Products</th>
                  <th style={{ textAlign: 'right' }}>Invoice Qty</th>
                  <th style={{ textAlign: 'right' }}>Accepted Book Qty</th>
                  <th style={{ textAlign: 'right' }}>Dip Gain</th>
                  <th style={{ textAlign: 'right' }}>Variance</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button
                        onClick={() => navigate(`/app/purchases/tanker-receipts/${r.id}`)}
                        className="btn-link"
                        style={{ fontWeight: 600, color: 'var(--color-accent)', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
                      >
                        {r.receipt_number}
                      </button>
                    </td>
                    <td style={{ fontSize: '0.8125rem' }}>
                      <div>{new Date(r.unloading_end_time).toLocaleDateString()}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {new Date(r.unloading_end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.supplier_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Inv: {r.invoice_number} ({r.invoice_date})
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: '#f1f5f9', color: '#334155', fontWeight: 600 }}>
                        {r.vehicle_registration}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {r.products_summary.map((p, idx) => (
                          <span key={idx} className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>
                      {formatNumber(r.total_invoice_quantity, 2)} L
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-accent)' }}>
                      {formatNumber(r.total_accepted_quantity, 2)} L
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {formatNumber(r.total_physical_dip_gain, 2)} {r.total_physical_dip_gain ? 'L' : ''}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {renderVarianceBadge(r.total_variance)}
                    </td>
                    <td>{renderStatusBadge(r.status)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-xs)' }}>
                        <button
                          onClick={() => navigate(`/app/purchases/tanker-receipts/${r.id}`)}
                          className="btn btn-secondary btn-sm"
                        >
                          {r.status === 'recorded' ? 'Edit' : 'View'}
                        </button>
                        {r.status === 'confirmed' && (
                          <button
                            onClick={() => handleOpenVoidModal(r)}
                            className="btn btn-outline-danger btn-sm"
                          >
                            Void
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
      {voidModalReceipt && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', padding: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--color-danger-text)', marginBottom: 'var(--space-sm)' }}>
              <AlertCircle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Void Confirmed Receipt</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
              Voiding <strong>{voidModalReceipt.receipt_number}</strong> will create immutable reversal movements in the tank stock ledger. Posted historical transactions cannot be deleted.
            </p>

            {voidError && (
              <div className="alert alert-danger" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-sm)' }}>
                {voidError}
              </div>
            )}

            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>
                Mandatory Void Reason <span style={{ color: 'red' }}>*</span>
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder="Provide comprehensive reason for reversing this confirmed receipt..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={voidLoading}
                onClick={() => setVoidModalReceipt(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={voidLoading || !voidReason.trim()}
                onClick={handleConfirmVoid}
              >
                {voidLoading ? 'Voiding...' : 'Confirm Void & Post Reversals'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
