// frontend/src/features/purchases/pages/PurchaseItemsPage.tsx
import React, { useEffect, useState } from 'react';
import { useAppSelector } from '@/app/store';
import {
  fetchPurchaseItems,
  createPurchaseItem,
  updatePurchaseItem,
  fetchPurchaseTaxCodes
} from '@/api/client';
import type { PurchaseItem, PurchaseTaxCode } from '@/features/purchases/types';
import { PageHeader } from '@/components/navigation/PageHeader';
import {
  Package,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  X,
  AlertCircle,
  Wrench
} from 'lucide-react';

export const PurchaseItemsPage: React.FC = () => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [taxCodes, setTaxCodes] = useState<PurchaseTaxCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Item Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PurchaseItem | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    item_type: 'goods' as 'goods' | 'service',
    unit: 'can',
    hsn_sac: '',
    purchase_tax_treatment: 'gst' as 'gst' | 'exempt' | 'nil_rated' | 'out_of_scope' | 'non_gst_petroleum',
    default_purchase_tax_code: '',
    default_itc_classification: 'eligible_inputs' as any,
    is_active: true
  });

  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadData = async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const [itemsData, taxCodesData] = await Promise.all([
        fetchPurchaseItems(selectedOrgId),
        fetchPurchaseTaxCodes(selectedOrgId)
      ]);
      setItems(itemsData);
      setTaxCodes(taxCodesData);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load purchase items.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedOrgId]);

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.hsn_sac && item.hsn_sac.toLowerCase().includes(search.toLowerCase()));

    const matchesType = typeFilter === 'all' || item.item_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const handleOpenModal = (item?: PurchaseItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        code: item.code,
        name: item.name,
        item_type: item.item_type,
        unit: item.unit,
        hsn_sac: item.hsn_sac || '',
        purchase_tax_treatment: item.purchase_tax_treatment,
        default_purchase_tax_code: item.default_purchase_tax_code || '',
        default_itc_classification: item.default_itc_classification,
        is_active: item.is_active
      });
    } else {
      setEditingItem(null);
      setFormData({
        code: '',
        name: '',
        item_type: 'goods',
        unit: 'piece',
        hsn_sac: '',
        purchase_tax_treatment: 'gst',
        default_purchase_tax_code: taxCodes.length > 0 ? taxCodes[0].id : '',
        default_itc_classification: 'eligible_inputs',
        is_active: true
      });
    }
    setModalError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    setSaving(true);
    setModalError(null);
    try {
      const payload: Partial<PurchaseItem> = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        item_type: formData.item_type,
        unit: formData.unit.trim(),
        hsn_sac: formData.hsn_sac.trim() || null,
        purchase_tax_treatment: formData.purchase_tax_treatment,
        default_purchase_tax_code: formData.default_purchase_tax_code || null,
        default_itc_classification: formData.default_itc_classification,
        is_active: formData.is_active
      };

      if (editingItem) {
        await updatePurchaseItem(selectedOrgId, editingItem.id, payload);
      } else {
        await createPurchaseItem(selectedOrgId, payload);
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save purchase item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title="Purchase Items Master"
        subtitle="Manage goods and services for procurement: lubricants, spare parts, maintenance services, contractor fees, and general expenses."
        backLink={{ to: '/app/purchases/purchase-bills', label: 'Purchase Bills' }}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleOpenModal()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} />
            <span>New Purchase Item</span>
          </button>
        }
      />

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', minWidth: '320px', flex: 1, maxWidth: '400px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Search by code, name, or HSN/SAC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '34px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`btn btn-sm ${typeFilter === 'all' ? 'btn-secondary active' : 'btn-outline-secondary'}`}
            onClick={() => setTypeFilter('all')}
          >
            All Items
          </button>
          <button
            type="button"
            className={`btn btn-sm ${typeFilter === 'goods' ? 'btn-secondary active' : 'btn-outline-secondary'}`}
            onClick={() => setTypeFilter('goods')}
          >
            Goods (Lubricants / Parts)
          </button>
          <button
            type="button"
            className={`btn btn-sm ${typeFilter === 'service' ? 'btn-secondary active' : 'btn-outline-secondary'}`}
            onClick={() => setTypeFilter('service')}
          >
            Services (Repairs / AMC)
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading purchase items...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No purchase items found. Click "New Purchase Item" to add lubricants, spare parts, or services.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '10px 14px' }}>Code</th>
                <th style={{ padding: '10px 14px' }}>Item Name</th>
                <th style={{ padding: '10px 14px' }}>Type</th>
                <th style={{ padding: '10px 14px' }}>Unit</th>
                <th style={{ padding: '10px 14px' }}>HSN / SAC</th>
                <th style={{ padding: '10px 14px' }}>Tax Treatment</th>
                <th style={{ padding: '10px 14px' }}>Default Tax Code</th>
                <th style={{ padding: '10px 14px' }}>ITC Default</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'monospace' }}>
                    {item.code}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                    {item.name}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      className={`badge ${item.item_type === 'goods' ? 'badge-info' : 'badge-primary'}`}
                      style={{ textTransform: 'capitalize', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      {item.item_type === 'goods' ? <Package size={12} /> : <Wrench size={12} />}
                      {item.item_type}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {item.unit}
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>
                    {item.hsn_sac || '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className="badge badge-secondary" style={{ textTransform: 'uppercase' }}>
                      {item.purchase_tax_treatment.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {item.default_purchase_tax_code_code ? (
                      <span className="badge badge-outline-secondary" style={{ fontFamily: 'monospace' }}>
                        {item.default_purchase_tax_code_code}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {item.default_itc_classification.replace(/_/g, ' ')}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {item.is_active ? (
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} /> Active
                      </span>
                    ) : (
                      <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <XCircle size={12} /> Inactive
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleOpenModal(item)}
                    >
                      <Edit2 size={13} style={{ marginRight: '4px' }} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Item Modal */}
      {modalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="modal-card" style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '560px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                {editingItem ? 'Edit Purchase Item' : 'New Purchase Item (Goods / Service)'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div className="alert alert-danger" style={{ marginBottom: '14px', fontSize: '0.85rem' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Item Code *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. LUBE-15W40, SRV-PUMP"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Item Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. Engine Oil 15W-40 (5L Can), Nozzle Overhaul"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Item Type *</label>
                  <select
                    className="form-control"
                    value={formData.item_type}
                    onChange={(e: any) => setFormData({ ...formData, item_type: e.target.value })}
                  >
                    <option value="goods">Goods (Lubricant, Spares)</option>
                    <option value="service">Service (Maintenance, Labor)</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Unit *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="can, litre, nos, hour"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>HSN / SAC</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 27101980, 9987"
                    value={formData.hsn_sac}
                    onChange={(e) => setFormData({ ...formData, hsn_sac: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Tax Treatment *</label>
                  <select
                    className="form-control"
                    value={formData.purchase_tax_treatment}
                    onChange={(e: any) => setFormData({ ...formData, purchase_tax_treatment: e.target.value })}
                  >
                    <option value="gst">GST</option>
                    <option value="exempt">Exempt</option>
                    <option value="nil_rated">Nil Rated</option>
                    <option value="out_of_scope">Out of Scope</option>
                    <option value="non_gst_petroleum">Non-GST Petroleum</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Default Tax Code</label>
                  <select
                    className="form-control"
                    value={formData.default_purchase_tax_code}
                    onChange={(e) => setFormData({ ...formData, default_purchase_tax_code: e.target.value })}
                  >
                    <option value="">-- None --</option>
                    {taxCodes.map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        {tc.name} ({tc.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Default ITC Classification</label>
                <select
                  className="form-control"
                  value={formData.default_itc_classification}
                  onChange={(e: any) => setFormData({ ...formData, default_itc_classification: e.target.value })}
                >
                  <option value="eligible_inputs">Eligible Inputs</option>
                  <option value="eligible_input_services">Eligible Input Services</option>
                  <option value="eligible_capital_goods">Eligible Capital Goods</option>
                  <option value="ineligible_blocked">Ineligible (Section 17(5) Blocked)</option>
                  <option value="ineligible_other">Ineligible (Other)</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="not_applicable">Not Applicable</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
