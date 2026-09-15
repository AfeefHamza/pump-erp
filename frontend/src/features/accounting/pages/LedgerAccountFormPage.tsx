import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { createLedgerAccount, fetchLedgerAccount, fetchLedgerAccounts, updateLedgerAccount } from '@/api/client';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import type { AccountType, LedgerAccount } from '@/features/accounting/types';

const typeOptions: Array<{ value: AccountType; label: string }> = [
  { value: 'asset', label: 'Asset' }, { value: 'liability', label: 'Liability' }, { value: 'equity', label: 'Equity' }, { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' },
];

export const LedgerAccountFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { accountId } = useParams();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', name: '', account_type: 'asset' as AccountType, parent_id: '', is_group: false, allow_manual_posting: true, description: '' });

  useEffect(() => {
    if (!orgId) return;
    Promise.all([fetchLedgerAccounts(orgId), accountId ? fetchLedgerAccount(orgId, accountId) : Promise.resolve(null)])
      .then(([rows, account]) => {
        setAccounts(rows);
        if (account) setForm({ code: account.code, name: account.name, account_type: account.account_type, parent_id: account.parent || '', is_group: account.is_group, allow_manual_posting: account.allow_manual_posting, description: account.description || '' });
      }).catch((err) => setError(err.message || 'Could not load account.'));
  }, [orgId, accountId]);

  const parentOptions = useMemo(() => accounts.filter((row) => row.is_group && row.account_type === form.account_type && row.id !== accountId), [accounts, form.account_type, accountId]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!orgId) return; setSaving(true); setError(null);
    const payload = { ...form, parent_id: form.parent_id || null, allow_manual_posting: form.is_group ? false : form.allow_manual_posting };
    try {
      if (accountId) await updateLedgerAccount(orgId, accountId, payload); else await createLedgerAccount(orgId, payload);
      navigate('/app/finance/chart-of-accounts');
    } catch (err: any) { setError(err.message || 'Could not save account.'); setSaving(false); }
  };

  return <form onSubmit={submit} style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>
    <button type="button" className="btn btn-ghost" onClick={() => navigate('/app/finance/chart-of-accounts')}><ArrowLeft size={16}/> Back to Chart of Accounts</button>
    <PageHeader title={accountId ? 'Edit Ledger Account' : 'New Ledger Account'} subtitle="Create a clean account hierarchy for posting and reporting."/>
    {error && <div className="alert alert-error">{error}</div>}
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 18 }}>
        <label>Account Code *<input className="input" required maxLength={30} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. 6110"/></label>
        <label>Account Name *<input className="input" required maxLength={150} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Electricity Expense"/></label>
        <label>Account Type *<select className="input" value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value as AccountType, parent_id: '' })}>{typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>Parent Group<select className="input" value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}><option value="">No parent (top level)</option>{parentOptions.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</select></label>
        <label style={{ gridColumn: 'span 2' }}>Description<textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></label>
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 20 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.is_group} onChange={(e) => setForm({ ...form, is_group: e.target.checked, allow_manual_posting: e.target.checked ? false : form.allow_manual_posting })}/> Group account</label>
        {!form.is_group && <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.allow_manual_posting} onChange={(e) => setForm({ ...form, allow_manual_posting: e.target.checked })}/> Allow manual journal posting</label>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 28 }}><button type="button" className="btn btn-secondary" onClick={() => navigate('/app/finance/chart-of-accounts')}>Cancel</button><button className="btn btn-primary" disabled={saving}><CheckCircle2 size={17}/>{saving ? ' Saving…' : ' Save Account'}</button></div>
    </div>
  </form>;
};
