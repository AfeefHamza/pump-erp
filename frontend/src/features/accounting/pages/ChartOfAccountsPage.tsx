import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ExternalLink, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchLedgerAccounts, fetchTrialBalance } from '@/api/client';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import type { AccountType, LedgerAccount, TrialBalance } from '@/features/accounting/types';

const labels: Record<AccountType, string> = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses' };
const money = (value: string) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));

export const ChartOfAccountsPage: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [trial, setTrial] = useState<TrialBalance | null>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [tab, setTab] = useState<'accounts' | 'trial'>('accounts');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setAccounts(await fetchLedgerAccounts(orgId, { ...(search ? { search } : {}), ...(type ? { account_type: type } : {}) }));
      if (outletId) setTrial(await fetchTrialBalance(orgId, outletId));
      setError(null);
    } catch (err: any) { setError(err.message || 'Could not load accounting ledgers.'); }
  }, [orgId, outletId, search, type]);
  useEffect(() => { load(); }, [load]);

  const trialByAccount = useMemo(() => new Map((trial?.rows || []).map((row) => [row.account_id, row])), [trial]);

  return <div style={{ maxWidth: 1500, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Chart of Accounts" subtitle="The organisation-wide ledger structure used by vouchers and financial reports." actions={<button className="btn btn-primary" onClick={() => navigate('/app/finance/chart-of-accounts/new')}><Plus size={16}/> New Account</button>}/>
    {error && <div className="alert alert-error">{error}</div>}
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      <button className={`btn ${tab === 'accounts' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('accounts')}>Accounts</button>
      <button className={`btn ${tab === 'trial' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('trial')}>Trial Balance</button>
    </div>
    {tab === 'accounts' ? <>
      <div className="card" style={{ padding: 16, display: 'flex', gap: 12, marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1 }}><Search size={16} style={{ position: 'absolute', left: 10, top: 12 }}/><input className="input" style={{ width: '100%', paddingLeft: 32 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Account code or name"/></div>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="">All Types</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Code</th><th>Account</th><th>Parent</th><th>Type</th><th>Posting</th><th>Status</th><th>Ledger</th></tr></thead><tbody>
        {accounts.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 44 }}><BookOpen size={28}/><div>No ledger accounts found.</div></td></tr> : accounts.map((account) => <tr key={account.id} style={{ cursor: account.system_key ? 'default' : 'pointer' }} onClick={() => !account.system_key && navigate(`/app/finance/chart-of-accounts/${account.id}/edit`)}><td><strong>{account.code}</strong></td><td><span style={{ paddingLeft: account.parent ? 18 : 0, fontWeight: account.is_group ? 750 : 500 }}>{account.name}</span>{account.system_key && <div className="text-muted">System account</div>}</td><td>{account.parent_name || '—'}</td><td>{labels[account.account_type]}</td><td>{account.is_group ? 'Group' : account.allow_manual_posting ? 'Manual allowed' : 'Automatic only'}</td><td><span className={`status-badge ${account.is_active ? 'success' : 'danger'}`}>{account.is_active ? 'Active' : 'Inactive'}</span></td><td>{account.is_group ? '—' : <button className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); navigate(`/app/finance/chart-of-accounts/${account.id}/ledger`); }}><ExternalLink size={14}/> View</button>}</td></tr>)}
      </tbody></table></div>
    </> : <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Code</th><th>Account</th><th>Type</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th><th style={{ textAlign: 'right' }}>Closing Debit</th><th style={{ textAlign: 'right' }}>Closing Credit</th></tr></thead><tbody>
      {(trial?.rows || []).length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 44 }}>No postings for this outlet.</td></tr> : accounts.filter((a) => trialByAccount.has(a.id)).map((account) => { const row = trialByAccount.get(account.id)!; return <tr key={account.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/finance/chart-of-accounts/${account.id}/ledger`)}><td><strong>{row.code}</strong></td><td>{row.name}</td><td>{labels[row.account_type]}</td><td style={{ textAlign: 'right' }}>{money(row.debit)}</td><td style={{ textAlign: 'right' }}>{money(row.credit)}</td><td style={{ textAlign: 'right' }}>{money(row.closing_debit)}</td><td style={{ textAlign: 'right' }}>{money(row.closing_credit)}</td></tr>; })}
    </tbody><tfoot><tr><th colSpan={3}>Totals</th><th style={{ textAlign: 'right' }}>{money(trial?.total_debit || '0')}</th><th style={{ textAlign: 'right' }}>{money(trial?.total_credit || '0')}</th><th colSpan={2}></th></tr></tfoot></table></div>}
  </div>;
};
