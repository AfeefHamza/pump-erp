import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, History, Package, Plus, Search, X } from 'lucide-react';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { SearchableCombobox, type ComboboxOption } from '@/components/forms/SearchableCombobox';
import { createItemStockAdjustment, fetchItemStockLedger, fetchItemStockSummary } from '@/api/client';
import type { ItemStockSummary } from '@/features/sales/types';

const today = () => new Date().toISOString().slice(0, 10);
type LedgerRow = { id: string; effective_date: string; movement_type: string; direction: 'IN' | 'OUT'; quantity: string; running_balance: string; description: string; source_type: string };
const reasons = ['Opening stock', 'Physical count correction', 'Damage / leakage', 'Internal consumption', 'Transfer correction', 'Other authorised adjustment'];

export const ItemStockPage: React.FC = () => {
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [rows, setRows] = useState<ItemStockSummary[]>([]);
  const [selected, setSelected] = useState<ItemStockSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showEntry, setShowEntry] = useState(true);
  const [reasonCategory, setReasonCategory] = useState(reasons[0]);
  const [form, setForm] = useState({ item_id: '', adjustment_date: today(), direction: 'IN', quantity: '', reason: '' });

  const load = () => {
    if (orgId && outletId) fetchItemStockSummary(orgId, outletId).then(setRows).catch((err) => setError(err.message));
  };
  useEffect(load, [orgId, outletId]);

  const selectItem = async (item: ItemStockSummary) => {
    setSelected(item);
    setForm((value) => ({ ...value, item_id: item.item_id }));
    if (orgId && outletId) setLedger(await fetchItemStockLedger(orgId, outletId, item.item_id));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || !outletId) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      await createItemStockAdjustment(orgId, outletId, { ...form, reason: `${reasonCategory}: ${form.reason.trim()}` });
      setSuccess('Inventory adjustment posted successfully.');
      setForm((value) => ({ ...value, quantity: '', reason: '' }));
      load();
      if (selected) setLedger(await fetchItemStockLedger(orgId, outletId, selected.item_id));
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const visible = rows.filter((row) => `${row.item_code} ${row.item_name}`.toLowerCase().includes(search.toLowerCase()));
  const itemOptions: ComboboxOption[] = useMemo(() => rows.map((item) => ({ id: item.item_id, label: item.item_name, subLabel: `${item.item_code} · ${item.current_quantity} ${item.unit} on hand`, tags: [item.item_code, item.item_name] })), [rows]);
  const totalUnits = rows.reduce((sum, row) => sum + Number(row.current_quantity || 0), 0);
  const lowStock = rows.filter((row) => Number(row.reorder_level) > 0 && Number(row.current_quantity) <= Number(row.reorder_level)).length;
  const negativeHistory = rows.filter((row) => row.has_negative_balance_history).length;

  return <div className="erp-page inventory-adjustment-page">
    <PageHeader title="Inventory Adjustments" subtitle="Post authorised stock gains, losses, opening balances and physical-count corrections." actions={<button className="btn btn-primary" onClick={() => setShowEntry(true)}><Plus size={16}/> New Adjustment</button>}/>
    {error && <div className="alert alert-danger">{error}</div>}
    {success && <div className="alert alert-success">{success}</div>}

    <div className="inventory-stat-grid">
      <div className="inventory-stat"><span>Tracked Items</span><strong>{rows.length}</strong><Package size={20}/></div>
      <div className="inventory-stat"><span>Total Units on Hand</span><strong>{totalUnits.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</strong><ClipboardCheck size={20}/></div>
      <div className="inventory-stat warning"><span>At / Below Reorder</span><strong>{lowStock}</strong><ArrowDownToLine size={20}/></div>
      <div className="inventory-stat danger"><span>Negative-stock History</span><strong>{negativeHistory}</strong><History size={20}/></div>
    </div>

    {showEntry && <form className="erp-document-card adjustment-entry-card" onSubmit={submit}>
      <div className="erp-section-heading"><div><span className="erp-section-kicker">Stock journal</span><h2>New Inventory Adjustment</h2><p>This posts an append-only movement. It does not edit historical stock records.</p></div><button type="button" className="btn-icon" aria-label="Close adjustment entry" onClick={() => setShowEntry(false)}><X size={18}/></button></div>
      <div className="adjustment-direction">
        <button type="button" className={form.direction === 'IN' ? 'active gain' : ''} onClick={() => setForm({ ...form, direction: 'IN' })}><ArrowDownToLine size={20}/><span><strong>Increase stock</strong><small>Opening stock, excess or correction</small></span></button>
        <button type="button" className={form.direction === 'OUT' ? 'active loss' : ''} onClick={() => setForm({ ...form, direction: 'OUT' })}><ArrowUpFromLine size={20}/><span><strong>Decrease stock</strong><small>Damage, shortage or consumption</small></span></button>
      </div>
      <div className="erp-form-grid adjustment-form-grid">
        <label className="erp-field-span-2">Item <span className="required">*</span><SearchableCombobox ariaLabel="Adjustment item" value={form.item_id} options={itemOptions} placeholder="Search stock item by name or code" onChange={(item_id) => { const item = rows.find((row) => row.item_id === item_id); setForm({ ...form, item_id }); if (item) selectItem(item); }}/></label>
        <label>Adjustment Date <span className="required">*</span><input className="input" type="date" required value={form.adjustment_date} onChange={(e) => setForm({ ...form, adjustment_date: e.target.value })}/></label>
        <label>Quantity <span className="required">*</span><div className="input-with-suffix"><input className="input number-input" type="number" min="0.0001" step="0.0001" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}/><span>{selected?.unit || 'Unit'}</span></div></label>
        <label>Reason Category <span className="required">*</span><select className="input" value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)}>{reasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
        <label className="erp-field-span-3">Explanation / Reference <span className="required">*</span><textarea className="input" minLength={5} required rows={2} placeholder="Explain the physical count, document reference or authorised reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}/></label>
      </div>
      <div className="adjustment-preview"><span>Posting</span><strong className={form.direction === 'IN' ? 'gain-text' : 'loss-text'}>{form.direction === 'IN' ? '+' : '−'} {Number(form.quantity || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 })} {selected?.unit || ''}</strong><span>{selected ? `to ${selected.item_name}` : 'Select an item'}</span><button className="btn btn-primary" disabled={saving || !form.item_id}>{saving ? 'Posting…' : 'Post Adjustment'}</button></div>
    </form>}

    <section className="erp-document-card inventory-register-card">
      <div className="inventory-register-toolbar"><div><span className="erp-section-kicker">Stock register</span><h2>Current Item Balances</h2></div><div className="search-field"><Search size={16}/><input className="input" placeholder="Search item name or code" value={search} onChange={(e) => setSearch(e.target.value)}/></div></div>
      <div className="erp-line-table-wrap"><table className="data-table"><thead><tr><th>Item</th><th>Unit</th><th className="number">On Hand</th><th className="number">Reorder Level</th><th>Status</th><th/></tr></thead><tbody>{visible.length === 0 ? <tr><td colSpan={6} className="erp-empty-cell"><Package size={28}/><span>No tracked stock items.</span></td></tr> : visible.map((item) => { const low = Number(item.current_quantity) <= Number(item.reorder_level) && Number(item.reorder_level) > 0; return <tr key={item.item_id} className={selected?.item_id === item.item_id ? 'selected-row' : ''} onClick={() => selectItem(item)}><td><strong>{item.item_name}</strong><small>{item.item_code}</small></td><td>{item.unit}</td><td className="number"><strong>{item.current_quantity}</strong></td><td className="number">{item.reorder_level}</td><td><span className={`status-badge ${low ? 'warning' : 'success'}`}>{low ? 'Low stock' : 'Available'}</span></td><td><button type="button" className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); selectItem(item); }}>View ledger</button></td></tr>; })}</tbody></table></div>
    </section>

    {selected && <section className="erp-document-card inventory-ledger-card"><div className="erp-section-heading"><div><span className="erp-section-kicker">Movement history</span><h2>{selected.item_name} Ledger</h2><p>{selected.item_code} · Current balance {selected.current_quantity} {selected.unit}</p></div></div><div className="erp-line-table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Movement</th><th>Description</th><th className="number">In</th><th className="number">Out</th><th className="number">Balance</th></tr></thead><tbody>{ledger.length === 0 ? <tr><td colSpan={6} className="erp-empty-cell">No stock movements recorded.</td></tr> : ledger.map((row) => <tr key={row.id}><td>{row.effective_date}</td><td className="capitalize">{row.movement_type.replaceAll('_', ' ')}</td><td>{row.description}</td><td className="number gain-text">{row.direction === 'IN' ? row.quantity : '—'}</td><td className="number loss-text">{row.direction === 'OUT' ? row.quantity : '—'}</td><td className="number"><strong>{row.running_balance}</strong></td></tr>)}</tbody></table></div></section>}
  </div>;
};
