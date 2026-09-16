import React, { useEffect, useState } from 'react';
import { ArrowLeft, Printer, RotateCcw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchJournalEntry, reverseJournalEntry } from '@/api/client';
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
  shift_accounting: 'Shift Accounting',
};
const sourceLabel = (source: string) => sourceLabels[source] || source.replaceAll('_', ' ');

export const JournalVoucherDetailPage: React.FC = () => {
  const navigate = useNavigate(); const { journalId } = useParams();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId); const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [journal, setJournal] = useState<JournalEntry | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (orgId && outletId && journalId) fetchJournalEntry(orgId, outletId, journalId).then(setJournal).catch((err) => setError(err.message)); }, [orgId, outletId, journalId]);
  const reverse = async () => {
    if (!orgId || !outletId || !journalId || !journal) return;
    const reason = window.prompt(`Reason for reversing ${journal.journal_number}?`);
    if (!reason) return;
    try { const reversal = await reverseJournalEntry(orgId, outletId, journalId, reason); navigate(`/app/finance/vouchers/${reversal.id}`); }
    catch (err: any) { setError(err.message || 'Could not reverse voucher.'); }
  };
  if (!journal) return <div style={{ padding: '1.5rem' }}>{error ? <div className="alert alert-error">{error}</div> : 'Loading voucher…'}</div>;
  return <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem' }}>
    <button className="btn btn-ghost" onClick={() => navigate('/app/finance/vouchers')}><ArrowLeft size={16}/> Back to Journal Vouchers</button>
    <PageHeader title={journal.journal_number} subtitle="Posted accounting voucher — read only" actions={<div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary" onClick={() => window.print()}><Printer size={16}/> Print</button>{journal.status === 'posted' && journal.source_type === 'manual_journal' && !journal.reversal_of && <button className="btn btn-danger" onClick={reverse}><RotateCcw size={16}/> Reverse</button>}</div>}/>
    {error && <div className="alert alert-error">{error}</div>}
    <section className="card" style={{ padding: 20, marginBottom: 18 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 16 }}><div><div className="text-muted">Date</div><strong>{journal.entry_date}</strong></div><div><div className="text-muted">Reference</div><strong>{journal.reference || '—'}</strong></div><div><div className="text-muted">Source</div><strong style={{ textTransform: 'capitalize' }}>{sourceLabel(journal.source_type)}</strong></div><div><div className="text-muted">Status</div><span className={`status-badge ${journal.status === 'posted' ? 'success' : 'danger'}`}>{journal.status}</span></div></div><div style={{ marginTop: 18 }}><div className="text-muted">Narration</div><strong>{journal.narration}</strong></div>{journal.reversal_reason && <div className="alert" style={{ marginTop: 16 }}>Reversal reason: {journal.reversal_reason}</div>}</section>
    <section className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Account</th><th>Description</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th></tr></thead><tbody>{journal.lines.map((line) => <tr key={line.id}><td><strong>{line.account_code_snapshot}</strong> — {line.account_name_snapshot}</td><td>{line.description || '—'}</td><td style={{ textAlign: 'right' }}>{Number(line.debit) ? money(line.debit) : '—'}</td><td style={{ textAlign: 'right' }}>{Number(line.credit) ? money(line.credit) : '—'}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Totals</th><th style={{ textAlign: 'right' }}>{money(journal.total_debit)}</th><th style={{ textAlign: 'right' }}>{money(journal.total_credit)}</th></tr></tfoot></table></section>
    <div className="text-muted" style={{ marginTop: 16 }}>Created by {journal.created_by_name || 'System'} on {new Date(journal.created_at).toLocaleString()}.</div>
  </div>;
};
