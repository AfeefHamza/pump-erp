// frontend/src/features/inventory/components/ItemDrawer.tsx
import React, { useEffect, useState } from 'react';
import { useAppSelector } from '@/app/store';
import {
  fetchUnits,
  createItem,
  updateItem,
  fetchTaxTreatments,
  createItemPurchaseTaxTreatment
} from '@/api/client';
import type {
  Item,
  ItemType,
  UnitMaster,
  TaxTreatment
} from '@/features/inventory/types';
import { UnitManagementModal } from './UnitManagementModal';
import {
  X,
  Package,
  Fuel,
  Boxes,
  Wrench,
  AlertCircle,
  Percent
} from 'lucide-react';

interface ItemDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item?: Item | null;
  initialType?: ItemType;
  onSaved: (item: Item) => void;
}

export const ItemDrawer: React.FC<ItemDrawerProps> = ({
  isOpen,
  onClose,
  item,
  initialType = 'stock_item',
  onSaved,
}) => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  const [itemType, setItemType] = useState<ItemType>(initialType);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [baseUnit, setBaseUnit] = useState('');
  const [hsnSac, setHsnSac] = useState('');
  const [description, setDescription] = useState('');
  const [isPurchasable, setIsPurchasable] = useState(true);
  const [isSellable, setIsSellable] = useState(true);
  const [isActive, setIsActive] = useState(true);

  // Fuel Profile
  const [fuelType, setFuelType] = useState<'motor_spirit' | 'high_speed_diesel' | 'cng' | 'lpg' | 'other'>('motor_spirit');
  const [densityStandard, setDensityStandard] = useState('');
  const [colorCode, setColorCode] = useState('#2563eb');

  // Stock Profile
  const [reorderLevel, setReorderLevel] = useState('');
  const [reorderQuantity, setReorderQuantity] = useState('');
  const [barcode, setBarcode] = useState('');
  const [storageLocation, setStorageLocation] = useState('');

  // Purchase Tax Treatment
  const [taxTreatmentId, setTaxTreatmentId] = useState('');
  const [itcClassification, setItcClassification] = useState<string>('eligible_inputs');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));

  // Auxiliary data
  const [units, setUnits] = useState<UnitMaster[]>([]);
  const [taxTreatments, setTaxTreatments] = useState<TaxTreatment[]>([]);
  const [unitModalOpen, setUnitModalOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAuxData = async () => {
    if (!selectedOrgId) return;
    try {
      const [unitsData, treatmentsData] = await Promise.all([
        fetchUnits(selectedOrgId),
        fetchTaxTreatments(selectedOrgId, { purchase_only: 'true' }),
      ]);
      setUnits(unitsData);
      setTaxTreatments(treatmentsData);

      // Default unit selection if empty
      if (!baseUnit && unitsData.length > 0) {
        if (itemType === 'fuel') {
          const ltr = unitsData.find((u) => u.code.toUpperCase() === 'LTR' || u.name.toLowerCase().includes('litre'));
          setBaseUnit(ltr ? ltr.id : unitsData[0].id);
        } else {
          setBaseUnit(unitsData[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load aux data for ItemDrawer:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAuxData();
      if (item) {
        setItemType(item.item_type);
        setCode(item.code);
        setName(item.name);
        setBaseUnit(item.base_unit);
        setHsnSac(item.hsn_sac || '');
        setDescription(item.description || '');
        setIsPurchasable(item.is_purchasable);
        setIsSellable(item.is_sellable);
        setIsActive(item.is_active);

        if (item.fuel_profile) {
          setFuelType(item.fuel_profile.fuel_type || 'motor_spirit');
          setDensityStandard(item.fuel_profile.density_standard || '');
          setColorCode(item.fuel_profile.color_code || '#2563eb');
        }

        if (item.stock_profile) {
          setReorderLevel(item.stock_profile.reorder_level || '');
          setReorderQuantity(item.stock_profile.reorder_quantity || '');
          setBarcode(item.stock_profile.barcode || '');
          setStorageLocation(item.stock_profile.storage_location || '');
        }

        if (item.current_purchase_tax_treatment) {
          setTaxTreatmentId(item.current_purchase_tax_treatment.tax_treatment_id || '');
          setItcClassification(item.current_purchase_tax_treatment.default_itc_classification || 'eligible_inputs');
          if (item.current_purchase_tax_treatment.effective_from) {
            setEffectiveFrom(item.current_purchase_tax_treatment.effective_from);
          }
        }
      } else {
        // Reset form for create
        setItemType(initialType);
        setCode('');
        setName('');
        setHsnSac('');
        setDescription('');
        setIsPurchasable(true);
        setIsSellable(true);
        setIsActive(true);
        setDensityStandard('');
        setColorCode('#2563eb');
        setReorderLevel('');
        setReorderQuantity('');
        setBarcode('');
        setStorageLocation('');
        setTaxTreatmentId('');
        setItcClassification('eligible_inputs');
        setEffectiveFrom(new Date().toISOString().slice(0, 10));
      }
      setError(null);
    }
  }, [isOpen, item, initialType, selectedOrgId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;

    if (!code.trim()) {
      setError('Item code is required.');
      return;
    }
    if (!name.trim()) {
      setError('Item name is required.');
      return;
    }
    if (!baseUnit) {
      setError('Base unit of measurement is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: any = {
        code: code.trim(),
        name: name.trim(),
        item_type: itemType,
        base_unit: baseUnit,
        hsn_sac: hsnSac.trim() || null,
        description: description.trim() || null,
        is_purchasable: isPurchasable,
        is_sellable: isSellable,
        is_active: isActive,
      };

      if (itemType === 'fuel') {
        payload.fuel_profile = {
          fuel_type: fuelType,
          density_standard: densityStandard ? densityStandard.trim() : null,
          color_code: colorCode,
        };
      } else if (itemType === 'stock_item') {
        payload.stock_profile = {
          reorder_level: reorderLevel ? reorderLevel.trim() : null,
          reorder_quantity: reorderQuantity ? reorderQuantity.trim() : null,
          barcode: barcode ? barcode.trim() : null,
          storage_location: storageLocation ? storageLocation.trim() : null,
        };
      }

      let savedItem: Item;
      if (item) {
        savedItem = await updateItem(selectedOrgId, item.id, payload);
      } else {
        savedItem = await createItem(selectedOrgId, payload);
      }

      // If a Tax Treatment was specified, atomically link it via purchases mapping
      if (taxTreatmentId && savedItem.id) {
        try {
          await createItemPurchaseTaxTreatment(selectedOrgId, savedItem.id, {
            tax_treatment: taxTreatmentId,
            default_itc_classification: itcClassification as any,
            effective_from: effectiveFrom,
          });
        } catch (taxErr: any) {
          console.warn('Item created/updated, but tax treatment mapping returned warning:', taxErr);
        }
      }

      onSaved(savedItem);
      onClose();
    } catch (err: any) {
      console.error('Error saving item:', err);
      const errMsg =
        err?.data?.code?.[0] ||
        err?.data?.error ||
        err?.data?.detail ||
        err?.message ||
        'Failed to save item master record.';
      setError(errMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="slider-overlay" onClick={onClose}>
        <div
          className="slider-panel"
          style={{ maxWidth: '640px' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="slider-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: '#f1f5f9',
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {itemType === 'fuel' ? (
                  <Fuel size={22} className="text-amber-600" />
                ) : itemType === 'stock_item' ? (
                  <Package size={22} className="text-blue-600" />
                ) : itemType === 'service' ? (
                  <Wrench size={22} className="text-purple-600" />
                ) : (
                  <Boxes size={22} className="text-slate-600" />
                )}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#0f172a' }}>
                  {item ? 'Edit Item Master' : 'Create Canonical Item'}
                </h3>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
                  Unified product & service catalog for Inventory, Purchases, and Sales
                </p>
              </div>
            </div>
            <button
              className="btn-close"
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="slider-body">
            {error && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: '#b91c1c',
                  fontSize: '0.875rem',
                }}
              >
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <form id="item-drawer-form" onSubmit={handleSubmit}>
              {/* Type Selection */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
                  Item Category / Type *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                  {[
                    { type: 'fuel' as ItemType, label: 'Fuel', icon: Fuel, desc: 'Tank Ledger' },
                    { type: 'stock_item' as ItemType, label: 'Stock', icon: Package, desc: 'Qty Ledger' },
                    { type: 'non_stock_item' as ItemType, label: 'Non-Stock', icon: Boxes, desc: 'Expense' },
                    { type: 'service' as ItemType, label: 'Service', icon: Wrench, desc: 'Services' },
                  ].map((t) => {
                    const Icon = t.icon;
                    const isSelected = itemType === t.type;
                    return (
                      <button
                        key={t.type}
                        type="button"
                        onClick={() => {
                          if (!item) setItemType(t.type);
                        }}
                        disabled={!!item}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          padding: '0.75rem 0.5rem',
                          borderRadius: '10px',
                          border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                          backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                          cursor: item ? 'not-allowed' : 'pointer',
                          textAlign: 'center',
                          opacity: item && !isSelected ? 0.5 : 1,
                        }}
                      >
                        <Icon size={20} color={isSelected ? '#2563eb' : '#64748b'} />
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, marginTop: '0.25rem', color: isSelected ? '#1d4ed8' : '#334155' }}>
                          {t.label}
                        </span>
                        <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>{t.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Ledger info banner */}
                <div
                  style={{
                    marginTop: '0.625rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    backgroundColor: itemType === 'fuel' ? '#fef3c7' : itemType === 'stock_item' ? '#eff6ff' : '#f8fafc',
                    color: itemType === 'fuel' ? '#92400e' : itemType === 'stock_item' ? '#1e40af' : '#475569',
                    border: `1px solid ${itemType === 'fuel' ? '#fde68a' : itemType === 'stock_item' ? '#bfdbfe' : '#e2e8f0'}`,
                  }}
                >
                  {itemType === 'fuel' && 'Tracking Mode: Tank Ledger (automatic DIP variances, deliveries & nozzle sales).'}
                  {itemType === 'stock_item' && 'Tracking Mode: Quantity Ledger (real-time balance, stock transfers, reorder levels).'}
                  {itemType === 'non_stock_item' && 'Tracking Mode: None (consumables/operating items expensed directly upon receipt).'}
                  {itemType === 'service' && 'Tracking Mode: None (labour, maintenance, testing, or professional fees).'}
                </div>
              </div>

              {/* Core Information */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    Item Code *
                  </label>
                  <input
                    type="text"
                    placeholder={itemType === 'fuel' ? 'e.g. MS, HSD' : 'e.g. LUB-500ML'}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    Item Name *
                  </label>
                  <input
                    type="text"
                    placeholder={itemType === 'fuel' ? 'e.g. Petrol (Motor Spirit)' : 'e.g. Engine Oil 20W40'}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              </div>

              {/* Base Unit and HSN/SAC */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155' }}>
                      Base Unit of Measure *
                    </label>
                    <button
                      type="button"
                      onClick={() => setUnitModalOpen(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563eb',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      + Manage Units
                    </button>
                  </div>
                  <select
                    value={baseUnit}
                    onChange={(e) => setBaseUnit(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value="">Select Base Unit</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.code}) - {u.unit_type}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    HSN / SAC Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2710 or 9987"
                    value={hsnSac}
                    onChange={(e) => setHsnSac(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              </div>

              {/* Dynamic Profile: Fuel Profile */}
              {itemType === 'fuel' && (
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: '#fffbeb',
                    borderRadius: '10px',
                    border: '1px solid #fef3c7',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Fuel size={18} className="text-amber-600" />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400e' }}>
                      Forecourt Fuel Specifications
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#78350f', marginBottom: '0.25rem' }}>
                        Fuel Grade Classification *
                      </label>
                      <select
                        value={fuelType}
                        onChange={(e: any) => setFuelType(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #fde68a',
                          fontSize: '0.8125rem',
                          backgroundColor: '#ffffff',
                        }}
                      >
                        <option value="motor_spirit">Motor Spirit (Petrol / MS)</option>
                        <option value="high_speed_diesel">High Speed Diesel (HSD)</option>
                        <option value="cng">Compressed Natural Gas (CNG)</option>
                        <option value="lpg">Liquefied Petroleum Gas (LPG)</option>
                        <option value="other">Other Fuel Product</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#78350f', marginBottom: '0.25rem' }}>
                        Standard Density (kg/m³)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 745.0"
                        value={densityStandard}
                        onChange={(e) => setDensityStandard(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #fde68a',
                          fontSize: '0.8125rem',
                          backgroundColor: '#ffffff',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#78350f', marginBottom: '0.25rem' }}>
                        Color Accent
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="color"
                          value={colorCode}
                          onChange={(e) => setColorCode(e.target.value)}
                          style={{
                            width: '36px',
                            height: '36px',
                            padding: '0',
                            border: '1px solid #fde68a',
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        />
                        <span style={{ fontSize: '0.75rem', color: '#92400e', fontFamily: 'monospace' }}>{colorCode}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Dynamic Profile: Stock Item Profile */}
              {itemType === 'stock_item' && (
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: '#f0fdf4',
                    borderRadius: '10px',
                    border: '1px solid #bbf7d0',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Boxes size={18} className="text-emerald-600" />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#166534' }}>
                      Inventory & Reorder Thresholds
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#166534', marginBottom: '0.25rem' }}>
                        Reorder Level
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 20"
                        value={reorderLevel}
                        onChange={(e) => setReorderLevel(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #bbf7d0',
                          fontSize: '0.8125rem',
                          backgroundColor: '#ffffff',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#166534', marginBottom: '0.25rem' }}>
                        Reorder Qty
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 50"
                        value={reorderQuantity}
                        onChange={(e) => setReorderQuantity(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #bbf7d0',
                          fontSize: '0.8125rem',
                          backgroundColor: '#ffffff',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#166534', marginBottom: '0.25rem' }}>
                        Barcode / SKU
                      </label>
                      <input
                        type="text"
                        placeholder="Scan / code"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #bbf7d0',
                          fontSize: '0.8125rem',
                          backgroundColor: '#ffffff',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#166534', marginBottom: '0.25rem' }}>
                        Storage Shelf
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Rack A-2"
                        value={storageLocation}
                        onChange={(e) => setStorageLocation(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #bbf7d0',
                          fontSize: '0.8125rem',
                          backgroundColor: '#ffffff',
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Purchase Tax Treatment Mapping (Purchase Owned Architecture) */}
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <Percent size={18} className="text-blue-600" />
                  <div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>
                      Purchase Tax Treatment (Settings-Linked)
                    </span>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                      Pre-populates statutory GST rates and ITC eligibility on Purchase Bills
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                      Default Tax Treatment
                    </label>
                    <select
                      value={taxTreatmentId}
                      onChange={(e) => setTaxTreatmentId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.8125rem',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <option value="">-- No Default Tax Treatment --</option>
                      {taxTreatments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.tax_regime.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                      ITC Classification
                    </label>
                    <select
                      value={itcClassification}
                      onChange={(e) => setItcClassification(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.8125rem',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <option value="eligible_inputs">Eligible Inputs</option>
                      <option value="eligible_capital_goods">Eligible Capital Goods</option>
                      <option value="eligible_input_services">Eligible Input Services</option>
                      <option value="ineligible_blocked">Ineligible Blocked (Sec 17(5))</option>
                      <option value="ineligible_other">Ineligible Other</option>
                      <option value="not_applicable">Not Applicable</option>
                      <option value="pending_review">Pending Review</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                      Effective From
                    </label>
                    <input
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.8125rem',
                        backgroundColor: '#ffffff',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Description / Specification Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional item details, grade specifications or remarks"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              {/* Visibility and Availability */}
              <div style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={isPurchasable}
                    onChange={(e) => setIsPurchasable(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                  />
                  Purchasable (Available on Bills)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={isSellable}
                    onChange={(e) => setIsSellable(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
                  />
                  Sellable (Available on POS/Invoices)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#16a34a' }}
                  />
                  Active Master Status
                </label>
              </div>
            </form>
          </div>

          {/* Actions */}
          <div className="slider-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.625rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="item-drawer-form"
              disabled={saving}
              style={{
                padding: '0.625rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#2563eb',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              }}
            >
              {saving ? 'Saving...' : item ? 'Update Item' : 'Create Item'}
            </button>
          </div>
        </div>
      </div>

      {/* Unit Management Modal */}
      <UnitManagementModal
        isOpen={unitModalOpen}
        onClose={() => setUnitModalOpen(false)}
        onUnitsUpdated={loadAuxData}
      />
    </>
  );
};
