import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { SearchableCombobox, type ComboboxOption } from '@/components/forms/SearchableCombobox';
import { createSalesInvoice, fetchCustomers, fetchPaymentAccountOptions, fetchSalesPreparation, fetchUnbilledCreditSlips, type Customer } from '@/api/client';
import type { PaymentAccount } from '@/features/finance/types';
import type { SalesPreparation, UnbilledCreditSlip } from '@/features/sales/types';

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number | string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(value || 0));
type DraftLine = { key: string; source: 'item' | 'credit_slip'; item_id?: string; credit_slip_id?: string; quantity: string; unit_price: string; discount_amount: string; tax_treatment_id?: string; tax_inclusive: boolean };
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
  const [form, setForm] = useState({ invoice_type: 'cash' as 'cash' | 'credit', customer_id: '', invoice_date: today(), due_date: today(), payment_account_id: '', payment_method: 'cash', payment_reference: '', notes: '' });

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

  const customerOptions: ComboboxOption[] = useMemo(() => customers.map((customer) => ({ id: customer.id, label: customer.display_name, subLabel: `${customer.customer_code}${customer.phone_number ? ` · ${customer.phone_number}` : ''}`, tags: [customer.customer_code, customer.display_name, customer.phone_number || ''] })), [customers]);
  const itemOptions: ComboboxOption[] = useMemo(() => preparation.items.map((item) => ({ id: item.id, label: item.name, subLabel: `${item.code} · ${item.item_type.replaceAll('_', ' ')} · ${item.unit}${item.hsn_sac ? ` · HSN/SAC ${item.hsn_sac}` : ''}`, tags: [item.code, item.name, item.item_type, item.hsn_sac || ''] })), [preparation.items]);
  const updateLine = (key: string, patch: Partial<DraftLine>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  const chooseItem = (line: DraftLine, itemId: string) => { const item = preparation.items.find((row) => row.id === itemId); updateLine(line.key, { item_id: itemId, tax_treatment_id: item?.tax_treatment_id || '' }); };
  const addSlip = (slip: UnbilledCreditSlip) => {
    if (lines.some((line) => line.credit_slip_id === slip.id)) return;
    setForm((value) => ({ ...value, invoice_type: 'credit' }));
    setLines((current) => [...current.filter((line) => line.item_id || line.credit_slip_id), { key: crypto.randomUUID(), source: 'credit_slip', credit_slip_id: slip.id, quantity: slip.quantity, unit_price: slip.unit_price, discount_amount: '0', tax_inclusive: true }]);
  };
  const enteredValue = useMemo(() => lines.reduce((total, line) => total + Math.max(0, Number(line.quantity || 0) * Number(line.unit_price || 0) - Number(line.discount_amount || 0)), 0), [lines]);
  const validLineCount = lines.filter((line) => line.item_id || line.credit_slip_id).length;
  const compatibleAccounts = accounts.filter((account) => form.payment_method === 'cash' ? account.account_type === 'cash' : account.account_type === 'bank');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || !outletId) return;
    const validLines = lines.filter((line) => line.item_id || line.credit_slip_id);
    if (!validLines.length) { setError('Add at least one item or Credit Slip.'); return; }
    setSaving(true); setError(null);
    try {
      const invoice = await createSalesInvoice(orgId, outletId, {
        client_request_id: clientRequestId, customer_id: form.customer_id || null, invoice_date: form.invoice_date, due_date: form.due_date || null,
        invoice_type: form.invoice_type, payment_account_id: form.invoice_type === 'cash' ? form.payment_account_id : null,
        payment_method: form.invoice_type === 'cash' ? form.payment_method : '', payment_reference: form.invoice_type === 'cash' ? form.payment_reference : '', notes: form.notes,
        lines: validLines.map((line) => line.source === 'credit_slip' ? { credit_slip_id: line.credit_slip_id } : { item_id: line.item_id, quantity: line.quantity, unit_price: line.unit_price, discount_amount: line.discount_amount || '0', tax_treatment_id: line.tax_treatment_id || null, tax_inclusive: line.tax_inclusive }),
      });
      navigate(`/app/sales/invoices/${invoice.id}`, { replace: true });
    } catch (err: any) { setError(err.message || 'Could not save Sales Invoice.'); setSaving(false); }
  };

  return <form onSubmit={submit} className="erp-document-page">
    <div className="erp-document-toolbar">
      <div className="erp-document-title-group"><button type="button" className="btn-icon" aria-label="Back to Sales Invoices" onClick={() => navigate('/app/sales/invoices')}><ArrowLeft size={19}/></button><div><h1>New Sales Invoice</h1><p>Products, services and recorded fuel Credit Slips</p></div></div>
      <div className="erp-document-actions"><span className="erp-document-status"><span/> New invoice</span><button type="button" className="btn btn-secondary" onClick={() => navigate('/app/sales/invoices')}>Cancel</button><button className="btn btn-primary" disabled={saving || (form.invoice_type === 'credit' && !form.customer_id) || (form.invoice_type === 'cash' && !form.payment_account_id)}><CheckCircle2 size={17}/>{saving ? 'Saving…' : 'Save Invoice'}</button></div>
    </div>
    {error && <div className="alert alert-danger">{error}</div>}

    <section className="erp-document-card erp-document-header-card">
      <div className="erp-section-heading"><div><span className="erp-section-kicker">Invoice details</span><h2>Customer and document information</h2></div><ReceiptText size={22}/></div>
      <div className="erp-form-grid erp-form-grid-4">
        <label>Sale Type<select className="input" value={form.invoice_type} onChange={(e) => setForm({ ...form, invoice_type: e.target.value as 'cash' | 'credit', payment_account_id: '' })}><option value="cash">Cash Sale</option><option value="credit">Credit Sale</option></select></label>
        <label className="erp-field-span-2">Customer {form.invoice_type === 'credit' && <span className="required">*</span>}<SearchableCombobox ariaLabel="Customer" value={form.customer_id} options={customerOptions} placeholder="Cash customer or search by name / code" onChange={(customer_id) => setForm({ ...form, customer_id })}/></label>
        <label>Invoice Date<input className="input" type="date" required value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}/></label>
        <label>Due Date<input className="input" type="date" required value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}/></label>
        <label className="erp-field-span-3">Reference / Notes<input className="input" placeholder="Optional order number, vehicle or internal note" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label>
      </div>
    </section>

    <section className="erp-document-card erp-line-card">
      <div className="erp-section-heading erp-line-heading"><div><span className="erp-section-kicker">Line items</span><h2>Products and services</h2><p>Fuel sales recorded at the meter are billed from Credit Slips below.</p></div><button type="button" className="btn btn-secondary" onClick={() => setLines([...lines, blankLine()])}><Plus size={16}/> Add Row</button></div>
      <div className="erp-line-table-wrap"><table className="erp-line-table"><thead><tr><th>#</th><th>Item / Service</th><th>Stock</th><th className="number">Qty</th><th className="number">Rate</th><th className="number">Discount</th><th>Tax Treatment</th><th>Incl.</th><th className="number">Amount</th><th/></tr></thead><tbody>{lines.map((line, index) => {
        if (line.source === 'credit_slip') { const slip = slips.find((row) => row.id === line.credit_slip_id); return <tr key={line.key}><td>{index + 1}</td><td><strong>{slip?.product_name || 'Fuel Credit Slip'}</strong><small>{slip?.slip_number} · Meter sale</small></td><td>Recorded</td><td className="number">{line.quantity}</td><td className="number">{money(line.unit_price)}</td><td className="number">—</td><td><span className="badge badge-info">Non-GST Petroleum</span></td><td>Yes</td><td className="number"><strong>{money(Number(line.quantity) * Number(line.unit_price))}</strong></td><td><button type="button" className="btn-icon" aria-label="Remove line" onClick={() => setLines(lines.filter((row) => row.key !== line.key))}><Trash2 size={16}/></button></td></tr>; }
        const item = preparation.items.find((row) => row.id === line.item_id); const lineAmount = Math.max(0, Number(line.quantity || 0) * Number(line.unit_price || 0) - Number(line.discount_amount || 0));
        return <tr key={line.key}><td>{index + 1}</td><td><SearchableCombobox ariaLabel={`Item ${index + 1}`} value={line.item_id || ''} options={itemOptions} placeholder="Search item name, code or HSN" onChange={(itemId) => chooseItem(line, itemId)}/></td><td>{item?.available_quantity == null ? <span className="text-muted">Not tracked</span> : <><strong>{item.available_quantity}</strong><small>{item.unit} available</small></>}</td><td><input aria-label={`Quantity ${index + 1}`} className="input number-input" type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })}/></td><td><input aria-label={`Unit price ${index + 1}`} className="input number-input" type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}/></td><td><input aria-label={`Discount ${index + 1}`} className="input number-input" type="number" min="0" step="0.01" value={line.discount_amount} onChange={(e) => updateLine(line.key, { discount_amount: e.target.value })}/></td><td><select aria-label={`Tax Treatment ${index + 1}`} className="input" value={line.tax_treatment_id || ''} onChange={(e) => updateLine(line.key, { tax_treatment_id: e.target.value })}><option value="">Select treatment</option>{preparation.tax_treatments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></td><td className="checkbox-cell"><input aria-label={`Tax inclusive ${index + 1}`} type="checkbox" checked={line.tax_inclusive} onChange={(e) => updateLine(line.key, { tax_inclusive: e.target.checked })}/></td><td className="number"><strong>{money(lineAmount)}</strong></td><td><button type="button" className="btn-icon" aria-label="Remove line" onClick={() => setLines(lines.filter((row) => row.key !== line.key))}><Trash2 size={16}/></button></td></tr>;
      })}</tbody></table></div>
      <button type="button" className="erp-add-line" onClick={() => setLines([...lines, blankLine()])}><Plus size={15}/> Add another line</button>
    </section>

    {form.customer_id && <section className="erp-document-card erp-credit-slip-card"><div className="erp-section-heading"><div><span className="erp-section-kicker">Recorded meter sales</span><h2>Unbilled Fuel Credit Slips</h2><p>Billing a slip does not create another tank-stock movement.</p></div><FileText size={22}/></div><div className="erp-line-table-wrap"><table className="data-table"><thead><tr><th>Slip</th><th>Product / Vehicle</th><th>Quantity</th><th className="number">Amount</th><th/></tr></thead><tbody>{slips.length === 0 ? <tr><td colSpan={5} className="erp-empty-cell">No unbilled Credit Slips for this customer.</td></tr> : slips.map((slip) => <tr key={slip.id}><td><strong>{slip.slip_number}</strong><small>{new Date(slip.occurred_at).toLocaleString()}</small></td><td>{slip.product_name}<small>{slip.vehicle_number || 'No vehicle'}</small></td><td>{slip.quantity}</td><td className="number"><strong>{money(slip.amount)}</strong></td><td><button type="button" className="btn btn-secondary btn-sm" disabled={lines.some((line) => line.credit_slip_id === slip.id)} onClick={() => addSlip(slip)}>Add to invoice</button></td></tr>)}</tbody></table></div></section>}

    <div className="erp-document-bottom-grid">
      <section className="erp-document-card"><div className="erp-section-heading"><div><span className="erp-section-kicker">Settlement</span><h2>{form.invoice_type === 'cash' ? 'Receive payment' : 'Credit terms'}</h2></div></div>{form.invoice_type === 'cash' ? <div className="erp-form-grid erp-form-grid-3"><label>Payment Method<select className="input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value, payment_account_id: '' })}><option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option><option value="upi">UPI</option><option value="card">Card</option></select></label><label>Deposit Account <span className="required">*</span><select className="input" required value={form.payment_account_id} onChange={(e) => setForm({ ...form, payment_account_id: e.target.value })}><option value="">Select account</option>{compatibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Payment Reference<input className="input" placeholder="Optional UTR / reference" value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })}/></label></div> : <p className="text-muted">The invoice will be posted to the selected customer’s outstanding balance and tracked until receipt.</p>}</section>
      <aside className="erp-document-card erp-total-card"><div><span>Entered subtotal</span><strong>{money(enteredValue)}</strong></div><div><span>Invoice lines</span><strong>{validLineCount}</strong></div><p>Final GST, petroleum components and rounding are calculated and locked by the server when saved.</p><div className="erp-grand-total"><span>Preview total</span><strong>{money(enteredValue)}</strong></div></aside>
    </div>

    <div className="erp-sticky-actions"><div><strong>{validLineCount} line{validLineCount === 1 ? '' : 's'}</strong><span> · Server totals will be authoritative</span></div><div><button type="button" className="btn btn-secondary" onClick={() => navigate('/app/sales/invoices')}>Cancel</button><button className="btn btn-primary" disabled={saving || (form.invoice_type === 'credit' && !form.customer_id) || (form.invoice_type === 'cash' && !form.payment_account_id)}><CheckCircle2 size={17}/>{saving ? 'Saving Invoice…' : 'Save Sales Invoice'}</button></div></div>
  </form>;
};
