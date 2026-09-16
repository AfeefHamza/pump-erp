import React, { useCallback, useEffect, useState } from 'react';
import { BookOpenCheck, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchJournalEntries } from '@/api/client';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import type { JournalEntry } from '@/features/accounting/types';

const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
const sourceLabels: Record<string, string> = {
  manual_journal: 'Manual Journal', journal_reversal: 'Reversal', sales_invoice: 'Sales Invoice',
  purchase_bill: 'Purchase Bill', customer_receipt: 'Customer Receipt', supplier_payment: 'Supplier Payment',
  supplier_payment_allocation: 'Supplier Advance Allocation',
  expense: 'Expense', cash_bank_transfer: 'Cash / Bank Transfer',
  digital_settlement: 'Digital Settlement',
};
const sourceLabel = (source: string) => sourceLabels[source] || source.replaceAll('_', ' ');

export const JournalVoucherListPage: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [rows, setRows] = useState<JournalEntry[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!orgId || !outletId) return;
    try { setRows(await fetchJournalEntries(orgId, outletId, { ...(search ? { search } : {}), status })); setError(null); }
    catch (err: any) { setError(err.message || 'Could not load Journal Vouchers.'); }
  }, [orgId, outletId, search, status]);
  useEffect(() => { load(); }, [load]);

  return <div style={{ maxWidth: 1500, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Journal Vouchers" subtitle="Post balanced manual entries. Saved vouchers are locked and corrected only by reversal." actions={<button className="btn btn-primary" onClick={() => navigate('/app/finance/vouchers/new')}><Plus size={16}/> New Journal Voucher</button>}/>
    {error && <div className="alert alert-error">{error}</div>}
    <div className="card" style={{ padding: 16, display: 'flex', gap: 12, marginBottom: 18 }}><div style={{ position: 'relative', flex: 1 }}><Search size={16} style={{ position: 'absolute', left: 10, top: 12 }}/><input className="input" style={{ width: '100%', paddingLeft: 32 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Voucher number, reference or narration"/></div><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All Statuses</option><option value="posted">Posted</option><option value="reversed">Reversed</option></select><button className="btn btn-secondary" onClick={load}>Search</button></div>
    <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>Voucher</th><th>Reference</th><th>Narration</th><th>Source</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th></tr></thead><tbody>
      {rows.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 44 }}><BookOpenCheck size={28}/><div>No Journal Vouchers found.</div></td></tr> : rows.map((row) => <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/finance/vouchers/${row.id}`)}><td>{row.entry_date}</td><td><strong>{row.journal_number}</strong></td><td>{row.reference || '—'}</td><td>{row.narration}</td><td style={{ textTransform: 'capitalize' }}>{sourceLabel(row.source_type)}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(row.total_debit)}</td><td><span className={`status-badge ${row.status === 'posted' ? 'success' : 'danger'}`}>{row.status}</span></td></tr>)}
    </tbody></table></div>
  </div>;
};
