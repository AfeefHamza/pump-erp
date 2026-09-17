// frontend/src/features/purchases/pages/SuppliersPage.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { fetchSuppliers, createSupplier, updateSupplier } from '@/api/client';
import type { Supplier } from '@/features/purchases/types';
import { PageHeader } from '@/components/navigation/PageHeader';
import {
  Briefcase,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  X,
  Phone,
  Mail,
  AlertCircle
} from 'lucide-react';

export const SuppliersPage: React.FC = () => {
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    tax_number: '',
    gstin: '',
    gst_registration_type: 'pending_review' as any,
    state: '',
    state_code: '',
    address: '',
    is_active: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSuppliers(selectedOrgId);
      setSuppliers(data);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load suppliers list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedOrgId]);

  const filteredSuppliers = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.gstin && s.gstin.toLowerCase().includes(q)) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q))
    );
  }, [suppliers, search]);

  const openCreateModal = () => {
    navigate('/app/purchases/suppliers/new');
  };

  const openEditModal = (supplier: Supplier) => {
    navigate(`/app/purchases/suppliers/${supplier.id}/edit`);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    if (!formData.name.trim() || !formData.code.trim()) {
      setFormError('Supplier code and name are required.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingSupplier) {
        await updateSupplier(selectedOrgId, editingSupplier.id, formData);
      } else {
        await createSupplier(selectedOrgId, formData);
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail || err.message || 'Failed to save supplier.';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <PageHeader
        title="Suppliers"
        subtitle="Manage petroleum fuel and lubricant suppliers for purchasing and payables."
        actions={
          <button
            className="btn btn-primary"
            onClick={openCreateModal}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={16} />
            <span>Add Supplier</span>
          </button>
        }
      />

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted, #64748b)',
            }}
          />
          <input
            type="text"
            className="form-control"
            placeholder="Search suppliers by name, code, contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2.25rem', height: '38px', fontSize: '0.875rem' }}
          />
        </div>
        <div style={{ fontSize: '0.825rem', color: 'var(--text-muted, #64748b)', whiteSpace: 'nowrap' }}>
          Total Suppliers: <strong style={{ color: 'var(--text-main, #0f172a)' }}>{filteredSuppliers.length}</strong>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div
          style={{
            backgroundColor: 'var(--color-danger-bg, #fee2e2)',
            color: 'var(--color-danger-text, #b91c1c)',
            border: '1px solid rgba(185, 28, 28, 0.2)',
            borderRadius: 'var(--radius-md, 6px)',
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Suppliers Table Card */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
            Loading suppliers...
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="empty-state" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div className="empty-state-icon-wrapper" style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }}>
              <Briefcase size={36} />
            </div>
            <h3 className="empty-state-title" style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
              No suppliers found
            </h3>
            <p className="empty-state-description" style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              {search ? 'Try adjusting your search query.' : 'Create your first supplier to start recording tanker receipts.'}
            </p>
            {!search && (
              <button className="btn btn-primary" onClick={openCreateModal} style={{ marginTop: '1rem' }}>
                <Plus size={16} />
                <span>Add Supplier</span>
              </button>
            )}
          </div>
        ) : (
          <div className="data-table-container">
            <table className="table data-table">
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Code</th>
                  <th>Supplier Name</th>
                  <th>Contact Person</th>
                  <th>Contact Info</th>
                  <th>Tax / VAT No.</th>
                  <th>Address</th>
                  <th style={{ width: '100px' }}>Status</th>
                  <th style={{ width: '80px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          color: 'var(--color-accent, #0f766e)',
                          backgroundColor: 'var(--color-accent-light, #ccfbf1)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {s.code}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                      {s.name}
                    </td>
                    <td style={{ color: 'var(--text-muted, #64748b)' }}>
                      {s.contact_person || '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.8rem' }}>
                        {s.phone && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-main)' }}>
                            <Phone size={12} style={{ color: 'var(--text-muted)' }} />
                            {s.phone}
                          </span>
                        )}
                        {s.email && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                            <Mail size={12} style={{ color: 'var(--text-muted)' }} />
                            {s.email}
                          </span>
                        )}
                        {!s.phone && !s.email && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {s.tax_number || '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '200px' }}>
                      {s.address || '—'}
                    </td>
                    <td>
                      {s.is_active ? (
                        <span className="status-badge status-active" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={12} />
                          Active
                        </span>
                      ) : (
                        <span className="status-badge status-closed" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <XCircle size={12} />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => openEditModal(s)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 8px' }}
                        title="Edit Supplier"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supplier Create/Edit Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '540px',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.15))',
              marginBottom: 0,
              overflow: 'hidden',
            }}
          >
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Briefcase size={18} style={{ color: 'var(--color-accent)' }} />
                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {formError && (
                <div
                  style={{
                    backgroundColor: 'var(--color-danger-bg, #fee2e2)',
                    color: 'var(--color-danger-text, #b91c1c)',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <AlertCircle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Supplier Code <span style={{ color: 'var(--color-danger-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. ARAMCO"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Supplier Name <span style={{ color: 'var(--color-danger-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Saudi Aramco Distribution"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Contact Person</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Ahmed Ali"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Phone Number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="+966 50 123 4567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="orders@supplier.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tax / VAT Number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="300123456700003"
                    value={formData.tax_number}
                    onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">GSTIN (15 Digits)</label>
                  <input
                    type="text"
                    maxLength={15}
                    className="form-control"
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    value={formData.gstin}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      const prefix = val.slice(0, 2);
                      setFormData({
                        ...formData,
                        gstin: val,
                        state_code: prefix.length === 2 && /^\d+$/.test(prefix) ? prefix : formData.state_code
                      });
                    }}
                    style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">GST Registration Type</label>
                  <select
                    className="form-control"
                    value={formData.gst_registration_type}
                    onChange={(e: any) => setFormData({ ...formData, gst_registration_type: e.target.value })}
                  >
                    <option value="pending_review">Pending Review</option>
                    <option value="registered">Registered Regular</option>
                    <option value="composition">Composition Scheme</option>
                    <option value="unregistered">Unregistered</option>
                    <option value="overseas">Overseas / Import</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">State / Region</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Maharashtra, Karnataka"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">State Code</label>
                  <input
                    type="text"
                    maxLength={2}
                    className="form-control"
                    placeholder="e.g. 27"
                    value={formData.state_code}
                    onChange={(e) => setFormData({ ...formData, state_code: e.target.value })}
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Address / Bulk Depot Details</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Bulk Terminal Gate 3, Industrial Area"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
                <input
                  type="checkbox"
                  id="supplier_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-accent)' }}
                />
                <label htmlFor="supplier_active" style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-main)', cursor: 'pointer' }}>
                  Active Supplier
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary"
                >
                  {saving ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Create Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
