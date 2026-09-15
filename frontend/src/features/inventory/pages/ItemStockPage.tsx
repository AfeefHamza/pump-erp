import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Package, Search } from 'lucide-react';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { createItemStockAdjustment, fetchItemStockLedger, fetchItemStockSummary } from '@/api/client';
import type { ItemStockSummary } from '@/features/sales/types';

const today = () => new Date().toISOString().slice(0, 10);
type LedgerRow = { id:string; effective_date:string; movement_type:string; direction:'IN'|'OUT'; quantity:string; running_balance:string; description:string; source_type:string };

export const ItemStockPage: React.FC = () => {
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId); const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [rows, setRows] = useState<ItemStockSummary[]>([]); const [selected, setSelected] = useState<ItemStockSummary | null>(null); const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [search, setSearch] = useState(''); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ item_id: '', adjustment_date: today(), direction: 'IN', quantity: '', reason: '' });
  const load = () => { if (orgId && outletId) fetchItemStockSummary(orgId, outletId).then(setRows).catch((err) => setError(err.message)); };
  useEffect(load, [orgId, outletId]);
  const selectItem = async (item: ItemStockSummary) => { setSelected(item); setForm((value) => ({ ...value, item_id: item.item_id })); if (orgId && outletId) setLedger(await fetchItemStockLedger(orgId, outletId, item.item_id)); };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!orgId || !outletId) return; setSaving(true); setError(null); try { await createItemStockAdjustment(orgId, outletId, form); setForm({ ...form, quantity: '', reason: '' }); load(); if (selected) setLedger(await fetchItemStockLedger(orgId, outletId, selected.item_id)); } catch (err: any) { setError(err.message); } finally { setSaving(false); } };
  const visible = rows.filter((row) => `${row.item_code} ${row.item_name}`.toLowerCase().includes(search.toLowerCase()));
  return <div style={{ maxWidth: 1500, margin: '0 auto', padding: '1.5rem' }}><PageHeader title="Item Stock" subtitle="Ordinary stock items and lubricants. Fuel stock remains in the tank ledger."/>{error && <div className="alert alert-error">{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 350px', gap: 20, alignItems: 'start' }}><div style={{ display: 'grid', gap: 18 }}>
      <div className="card" style={{ padding: 14 }}><div style={{ position: 'relative' }}><Search size={16} style={{ position: 'absolute', left: 10, top: 12 }}/><input className="input" style={{ width: '100%', paddingLeft: 32 }} placeholder="Search stock items" value={search} onChange={(e) => setSearch(e.target.value)}/></div></div>
      <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Item</th><th>Unit</th><th style={{ textAlign: 'right' }}>On Hand</th><th style={{ textAlign: 'right' }}>Reorder Level</th><th>Status</th></tr></thead><tbody>{visible.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 38 }}><Package size={28}/><div>No tracked stock items.</div></td></tr> : visible.map((item) => { const low = Number(item.current_quantity) <= Number(item.reorder_level) && Number(item.reorder_level) > 0; return <tr key={item.item_id} onClick={() => selectItem(item)} style={{ cursor: 'pointer', background: selected?.item_id === item.item_id ? 'var(--bg-muted)' : undefined }}><td><strong>{item.item_name}</strong><div className="text-muted">{item.item_code}</div></td><td>{item.unit}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{item.current_quantity}</td><td style={{ textAlign: 'right' }}>{item.reorder_level}</td><td><span className={`status-badge ${low ? 'warning' : 'success'}`}>{low ? 'Low stock' : 'Available'}</span></td></tr>; })}</tbody></table></div>
      {selected && <div className="card" style={{ overflowX: 'auto' }}><div style={{ padding: 18 }}><h3 style={{ margin: 0 }}>{selected.item_name} Ledger</h3><div className="text-muted">Append-only movement history with running balance.</div></div><table className="data-table"><thead><tr><th>Date</th><th>Movement</th><th>Description</th><th style={{ textAlign: 'right' }}>In</th><th style={{ textAlign: 'right' }}>Out</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead><tbody>{ledger.map((row) => <tr key={row.id}><td>{row.effective_date}</td><td style={{ textTransform: 'capitalize' }}>{row.movement_type.replaceAll('_', ' ')}</td><td>{row.description}</td><td style={{ textAlign: 'right' }}>{row.direction === 'IN' ? row.quantity : '—'}</td><td style={{ textAlign: 'right' }}>{row.direction === 'OUT' ? row.quantity : '—'}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{row.running_balance}</td></tr>)}</tbody></table></div>}
    </div><form className="card" style={{ padding: 20, position: 'sticky', top: 20 }} onSubmit={submit}><h3 style={{ marginTop: 0 }}>Stock Adjustment</h3><div className="text-muted" style={{ marginBottom: 14 }}>Use for opening stock, corrections, damage or physical-count differences.</div><div style={{ display: 'grid', gap: 13 }}>
      <label>Item<select className="input" required value={form.item_id} onChange={(e) => { const item = rows.find((row) => row.item_id === e.target.value); setForm({ ...form, item_id: e.target.value }); if (item) selectItem(item); }}><option value="">Select item</option>{rows.map((item) => <option key={item.item_id} value={item.item_id}>{item.item_name}</option>)}</select></label>
      <label>Date<input className="input" type="date" required value={form.adjustment_date} onChange={(e) => setForm({ ...form, adjustment_date: e.target.value })}/></label>
      <label>Direction<select className="input" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}><option value="IN">Increase stock</option><option value="OUT">Decrease stock</option></select></label>
      <label>Quantity<input className="input" type="number" min="0.0001" step="0.0001" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}/></label>
      <label>Reason<textarea className="input" minLength={5} required rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}/></label>
      <button className="btn btn-primary" style={{ justifyContent: 'center' }} disabled={saving || !form.item_id}>{form.direction === 'IN' ? <ArrowDownToLine size={16}/> : <ArrowUpFromLine size={16}/>} {saving ? 'Saving…' : 'Post Adjustment'}</button>
    </div></form></div>
  </div>;
};
