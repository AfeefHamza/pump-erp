import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, BookOpen, Landmark, Plus, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { createPaymentAccount, deactivatePaymentAccount, fetchCashBankTransfers, fetchPaymentAccounts, updatePaymentAccount } from '@/api/client';
import type { CashBankTransfer, PaymentAccount, PaymentAccountInput } from '@/features/finance/types';

const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
const emptyForm: PaymentAccountInput = { code: '', name: '', account_type: 'cash', opening_balance: '0.00', opening_balance_date: null };

export const PaymentAccountsPage: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PaymentAccountInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<CashBankTransfer[]>([]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setError(null);
    try {
      setAccounts(await fetchPaymentAccounts(orgId, outletId || undefined));
      if (outletId) setTransfers(await fetchCashBankTransfers(orgId, outletId));
    }
    catch (err: any) { setError(err?.data?.detail || err.message || 'Failed to load payment accounts.'); }
    finally { setLoading(false); }
  }, [orgId, outletId]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => accounts.filter((account) => {
    const q = search.toLowerCase();
    return !q || account.name.toLowerCase().includes(q) || account.code.toLowerCase().includes(q);
  }), [accounts, search]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || !form.code.trim() || !form.name.trim()) return;
    setSaving(true); setError(null);
    try {
      if (editingId) await updatePaymentAccount(orgId, editingId, form);
      else await createPaymentAccount(orgId, form);
      setOpen(false); setForm(emptyForm); await load();
    } catch (err: any) { setError(err?.data?.detail || err.message || 'Failed to save payment account.'); }
    finally { setSaving(false); }
  };

  return <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Cash & Banking" subtitle="Manage cash and bank balances, books, deposits, withdrawals and transfers." actions={<div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary" onClick={() => navigate('/app/finance/transfers/new')}><ArrowRightLeft size={16}/> New Transfer</button><button className="btn btn-primary" onClick={() => { setEditingId(null); setForm({ ...emptyForm, outlet_id: outletId || null }); setOpen(true); }}><Plus size={16}/> New Account</button></div>}/>
    {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div style={{ position: 'relative', maxWidth: 420 }}><Search size={16} style={{ position: 'absolute', left: 11, top: 12 }}/><input className="input" style={{ width: '100%', paddingLeft: 34 }} placeholder="Search account name or code" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
    </div>
    <div className="card" style={{ overflowX: 'auto' }}>
      <table className="data-table"><thead><tr><th>Account</th><th>Type</th><th>Scope</th><th>Bank Details</th><th style={{ textAlign: 'right' }}>Opening Balance</th><th style={{ textAlign: 'right' }}>Current Balance</th><th>Status</th><th></th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={8}>Loading accounts…</td></tr> : filtered.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>No payment accounts found.</td></tr> : filtered.map((account) => <tr key={account.id}>
        <td><strong>{account.name}</strong><div className="text-muted">{account.code}</div></td><td>{account.account_type === 'cash' ? 'Cash' : 'Bank'}</td><td>{account.outlet_name || 'All outlets'}</td><td>{account.account_type === 'bank' ? `${account.bank_name || 'Bank'}${account.account_number_last4 ? ` ••••${account.account_number_last4}` : ''}` : '—'}</td><td style={{ textAlign: 'right' }}>{money(account.opening_balance)}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(account.current_balance)}</td><td><span className={`status-badge ${account.is_active ? 'success' : 'neutral'}`}>{account.is_active ? 'Active' : 'Inactive'}</span></td>
        <td><button className="btn btn-ghost" onClick={() => navigate(`/app/finance/cash-banking/${account.id}/book`)}><BookOpen size={15}/> Book</button><button className="btn btn-ghost" onClick={() => setSelectedId(selectedId === account.id ? null : account.id)}>Recent</button>{account.is_active && <button className="btn btn-ghost" onClick={() => { setEditingId(account.id); setForm({ outlet_id: account.outlet || null, code: account.code, name: account.name, account_type: account.account_type, bank_name: account.bank_name || '', account_number_last4: account.account_number_last4 || '', ifsc: account.ifsc || '', opening_balance: account.opening_balance, opening_balance_date: account.opening_balance_date || null, notes: account.notes || '' }); setOpen(true); }}>Edit</button>}{account.is_active && <button className="btn btn-ghost" onClick={async () => { if (orgId && window.confirm(`Deactivate ${account.name}?`)) { await deactivatePaymentAccount(orgId, account.id); await load(); } }}>Deactivate</button>}</td>
      </tr>)}</tbody></table>
    </div>
    {selectedId && (() => { const account = accounts.find((row) => row.id === selectedId); return account ? <div className="card" style={{ marginTop: 18, overflow: 'hidden' }}><div style={{ padding: 18 }}><h3 style={{ margin: 0 }}>{account.name} Movements</h3></div><table className="data-table"><thead><tr><th>Date</th><th>Description</th><th>Type</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead><tbody>{!account.movements?.length ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 28 }}>No movements recorded.</td></tr> : account.movements.map((row) => <tr key={row.id}><td>{row.effective_date}</td><td>{row.description}</td><td>{row.movement_type.replaceAll('_', ' ')}</td><td style={{ textAlign: 'right', color: Number(row.signed_amount) < 0 ? 'var(--color-danger-text)' : 'var(--color-success-text)' }}>{money(row.signed_amount)}</td></tr>)}</tbody></table></div> : null; })()}
    <div className="card" style={{ marginTop: 20, overflowX: 'auto' }}><div style={{ padding: 18 }}><h3 style={{ margin: 0 }}>Recent Transfers</h3><div className="text-muted">Cash deposits, bank withdrawals and account transfers.</div></div><table className="data-table"><thead><tr><th>Transfer</th><th>Date</th><th>From</th><th>To</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th></tr></thead><tbody>{transfers.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}>No transfers recorded.</td></tr> : transfers.map((row) => <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/finance/transfers/${row.id}`)}><td><strong>{row.transfer_number}</strong></td><td>{row.transfer_date}</td><td>{row.from_account_name}</td><td>{row.to_account_name}</td><td style={{ textAlign: 'right' }}>{money(row.amount)}</td><td><span className={`status-badge ${row.status === 'active' ? 'success' : 'neutral'}`}>{row.status}</span></td></tr>)}</tbody></table></div>
    {open && <div className="modal-overlay" onClick={() => setOpen(false)}><div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="payment-account-title" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
      <div className="modal-header"><div><h2 id="payment-account-title" style={{ margin: 0 }}>{editingId ? 'Edit Payment Account' : 'New Payment Account'}</h2><p className="text-muted" style={{ margin: '4px 0 0' }}>Create a cash counter or bank account.</p></div><button type="button" aria-label="Close" className="btn btn-ghost" onClick={() => setOpen(false)}><X size={18}/></button></div>
      <form onSubmit={save}>{error && <div className="alert alert-danger" style={{ margin: '16px 22px 0' }}>{error}</div>}<div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <label>Account Code<input className="input" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}/></label>
        <label>Account Name<input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/></label>
        <label>Account Type<select className="input" value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value as 'cash' | 'bank', bank_name: '', account_number_last4: '', ifsc: '' })}><option value="cash">Cash</option><option value="bank">Bank</option></select></label>
        <label>Scope<select className="input" value={form.outlet_id ? 'outlet' : 'organisation'} onChange={(e) => setForm({ ...form, outlet_id: e.target.value === 'outlet' ? outletId : null })}><option value="outlet">Current outlet</option><option value="organisation">All outlets</option></select></label>
        {form.account_type === 'bank' && <><label>Bank Name<input className="input" value={form.bank_name || ''} onChange={(e) => setForm({ ...form, bank_name: e.target.value })}/></label><label>Last 4 Digits<input className="input" maxLength={4} value={form.account_number_last4 || ''} onChange={(e) => setForm({ ...form, account_number_last4: e.target.value })}/></label><label>IFSC<input className="input" maxLength={11} value={form.ifsc || ''} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })}/></label></>}
        <label>Opening Balance<input className="input" type="number" step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}/></label>
        <label>Opening Date<input className="input" type="date" value={form.opening_balance_date || ''} onChange={(e) => setForm({ ...form, opening_balance_date: e.target.value || null })}/></label>
      </div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={saving}><Landmark size={16}/>{saving ? ' Saving…' : ' Save Account'}</button></div></form>
    </div></div>}
  </div>;
};
