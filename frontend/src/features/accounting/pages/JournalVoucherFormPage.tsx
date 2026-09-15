import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createJournalEntry, fetchLedgerAccounts } from '@/api/client';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import type { LedgerAccount } from '@/features/accounting/types';

type DraftLine = { key: string; account_id: string; description: string; debit: string; credit: string };
const blankLine = (): DraftLine => ({ key: crypto.randomUUID(), account_id: '', description: '', debit: '', credit: '' });
const today = () => new Date().toISOString().slice(0, 10);
const amount = (value: string) => Number(value || 0);
const formatted = (value: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export const JournalVoucherFormPage: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([blankLine(), blankLine()]);
  const [form, setForm] = useState({ entry_date: today(), reference: '', narration: '' });
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (orgId) fetchLedgerAccounts(orgId, { active: 'true' }).then((rows) => setAccounts(rows.filter((row) => !row.is_group && row.allow_manual_posting))).catch((err) => setError(err.message)); }, [orgId]);
  const totals = useMemo(() => ({ debit: lines.reduce((sum, row) => sum + amount(row.debit), 0), credit: lines.reduce((sum, row) => sum + amount(row.credit), 0) }), [lines]);
  const balanced = totals.debit > 0 && Math.abs(totals.debit - totals.credit) < 0.001;
  const update = (key: string, patch: Partial<DraftLine>) => setLines((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  const updateAmount = (line: DraftLine, side: 'debit' | 'credit', value: string) => update(line.key, side === 'debit' ? { debit: value, credit: value ? '' : line.credit } : { credit: value, debit: value ? '' : line.debit });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!orgId || !outletId) return;
    const postingLines = lines.filter((row) => row.account_id && (amount(row.debit) > 0 || amount(row.credit) > 0));
    if (!balanced || postingLines.length < 2) { setError('Enter at least two lines and balance Debit with Credit exactly.'); return; }
    setSaving(true); setError(null);
    try {
      const journal = await createJournalEntry(orgId, outletId, { client_request_id: clientRequestId, ...form, lines: postingLines.map(({ account_id, description, debit, credit }) => ({ account_id, description, debit: debit || '0', credit: credit || '0' })) });
      navigate(`/app/finance/vouchers/${journal.id}`);
    } catch (err: any) { setError(err.message || 'Could not post Journal Voucher.'); setSaving(false); }
  };

  return <form onSubmit={submit} style={{ maxWidth: 1500, margin: '0 auto', padding: '1.5rem' }}>
    <button type="button" className="btn btn-ghost" onClick={() => navigate('/app/finance/vouchers')}><ArrowLeft size={16}/> Back to Journal Vouchers</button>
    <PageHeader title="New Journal Voucher" subtitle="A direct-save accounting entry. Once posted, it cannot be edited or deleted."/>
    {error && <div className="alert alert-error">{error}</div>}
    <section className="card" style={{ padding: 20, marginBottom: 18 }}><div style={{ display: 'grid', gridTemplateColumns: '220px 260px minmax(300px,1fr)', gap: 14 }}><label>Voucher Date *<input className="input" type="date" required value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })}/></label><label>Reference<input className="input" value={form.reference} maxLength={100} onChange={(e) => setForm({ ...form, reference: e.target.value })}/></label><label>Narration *<input className="input" required minLength={5} value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} placeholder="Reason for this accounting entry"/></label></div></section>
    <section className="card" style={{ overflow: 'hidden' }}><div style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><h3 style={{ margin: 0 }}>Debit & Credit Lines</h3><div className="text-muted">Use ledger accounts from this organisation.</div></div><button type="button" className="btn btn-secondary" onClick={() => setLines([...lines, blankLine()])}><Plus size={16}/> Add Row</button></div><div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th style={{ minWidth: 280 }}>Account</th><th style={{ minWidth: 300 }}>Description</th><th style={{ width: 170, textAlign: 'right' }}>Debit</th><th style={{ width: 170, textAlign: 'right' }}>Credit</th><th style={{ width: 50 }}></th></tr></thead><tbody>{lines.map((line) => <tr key={line.key}><td><select aria-label="Ledger account" className="input" required value={line.account_id} onChange={(e) => update(line.key, { account_id: e.target.value })}><option value="">Select account</option>{accounts.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</select></td><td><input aria-label="Line description" className="input" value={line.description} onChange={(e) => update(line.key, { description: e.target.value })}/></td><td><input aria-label="Debit amount" className="input" style={{ textAlign: 'right' }} type="number" min="0" step="0.01" value={line.debit} onChange={(e) => updateAmount(line, 'debit', e.target.value)}/></td><td><input aria-label="Credit amount" className="input" style={{ textAlign: 'right' }} type="number" min="0" step="0.01" value={line.credit} onChange={(e) => updateAmount(line, 'credit', e.target.value)}/></td><td><button aria-label="Remove line" type="button" className="btn btn-ghost" disabled={lines.length <= 2} onClick={() => setLines(lines.filter((row) => row.key !== line.key))}><Trash2 size={16}/></button></td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Totals</th><th style={{ textAlign: 'right' }}>{formatted(totals.debit)}</th><th style={{ textAlign: 'right' }}>{formatted(totals.credit)}</th><th></th></tr></tfoot></table></div></section>
    <div className="card" style={{ marginTop: 18, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><strong style={{ color: balanced ? 'var(--color-success)' : 'var(--color-danger)' }}>{balanced ? 'Balanced and ready to post' : `Difference: ${formatted(Math.abs(totals.debit - totals.credit))}`}</strong><div className="text-muted">Corrections after posting require a reversal voucher.</div></div><button className="btn btn-primary" disabled={saving || !balanced}><CheckCircle2 size={17}/>{saving ? ' Posting…' : ' Post Journal Voucher'}</button></div>
  </form>;
};
