import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Info, Percent, Plus, X } from 'lucide-react';
import { useAppSelector } from '@/app/store';
import {
  createTaxTreatment,
  createTaxTreatmentRate,
  deactivateTaxTreatment,
  fetchTaxTreatments,
} from '@/api/client';
import type { TaxTreatment } from '@/features/inventory/types';
import { PageHeader } from '@/components/navigation/PageHeader';

type Regime = TaxTreatment['tax_regime'];

const regimeLabels: Record<Regime, string> = {
  gst: 'GST',
  non_gst_petroleum: 'Non-GST Petroleum',
  non_gst: 'Other Non-GST',
  exempt: 'GST Exempt',
  nil_rated: 'Nil-Rated GST',
  out_of_scope: 'Out of Scope',
};

const regimeHelp: Record<Regime, string> = {
  gst: 'Normal taxable goods and services. Choose the GST rate used on the invoice.',
  non_gst_petroleum: 'Petrol, diesel and other petroleum products currently outside GST. Do not classify them as exempt.',
  non_gst: 'A non-petroleum transaction that is outside GST but still belongs in the books.',
  exempt: 'A supply specifically exempted from GST by notification.',
  nil_rated: 'A taxable supply with a notified GST rate of 0%.',
  out_of_scope: 'An entry that is not a GST supply, such as a pure accounting or statutory entry.',
};

const defaultName = (regime: Regime, rate: string) => regime === 'gst' ? `GST ${Number(rate)}%` : regimeLabels[regime];
const defaultCode = (regime: Regime, rate: string) => regime === 'gst'
  ? `GST-${String(Number(rate)).replace('.', '-')}`
  : ({
      non_gst_petroleum: 'NON-GST-PETROLEUM',
      non_gst: 'NON-GST',
      exempt: 'GST-EXEMPT',
      nil_rated: 'GST-NIL',
      out_of_scope: 'OUT-OF-SCOPE',
      gst: 'GST',
    } as Record<Regime, string>)[regime];

export const TaxTreatmentsPage: React.FC = () => {
  const organisationId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const [treatments, setTreatments] = useState<TaxTreatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [addRateTo, setAddRateTo] = useState<TaxTreatment | null>(null);
  const [regime, setRegime] = useState<Regime>('gst');
  const [rate, setRate] = useState('18');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!organisationId) return;
    setLoading(true);
    setError(null);
    try {
      setTreatments(await fetchTaxTreatments(organisationId));
    } catch (loadError: any) {
      setError(loadError?.data?.detail || 'Unable to load tax treatments.');
    } finally {
      setLoading(false);
    }
  }, [organisationId]);

  useEffect(() => { load(); }, [load]);

  const sortedTreatments = useMemo(() => [...treatments].sort((a, b) => {
    const order: Regime[] = ['gst', 'non_gst_petroleum', 'non_gst', 'exempt', 'nil_rated', 'out_of_scope'];
    return order.indexOf(a.tax_regime) - order.indexOf(b.tax_regime) || a.name.localeCompare(b.name);
  }), [treatments]);

  const openNew = () => {
    setAddRateTo(null);
    setRegime('gst');
    setRate('18');
    setName('');
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setError(null);
    setShowForm(true);
  };

  const openRate = (treatment: TaxTreatment) => {
    setAddRateTo(treatment);
    setRegime('gst');
    setRate('18');
    setName(treatment.name);
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setError(null);
    setShowForm(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organisationId) return;
    const numericRate = Number(rate);
    if (regime === 'gst' && (!Number.isFinite(numericRate) || numericRate < 0 || numericRate > 100)) {
      setError('Enter a valid GST percentage between 0 and 100.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let treatment = addRateTo;
      if (!treatment) {
        treatment = await createTaxTreatment(organisationId, {
          code: defaultCode(regime, rate),
          name: name.trim() || defaultName(regime, rate),
          tax_regime: regime,
          description: regimeHelp[regime],
          is_purchase_applicable: true,
          is_sales_applicable: true,
          is_active: true,
        });
      }
      await createTaxTreatmentRate(organisationId, treatment.id, {
        effective_from: effectiveFrom,
        effective_to: null,
        gst_rate: regime === 'gst' ? numericRate.toFixed(2) : '0.00',
        cess_rate: '0.00',
        cess_per_unit: '0.0000',
      });
      setShowForm(false);
      setAddRateTo(null);
      await load();
    } catch (saveError: any) {
      setError(saveError?.data?.detail || saveError?.data?.error || saveError?.message || 'Unable to save the treatment.');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (treatment: TaxTreatment) => {
    if (!organisationId || !window.confirm(`Deactivate “${treatment.name}”? Existing bills will not change.`)) return;
    try {
      await deactivateTaxTreatment(organisationId, treatment.id);
      await load();
    } catch (actionError: any) {
      setError(actionError?.data?.detail || 'Unable to deactivate the treatment.');
    }
  };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '2rem' }}>
      <PageHeader
        title="Tax Treatments"
        subtitle="Simple defaults used by Item Master and purchase bills"
        actions={<button className="btn btn-primary" type="button" onClick={openNew}><Plus size={16} /> Add Treatment</button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.7rem', margin: '1rem 0' }}>
        {[
          ['GST', 'Taxable goods and services'],
          ['Non-GST Petroleum', 'Petrol and diesel; not GST-exempt'],
          ['Exempt / Nil-Rated', 'Use only when legally applicable'],
          ['Out of Scope', 'Non-supply accounting entries'],
        ].map(([title, note]) => <div key={title} style={{ padding: '0.8rem', border: '1px solid #dbe2ea', borderRadius: 8, background: '#fff' }}><strong style={{ display: 'block', fontSize: '0.82rem' }}>{title}</strong><small style={{ color: '#64748b' }}>{note}</small></div>)}
      </div>

      {showForm && (
        <form onSubmit={save} style={{ marginBottom: '1rem', border: '1px solid #93c5fd', borderRadius: 8, background: '#eff6ff', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <strong>{addRateTo ? `New rate for ${addRateTo.name}` : 'Add Tax Treatment'}</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)} aria-label="Close"><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
            {!addRateTo && <label><small style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Treatment Type</small><select className="input" value={regime} onChange={(e) => setRegime(e.target.value as Regime)}><option value="gst">GST</option><option value="non_gst_petroleum">Non-GST Petroleum</option><option value="non_gst">Other Non-GST</option><option value="exempt">GST Exempt</option><option value="nil_rated">Nil-Rated GST</option><option value="out_of_scope">Out of Scope</option></select></label>}
            {regime === 'gst' && <label><small style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>GST Rate %</small><input className="input" type="number" min="0" max="100" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></label>}
            {!addRateTo && <label><small style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Display Name <span style={{ color: '#64748b' }}>(optional)</span></small><input className="input" value={name} placeholder={defaultName(regime, rate)} onChange={(e) => setName(e.target.value)} /></label>}
            <label><small style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Effective From</small><input className="input" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required /></label>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: '0.7rem', color: '#475569', fontSize: '0.78rem' }}><Info size={14} /> {regimeHelp[regime]}</div>
        </form>
      )}

      {error && <div className="alert alert-error" style={{ marginBottom: '0.8rem' }}>{error}</div>}

      <div style={{ border: '1px solid #dbe2ea', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th style={{ width: 42 }}></th><th>Treatment</th><th>Type</th><th>Current Rate</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center' }}>Loading…</td></tr> : sortedTreatments.map((treatment) => {
              const expanded = expandedId === treatment.id;
              const currentRate = treatment.rates?.[0];
              return <React.Fragment key={treatment.id}>
                <tr>
                  <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpandedId(expanded ? null : treatment.id)}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></td>
                  <td><strong>{treatment.name}</strong><div style={{ color: '#64748b', fontSize: '0.73rem' }}>{treatment.code}</div></td>
                  <td>{regimeLabels[treatment.tax_regime]}</td>
                  <td>{treatment.tax_regime === 'gst' ? `${currentRate?.gst_rate || '—'}%` : 'No GST'}</td>
                  <td>{treatment.is_active ? <span style={{ color: '#15803d', display: 'inline-flex', gap: 4, alignItems: 'center' }}><CheckCircle2 size={14} /> Active</span> : <span style={{ color: '#94a3b8' }}>Inactive</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    {treatment.tax_regime === 'gst' && treatment.is_active && <button type="button" className="btn btn-secondary btn-sm" onClick={() => openRate(treatment)}><Percent size={14} /> New Rate</button>}
                    {treatment.is_active && <button type="button" className="btn btn-ghost btn-sm" onClick={() => deactivate(treatment)}>Deactivate</button>}
                  </td>
                </tr>
                {expanded && <tr><td></td><td colSpan={5} style={{ background: '#f8fafc', padding: '0.8rem 1rem' }}><div style={{ color: '#475569', marginBottom: 6 }}>{regimeHelp[treatment.tax_regime]}</div>{treatment.rates?.length ? treatment.rates.map((row) => <span key={row.id} style={{ display: 'inline-block', marginRight: 8, padding: '0.25rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: 5, background: '#fff', fontSize: '0.75rem' }}>{treatment.tax_regime === 'gst' ? `${row.gst_rate}%` : '0% GST'} from {row.effective_from}</span>) : <span style={{ color: '#b45309' }}>No effective rate configured.</span>}</td></tr>}
              </React.Fragment>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
