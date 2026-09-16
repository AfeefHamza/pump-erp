import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Paperclip } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { createExpense, fetchExpenseCategories, fetchPaymentAccountOptions } from '@/api/client';
import type { ExpenseCategory, PaymentAccount } from '@/features/finance/types';

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));

export const ExpenseFormPage: React.FC = () => {
  const navigate = useNavigate(); const orgId = useAppSelector((s) => s.ui.selectedOrganizationId); const outletId = useAppSelector((s) => s.ui.selectedOutletId);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]); const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [attachment, setAttachment] = useState<File | null>(null); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ expense_date: today(), category_id: '', payment_account_id: '', payee: '', amount: '', reference_number: '', notes: '' });
  useEffect(() => { if (orgId && outletId) Promise.all([fetchExpenseCategories(orgId, true), fetchPaymentAccountOptions(orgId, outletId)]).then(([a, b]) => { setCategories(a); setAccounts(b); }).catch((e) => setError(e.message)); }, [orgId, outletId]);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!orgId || !outletId) return; setSaving(true); setError(null); try { const row = await createExpense(orgId, outletId, { ...form, client_request_id: requestId, attachment }); navigate(`/app/finance/expenses/${row.id}`); } catch (err: any) { setError(err?.data?.detail || Object.values(err?.data || {}).flat().join(' ') || err.message); } finally { setSaving(false); } };
  if (!orgId || !outletId) return <div className="card" style={{ margin: 24, padding: 32 }}>Select an organisation and outlet before recording an expense.</div>;
  return <form onSubmit={submit} style={{ maxWidth: 1250, margin: '0 auto', padding: '1.5rem' }}><PageHeader title="Record Expense" subtitle="Save the expense, account movement and journal together." actions={<button type="button" className="btn btn-secondary" onClick={() => navigate('/app/finance/expenses')}><ArrowLeft size={16}/> Back</button>}/>{error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(300px,.8fr)', gap: 20, alignItems: 'start' }}><section className="card" style={{ padding: 24 }}><h3 style={{ marginTop: 0 }}>Expense Details</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}>
      <label>Expense Date<input className="input" type="date" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })}/></label>
      <label>Expense Category<select className="input" required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="">Select category</option>{categories.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.ledger_account_name}</option>)}</select></label>
      <label>Paid From<select className="input" required value={form.payment_account_id} onChange={(e) => setForm({ ...form, payment_account_id: e.target.value })}><option value="">Select cash or bank account</option>{accounts.map((row) => <option key={row.id} value={row.id}>{row.name} · {money(row.current_balance)}</option>)}</select></label>
      <label>Amount<input className="input" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}/></label>
      <label>Paid To / Payee<input className="input" value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })}/></label>
      <label>Reference Number<input className="input" value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })}/></label>
      <label style={{ gridColumn: '1 / -1' }}>Notes<textarea className="input" rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label>
      <label style={{ gridColumn: '1 / -1' }}><Paperclip size={15}/> Attachment<input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setAttachment(e.target.files?.[0] || null)}/><small className="text-muted">Optional invoice, receipt or voucher.</small></label>
    </div></section><aside className="card" style={{ padding: 22, position: 'sticky', top: 20 }}><h3 style={{ marginTop: 0 }}>Posting Summary</h3><p className="text-muted">The selected expense ledger will be debited and the payment account credited.</p><div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}><span>Expense Total</span><strong>{money(form.amount)}</strong></div><button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 20 }} disabled={saving || !form.category_id || !form.payment_account_id || Number(form.amount) <= 0}><CheckCircle2 size={17}/>{saving ? ' Saving…' : ' Save Expense'}</button></aside></div>
  </form>;
};
