import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { fetchSalesInvoices } from '@/api/client';
import type { SalesInvoice } from '@/features/sales/types';

const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));

export const SalesInvoiceListPage: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [rows, setRows] = useState<SalesInvoice[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('active');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!orgId || !outletId) return;
    try {
      setRows(await fetchSalesInvoices(orgId, outletId, { ...(search ? { search } : {}), ...(type ? { invoice_type: type } : {}), status }));
      setError(null);
    } catch (err: any) { setError(err.message || 'Could not load Sales Invoices.'); }
  }, [orgId, outletId, search, type, status]);
  useEffect(() => { load(); }, [load]);

  const active = rows.filter((row) => row.status === 'active');
  const billed = active.reduce((sum, row) => sum + Number(row.grand_total), 0);
  const outstanding = active.reduce((sum, row) => sum + Number(row.outstanding_amount), 0);

  return <div style={{ maxWidth: 1500, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Sales Invoices" subtitle="Invoice lubricant products, ordinary items, services and existing fuel Credit Slips." actions={<button className="btn btn-primary" onClick={() => navigate('/app/sales/invoices/new')}><Plus size={16}/> New Sales Invoice</button>}/>
    {error && <div className="alert alert-error">{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(180px,1fr))', gap: 16, marginBottom: 18 }}>
      {[["Invoices", String(active.length)], ["Total Billed", money(String(billed))], ["Customer Outstanding", money(String(outstanding))]].map(([label, value]) => <div className="card" style={{ padding: 18 }} key={label}><div className="text-muted">{label}</div><div style={{ fontSize: 24, fontWeight: 750, marginTop: 6 }}>{value}</div></div>)}
    </div>
    <div className="card" style={{ padding: 16, display: 'flex', gap: 12, marginBottom: 18 }}>
      <div style={{ position: 'relative', flex: 1 }}><Search size={16} style={{ position: 'absolute', left: 10, top: 12 }}/><input className="input" style={{ width: '100%', paddingLeft: 32 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice number or customer"/></div>
      <select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="">All Types</option><option value="cash">Cash</option><option value="credit">Credit</option></select>
      <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="voided">Voided</option><option value="all">All</option></select>
      <button className="btn btn-secondary" onClick={load}>Search</button>
    </div>
    <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Type</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Outstanding</th><th>Payment</th><th>Status</th></tr></thead><tbody>
      {rows.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 44 }}><FileText size={28}/><div>No Sales Invoices found.</div></td></tr> : rows.map((invoice) => <tr key={invoice.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/sales/invoices/${invoice.id}`)}><td>{invoice.invoice_date}</td><td><strong>{invoice.invoice_number}</strong></td><td>{invoice.customer_name}</td><td style={{ textTransform: 'capitalize' }}>{invoice.invoice_type}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(invoice.grand_total)}</td><td style={{ textAlign: 'right' }}>{money(invoice.outstanding_amount)}</td><td style={{ textTransform: 'capitalize' }}>{invoice.payment_status.replace('_', ' ')}</td><td><span className={`status-badge ${invoice.status === 'active' ? 'success' : 'danger'}`}>{invoice.status}</span></td></tr>)}
    </tbody></table></div>
  </div>;
};
