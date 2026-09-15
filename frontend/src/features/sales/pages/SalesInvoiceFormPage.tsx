import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { createSalesInvoice, fetchCustomers, fetchPaymentAccountOptions, fetchSalesPreparation, fetchUnbilledCreditSlips, type Customer } from '@/api/client';
import type { PaymentAccount } from '@/features/finance/types';
import type { SalesPreparation, UnbilledCreditSlip } from '@/features/sales/types';

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number | string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
type DraftLine = { key: string; source: 'item'|'credit_slip'; item_id?: string; credit_slip_id?: string; quantity: string; unit_price: string; discount_amount: string; tax_treatment_id?: string; tax_inclusive: boolean };
const blankLine = (): DraftLine => ({ key: crypto.randomUUID(), source: 'item', item_id: '', quantity: '1', unit_price: '', discount_amount: '0', tax_treatment_id: '', tax_inclusive: false });

export const SalesInvoiceFormPage: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [preparation, setPreparation] = useState<SalesPreparation>({ items: [], tax_treatments: [] });
  const [slips, setSlips] = useState<UnbilledCreditSlip[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ invoice_type: 'cash' as 'cash'|'credit', customer_id: '', invoice_date: today(), due_date: today(), payment_account_id: '', payment_method: 'cash', payment_reference: '', notes: '' });

  useEffect(() => {
    if (!orgId || !outletId) return;
    Promise.all([fetchCustomers(orgId, { status: 'active' }), fetchPaymentAccountOptions(orgId, outletId), fetchSalesPreparation(orgId, outletId, form.invoice_date)])
      .then(([customerRows, accountRows, prep]) => { setCustomers(customerRows); setAccounts(accountRows); setPreparation(prep); })
      .catch((err) => setError(err.message || 'Could not prepare the invoice.'));
  }, [orgId, outletId, form.invoice_date]);

  useEffect(() => {
    if (!orgId || !outletId || !form.customer_id) { setSlips([]); return; }
    fetchUnbilledCreditSlips(orgId, outletId, form.customer_id).then(setSlips).catch((err) => setError(err.message));
  }, [orgId, outletId, form.customer_id]);

  const updateLine = (key: string, patch: Partial<DraftLine>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  const chooseItem = (line: DraftLine, itemId: string) => {
    const item = preparation.items.find((row) => row.id === itemId);
    updateLine(line.key, { item_id: itemId, tax_treatment_id: item?.tax_treatment_id || '' });
  };
  const addSlip = (slip: UnbilledCreditSlip) => {
    if (lines.some((line) => line.credit_slip_id === slip.id)) return;
    setForm((value) => ({ ...value, invoice_type: 'credit' }));
    setLines((current) => [...current.filter((line) => line.item_id || line.credit_slip_id), { key: crypto.randomUUID(), source: 'credit_slip', credit_slip_id: slip.id, quantity: slip.quantity, unit_price: slip.unit_price, discount_amount: '0', tax_inclusive: true }]);
  };
  const estimates = useMemo(() => lines.reduce((acc, line) => {
    const base = Number(line.quantity || 0) * Number(line.unit_price || 0) - Number(line.discount_amount || 0);
    const treatment = preparation.tax_treatments.find((row) => row.id === line.tax_treatment_id);
    // Server is authoritative. The client only previews known zero/non-GST lines here.
    return acc + Math.max(0, base) + (treatment?.tax_regime === 'gst' && !line.tax_inclusive ? 0 : 0);
  }, 0), [lines, preparation]);
  const compatibleAccounts = accounts.filter((account) => form.payment_method === 'cash' ? account.account_type === 'cash' : account.account_type === 'bank');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || !outletId) return;
    const validLines = lines.filter((line) => line.item_id || line.credit_slip_id);
    if (!validLines.length) { setError('Add at least one item or Credit Slip.'); return; }
    setSaving(true); setError(null);
    try {
      const invoice = await createSalesInvoice(orgId, outletId, {
        client_request_id: clientRequestId,
        customer_id: form.customer_id || null,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        invoice_type: form.invoice_type,
        payment_account_id: form.invoice_type === 'cash' ? form.payment_account_id : null,
        payment_method: form.invoice_type === 'cash' ? form.payment_method : '',
        payment_reference: form.invoice_type === 'cash' ? form.payment_reference : '',
        notes: form.notes,
        lines: validLines.map((line) => line.source === 'credit_slip' ? { credit_slip_id: line.credit_slip_id } : {
          item_id: line.item_id, quantity: line.quantity, unit_price: line.unit_price,
          discount_amount: line.discount_amount || '0', tax_treatment_id: line.tax_treatment_id || null,
          tax_inclusive: line.tax_inclusive,
        }),
      });
      navigate(`/app/sales/invoices/${invoice.id}`);
    } catch (err: any) { setError(err.message || 'Could not save Sales Invoice.'); setSaving(false); }
  };

  return <form onSubmit={submit} style={{ maxWidth: 1600, margin: '0 auto', padding: '1.5rem' }}>
    <button type="button" className="btn btn-ghost" onClick={() => navigate('/app/sales/invoices')}><ArrowLeft size={16}/> Back to Sales Invoices</button>
    <PageHeader title="New Sales Invoice" subtitle="Full-page ERP entry for products, services and previously recorded fuel Credit Slips."/>
    {error && <div className="alert alert-error">{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 18 }}>
        <section className="card" style={{ padding: 20 }}><h3 style={{ marginTop: 0 }}>Invoice Details</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
          <label>Sale Type<select className="input" value={form.invoice_type} onChange={(e) => setForm({ ...form, invoice_type: e.target.value as 'cash'|'credit', payment_account_id: '' })}><option value="cash">Cash Sale</option><option value="credit">Credit Sale</option></select></label>
          <label>Invoice Date<input className="input" type="date" required value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}/></label>
          <label>Due Date<input className="input" type="date" required value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}/></label>
          <label style={{ gridColumn: 'span 2' }}>Customer {form.invoice_type === 'credit' && '*'}<select className="input" required={form.invoice_type === 'credit'} value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}><option value="">Cash Customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.display_name} ({customer.customer_code})</option>)}</select></label>
          <label>Notes<input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label>
        </div></section>

        <section className="card" style={{ overflow: 'hidden' }}><div style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div><h3 style={{ margin: 0 }}>Products & Services</h3><div className="text-muted">Fuel is billed from Credit Slips below; it cannot be entered manually.</div></div><button type="button" className="btn btn-secondary" onClick={() => setLines([...lines, blankLine()])}><Plus size={16}/> Add Row</button></div>
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th style={{ minWidth: 250 }}>Item</th><th>Available</th><th>Qty</th><th>Rate</th><th>Discount</th><th style={{ minWidth: 180 }}>Tax Treatment</th><th>Inclusive</th><th></th></tr></thead><tbody>{lines.map((line) => {
            if (line.source === 'credit_slip') { const slip = slips.find((row) => row.id === line.credit_slip_id); return <tr key={line.key}><td><strong>{slip?.product_name || 'Fuel Credit Slip'}</strong><div className="text-muted">{slip?.slip_number}</div></td><td>Meter sale</td><td>{line.quantity}</td><td>{money(line.unit_price)}</td><td>—</td><td>Non-GST Petroleum</td><td>Yes</td><td><button type="button" className="btn btn-ghost" aria-label="Remove line" onClick={() => setLines(lines.filter((row) => row.key !== line.key))}><Trash2 size={16}/></button></td></tr>; }
            const item = preparation.items.find((row) => row.id === line.item_id);
            return <tr key={line.key}><td><select aria-label="Item" className="input" value={line.item_id} onChange={(e) => chooseItem(line, e.target.value)}><option value="">Select item</option>{preparation.items.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.code})</option>)}</select></td><td>{item?.available_quantity == null ? 'Not tracked' : `${item.available_quantity} ${item.unit}`}</td><td><input aria-label="Quantity" className="input" style={{ width: 100 }} type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })}/></td><td><input aria-label="Unit price" className="input" style={{ width: 120 }} type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}/></td><td><input aria-label="Discount" className="input" style={{ width: 110 }} type="number" min="0" step="0.01" value={line.discount_amount} onChange={(e) => updateLine(line.key, { discount_amount: e.target.value })}/></td><td><select aria-label="Tax Treatment" className="input" value={line.tax_treatment_id || ''} onChange={(e) => updateLine(line.key, { tax_treatment_id: e.target.value })}><option value="">Select treatment</option>{preparation.tax_treatments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></td><td><input aria-label="Tax inclusive" type="checkbox" checked={line.tax_inclusive} onChange={(e) => updateLine(line.key, { tax_inclusive: e.target.checked })}/></td><td><button type="button" className="btn btn-ghost" aria-label="Remove line" onClick={() => setLines(lines.filter((row) => row.key !== line.key))}><Trash2 size={16}/></button></td></tr>;
          })}</tbody></table></div>
        </section>

        {form.customer_id && <section className="card" style={{ overflow: 'hidden' }}><div style={{ padding: 20 }}><h3 style={{ margin: 0 }}>Unbilled Fuel Credit Slips</h3><div className="text-muted">Add slips already recorded from meter sales. No additional tank stock movement is created.</div></div><div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Slip</th><th>Product / Vehicle</th><th>Quantity</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead><tbody>{slips.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 28 }}>No unbilled Credit Slips for this customer.</td></tr> : slips.map((slip) => <tr key={slip.id}><td><strong>{slip.slip_number}</strong><div className="text-muted">{new Date(slip.occurred_at).toLocaleString()}</div></td><td>{slip.product_name}<div className="text-muted">{slip.vehicle_number || 'No vehicle'}</div></td><td>{slip.quantity}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(slip.amount)}</td><td><button type="button" className="btn btn-secondary" disabled={lines.some((line) => line.credit_slip_id === slip.id)} onClick={() => addSlip(slip)}>Add</button></td></tr>)}</tbody></table></div></section>}
      </div>

      <aside className="card" style={{ padding: 20, position: 'sticky', top: 20 }}><h3 style={{ marginTop: 0 }}>Invoice Summary</h3><div className="text-muted" style={{ marginBottom: 14 }}>The server calculates and locks the final GST and totals when saved.</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}><span>Entered value</span><strong>{money(estimates)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}><span>Lines</span><strong>{lines.filter((line) => line.item_id || line.credit_slip_id).length}</strong></div>
        {form.invoice_type === 'cash' && <div style={{ display: 'grid', gap: 12, marginTop: 14 }}><label>Payment Method<select className="input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value, payment_account_id: '' })}><option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option><option value="upi">UPI</option><option value="card">Card</option></select></label><label>Deposit Account<select className="input" required value={form.payment_account_id} onChange={(e) => setForm({ ...form, payment_account_id: e.target.value })}><option value="">Select account</option>{compatibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Reference<input className="input" value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })}/></label></div>}
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 20 }} disabled={saving || (form.invoice_type === 'credit' && !form.customer_id) || (form.invoice_type === 'cash' && !form.payment_account_id)}><CheckCircle2 size={17}/>{saving ? ' Saving Invoice…' : ' Save Sales Invoice'}</button>
      </aside>
    </div>
  </form>;
};
