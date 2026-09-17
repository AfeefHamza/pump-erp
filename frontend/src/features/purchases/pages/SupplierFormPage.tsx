import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Briefcase, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { createSupplier, fetchSupplier, updateSupplier } from '@/api/client';
import type { Supplier } from '@/features/purchases/types';
import { PageHeader } from '@/components/navigation/PageHeader';

const emptyForm = { code: '', name: '', contact_person: '', phone: '', email: '', tax_number: '', gstin: '', gst_registration_type: 'pending_review', state: '', state_code: '', address: '', is_active: true };

export const SupplierFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { supplierId } = useParams();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(Boolean(supplierId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !supplierId) return;
    fetchSupplier(orgId, supplierId).then((supplier) => setForm({
      code: supplier.code, name: supplier.name, contact_person: supplier.contact_person || '', phone: supplier.phone || '', email: supplier.email || '',
      tax_number: supplier.tax_number || '', gstin: supplier.gstin || '', gst_registration_type: supplier.gst_registration_type || 'pending_review',
      state: supplier.state || '', state_code: supplier.state_code || '', address: supplier.address || '', is_active: supplier.is_active,
    })).catch((err) => setError(err.message || 'Failed to load supplier.')).finally(() => setLoading(false));
  }, [orgId, supplierId]);

  const update = (field: string, value: any) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!orgId) return;
    setSaving(true); setError(null);
    const payload: Partial<Supplier> = { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim(), contact_person: form.contact_person.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null, tax_number: form.tax_number.trim() || null, gstin: form.gstin.trim().toUpperCase() || null, state: form.state.trim() || null, state_code: form.state_code.trim() || null, address: form.address.trim() || null } as Partial<Supplier>;
    try {
      await (supplierId ? updateSupplier(orgId, supplierId, payload) : createSupplier(orgId, payload));
      navigate('/app/purchases/suppliers', { replace: true });
    } catch (err: any) { setError(err.message || 'Failed to save supplier.'); } finally { setSaving(false); }
  };

  if (loading) return <div className="erp-page"><div className="erp-document-card erp-loading-state">Loading supplier…</div></div>;
  return <form className="erp-page erp-master-form-page" onSubmit={submit}>
    <PageHeader title={supplierId ? 'Edit Supplier' : 'New Supplier'} subtitle="Create and maintain the supplier master used by receipts, purchase bills and payments." backLink={{ to: '/app/purchases/suppliers', label: 'Back to Suppliers' }}/>
    {error && <div className="alert alert-danger"><AlertCircle size={17}/>{error}</div>}
    <section className="erp-document-card">
      <div className="erp-section-heading"><div><span className="erp-section-kicker">Supplier master</span><h2>Identity & Status</h2><p>Core identity used on every purchase document.</p></div><Briefcase size={22}/></div>
      <div className="erp-form-grid">
        <label>Supplier Code <span className="required">*</span><input className="input" required disabled={Boolean(supplierId)} value={form.code} onChange={(e) => update('code', e.target.value.toUpperCase())} placeholder="SUP-001"/></label>
        <label className="erp-field-span-2">Supplier Name <span className="required">*</span><input className="input" required value={form.name} onChange={(e) => update('name', e.target.value)} /></label>
        <label>Status<select className="input" value={form.is_active ? 'active' : 'inactive'} onChange={(e) => update('is_active', e.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      </div>
    </section>
    <section className="erp-document-card">
      <div className="erp-section-heading"><div><span className="erp-section-kicker">Contact</span><h2>Contact & Address</h2></div></div>
      <div className="erp-form-grid">
        <label>Contact Person<input className="input" value={form.contact_person} onChange={(e) => update('contact_person', e.target.value)} /></label>
        <label>Phone<input className="input" value={form.phone} onChange={(e) => update('phone', e.target.value)} /></label>
        <label>Email<input className="input" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></label>
        <label>State<input className="input" value={form.state} onChange={(e) => update('state', e.target.value)} /></label>
        <label>State Code<input className="input" value={form.state_code} onChange={(e) => update('state_code', e.target.value)} /></label>
        <label className="erp-field-span-3">Address<textarea className="input" rows={3} value={form.address} onChange={(e) => update('address', e.target.value)} /></label>
      </div>
    </section>
    <section className="erp-document-card">
      <div className="erp-section-heading"><div><span className="erp-section-kicker">Tax profile</span><h2>Registration Details</h2><p>Used to validate GST treatment on purchase bills.</p></div></div>
      <div className="erp-form-grid">
        <label>GST Registration<select className="input" value={form.gst_registration_type} onChange={(e) => update('gst_registration_type', e.target.value)}><option value="registered">Registered</option><option value="unregistered">Unregistered</option><option value="composition">Composition</option><option value="overseas">Overseas</option><option value="pending_review">Pending Review</option></select></label>
        <label>GSTIN<input className="input" value={form.gstin} onChange={(e) => update('gstin', e.target.value.toUpperCase())} /></label>
        <label>Tax / VAT Number<input className="input" value={form.tax_number} onChange={(e) => update('tax_number', e.target.value)} /></label>
      </div>
    </section>
    <div className="erp-sticky-actions"><button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}><ArrowLeft size={16}/> Cancel</button><button className="btn btn-primary" disabled={saving}><Save size={16}/>{saving ? 'Saving…' : 'Save Supplier'}</button></div>
  </form>;
};
