import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Search, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { fetchSupplierPayments } from '@/api/client';
import type { SupplierPayment, SupplierPaymentListResponse } from '@/features/finance/types';

const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
const methodName = (value: string) => ({ cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque', upi: 'UPI', other: 'Other' }[value] || value);

export const SupplierPaymentsPage: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [data, setData] = useState<SupplierPaymentListResponse | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!orgId || !outletId) return;
    try { setData(await fetchSupplierPayments(orgId, outletId, { ...(search ? { search } : {}), ...(status !== 'all' ? { status } : {}) })); setError(null); }
    catch (err: any) { setError(err?.data?.detail || err.message || 'Failed to load supplier payments.'); }
  }, [orgId, outletId, search, status]);
  useEffect(() => { load(); }, [load]);
  const payments: SupplierPayment[] = data?.results || [];

  return <div style={{ maxWidth: 1500, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Supplier Payments" subtitle="Record payments, allocate Purchase Bills and track supplier advances." actions={<button className="btn btn-primary" onClick={() => navigate('/app/purchases/supplier-payments/new')}><Plus size={16}/> Record Payment</button>}/>
    {error && <div className="alert alert-error">{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(200px,1fr))', gap: 16, marginBottom: 20 }}>
      {[['Active Payments', data?.summary.total_active_payments || '0'], ['Allocated', data?.summary.total_allocated || '0'], ['Supplier Advances', data?.summary.total_unallocated || '0']].map(([label, value]) => <div className="card" style={{ padding: 18 }} key={label}><div className="text-muted">{label}</div><div style={{ fontSize: 24, fontWeight: 750, marginTop: 6 }}>{money(value)}</div></div>)}
    </div>
    <div className="card" style={{ padding: 16, display: 'flex', gap: 12, marginBottom: 18 }}><div style={{ position: 'relative', flex: 1 }}><Search size={16} style={{ position: 'absolute', left: 10, top: 12 }}/><input className="input" style={{ width: '100%', paddingLeft: 32 }} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Payment number, supplier or reference"/></div><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="voided">Voided</option><option value="all">All</option></select><button className="btn btn-secondary" onClick={load}>Search</button></div>
    <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>Payment</th><th>Supplier</th><th>Account / Method</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Allocated</th><th style={{ textAlign: 'right' }}>Advance</th><th>Status</th></tr></thead><tbody>
      {payments.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 44 }}><WalletCards size={28}/><div>No supplier payments found.</div></td></tr> : payments.map((payment) => <tr key={payment.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/purchases/supplier-payments/${payment.id}`)}><td>{payment.payment_date}</td><td><strong>{payment.payment_number}</strong><div className="text-muted">{payment.reference_number || payment.cheque_number || 'No reference'}</div></td><td><strong>{payment.supplier_name}</strong><div className="text-muted">{payment.supplier_code}</div></td><td>{payment.payment_account_name}<div className="text-muted">{methodName(payment.payment_method)}</div></td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(payment.amount)}</td><td style={{ textAlign: 'right' }}>{money(payment.allocated_amount)}</td><td style={{ textAlign: 'right' }}>{money(payment.unallocated_amount)}</td><td><span className={`status-badge ${payment.status === 'active' ? 'success' : 'danger'}`}>{payment.status}</span></td></tr>)}
    </tbody></table></div>
  </div>;
};
