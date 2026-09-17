import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { SearchableCombobox, type ComboboxOption } from '@/components/forms/SearchableCombobox';
import { createItemStockAdjustment, fetchItemStockSummary } from '@/api/client';
import type { ItemStockSummary } from '@/features/sales/types';

const today = () => new Date().toISOString().slice(0, 10);
const reasons = ['Opening stock', 'Physical count correction', 'Damage / leakage', 'Internal consumption', 'Transfer correction', 'Other authorised adjustment'];

export const ItemStockAdjustmentFormPage: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [items, setItems] = useState<ItemStockSummary[]>([]);
  const [reasonCategory, setReasonCategory] = useState(reasons[0]);
  const [form, setForm] = useState({ item_id: '', adjustment_date: today(), direction: 'IN', quantity: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (orgId && outletId) fetchItemStockSummary(orgId, outletId).then(setItems).catch((err) => setError(err.message)); }, [orgId, outletId]);
  const selected = items.find((item) => item.item_id === form.item_id);
  const options: ComboboxOption[] = useMemo(() => items.map((item) => ({ id: item.item_id, label: item.item_name, subLabel: `${item.item_code} · ${item.current_quantity} ${item.unit} on hand`, tags: [item.item_code, item.item_name] })), [items]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!orgId || !outletId) return;
    setSaving(true); setError(null);
    try {
      await createItemStockAdjustment(orgId, outletId, { ...form, reason: `${reasonCategory}: ${form.reason.trim()}` });
      navigate('/app/inventory/adjustments', { replace: true, state: { success: 'Inventory adjustment posted successfully.' } });
    } catch (err: any) { setError(err.message || 'Failed to post adjustment.'); } finally { setSaving(false); }
  };
  return <form className="erp-page erp-master-form-page" onSubmit={submit}>
    <PageHeader title="New Inventory Adjustment" subtitle="Post an authorised, append-only stock movement to the item ledger." backLink={{ to: '/app/inventory/adjustments', label: 'Back to Inventory Adjustments' }}/>
    {error && <div className="alert alert-danger"><AlertCircle size={17}/>{error}</div>}
    <section className="erp-document-card adjustment-entry-card">
      <div className="erp-section-heading"><div><span className="erp-section-kicker">Stock journal</span><h2>Movement Direction</h2><p>Select whether this entry adds to or reduces the physical item balance.</p></div></div>
      <div className="adjustment-direction">
        <button type="button" className={form.direction === 'IN' ? 'active gain' : ''} onClick={() => setForm({ ...form, direction: 'IN' })}><ArrowDownToLine size={20}/><span><strong>Increase stock</strong><small>Opening stock, excess or correction</small></span></button>
        <button type="button" className={form.direction === 'OUT' ? 'active loss' : ''} onClick={() => setForm({ ...form, direction: 'OUT' })}><ArrowUpFromLine size={20}/><span><strong>Decrease stock</strong><small>Damage, shortage or consumption</small></span></button>
      </div>
    </section>
    <section className="erp-document-card">
      <div className="erp-section-heading"><div><span className="erp-section-kicker">Adjustment details</span><h2>Item & Authorisation</h2></div></div>
      <div className="erp-form-grid adjustment-form-grid">
        <label className="erp-field-span-2">Item <span className="required">*</span><SearchableCombobox ariaLabel="Adjustment item" value={form.item_id} options={options} placeholder="Click to select a stock item" onChange={(item_id) => setForm({ ...form, item_id })}/></label>
        <label>Adjustment Date <span className="required">*</span><input className="input" type="date" required value={form.adjustment_date} onChange={(e) => setForm({ ...form, adjustment_date: e.target.value })}/></label>
        <label>Quantity <span className="required">*</span><div className="input-with-suffix"><input className="input number-input" type="number" min="0.0001" step="0.0001" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}/><span>{selected?.unit || 'Unit'}</span></div></label>
        <label>Reason Category <span className="required">*</span><select className="input" value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)}>{reasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
        <label className="erp-field-span-3">Explanation / Reference <span className="required">*</span><textarea className="input" minLength={5} required rows={3} placeholder="Physical count, document number or authorised reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}/></label>
      </div>
      <div className="adjustment-preview"><span>Posting</span><strong className={form.direction === 'IN' ? 'gain-text' : 'loss-text'}>{form.direction === 'IN' ? '+' : '−'} {Number(form.quantity || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 })} {selected?.unit || ''}</strong><span>{selected ? `to ${selected.item_name}` : 'Select an item'}</span></div>
    </section>
    <div className="erp-sticky-actions"><button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}><ArrowLeft size={16}/> Cancel</button><button className="btn btn-primary" disabled={saving || !form.item_id}><Save size={16}/>{saving ? 'Posting…' : 'Post Adjustment'}</button></div>
  </form>;
};
