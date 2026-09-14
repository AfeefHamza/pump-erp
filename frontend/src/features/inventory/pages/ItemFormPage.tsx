import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Fuel, Package, Save, Wrench } from 'lucide-react';
import { useAppSelector } from '@/app/store';
import {
  createItem,
  fetchItemDetail,
  fetchTaxTreatments,
  fetchUnits,
  updateItem,
} from '@/api/client';
import type { Item, ItemType, TaxTreatment, UnitMaster } from '@/features/inventory/types';

type FormState = {
  itemType: ItemType;
  code: string;
  name: string;
  shortName: string;
  category: string;
  baseUnit: string;
  hsnSac: string;
  barcode: string;
  description: string;
  isPurchasable: boolean;
  isSellable: boolean;
  isActive: boolean;
  taxTreatmentId: string;
  fuelCategory: 'petrol' | 'diesel' | 'premium_petrol' | 'premium_diesel' | 'cng' | 'lpg' | 'other';
  customFuelCategory: string;
  densityStd: string;
  densityMin: string;
  densityMax: string;
  priceEligible: boolean;
  brand: string;
  reorderLevel: string;
  valuationMethod: 'fifo' | 'weighted_average';
};

const initialForm: FormState = {
  itemType: 'stock_item',
  code: '',
  name: '',
  shortName: '',
  category: '',
  baseUnit: '',
  hsnSac: '',
  barcode: '',
  description: '',
  isPurchasable: true,
  isSellable: true,
  isActive: true,
  taxTreatmentId: '',
  fuelCategory: 'petrol',
  customFuelCategory: '',
  densityStd: '',
  densityMin: '',
  densityMax: '',
  priceEligible: true,
  brand: '',
  reorderLevel: '0',
  valuationMethod: 'fifo',
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 38,
  padding: '0.5rem 0.65rem',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  background: '#fff',
  color: '#0f172a',
  fontSize: '0.875rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 5,
  color: '#334155',
  fontSize: '0.78rem',
  fontWeight: 600,
};

const sectionStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #dbe2ea',
  borderRadius: 8,
  overflow: 'hidden',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '0.9rem 1rem',
  padding: '1rem 1.1rem 1.15rem',
};

const taxHelp: Record<string, string> = {
  gst: 'For lubricants, spares and services charged under GST. GST is calculated from the selected treatment rate.',
  non_gst_petroleum: 'For petrol, diesel and other petroleum products currently outside GST. Invoice petroleum taxes remain separate from GST.',
  non_gst: 'For transactions outside GST that are not petroleum products.',
  exempt: 'For a supply covered by a GST exemption notification.',
  nil_rated: 'For a taxable supply whose notified GST rate is 0%.',
  out_of_scope: 'For entries that are not a GST supply. Do not use this for petrol or diesel.',
};

export const ItemFormPage: React.FC = () => {
  const { itemId } = useParams<{ itemId?: string }>();
  const [searchParams] = useSearchParams();
  const requestedItemType = searchParams.get('type');
  const navigate = useNavigate();
  const organisationId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const isEdit = Boolean(itemId);

  const [form, setForm] = useState<FormState>(initialForm);
  const [units, setUnits] = useState<UnitMaster[]>([]);
  const [treatments, setTreatments] = useState<TaxTreatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTreatment = useMemo(
    () => treatments.find((t) => t.id === form.taxTreatmentId),
    [treatments, form.taxTreatmentId]
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    if (!organisationId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [unitRows, treatmentRows, item] = await Promise.all([
          fetchUnits(organisationId),
          fetchTaxTreatments(organisationId, { purchase_only: 'true' }),
          itemId ? fetchItemDetail(organisationId, itemId) : Promise.resolve<Item | null>(null),
        ]);
        if (cancelled) return;
        setUnits(unitRows.filter((unit) => unit.is_active));
        setTreatments(treatmentRows.filter((treatment) => treatment.is_active));

        if (item) {
          setForm({
            ...initialForm,
            itemType: item.item_type,
            code: item.code,
            name: item.name,
            shortName: item.short_name || '',
            category: item.category || '',
            baseUnit: item.base_unit,
            hsnSac: item.hsn_sac || '',
            barcode: item.barcode || '',
            description: item.description || '',
            isPurchasable: item.is_purchasable,
            isSellable: item.is_sellable,
            isActive: item.is_active,
            taxTreatmentId: item.current_purchase_tax_treatment?.tax_treatment_id || '',
            fuelCategory: item.fuel_profile?.fuel_category || 'petrol',
            customFuelCategory: item.fuel_profile?.custom_category_name || '',
            densityStd: item.fuel_profile?.density_std || '',
            densityMin: item.fuel_profile?.density_min || '',
            densityMax: item.fuel_profile?.density_max || '',
            priceEligible: item.fuel_profile?.price_configuration_eligible ?? true,
            brand: item.stock_profile?.brand || '',
            reorderLevel: item.stock_profile?.reorder_level || '0',
            valuationMethod: item.stock_profile?.valuation_method || 'fifo',
          });
        } else {
          const itemType: ItemType = ['fuel', 'stock_item', 'non_stock_item', 'service'].includes(requestedItemType || '')
            ? requestedItemType as ItemType
            : 'stock_item';
          const defaultUnit = unitRows.find((unit) => unit.code === 'NOS') || unitRows[0];
          const defaultTax = itemType === 'fuel'
            ? treatmentRows.find((treatment) => treatment.is_active && treatment.tax_regime === 'non_gst_petroleum')
            : treatmentRows.find(
            (treatment) => treatment.is_active && treatment.tax_regime === 'gst' && treatment.rates?.some((rate) => rate.gst_rate === '18.00')
          ) || treatmentRows.find((treatment) => treatment.is_active && treatment.tax_regime === 'gst');
          const preferredUnit = itemType === 'fuel'
            ? unitRows.find((unit) => unit.code === 'LTR') || defaultUnit
            : defaultUnit;
          setForm((current) => ({
            ...current,
            itemType,
            baseUnit: preferredUnit?.id || '',
            taxTreatmentId: defaultTax?.id || '',
          }));
        }
      } catch (loadError: any) {
        if (!cancelled) setError(loadError?.data?.detail || loadError?.message || 'Unable to load the item form.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [organisationId, itemId, requestedItemType]);

  const changeType = (itemType: ItemType) => {
    if (isEdit) return;
    const litre = units.find((unit) => unit.code === 'LTR');
    const nos = units.find((unit) => unit.code === 'NOS');
    const recommendedRegime = itemType === 'fuel' ? 'non_gst_petroleum' : 'gst';
    const treatment = treatments.find((row) => row.tax_regime === recommendedRegime && row.is_active);
    setForm((current) => ({
      ...current,
      itemType,
      baseUnit: (itemType === 'fuel' ? litre : nos)?.id || current.baseUnit,
      taxTreatmentId: treatment?.id || current.taxTreatmentId,
      isSellable: itemType === 'service' ? false : current.isSellable,
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organisationId) return;
    if (!form.code.trim() || !form.name.trim() || !form.baseUnit) {
      setError('Item code, item name and base unit are required.');
      return;
    }
    if (!form.taxTreatmentId) {
      setError('Select the default purchase tax treatment.');
      return;
    }
    if (form.itemType === 'fuel' && form.fuelCategory === 'other' && !form.customFuelCategory.trim()) {
      setError('Enter the custom fuel category name.');
      return;
    }

    const payload: Record<string, unknown> = {
      code: form.code.trim(),
      name: form.name.trim(),
      short_name: form.shortName.trim() || null,
      item_type: form.itemType,
      category: form.category.trim() || null,
      base_unit: form.baseUnit,
      hsn_sac: form.hsnSac.trim() || null,
      barcode: form.barcode.trim() || null,
      description: form.description.trim() || null,
      is_purchasable: form.isPurchasable,
      is_sellable: form.isSellable,
      is_active: form.isActive,
      tax_treatment_id: form.taxTreatmentId,
    };

    if (form.itemType === 'fuel') {
      payload.fuel_profile = {
        fuel_category: form.fuelCategory,
        custom_category_name: form.fuelCategory === 'other' ? form.customFuelCategory.trim() : null,
        short_code: form.shortName.trim() || form.code.trim(),
        density_std: form.densityStd || null,
        density_min: form.densityMin || null,
        density_max: form.densityMax || null,
        price_configuration_eligible: form.priceEligible,
      };
    }
    if (form.itemType === 'stock_item') {
      payload.stock_profile = {
        brand: form.brand.trim() || null,
        reorder_level: form.reorderLevel || '0',
        valuation_method: form.valuationMethod,
      };
    }

    setSaving(true);
    setError(null);
    try {
      if (itemId) await updateItem(organisationId, itemId, payload);
      else await createItem(organisationId, payload);
      navigate('/app/inventory/items');
    } catch (saveError: any) {
      setError(saveError?.data?.detail || saveError?.data?.error || saveError?.message || 'Unable to save the item.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading item form…</div>;
  }

  const itemTypes = [
    { id: 'fuel' as ItemType, label: 'Fuel', note: 'Tank stock and forecourt', icon: Fuel },
    { id: 'stock_item' as ItemType, label: 'Goods', note: 'Quantity-tracked items', icon: Package },
    { id: 'non_stock_item' as ItemType, label: 'Non-stock', note: 'Consumables and expenses', icon: Package },
    { id: 'service' as ItemType, label: 'Service', note: 'Repairs and professional work', icon: Wrench },
  ];

  return (
    <form onSubmit={submit} style={{ maxWidth: 1180, margin: '0 auto', padding: '1.5rem 1.75rem 5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/app/inventory/items')} aria-label="Back to items">
            <ArrowLeft size={17} />
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.45rem' }}>{isEdit ? 'Edit Item' : 'New Item'}</h1>
            <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.83rem' }}>
              One item master for fuel, goods, consumables and services
            </p>
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          <Save size={16} /> {saving ? 'Saving…' : 'Save Item'}
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '0.9rem' }}>{error}</div>}

      <div style={{ display: 'grid', gap: '0.9rem' }}>
        <section style={sectionStyle}>
          <div style={{ padding: '0.7rem 1.1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Item Type</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.65rem', padding: '1rem 1.1rem' }}>
            {itemTypes.map(({ id, label, note, icon: Icon }) => {
              const selected = form.itemType === id;
              return (
                <button key={id} type="button" disabled={isEdit} onClick={() => changeType(id)} style={{
                  display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.7rem', textAlign: 'left',
                  border: selected ? '2px solid #0f766e' : '1px solid #cbd5e1', borderRadius: 7,
                  background: selected ? '#f0fdfa' : '#fff', cursor: isEdit ? 'default' : 'pointer',
                }}>
                  <Icon size={19} color={selected ? '#0f766e' : '#64748b'} />
                  <span><strong style={{ display: 'block', fontSize: '0.84rem' }}>{label}</strong><small style={{ color: '#64748b' }}>{note}</small></span>
                  {selected && <Check size={16} color="#0f766e" style={{ marginLeft: 'auto' }} />}
                </button>
              );
            })}
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ padding: '0.7rem 1.1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Basic Information</div>
          <div style={gridStyle}>
            <label><span style={labelStyle}>Item Code *</span><input autoFocus={!isEdit} style={fieldStyle} value={form.code} onChange={(e) => update('code', e.target.value)} /></label>
            <label style={{ gridColumn: 'span 2' }}><span style={labelStyle}>Item Name *</span><input style={fieldStyle} value={form.name} onChange={(e) => update('name', e.target.value)} /></label>
            <label><span style={labelStyle}>Short Name</span><input style={fieldStyle} value={form.shortName} onChange={(e) => update('shortName', e.target.value)} /></label>
            <label><span style={labelStyle}>Category</span><input style={fieldStyle} placeholder="e.g. Lubricants" value={form.category} onChange={(e) => update('category', e.target.value)} /></label>
            <label><span style={labelStyle}>Base Unit *</span><select style={fieldStyle} value={form.baseUnit} onChange={(e) => update('baseUnit', e.target.value)}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}</select></label>
            <label><span style={labelStyle}>HSN / SAC</span><input style={fieldStyle} value={form.hsnSac} onChange={(e) => update('hsnSac', e.target.value)} /></label>
            <label><span style={labelStyle}>Barcode</span><input style={fieldStyle} value={form.barcode} onChange={(e) => update('barcode', e.target.value)} /></label>
            <label style={{ gridColumn: 'span 3' }}><span style={labelStyle}>Description</span><textarea style={{ ...fieldStyle, minHeight: 68 }} value={form.description} onChange={(e) => update('description', e.target.value)} /></label>
          </div>
        </section>

        {form.itemType === 'fuel' && (
          <section style={sectionStyle}>
            <div style={{ padding: '0.7rem 1.1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Fuel & Forecourt</div>
            <div style={gridStyle}>
              <label><span style={labelStyle}>Fuel Category *</span><select style={fieldStyle} value={form.fuelCategory} onChange={(e) => update('fuelCategory', e.target.value as FormState['fuelCategory'])}><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="premium_petrol">Premium Petrol</option><option value="premium_diesel">Premium Diesel</option><option value="cng">CNG</option><option value="lpg">LPG</option><option value="other">Other</option></select></label>
              {form.fuelCategory === 'other' && <label><span style={labelStyle}>Custom Category *</span><input style={fieldStyle} value={form.customFuelCategory} onChange={(e) => update('customFuelCategory', e.target.value)} /></label>}
              <label><span style={labelStyle}>Standard Density</span><input type="number" step="0.0001" style={fieldStyle} value={form.densityStd} onChange={(e) => update('densityStd', e.target.value)} /></label>
              <label><span style={labelStyle}>Minimum Density</span><input type="number" step="0.0001" style={fieldStyle} value={form.densityMin} onChange={(e) => update('densityMin', e.target.value)} /></label>
              <label><span style={labelStyle}>Maximum Density</span><input type="number" step="0.0001" style={fieldStyle} value={form.densityMax} onChange={(e) => update('densityMax', e.target.value)} /></label>
            </div>
          </section>
        )}

        {form.itemType === 'stock_item' && (
          <section style={sectionStyle}>
            <div style={{ padding: '0.7rem 1.1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Inventory</div>
            <div style={gridStyle}>
              <label><span style={labelStyle}>Brand</span><input style={fieldStyle} value={form.brand} onChange={(e) => update('brand', e.target.value)} /></label>
              <label><span style={labelStyle}>Reorder Level</span><input type="number" min="0" step="0.0001" style={fieldStyle} value={form.reorderLevel} onChange={(e) => update('reorderLevel', e.target.value)} /></label>
              <label><span style={labelStyle}>Valuation Method</span><select style={fieldStyle} value={form.valuationMethod} onChange={(e) => update('valuationMethod', e.target.value as FormState['valuationMethod'])}><option value="fifo">FIFO</option><option value="weighted_average">Weighted Average</option></select></label>
            </div>
          </section>
        )}

        <section style={sectionStyle}>
          <div style={{ padding: '0.7rem 1.1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Purchasing & Tax</div>
          <div style={gridStyle}>
            <label style={{ gridColumn: 'span 2' }}><span style={labelStyle}>Default Purchase Tax Treatment *</span><select style={fieldStyle} value={form.taxTreatmentId} onChange={(e) => update('taxTreatmentId', e.target.value)}><option value="">Select treatment</option>{treatments.map((treatment) => <option key={treatment.id} value={treatment.id}>{treatment.name}</option>)}</select><small style={{ display: 'block', marginTop: 5, color: '#64748b' }}>{selectedTreatment ? taxHelp[selectedTreatment.tax_regime] : 'Tax treatments are configured once under Settings.'}</small></label>
            <div style={{ display: 'grid', gap: '0.55rem', alignContent: 'start', paddingTop: 20 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.isPurchasable} onChange={(e) => update('isPurchasable', e.target.checked)} /> Available in purchases</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.isSellable} onChange={(e) => update('isSellable', e.target.checked)} /> Available in sales</label>
              {isEdit && <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.isActive} onChange={(e) => update('isActive', e.target.checked)} /> Active</label>}
            </div>
          </div>
        </section>
      </div>

      <div style={{ position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.96)', borderTop: '1px solid #e2e8f0' }}>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/app/inventory/items')}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Saving…' : 'Save Item'}</button>
      </div>
    </form>
  );
};
