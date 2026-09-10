// frontend/src/features/purchases/pages/PurchaseTaxCodesPage.tsx
import React, { useEffect, useState } from 'react';
import { useAppSelector } from '@/app/store';
import {
  fetchPurchaseTaxCodes,
  createPurchaseTaxCode,
  updatePurchaseTaxCode,
  createPurchaseTaxCodeRate,
  updatePurchaseTaxCodeRate
} from '@/api/client';
import type { PurchaseTaxCode, PurchaseTaxCodeRate } from '@/features/purchases/types';
import { PageHeader } from '@/components/navigation/PageHeader';
import {
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  X,
  Lock,
  Calendar,
  AlertCircle,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

export const PurchaseTaxCodesPage: React.FC = () => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  const [taxCodes, setTaxCodes] = useState<PurchaseTaxCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedCodeId, setExpandedCodeId] = useState<string | null>(null);

  // Tax Code Modal
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<PurchaseTaxCode | null>(null);
  const [codeFormData, setCodeFormData] = useState({
    code: '',
    name: '',
    tax_regime: 'gst' as 'gst' | 'non_gst_petroleum' | 'exempt' | 'nil_rated' | 'out_of_scope',
    description: '',
    is_active: true
  });

  // Rate Version Modal
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [activeCodeForRate, setActiveCodeForRate] = useState<PurchaseTaxCode | null>(null);
  const [editingRate, setEditingRate] = useState<PurchaseTaxCodeRate | null>(null);
  const [rateFormData, setRateFormData] = useState({
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: '',
    gst_rate: '18.00',
    cess_rate: '0.00',
    cess_per_unit: '0.00',
    notes: ''
  });

  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadData = async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPurchaseTaxCodes(selectedOrgId);
      setTaxCodes(data);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load purchase tax codes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedOrgId]);

  const filteredCodes = taxCodes.filter(
    (c) =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.tax_regime.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenCodeModal = (code?: PurchaseTaxCode) => {
    if (code) {
      setEditingCode(code);
      setCodeFormData({
        code: code.code,
        name: code.name,
        tax_regime: code.tax_regime,
        description: code.description || '',
        is_active: code.is_active
      });
    } else {
      setEditingCode(null);
      setCodeFormData({
        code: '',
        name: '',
        tax_regime: 'gst',
        description: '',
        is_active: true
      });
    }
    setModalError(null);
    setCodeModalOpen(true);
  };

  const handleSaveCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    setSaving(true);
    setModalError(null);
    try {
      if (editingCode) {
        await updatePurchaseTaxCode(selectedOrgId, editingCode.id, codeFormData);
      } else {
        await createPurchaseTaxCode(selectedOrgId, codeFormData);
      }
      setCodeModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save tax code.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenRateModal = (code: PurchaseTaxCode, rate?: PurchaseTaxCodeRate) => {
    setActiveCodeForRate(code);
    if (rate) {
      setEditingRate(rate);
      setRateFormData({
        effective_from: rate.effective_from,
        effective_to: rate.effective_to || '',
        gst_rate: rate.gst_rate,
        cess_rate: rate.cess_rate,
        cess_per_unit: rate.cess_per_unit,
        notes: rate.notes || ''
      });
    } else {
      setEditingRate(null);
      setRateFormData({
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: '',
        gst_rate: code.tax_regime === 'gst' ? '18.00' : '0.00',
        cess_rate: '0.00',
        cess_per_unit: '0.00',
        notes: ''
      });
    }
    setModalError(null);
    setRateModalOpen(true);
  };

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !activeCodeForRate) return;
    setSaving(true);
    setModalError(null);
    try {
      const payload = {
        effective_from: rateFormData.effective_from,
        effective_to: rateFormData.effective_to || null,
        gst_rate: rateFormData.gst_rate,
        cess_rate: rateFormData.cess_rate,
        cess_per_unit: rateFormData.cess_per_unit,
        notes: rateFormData.notes || null
      };

      if (editingRate) {
        await updatePurchaseTaxCodeRate(selectedOrgId, activeCodeForRate.id, editingRate.id, payload);
      } else {
        await createPurchaseTaxCodeRate(selectedOrgId, activeCodeForRate.id, payload);
      }
      setRateModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save rate version.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title="Purchase Tax Codes"
        subtitle="Manage statutory GST codes, fuel petroleum levies, and effective-dated rate versions."
        backLink={{ to: '/app/purchases/purchase-bills', label: 'Purchase Bills' }}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleOpenCodeModal()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} />
            <span>New Tax Code</span>
          </button>
        }
      />

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Search Bar */}
      <div style={{ marginBottom: '16px', position: 'relative', maxWidth: '360px' }}>
        <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
        <input
          type="text"
          className="form-control"
          placeholder="Search tax codes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: '34px' }}
        />
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading tax codes...
        </div>
      ) : filteredCodes.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No purchase tax codes found. Click "New Tax Code" to create one.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ width: '32px' }}></th>
                <th style={{ padding: '10px 14px' }}>Code</th>
                <th style={{ padding: '10px 14px' }}>Name</th>
                <th style={{ padding: '10px 14px' }}>Regime</th>
                <th style={{ padding: '10px 14px' }}>Rates</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCodes.map((code) => {
                const isExpanded = expandedCodeId === code.id;
                const activeRate = code.rates?.[0];

                return (
                  <React.Fragment key={code.id}>
                    <tr
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        background: isExpanded ? 'rgba(240, 249, 255, 0.5)' : '#ffffff'
                      }}
                      onClick={() => setExpandedCodeId(isExpanded ? null : code.id)}
                    >
                      <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'monospace' }}>
                        {code.code}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div>{code.name}</div>
                        {code.description && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{code.description}</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          className={`badge ${
                            code.tax_regime === 'gst'
                              ? 'badge-info'
                              : code.tax_regime === 'non_gst_petroleum'
                              ? 'badge-warning'
                              : 'badge-secondary'
                          }`}
                          style={{ textTransform: 'uppercase', fontSize: '0.75rem' }}
                        >
                          {code.tax_regime.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {code.rates && code.rates.length > 0 ? (
                          <span style={{ fontSize: '0.85rem' }}>
                            {code.rates.length} version{code.rates.length > 1 ? 's' : ''} (latest:{' '}
                            <strong>{activeRate?.gst_rate || 0}%</strong>)
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No rates configured</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {code.is_active ? (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} /> Active
                          </span>
                        ) : (
                          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <XCircle size={12} /> Inactive
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleOpenCodeModal(code)}
                          style={{ marginRight: '6px' }}
                        >
                          <Edit2 size={13} style={{ marginRight: '4px' }} /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => handleOpenRateModal(code)}
                        >
                          <Plus size={13} style={{ marginRight: '4px' }} /> Add Rate
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Rate Versions Sub-Table */}
                    {isExpanded && (
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border-color)' }}>
                        <td colSpan={7} style={{ padding: '14px 20px 20px 48px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              Effective-Dated Rate Versions for {code.name} ({code.code})
                            </h4>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => handleOpenRateModal(code)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Plus size={13} /> Add New Effective Version
                            </button>
                          </div>

                          {code.rates && code.rates.length > 0 ? (
                            <table className="table" style={{ width: '100%', background: '#ffffff', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                  <th style={{ padding: '6px 10px' }}>Effective Period</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>GST Rate</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Cess %</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Cess / Unit</th>
                                  <th style={{ padding: '6px 10px' }}>Lock Status</th>
                                  <th style={{ padding: '6px 10px' }}>Notes</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {code.rates.map((rate) => (
                                  <tr key={rate.id} style={{ borderTop: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                                    <td style={{ padding: '8px 10px' }}>
                                      <Calendar size={13} style={{ display: 'inline', marginRight: '5px', color: 'var(--text-muted)' }} />
                                      <strong>{rate.effective_from}</strong> to {rate.effective_to || 'Indefinite (active)'}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                                      {rate.gst_rate}%
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                      {rate.cess_rate}%
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                      Rs. {rate.cess_per_unit}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                      {rate.is_locked ? (
                                        <span
                                          className="badge badge-warning"
                                          title="Used in recorded purchase bills. Locked against modifications to preserve accounting audit history."
                                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        >
                                          <Lock size={12} /> Locked
                                        </span>
                                      ) : (
                                        <span className="badge badge-secondary">Editable</span>
                                      )}
                                    </td>
                                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>
                                      {rate.notes || '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                      {!rate.is_locked && (
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-secondary"
                                          onClick={() => handleOpenRateModal(code, rate)}
                                        >
                                          Edit
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div style={{ padding: '16px', background: '#ffffff', borderRadius: '4px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', border: '1px dashed var(--border-color)' }}>
                              No rate versions have been added yet. Click "Add New Effective Version" above.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tax Code Create/Edit Modal */}
      {codeModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="modal-card" style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '500px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{editingCode ? 'Edit Tax Code' : 'New Purchase Tax Code'}</h3>
              <button type="button" onClick={() => setCodeModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div className="alert alert-danger" style={{ marginBottom: '14px', fontSize: '0.85rem' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveCode}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Tax Code *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="e.g. GST_18, FUEL_PETRO, EXEMPT"
                  value={codeFormData.code}
                  onChange={(e) => setCodeFormData({ ...codeFormData, code: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Display Name *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="e.g. GST 18% (Goods & Services)"
                  value={codeFormData.name}
                  onChange={(e) => setCodeFormData({ ...codeFormData, name: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Tax Regime *</label>
                <select
                  className="form-control"
                  value={codeFormData.tax_regime}
                  onChange={(e: any) => setCodeFormData({ ...codeFormData, tax_regime: e.target.value })}
                >
                  <option value="gst">GST (Goods and Services Tax)</option>
                  <option value="non_gst_petroleum">Non-GST Petroleum (VAT / Road Cess / Levies)</option>
                  <option value="exempt">Exempt</option>
                  <option value="nil_rated">Nil Rated</option>
                  <option value="out_of_scope">Out of Scope</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Description</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={codeFormData.description}
                  onChange={(e) => setCodeFormData({ ...codeFormData, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setCodeModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Tax Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rate Version Modal */}
      {rateModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="modal-card" style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '520px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                {editingRate ? 'Edit Rate Version' : `Add Effective Rate Version (${activeCodeForRate?.code})`}
              </h3>
              <button type="button" onClick={() => setRateModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {editingRate?.is_locked && (
              <div className="alert alert-warning" style={{ marginBottom: '14px', fontSize: '0.85rem', display: 'flex', gap: '8px' }}>
                <Lock size={16} />
                <span>This rate version is locked because it has been used in recorded purchase bills. Modifications are restricted to prevent accounting discrepancies.</span>
              </div>
            )}

            {modalError && (
              <div className="alert alert-danger" style={{ marginBottom: '14px', fontSize: '0.85rem' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveRate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Effective From *</label>
                  <input
                    type="date"
                    className="form-control"
                    required
                    disabled={editingRate?.is_locked}
                    value={rateFormData.effective_from}
                    onChange={(e) => setRateFormData({ ...rateFormData, effective_from: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Effective To</label>
                  <input
                    type="date"
                    className="form-control"
                    placeholder="Leave empty for indefinite"
                    value={rateFormData.effective_to}
                    onChange={(e) => setRateFormData({ ...rateFormData, effective_to: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>GST Rate (%) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="form-control"
                    required
                    disabled={editingRate?.is_locked}
                    value={rateFormData.gst_rate}
                    onChange={(e) => setRateFormData({ ...rateFormData, gst_rate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Cess (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="form-control"
                    disabled={editingRate?.is_locked}
                    value={rateFormData.cess_rate}
                    onChange={(e) => setRateFormData({ ...rateFormData, cess_rate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Cess/Unit (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    disabled={editingRate?.is_locked}
                    value={rateFormData.cess_per_unit}
                    onChange={(e) => setRateFormData({ ...rateFormData, cess_per_unit: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Notes / Circular Ref</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Rate revision per Notification 04/2026"
                  value={rateFormData.notes}
                  onChange={(e) => setRateFormData({ ...rateFormData, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setRateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || editingRate?.is_locked}>
                  {saving ? 'Saving...' : 'Save Rate Version'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
