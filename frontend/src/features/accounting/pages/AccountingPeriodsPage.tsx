import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, LockKeyhole, RotateCcw } from 'lucide-react';
import { createAccountingPeriodLock, fetchAccountingPeriodLocks, unlockAccountingPeriod } from '@/api/client';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import type { AccountingPeriodLock } from '@/features/accounting/types';

const currentMonth = () => new Date().toISOString().slice(0, 7);

export const AccountingPeriodsPage: React.FC = () => {
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId); const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [rows, setRows] = useState<AccountingPeriodLock[]>([]); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ month: currentMonth(), scope: 'outlet', reason: '' });
  const load = useCallback(async () => { if (!orgId) return; try { setRows(await fetchAccountingPeriodLocks(orgId)); setError(null); } catch (err: any) { setError(err.message || 'Could not load period locks.'); } }, [orgId]);
  useEffect(() => { load(); }, [load]);
  const lock = async (event: React.FormEvent) => {
    event.preventDefault(); if (!orgId) return; setSaving(true); setError(null);
    try { await createAccountingPeriodLock(orgId, { month: `${form.month}-01`, outlet_id: form.scope === 'outlet' ? outletId : null, reason: form.reason }); setForm({ ...form, reason: '' }); await load(); }
    catch (err: any) { setError(err.message || 'Could not lock period.'); } finally { setSaving(false); }
  };
  const unlock = async (row: AccountingPeriodLock) => {
    if (!orgId) return; const reason = window.prompt(`Reason for reopening ${row.month.slice(0, 7)}?`); if (!reason) return;
    try { await unlockAccountingPeriod(orgId, row.id, reason); await load(); } catch (err: any) { setError(err.message || 'Could not reopen period.'); }
  };
  return <div style={{ maxWidth: 1300, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Accounting Periods" subtitle="Lock completed months without blocking normal backdated documents in open periods. This is not an operational Day Close."/>
    {error && <div className="alert alert-error">{error}</div>}
    <form className="card" style={{ padding: 20, marginBottom: 18 }} onSubmit={lock}><h3 style={{ marginTop: 0 }}>Lock a Month</h3><div style={{ display: 'grid', gridTemplateColumns: '200px 240px minmax(300px,1fr) auto', gap: 14, alignItems: 'end' }}><label>Accounting Month<input className="input" required type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}/></label><label>Scope<select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}><option value="outlet">Current Outlet</option><option value="organisation">All Outlets</option></select></label><label>Reason *<input className="input" required minLength={5} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Monthly accounts finalised"/></label><button className="btn btn-primary" disabled={saving || (form.scope === 'outlet' && !outletId)}><LockKeyhole size={16}/>{saving ? ' Locking…' : ' Lock Month'}</button></div></form>
    <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Month</th><th>Scope</th><th>Reason</th><th>Locked By</th><th>Status</th><th></th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 44 }}><CalendarClock size={28}/><div>No accounting period locks.</div></td></tr> : rows.map((row) => <tr key={row.id}><td><strong>{new Date(`${row.month}T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong></td><td>{row.outlet_name || 'All Outlets'}</td><td>{row.reason}{row.unlock_reason && <div className="text-muted">Reopened: {row.unlock_reason}</div>}</td><td>{row.locked_by_name || 'System'}<div className="text-muted">{new Date(row.locked_at).toLocaleString()}</div></td><td><span className={`status-badge ${row.is_active ? 'danger' : 'success'}`}>{row.is_active ? 'Locked' : 'Open'}</span></td><td>{row.is_active && <button className="btn btn-secondary" onClick={() => unlock(row)}><RotateCcw size={15}/> Reopen</button>}</td></tr>)}</tbody></table></div>
  </div>;
};
