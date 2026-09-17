import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Save, Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { createCustomer, fetchCustomer, updateCustomer, type Customer, type OutletResponse } from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';

const emptyForm = {
  customer_code: '', display_name: '', customer_type: 'business', phone_number: '', alternate_phone_number: '',
  email: '', billing_address: '', GSTIN: '', credit_limit: '', credit_days: '', status: 'active', notes: '', outlet_ids: [] as string[],
};

export const CustomerFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const userOrgs = useAppSelector((state) => state.auth.currentUser?.organisations);
  const outlets: OutletResponse[] = useMemo(() => userOrgs?.find((org: any) => org.id === orgId)?.outlets || [], [userOrgs, orgId]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(Boolean(customerId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !customerId) return;
    fetchCustomer(orgId, customerId).then((customer) => setForm({
      customer_code: customer.customer_code || '', display_name: customer.display_name || '', customer_type: customer.customer_type || 'business',
      phone_number: customer.phone_number || '', alternate_phone_number: customer.alternate_phone_number || '', email: customer.email || '',
      billing_address: customer.billing_address || '', GSTIN: customer.GSTIN || '', credit_limit: customer.credit_limit ? String(customer.credit_limit) : '',
      credit_days: customer.credit_days != null ? String(customer.credit_days) : '', status: customer.status || 'active', notes: customer.notes || '',
      outlet_ids: customer.assigned_outlets?.map((outlet) => outlet.id) || [],
    })).catch((err) => setError(err.message || 'Failed to load customer.')).finally(() => setLoading(false));
  }, [orgId, customerId]);

  const update = (field: string, value: any) => setForm((current) => ({ ...current, [field]: value }));
  const toggleOutlet = (id: string) => update('outlet_ids', form.outlet_ids.includes(id) ? form.outlet_ids.filter((item) => item !== id) : [...form.outlet_ids, id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId) return;
    setSaving(true); setError(null);
    const payload: Partial<Customer> & { outlet_ids?: string[] } = {
      customer_code: form.customer_code.trim().toUpperCase(), display_name: form.display_name.trim(), customer_type: form.customer_type as Customer['customer_type'],
      phone_number: form.phone_number.trim() || null, alternate_phone_number: form.alternate_phone_number.trim() || null, email: form.email.trim() || null,
      billing_address: form.billing_address.trim() || null, GSTIN: form.GSTIN.trim().toUpperCase() || null,
      credit_limit: form.credit_limit || null, credit_days: form.credit_days ? Number(form.credit_days) : null, status: form.status as Customer['status'],
      notes: form.notes.trim() || null, outlet_ids: form.outlet_ids.length ? form.outlet_ids : undefined,
    };
    try {
      const saved = customerId ? await updateCustomer(orgId, customerId, payload) : await createCustomer(orgId, payload);
      navigate(`/app/sales/customers/${saved.id}`, { replace: true });
    } catch (err: any) { setError(err.message || 'Failed to save customer.'); } finally { setSaving(false); }
  };

  if (loading) return <div className="erp-page"><div className="erp-document-card erp-loading-state">Loading customer…</div></div>;
  return <form className="erp-page erp-master-form-page" onSubmit={submit}>
    <PageHeader title={customerId ? 'Edit Customer' : 'New Customer'} subtitle="Create and maintain the customer master record, contacts and credit terms." backLink={{ to: customerId ? `/app/sales/customers/${customerId}` : '/app/sales/customers', label: 'Back to Customers' }}/>
    {error && <div className="alert alert-danger"><AlertCircle size={17}/>{error}</div>}
    <section className="erp-document-card">
      <div className="erp-section-heading"><div><span className="erp-section-kicker">Customer master</span><h2>Identity & Classification</h2><p>Core details used throughout credit slips, invoices and receipts.</p></div><Users size={22}/></div>
      <div className="erp-form-grid">
        <label>Customer Code <span className="required">*</span><input className="input" required disabled={Boolean(customerId)} value={form.customer_code} onChange={(e) => update('customer_code', e.target.value.toUpperCase())} placeholder="CUST-001"/></label>
        <label className="erp-field-span-2">Display Name <span className="required">*</span><input className="input" required value={form.display_name} onChange={(e) => update('display_name', e.target.value)} placeholder="Customer or business name"/></label>
        <label>Customer Type<select className="input" value={form.customer_type} onChange={(e) => update('customer_type', e.target.value)}><option value="business">Business / Corporate</option><option value="individual">Individual</option><option value="government">Government Agency</option><option value="other">Other</option></select></label>
        <label>GSTIN<input className="input" value={form.GSTIN} onChange={(e) => update('GSTIN', e.target.value.toUpperCase())} placeholder="Optional GSTIN"/></label>
        <label>Status<select className="input" value={form.status} onChange={(e) => update('status', e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      </div>
    </section>
    <section className="erp-document-card">
      <div className="erp-section-heading"><div><span className="erp-section-kicker">Contact</span><h2>Contact & Billing</h2></div></div>
      <div className="erp-form-grid">
        <label>Phone<input className="input" value={form.phone_number} onChange={(e) => update('phone_number', e.target.value)} /></label>
        <label>Alternate Phone<input className="input" value={form.alternate_phone_number} onChange={(e) => update('alternate_phone_number', e.target.value)} /></label>
        <label>Email<input className="input" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></label>
        <label className="erp-field-span-3">Billing Address<textarea className="input" rows={3} value={form.billing_address} onChange={(e) => update('billing_address', e.target.value)} /></label>
      </div>
    </section>
    <section className="erp-document-card">
      <div className="erp-section-heading"><div><span className="erp-section-kicker">Commercial terms</span><h2>Credit Control</h2><p>Leave credit limit empty when no fixed limit is enforced.</p></div></div>
      <div className="erp-form-grid">
        <label>Credit Limit (₹)<input className="input number-input" type="number" min="0" step="0.01" value={form.credit_limit} onChange={(e) => update('credit_limit', e.target.value)} /></label>
        <label>Credit Days<input className="input number-input" type="number" min="0" step="1" value={form.credit_days} onChange={(e) => update('credit_days', e.target.value)} /></label>
        <label className="erp-field-span-2">Internal Notes<textarea className="input" rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} /></label>
      </div>
      {outlets.length > 1 && <div className="erp-checkbox-grid"><strong>Authorised outlets</strong><small>Leave all unchecked to allow every outlet.</small>{outlets.map((outlet) => <label key={outlet.id}><input type="checkbox" checked={form.outlet_ids.includes(outlet.id)} onChange={() => toggleOutlet(outlet.id)}/>{outlet.name}</label>)}</div>}
    </section>
    <div className="erp-sticky-actions"><button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}><ArrowLeft size={16}/> Cancel</button><button className="btn btn-primary" disabled={saving}><Save size={16}/>{saving ? 'Saving…' : 'Save Customer'}</button></div>
  </form>;
};
