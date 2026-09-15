import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { fetchCustomerOutstanding } from '@/api/client';
import type { CustomerOutstandingResponse } from '@/features/sales/types';

const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));

export const CustomerOutstandingPage: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [data, setData] = useState<CustomerOutstandingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!orgId || !outletId) return;
    fetchCustomerOutstanding(orgId, outletId).then(setData).catch((err) => setError(err.message || 'Could not load customer outstanding.'));
  }, [orgId, outletId]);
  return <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Customer Outstanding" subtitle="Track billed receivables separately from fuel Credit Slips waiting to be invoiced."/>
    {error && <div className="alert alert-error">{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(220px,1fr))', gap: 16, marginBottom: 18 }}>
      <div className="card" style={{ padding: 20 }}><div className="text-muted">Invoice Outstanding</div><div style={{ fontSize: 26, fontWeight: 750 }}>{money(data?.total_outstanding || '0')}</div></div>
      <div className="card" style={{ padding: 20 }}><div className="text-muted">Unbilled Fuel Credit Slips</div><div style={{ fontSize: 26, fontWeight: 750 }}>{money(data?.total_unbilled_credit || '0')}</div></div>
    </div>
    <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Customer</th><th style={{ textAlign: 'right' }}>Invoiced</th><th style={{ textAlign: 'right' }}>Paid</th><th style={{ textAlign: 'right' }}>Outstanding</th><th style={{ textAlign: 'right' }}>Unbilled Credit</th></tr></thead><tbody>
      {!data?.customers.length ? <tr><td colSpan={5} style={{ padding: 44, textAlign: 'center' }}><Users size={28}/><div>No customer balances found.</div></td></tr> : data.customers.map((row) => <tr key={row.customer_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/sales/customers/${row.customer_id}`)}><td><strong>{row.customer_name}</strong><div className="text-muted">{row.customer_code}</div></td><td style={{ textAlign: 'right' }}>{money(row.total_invoiced)}</td><td style={{ textAlign: 'right' }}>{money(row.total_paid)}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(row.outstanding)}</td><td style={{ textAlign: 'right' }}>{money(row.unbilled_credit)}</td></tr>)}
    </tbody></table></div>
  </div>;
};
