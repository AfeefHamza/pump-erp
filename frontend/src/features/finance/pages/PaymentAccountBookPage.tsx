import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { fetchPaymentAccountBook } from '@/api/client';
import type { PaymentAccountBook } from '@/features/finance/types';

const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
export const PaymentAccountBookPage: React.FC = () => {
  const { accountId } = useParams(); const navigate = useNavigate(); const orgId = useAppSelector((s) => s.ui.selectedOrganizationId); const outletId = useAppSelector((s) => s.ui.selectedOutletId);
  const [book, setBook] = useState<PaymentAccountBook | null>(null); const [error, setError] = useState<string | null>(null); const [dates, setDates] = useState({ from_date: '', to_date: '' });
  const load = () => { if (orgId && outletId && accountId) fetchPaymentAccountBook(orgId, outletId, accountId, Object.fromEntries(Object.entries(dates).filter(([,v]) => v))).then(setBook).catch((e) => setError(e?.data?.detail || e.message)); };
  useEffect(load, [orgId, outletId, accountId]);
  if (!book) return <div className="card" style={{ margin: 24, padding: 32 }}>{error || 'Loading account book…'}</div>;
  return <div style={{ maxWidth: 1350, margin: '0 auto', padding: '1.5rem' }}><PageHeader title={`${book.account.name} Book`} subtitle={`${book.account.code} · Complete outlet movement ledger`} actions={<button className="btn btn-secondary" onClick={() => navigate('/app/finance/cash-banking')}><ArrowLeft size={16}/> Back</button>}/>{error && <div className="alert alert-error">{error}</div>}
    <div className="card" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'end', marginBottom: 18 }}><label>From<input className="input" type="date" value={dates.from_date} onChange={(e) => setDates({ ...dates, from_date: e.target.value })}/></label><label>To<input className="input" type="date" value={dates.to_date} onChange={(e) => setDates({ ...dates, to_date: e.target.value })}/></label><button className="btn btn-primary" onClick={load}>Apply</button><div style={{ marginLeft: 'auto' }}><span className="text-muted">Closing Balance </span><strong style={{ fontSize: 22 }}>{money(book.closing_balance)}</strong></div></div>
    <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>Description</th><th>Source</th><th style={{ textAlign: 'right' }}>Receipt</th><th style={{ textAlign: 'right' }}>Payment</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead><tbody><tr><td colSpan={5}><strong>Opening Balance</strong></td><td style={{ textAlign: 'right' }}><strong>{money(book.opening_balance)}</strong></td></tr>{book.results.map((row) => <tr key={row.id}><td>{row.effective_date}</td><td>{row.description}</td><td>{row.movement_type.replaceAll('_', ' ')}</td><td style={{ textAlign: 'right' }}>{Number(row.debit) ? money(row.debit) : '—'}</td><td style={{ textAlign: 'right' }}>{Number(row.credit) ? money(row.credit) : '—'}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(row.running_balance)}</td></tr>)}</tbody></table></div>
  </div>;
};
