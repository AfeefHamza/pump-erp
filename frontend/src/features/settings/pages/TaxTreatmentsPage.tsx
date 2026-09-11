// frontend/src/features/settings/pages/TaxTreatmentsPage.tsx
import React, { useEffect, useState } from 'react';
import { useAppSelector } from '@/app/store';
import {
  fetchTaxTreatments,
  createTaxTreatment,
  updateTaxTreatment,
  createTaxTreatmentRate,
  updateTaxTreatmentRate,
  deleteTaxTreatmentRate
} from '@/api/client';
import type {
  TaxTreatment,
  TaxTreatmentRate,
  TaxTreatmentComponent
} from '@/features/inventory/types';
import { PageHeader } from '@/components/navigation/PageHeader';
import {
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  X,
  Lock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Percent,
  Trash2
} from 'lucide-react';

export const TaxTreatmentsPage: React.FC = () => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  const [treatments, setTreatments] = useState<TaxTreatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [regimeFilter, setRegimeFilter] = useState<string>('all');
  const [expandedTreatmentId, setExpandedTreatmentId] = useState<string | null>(null);

  // Treatment Modal (Create / Edit)
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<TaxTreatment | null>(null);
  const [treatmentFormData, setTreatmentFormData] = useState({
    code: '',
    name: '',
    tax_regime: 'gst' as 'gst' | 'exempt' | 'nil_rated' | 'out_of_scope',
    description: '',
    is_purchase_applicable: true,
    is_sales_applicable: true,
    is_active: true,
  });

  // Rate Version Modal
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [activeTreatmentForRate, setActiveTreatmentForRate] = useState<TaxTreatment | null>(null);
  const [editingRate, setEditingRate] = useState<TaxTreatmentRate | null>(null);
  const [rateFormData, setRateFormData] = useState({
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: '',
    gst_rate: '18.00',
    cess_rate: '0.00',
    cess_per_unit: '0.00',
    notes: '',
    components: [] as Partial<TaxTreatmentComponent>[],
  });

  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadData = async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTaxTreatments(selectedOrgId);
      setTreatments(data);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load tax treatments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedOrgId]);

  const filteredTreatments = treatments.filter((t) => {
    const matchesSearch =
      t.code.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.tax_regime.toLowerCase().includes(search.toLowerCase());

    const matchesRegime = regimeFilter === 'all' || t.tax_regime === regimeFilter;
    return matchesSearch && matchesRegime;
  });

  const handleOpenTreatmentModal = (treatment?: TaxTreatment) => {
    if (treatment) {
      setEditingTreatment(treatment);
      setTreatmentFormData({
        code: treatment.code,
        name: treatment.name,
        tax_regime: (treatment.tax_regime === 'non_gst_petroleum' ? 'out_of_scope' : treatment.tax_regime) as 'gst' | 'exempt' | 'nil_rated' | 'out_of_scope',
        description: treatment.description || '',
        is_purchase_applicable: treatment.is_purchase_applicable ?? true,
        is_sales_applicable: treatment.is_sales_applicable ?? true,
        is_active: treatment.is_active,
      });
    } else {
      setEditingTreatment(null);
      setTreatmentFormData({
        code: '',
        name: '',
        tax_regime: 'gst',
        description: '',
        is_purchase_applicable: true,
        is_sales_applicable: true,
        is_active: true,
      });
    }
    setModalError(null);
    setTreatmentModalOpen(true);
  };

  const handleSaveTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    setSaving(true);
    setModalError(null);
    try {
      if (editingTreatment) {
        await updateTaxTreatment(selectedOrgId, editingTreatment.id, treatmentFormData);
      } else {
        await createTaxTreatment(selectedOrgId, treatmentFormData);
      }
      setTreatmentModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err?.data?.error || err?.message || 'Failed to save tax treatment.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenRateModal = (treatment: TaxTreatment, rate?: TaxTreatmentRate) => {
    setActiveTreatmentForRate(treatment);
    if (rate) {
      setEditingRate(rate);
      setRateFormData({
        effective_from: rate.effective_from,
        effective_to: rate.effective_to || '',
        gst_rate: rate.gst_rate,
        cess_rate: rate.cess_rate,
        cess_per_unit: rate.cess_per_unit,
        notes: rate.notes || '',
        components: rate.components ? [...rate.components] : [],
      });
    } else {
      setEditingRate(null);
      setRateFormData({
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: '',
        gst_rate: treatment.tax_regime === 'gst' ? '18.00' : '0.00',
        cess_rate: '0.00',
        cess_per_unit: '0.00',
        notes: '',
        components: [],
      });
    }
    setModalError(null);
    setRateModalOpen(true);
  };

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !activeTreatmentForRate) return;
    setSaving(true);
    setModalError(null);
    try {
      const payload: any = {
        effective_from: rateFormData.effective_from,
        effective_to: rateFormData.effective_to || null,
        gst_rate: rateFormData.gst_rate,
        cess_rate: rateFormData.cess_rate,
        cess_per_unit: rateFormData.cess_per_unit,
        notes: rateFormData.notes || null,
      };

      if (editingRate) {
        await updateTaxTreatmentRate(selectedOrgId, activeTreatmentForRate.id, editingRate.id, payload);
      } else {
        await createTaxTreatmentRate(selectedOrgId, activeTreatmentForRate.id, payload);
      }
      setRateModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err?.data?.error || err?.message || 'Failed to save rate version.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRate = async (treatmentId: string, rateId: string) => {
    if (!selectedOrgId) return;
    if (!window.confirm('Delete this draft rate version?')) return;

    try {
      await deleteTaxTreatmentRate(selectedOrgId, treatmentId, rateId);
      await loadData();
    } catch (err: any) {
      alert(err?.data?.error || 'Failed to delete rate version.');
    }
  };



  return (
    <div style={{ padding: '2rem', maxWidth: '1440px', margin: '0 auto' }}>
      <PageHeader
        title="Tax Treatments"
        subtitle="Manage statutory GST rates, exemptions, and effective-dated rate versions"
        actions={
          <button
            type="button"
            onClick={() => handleOpenTreatmentModal()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#2563eb',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <Plus size={16} />
            New Tax Treatment
          </button>
        }
      />

      {/* Regime Filter Tabs */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1.5rem',
          marginBottom: '1rem',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { id: 'all', label: 'All Regimes' },
            { id: 'gst', label: 'GST' },
            { id: 'exempt', label: 'Exempt' },
            { id: 'nil_rated', label: 'Nil-Rated' },
            { id: 'out_of_scope', label: 'Out of Scope' },
          ].map((tab) => {
            const isSelected = regimeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setRegimeFilter(tab.id)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                  color: isSelected ? '#1d4ed8' : '#64748b',
                  fontWeight: isSelected ? 600 : 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
        <Search
          size={18}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94a3b8',
          }}
        />
        <input
          type="text"
          placeholder="Search tax treatments by name, code or regime..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '0.625rem 0.75rem 0.625rem 2.5rem',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            fontSize: '0.875rem',
          }}
        />
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '1rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            color: '#b91c1c',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Treatments List Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ width: '40px', padding: '0.875rem 0.5rem' }}></th>
              <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#475569' }}>Treatment Name</th>
              <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#475569' }}>Regime</th>
              <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#475569' }}>Active Rate</th>
              <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#475569' }}>Applicability</th>
              <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#475569' }}>Status</th>
              <th style={{ padding: '0.875rem 1.25rem', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  Loading tax treatments...
                </td>
              </tr>
            ) : filteredTreatments.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  No tax treatments configured. Click "+ New Tax Treatment" to define statutory tax rules.
                </td>
              </tr>
            ) : (
              filteredTreatments.map((t) => {
                const isExpanded = expandedTreatmentId === t.id;
                const activeRate = t.rates && t.rates.length > 0 ? t.rates[0] : null;

                return (
                  <React.Fragment key={t.id}>
                    <tr
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: isExpanded ? '#f8fafc' : '#ffffff',
                      }}
                    >
                      <td style={{ padding: '0.875rem 0.5rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setExpandedTreatmentId(isExpanded ? null : t.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            padding: '0.25rem',
                          }}
                        >
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{t.name}</span>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                              backgroundColor: '#f1f5f9',
                              color: '#475569',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px',
                            }}
                          >
                            {t.code}
                          </span>
                        </div>
                        {t.description && (
                          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '0.15rem' }}>
                            {t.description}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            padding: '0.25rem 0.625rem',
                            borderRadius: '9999px',
                            backgroundColor:
                              t.tax_regime === 'gst'
                                ? '#eff6ff'
                                : t.tax_regime === 'exempt'
                                ? '#f0fdf4'
                                : '#f1f5f9',
                            color:
                              t.tax_regime === 'gst'
                                ? '#1d4ed8'
                                : t.tax_regime === 'exempt'
                                ? '#16a34a'
                                : '#475569',
                          }}
                        >
                          {t.tax_regime === 'out_of_scope' ? 'OUT OF SCOPE' : t.tax_regime.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        {activeRate ? (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {t.tax_regime === 'gst' && (
                              <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                {activeRate.gst_rate}% GST
                                {parseFloat(activeRate.cess_rate) > 0 && ` + ${activeRate.cess_rate}% Cess`}
                                {parseFloat(activeRate.cess_per_unit) > 0 && ` + ₹${activeRate.cess_per_unit}/unit`}
                              </span>
                            )}
                            {t.tax_regime === 'exempt' && <span style={{ color: '#16a34a' }}>0% (Exempted)</span>}
                            {t.tax_regime === 'nil_rated' && <span style={{ color: '#64748b' }}>0% (Nil-Rated)</span>}
                            {t.tax_regime === 'out_of_scope' && <span style={{ color: '#94a3b8' }}>Out of Scope</span>}
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Effective {activeRate.effective_from}
                              {activeRate.effective_to ? ` to ${activeRate.effective_to}` : ' (Ongoing)'}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>No rates defined</span>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          {t.is_purchase_applicable && (
                            <span style={{ fontSize: '0.6875rem', backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                              Purchases
                            </span>
                          )}
                          {t.is_sales_applicable && (
                            <span style={{ fontSize: '0.6875rem', backgroundColor: '#f0fdf4', color: '#15803d', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                              Sales
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        {t.is_active ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#16a34a', fontSize: '0.8125rem' }}>
                            <CheckCircle2 size={14} /> Active
                          </span>
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#94a3b8', fontSize: '0.8125rem' }}>
                            <XCircle size={14} /> Inactive
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenRateModal(t)}
                            style={{
                              padding: '0.375rem 0.625rem',
                              border: '1px solid #bfdbfe',
                              borderRadius: '6px',
                              backgroundColor: '#eff6ff',
                              color: '#2563eb',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                            }}
                          >
                            <Plus size={13} />
                            Add Rate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenTreatmentModal(t)}
                            style={{
                              padding: '0.375rem 0.625rem',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              backgroundColor: '#ffffff',
                              color: '#334155',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.75rem',
                            }}
                          >
                            <Edit2 size={13} />
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Rate Versions Detail Accordion */}
                    {isExpanded && (
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <td colSpan={7} style={{ padding: '1.25rem 2rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
                              Effective Rate Versions for "{t.name}"
                            </h4>
                            <button
                              type="button"
                              onClick={() => handleOpenRateModal(t)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: '0.25rem 0.625rem',
                                fontSize: '0.75rem',
                                borderRadius: '6px',
                                border: '1px solid #2563eb',
                                backgroundColor: '#2563eb',
                                color: '#ffffff',
                                cursor: 'pointer',
                              }}
                            >
                              <Plus size={13} />
                              New Rate Version
                            </button>
                          </div>

                          {t.rates && t.rates.length > 0 ? (
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                                <thead>
                                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                    <th style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#475569' }}>Effective Window</th>
                                    <th style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#475569' }}>Rates / Levies</th>
                                    <th style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#475569' }}>Multi-Components</th>
                                    <th style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#475569' }}>Audit Status</th>
                                    <th style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {t.rates.map((r) => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                      <td style={{ padding: '0.625rem 1rem' }}>
                                        <span style={{ fontWeight: 500, color: '#1e293b' }}>
                                          {r.effective_from}
                                        </span>
                                        <span style={{ color: '#64748b' }}>
                                          {r.effective_to ? ` to ${r.effective_to}` : ' (Active)'}
                                        </span>
                                      </td>
                                      <td style={{ padding: '0.625rem 1rem' }}>
                                        {t.tax_regime === 'gst' ? (
                                          <span>
                                            GST: {r.gst_rate}%
                                            {parseFloat(r.cess_rate) > 0 && `, Cess: ${r.cess_rate}%`}
                                            {parseFloat(r.cess_per_unit) > 0 && `, ₹${r.cess_per_unit}/unit`}
                                          </span>
                                        ) : (
                                          <span style={{ color: '#64748b' }}>Non-GST Levies</span>
                                        )}
                                      </td>
                                      <td style={{ padding: '0.625rem 1rem' }}>
                                        {r.components && r.components.length > 0 ? (
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                            {r.components.map((c, i) => (
                                              <span
                                                key={i}
                                                style={{
                                                  fontSize: '0.6875rem',
                                                  backgroundColor: '#fef3c7',
                                                  color: '#92400e',
                                                  padding: '0.1rem 0.35rem',
                                                  borderRadius: '4px',
                                                }}
                                              >
                                                {c.name}: {c.rate_value}
                                                {c.calculation_type === 'percentage' ? '%' : '/unit'}
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          <span style={{ color: '#94a3b8' }}>-</span>
                                        )}
                                      </td>
                                      <td style={{ padding: '0.625rem 1rem' }}>
                                        {r.is_locked ? (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#64748b', fontSize: '0.75rem' }}>
                                            <Lock size={12} /> Locked by Bills
                                          </span>
                                        ) : (
                                          <span style={{ color: '#16a34a', fontSize: '0.75rem' }}>Draft / Editable</span>
                                        )}
                                      </td>
                                      <td style={{ padding: '0.625rem 1rem', textAlign: 'right' }}>
                                        {!r.is_locked && (
                                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                            <button
                                              type="button"
                                              onClick={() => handleOpenRateModal(t, r)}
                                              style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: '0.15rem' }}
                                            >
                                              <Edit2 size={13} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteRate(t.id, r.id)}
                                              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '0.15rem' }}
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8' }}>
                              No rate versions have been defined for this treatment.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Tax Treatment Create/Edit Modal */}
      {treatmentModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setTreatmentModalOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '540px',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Percent size={20} className="text-blue-600" />
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#0f172a' }}>
                  {editingTreatment ? 'Edit Tax Treatment' : 'New Tax Treatment'}
                </h3>
              </div>
              <button onClick={() => setTreatmentModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveTreatment} style={{ padding: '1.5rem' }}>
              {modalError && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '0.875rem' }}>
                  {modalError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                    Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GST-18"
                    value={treatmentFormData.code}
                    onChange={(e) => setTreatmentFormData({ ...treatmentFormData, code: e.target.value })}
                    required
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                    Treatment Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GST 18% (Standard)"
                    value={treatmentFormData.name}
                    onChange={(e) => setTreatmentFormData({ ...treatmentFormData, name: e.target.value })}
                    required
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Tax Regime *
                </label>
                <select
                  value={treatmentFormData.tax_regime}
                  onChange={(e: any) => setTreatmentFormData({ ...treatmentFormData, tax_regime: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  <option value="gst">GST (Goods and Services Tax)</option>
                  <option value="exempt">Exempt</option>
                  <option value="nil_rated">Nil-Rated</option>
                  <option value="out_of_scope">Out of Scope</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Description / Legal Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. Schedule II statutory GST rate"
                  value={treatmentFormData.description}
                  onChange={(e) => setTreatmentFormData({ ...treatmentFormData, description: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '8px', marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={treatmentFormData.is_purchase_applicable}
                    onChange={(e) => setTreatmentFormData({ ...treatmentFormData, is_purchase_applicable: e.target.checked })}
                    style={{ accentColor: '#2563eb' }}
                  />
                  Applicable to Purchases
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={treatmentFormData.is_sales_applicable}
                    onChange={(e) => setTreatmentFormData({ ...treatmentFormData, is_sales_applicable: e.target.checked })}
                    style={{ accentColor: '#2563eb' }}
                  />
                  Applicable to Sales
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setTreatmentModalOpen(false)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {saving ? 'Saving...' : editingTreatment ? 'Update Treatment' : 'Create Treatment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rate Version Create/Edit Modal */}
      {rateModalOpen && activeTreatmentForRate && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setRateModalOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '620px',
              maxHeight: '90vh',
              overflowY: 'auto',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#0f172a' }}>
                  {editingRate ? 'Edit Rate Version' : 'New Effective Rate Version'}
                </h3>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
                  Statutory rates for "{activeTreatmentForRate.name}"
                </p>
              </div>
              <button onClick={() => setRateModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRate} style={{ padding: '1.5rem' }}>
              {modalError && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '0.875rem' }}>
                  {modalError}
                </div>
              )}

              {/* Effective Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                    Effective From *
                  </label>
                  <input
                    type="date"
                    value={rateFormData.effective_from}
                    onChange={(e) => setRateFormData({ ...rateFormData, effective_from: e.target.value })}
                    required
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                    Effective To (Leave blank for ongoing)
                  </label>
                  <input
                    type="date"
                    value={rateFormData.effective_to}
                    onChange={(e) => setRateFormData({ ...rateFormData, effective_to: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              {/* GST Fields */}
              {activeTreatmentForRate.tax_regime === 'gst' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem', padding: '1rem', backgroundColor: '#eff6ff', borderRadius: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#1e40af', marginBottom: '0.25rem' }}>
                      GST Rate (%) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={rateFormData.gst_rate}
                      onChange={(e) => setRateFormData({ ...rateFormData, gst_rate: e.target.value })}
                      required
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '0.875rem', backgroundColor: '#ffffff' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#1e40af', marginBottom: '0.25rem' }}>
                      Cess Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={rateFormData.cess_rate}
                      onChange={(e) => setRateFormData({ ...rateFormData, cess_rate: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '0.875rem', backgroundColor: '#ffffff' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#1e40af', marginBottom: '0.25rem' }}>
                      Cess / Unit (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={rateFormData.cess_per_unit}
                      onChange={(e) => setRateFormData({ ...rateFormData, cess_per_unit: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '0.875rem', backgroundColor: '#ffffff' }}
                    />
                  </div>
                </div>
              )}



              {/* Notes */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Gazette / Notification Reference Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kerala Finance Act 2024 revision"
                  value={rateFormData.notes}
                  onChange={(e) => setRateFormData({ ...rateFormData, notes: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setRateModalOpen(false)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {saving ? 'Saving...' : editingRate ? 'Update Rate' : 'Save Rate Version'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
