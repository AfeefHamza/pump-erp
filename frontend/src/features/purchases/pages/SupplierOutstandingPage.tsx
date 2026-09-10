// frontend/src/features/purchases/pages/SupplierOutstandingPage.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchSupplierOutstandingSummary,
  fetchSupplierStatement
} from '@/api/client';
import type {
  SupplierOutstandingSummary,
  SupplierStatement
} from '@/features/purchases/types';
import {
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  RefreshCw,
  ShoppingBag,
  Info,
  XCircle
} from 'lucide-react';
import { PageHeader } from '@/components/navigation/PageHeader';

export const SupplierOutstandingPage: React.FC = () => {
  const navigate = useNavigate();
  const activeOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const activeOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [summary, setSummary] = useState<SupplierOutstandingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Statement drawer / modal
  const [statementSupplierId, setStatementSupplierId] = useState<string | null>(null);
  const [statement, setStatement] = useState<SupplierStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);

  const loadSummary = async () => {
    if (!activeOrgId || !activeOutletId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSupplierOutstandingSummary(activeOrgId, activeOutletId);
      setSummary(data);
    } catch (err: any) {
      console.error(err);
      setError(err?.data?.detail || err.message || 'Failed to load supplier outstanding summary.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, [activeOrgId, activeOutletId]);

  const handleOpenStatement = async (supplierId: string) => {
    if (!activeOrgId || !activeOutletId) return;
    setStatementSupplierId(supplierId);
    setStatement(null);
    setStatementLoading(true);
    setStatementError(null);
    try {
      const data = await fetchSupplierStatement(activeOrgId, activeOutletId, supplierId);
      setStatement(data);
    } catch (err: any) {
      console.error(err);
      setStatementError(err?.data?.detail || err.message || 'Failed to load supplier statement.');
    } finally {
      setStatementLoading(false);
    }
  };

  const formatRs = (val?: string | number | null) => {
    const num = typeof val === 'number' ? val : parseFloat(val || '0') || 0;
    return num.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div>
      <PageHeader
        title="Supplier Outstanding & Ageing"
        subtitle="Track accounts payable, invoice ageing buckets (Not Due, 1–30, 31–60, 61–90, >90), and view supplier ledger statements."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <button
              onClick={() => navigate('/app/purchases/purchase-bills')}
              className="btn btn-secondary"
            >
              <ShoppingBag size={16} /> Purchase Bills
            </button>
            <button
              onClick={loadSummary}
              disabled={loading}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        }
      />

      {/* Error state */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-md)' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Top Level KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            <span>Total Billed</span>
            <ShoppingBag size={18} color="var(--color-accent)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 'var(--space-xs)' }}>
            Rs. {formatRs(summary?.total_billed)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
            Cumulative purchases to date
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            <span>Total Outstanding</span>
            <DollarSign size={18} color="var(--color-warning-text)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 'var(--space-xs)', color: 'var(--color-warning-text)' }}>
            Rs. {formatRs(summary?.total_outstanding)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
            Active unpaid balance
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            <span>Current (Not Due)</span>
            <CheckCircle2 size={18} color="var(--color-success-text)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 'var(--space-xs)', color: 'var(--color-success-text)' }}>
            Rs. {formatRs(summary?.not_due)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
            Due date in future
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            <span>Total Overdue</span>
            <Clock size={18} color="var(--color-danger-text)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 'var(--space-xs)', color: 'var(--color-danger-text)' }}>
            Rs. {formatRs(summary?.overdue_total)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
            Past due date
          </div>
        </div>
      </div>

      {/* Ageing Breakdown Card */}
      <div className="card" style={{ padding: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={16} color="var(--color-accent)" />
            Ageing Buckets Breakdown
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>As of {summary?.as_of_date || 'Today'}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-sm)' }}>
          <div style={{ padding: 'var(--space-sm) var(--space-md)', backgroundColor: 'var(--color-success-bg)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-success-text)', textTransform: 'uppercase' }}>Not Due</span>
            <span style={{ display: 'block', fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-success-text)', marginTop: '2px', fontFamily: 'monospace' }}>
              Rs. {formatRs(summary?.ageing_buckets?.not_due)}
            </span>
          </div>

          <div style={{ padding: 'var(--space-sm) var(--space-md)', backgroundColor: 'var(--color-pending-bg)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-pending-text)', textTransform: 'uppercase' }}>1 – 30 Days</span>
            <span style={{ display: 'block', fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-pending-text)', marginTop: '2px', fontFamily: 'monospace' }}>
              Rs. {formatRs(summary?.ageing_buckets?.bucket_1_30)}
            </span>
          </div>

          <div style={{ padding: 'var(--space-sm) var(--space-md)', backgroundColor: 'var(--color-warning-bg)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-warning-text)', textTransform: 'uppercase' }}>31 – 60 Days</span>
            <span style={{ display: 'block', fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-warning-text)', marginTop: '2px', fontFamily: 'monospace' }}>
              Rs. {formatRs(summary?.ageing_buckets?.bucket_31_60)}
            </span>
          </div>

          <div style={{ padding: 'var(--space-sm) var(--space-md)', backgroundColor: 'var(--color-danger-bg)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-danger-text)', textTransform: 'uppercase' }}>61 – 90 Days</span>
            <span style={{ display: 'block', fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-danger-text)', marginTop: '2px', fontFamily: 'monospace' }}>
              Rs. {formatRs(summary?.ageing_buckets?.bucket_61_90)}
            </span>
          </div>

          <div style={{ padding: 'var(--space-sm) var(--space-md)', backgroundColor: '#fee2e2', border: '1px solid #f87171', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#991b1b', textTransform: 'uppercase' }}>&gt; 90 Days</span>
            <span style={{ display: 'block', fontSize: '1.125rem', fontWeight: 700, color: '#991b1b', marginTop: '2px', fontFamily: 'monospace' }}>
              Rs. {formatRs(summary?.ageing_buckets?.bucket_over_90)}
            </span>
          </div>
        </div>
      </div>

      {/* Supplier Summary Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Supplier Outstanding Balances</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Click &quot;View Statement&quot; to inspect ledger history</span>
        </div>

        {loading ? (
          <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto var(--space-sm)' }} />
            <p>Loading supplier balances...</p>
          </div>
        ) : !summary || summary.suppliers.length === 0 ? (
          <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <DollarSign size={48} style={{ opacity: 0.4, margin: '0 auto var(--space-sm)' }} />
            <p>No supplier outstanding balances recorded yet.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th style={{ textAlign: 'right' }}>Total Billed</th>
                  <th style={{ textAlign: 'right' }}>Outstanding</th>
                  <th style={{ textAlign: 'right', color: 'var(--color-success-text)' }}>Not Due</th>
                  <th style={{ textAlign: 'right', color: 'var(--color-pending-text)' }}>1–30d</th>
                  <th style={{ textAlign: 'right', color: 'var(--color-warning-text)' }}>31–60d</th>
                  <th style={{ textAlign: 'right', color: 'var(--color-danger-text)' }}>61–90d</th>
                  <th style={{ textAlign: 'right', color: '#991b1b' }}>&gt;90d</th>
                  <th style={{ textAlign: 'center' }}>Unpaid Bills</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {summary.suppliers.map((item) => (
                  <tr key={item.supplier_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.supplier_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.supplier_code}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      Rs. {formatRs(item.total_billed)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                      Rs. {formatRs(item.total_outstanding)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-success-text)' }}>
                      {formatRs(item.not_due)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-pending-text)' }}>
                      {formatRs(item.bucket_1_30)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-warning-text)' }}>
                      {formatRs(item.bucket_31_60)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-danger-text)' }}>
                      {formatRs(item.bucket_61_90)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#991b1b', fontWeight: 600 }}>
                      {formatRs(item.bucket_over_90)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-secondary">{item.unpaid_bills_count}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleOpenStatement(item.supplier_id)}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <FileText size={12} /> Statement
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Statement Modal */}
      {statementSupplierId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '850px', width: '100%', padding: 'var(--space-lg)', margin: 'var(--space-md)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-sm)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                  {statement ? statement.supplier_name : 'Supplier Statement'}
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  {statement?.supplier_code} • As of {statement?.as_of_date || 'Today'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatementSupplierId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <XCircle size={22} />
              </button>
            </div>

            {/* Disclaimer Banner */}
            <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', padding: 'var(--space-sm) var(--space-md)' }}>
              <Info size={18} style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '0.8rem' }}>
                <strong>Notice: </strong>Supplier payment disbursements and allocation will be introduced in the upcoming Payments milestone. Running balance currently reflects all active purchase bills.
              </div>
            </div>

            {statementLoading ? (
              <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto var(--space-sm)' }} />
                <p>Loading statement history...</p>
              </div>
            ) : statementError ? (
              <div className="alert alert-danger" style={{ marginBottom: 'var(--space-md)' }}>
                {statementError}
              </div>
            ) : statement ? (
              <div>
                {/* Statement Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', background: 'var(--bg-main)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total Invoiced</span>
                    <span style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace' }}>Rs. {formatRs(statement.total_billed)}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total Paid</span>
                    <span style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-success-text)' }}>Rs. {formatRs(statement.total_paid)}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Net Outstanding</span>
                    <span style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-warning-text)' }}>Rs. {formatRs(statement.total_outstanding)}</span>
                  </div>
                </div>

                {/* Ledger Transactions Table */}
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Document</th>
                        <th>Supplier Inv</th>
                        <th>Due Date</th>
                        <th style={{ textAlign: 'right' }}>Debit (Bill)</th>
                        <th style={{ textAlign: 'right' }}>Credit (Paid)</th>
                        <th style={{ textAlign: 'right' }}>Running Balance</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {statement.lines.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-lg)', color: 'var(--text-muted)', fontFamily: 'inherit' }}>
                            No billing transactions recorded for this supplier.
                          </td>
                        </tr>
                      ) : (
                        statement.lines.map((line) => (
                          <tr key={line.bill_id}>
                            <td style={{ fontFamily: 'inherit' }}>{line.invoice_date}</td>
                            <td>
                              <button
                                onClick={() => {
                                  setStatementSupplierId(null);
                                  navigate(`/app/purchases/purchase-bills/${line.bill_id}`);
                                }}
                                className="btn-link"
                                style={{ fontWeight: 600, color: 'var(--color-accent)', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
                              >
                                {line.bill_number}
                              </button>
                              {line.status === 'voided' && (
                                <span className="badge badge-danger" style={{ fontSize: '0.65rem', marginLeft: '4px' }}>
                                  Void
                                </span>
                              )}
                            </td>
                            <td>{line.supplier_invoice_number}</td>
                            <td style={{ fontFamily: 'inherit' }}>{line.due_date}</td>
                            <td style={{ textAlign: 'right' }}>
                              {line.debit_amount !== '0.00' ? `Rs. ${formatRs(line.debit_amount)}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--color-success-text)' }}>
                              {line.credit_amount !== '0.00' ? `Rs. ${formatRs(line.credit_amount)}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                              Rs. {formatRs(line.running_balance)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-md)' }}>
              <button
                type="button"
                onClick={() => setStatementSupplierId(null)}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
