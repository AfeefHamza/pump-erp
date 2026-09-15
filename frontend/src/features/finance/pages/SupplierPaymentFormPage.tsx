import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, WandSparkles } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { createSupplierPayment, fetchPaymentAccountOptions, fetchSupplierOpenBills, fetchSuppliers } from '@/api/client';
import type { Supplier } from '@/features/purchases/types';
import type { OpenPurchaseBill, PaymentAccount, SupplierPaymentInput, SupplierPaymentMethod } from '@/features/finance/types';

const money = (value: number | string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
const today = () => new Date().toISOString().slice(0, 10);

export const SupplierPaymentFormPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselectedBillId = params.get('bill');
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [bills, setBills] = useState<OpenPurchaseBill[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    supplier_id: params.get('supplier') || '', payment_account_id: '', payment_date: today(), amount: '',
    payment_method: 'bank_transfer' as SupplierPaymentMethod, reference_number: '', cheque_number: '', cheque_date: '', notes: '',
  });
  const [clientRequestId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!orgId || !outletId) return;
    Promise.all([fetchSuppliers(orgId), fetchPaymentAccountOptions(orgId, outletId)]).then(([supplierRows, accountRows]) => {
      setSuppliers(supplierRows.filter((row) => row.is_active)); setAccounts(accountRows);
    }).catch((err: any) => setError(err?.data?.detail || err.message));
  }, [orgId, outletId]);

  useEffect(() => {
    if (!orgId || !outletId || !form.supplier_id) { setBills([]); setAllocations({}); return; }
    fetchSupplierOpenBills(orgId, outletId, form.supplier_id).then((rows) => {
      setBills(rows);
      if (preselectedBillId) {
        const bill = rows.find((row) => row.id === preselectedBillId);
        if (bill) setAllocations({ [bill.id]: bill.outstanding_amount });
      }
    }).catch((err: any) => setError(err?.data?.detail || err.message));
  }, [orgId, outletId, form.supplier_id, preselectedBillId]);

  const compatibleAccounts = accounts.filter((account) => form.payment_method === 'cash' ? account.account_type === 'cash' : form.payment_method === 'other' || account.account_type === 'bank');
  const allocated = useMemo(() => Object.values(allocations).reduce((sum, value) => sum + (Number(value) || 0), 0), [allocations]);
  const amount = Number(form.amount) || 0;
  const unallocated = Math.max(0, amount - allocated);

  const autoAllocate = () => {
    let remaining = amount;
    const next: Record<string, string> = {};
    for (const bill of bills) {
      if (remaining <= 0) break;
      const value = Math.min(remaining, Number(bill.outstanding_amount));
      if (value > 0) next[bill.id] = value.toFixed(2);
      remaining = Number((remaining - value).toFixed(2));
    }
    setAllocations(next);
  };

  const setMethod = (method: SupplierPaymentMethod) => {
    setForm({ ...form, payment_method: method, payment_account_id: '' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || !outletId) return;
    if (allocated > amount) { setError('Allocated amount cannot exceed the payment amount.'); return; }
    const payload: SupplierPaymentInput = {
      ...form,
      client_request_id: clientRequestId,
      cheque_date: form.cheque_date || null,
      allocations: Object.entries(allocations).filter(([, value]) => Number(value) > 0).map(([purchase_bill_id, allocationAmount]) => ({ purchase_bill_id, amount: Number(allocationAmount).toFixed(2) })),
    };
    setSaving(true); setError(null);
    try {
      const payment = await createSupplierPayment(orgId, outletId, payload);
      navigate(`/app/purchases/supplier-payments/${payment.id}`);
    } catch (err: any) {
      const details = err?.data;
      setError(details?.detail || (details && Object.values(details).flat().join(' ')) || err.message || 'Failed to save payment.');
    } finally { setSaving(false); }
  };

  if (!orgId || !outletId) return <div className="card" style={{ margin: 24, padding: 32 }}>Select an organisation and outlet before recording a payment.</div>;

  return <form onSubmit={submit} style={{ maxWidth: 1500, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Record Supplier Payment" subtitle="Record the money movement and allocate it against open Purchase Bills." actions={<button type="button" className="btn btn-secondary" onClick={() => navigate('/app/purchases/supplier-payments')}><ArrowLeft size={16}/> Back</button>}/>
    {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(300px,0.8fr)', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 20 }}>
        <section className="card" style={{ padding: 22 }}><h3 style={{ marginTop: 0 }}>Payment Details</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}>
          <label>Supplier<select className="input" required value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} ({supplier.code})</option>)}</select></label>
          <label>Payment Date<input className="input" type="date" required value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })}/></label>
          <label>Amount<input className="input" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}/></label>
          <label>Payment Method<select className="input" value={form.payment_method} onChange={(e) => setMethod(e.target.value as SupplierPaymentMethod)}><option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option><option value="upi">UPI</option><option value="other">Other</option></select></label>
          <label>Payment Account<select className="input" required value={form.payment_account_id} onChange={(e) => setForm({ ...form, payment_account_id: e.target.value })}><option value="">Select account</option>{compatibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {money(account.current_balance)}</option>)}</select></label>
          {(form.payment_method === 'bank_transfer' || form.payment_method === 'upi') && <label>Reference Number<input className="input" required value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })}/></label>}
          {form.payment_method === 'cheque' && <><label>Cheque Number<input className="input" required value={form.cheque_number} onChange={(e) => setForm({ ...form, cheque_number: e.target.value })}/></label><label>Cheque Date<input className="input" type="date" required value={form.cheque_date} onChange={(e) => setForm({ ...form, cheque_date: e.target.value })}/></label></>}
          <label style={{ gridColumn: '1 / -1' }}>Notes<textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label>
        </div></section>
        <section className="card" style={{ overflow: 'hidden' }}><div style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><h3 style={{ margin: 0 }}>Open Purchase Bills</h3><div className="text-muted">Allocate now or retain the balance as a supplier advance.</div></div><div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn btn-secondary" onClick={() => setAllocations({})}>Clear</button><button type="button" className="btn btn-secondary" disabled={amount <= 0} onClick={autoAllocate}><WandSparkles size={16}/> Auto Allocate</button></div></div>
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Bill</th><th>Invoice Date</th><th>Due Date</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Outstanding</th><th style={{ width: 180 }}>Allocate</th></tr></thead><tbody>{!form.supplier_id ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 36 }}>Select a supplier to view open bills.</td></tr> : bills.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 36 }}>No open Purchase Bills.</td></tr> : bills.map((bill) => <tr key={bill.id}><td><strong>{bill.bill_number}</strong><div className="text-muted">{bill.supplier_invoice_number}</div></td><td>{bill.invoice_date}</td><td>{bill.due_date}</td><td style={{ textAlign: 'right' }}>{money(bill.grand_total)}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(bill.outstanding_amount)}</td><td><input aria-label={`Allocate ${bill.bill_number}`} className="input" type="number" min="0" step="0.01" max={Math.min(amount, Number(bill.outstanding_amount))} value={allocations[bill.id] || ''} onChange={(e) => setAllocations({ ...allocations, [bill.id]: e.target.value })}/></td></tr>)}</tbody></table></div>
        </section>
      </div>
      <aside className="card" style={{ padding: 22, position: 'sticky', top: 20 }}><h3 style={{ marginTop: 0 }}>Payment Summary</h3>{[['Payment Amount', money(amount)], ['Allocated', money(allocated)], ['Supplier Advance', money(unallocated)], ['Bills Selected', String(Object.values(allocations).filter((value) => Number(value) > 0).length)]].map(([label, value]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}><span className="text-muted">{label}</span><strong>{value}</strong></div>)}
        {allocated > amount && <div className="alert alert-error" style={{ marginTop: 14 }}>Allocations exceed the payment amount.</div>}
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 20 }} disabled={saving || amount <= 0 || allocated > amount || !form.supplier_id || !form.payment_account_id}><CheckCircle2 size={17}/>{saving ? ' Saving Payment…' : ' Save Payment'}</button>
      </aside>
    </div>
  </form>;
};
