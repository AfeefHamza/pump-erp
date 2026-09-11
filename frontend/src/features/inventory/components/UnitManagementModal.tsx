// frontend/src/features/inventory/components/UnitManagementModal.tsx
import React, { useEffect, useState } from 'react';
import { useAppSelector } from '@/app/store';
import {
  fetchUnits,
  createUnit,
  fetchUnitConversions,
  createUnitConversion
} from '@/api/client';
import type { UnitMaster, UnitConversion } from '@/features/inventory/types';
import {
  X,
  Plus,
  Scale,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  Layers
} from 'lucide-react';

interface UnitManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnitsUpdated?: () => void;
}

export const UnitManagementModal: React.FC<UnitManagementModalProps> = ({
  isOpen,
  onClose,
  onUnitsUpdated,
}) => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  const [activeTab, setActiveTab] = useState<'units' | 'conversions'>('units');
  const [units, setUnits] = useState<UnitMaster[]>([]);
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Unit Form
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [unitCode, setUnitCode] = useState('');
  const [unitName, setUnitName] = useState('');
  const [unitType, setUnitType] = useState<'volume' | 'weight' | 'quantity' | 'service'>('quantity');

  // New Conversion Form
  const [showAddConversion, setShowAddConversion] = useState(false);
  const [fromUnitId, setFromUnitId] = useState('');
  const [toUnitId, setToUnitId] = useState('');
  const [multiplier, setMultiplier] = useState('');

  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const [unitsData, convData] = await Promise.all([
        fetchUnits(selectedOrgId),
        fetchUnitConversions(selectedOrgId),
      ]);
      setUnits(unitsData);
      setConversions(convData);
      if (unitsData.length >= 2) {
        setFromUnitId(unitsData[0].id);
        setToUnitId(unitsData[1].id);
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to load units and conversions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, selectedOrgId]);

  if (!isOpen) return null;

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !unitCode.trim() || !unitName.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const newUnit = await createUnit(selectedOrgId, {
        code: unitCode.trim().toUpperCase(),
        name: unitName.trim(),
        unit_type: unitType,
      });
      setUnits((prev) => [...prev, newUnit]);
      setUnitCode('');
      setUnitName('');
      setShowAddUnit(false);
      if (onUnitsUpdated) onUnitsUpdated();
    } catch (err: any) {
      console.error(err);
      setError(err?.data?.error || err?.message || 'Failed to create unit.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !fromUnitId || !toUnitId || !multiplier) return;

    if (fromUnitId === toUnitId) {
      setError('From Unit and To Unit cannot be the same.');
      return;
    }

    const multNum = parseFloat(multiplier);
    if (isNaN(multNum) || multNum <= 0) {
      setError('Conversion multiplier must be a positive number greater than 0.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const newConv = await createUnitConversion(selectedOrgId, {
        from_unit: fromUnitId,
        to_unit: toUnitId,
        multiplier: multiplier.trim(),
      });
      setConversions((prev) => [...prev, newConv]);
      setMultiplier('');
      setShowAddConversion(false);
    } catch (err: any) {
      console.error(err);
      setError(err?.data?.error || err?.message || 'Failed to create unit conversion.');
    } finally {
      setSaving(false);
    }
  };

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Scale size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#0f172a' }}>
                Units & Conversions
              </h3>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
                Manage base measurement units and conversion multipliers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e2e8f0',
            padding: '0 1.5rem',
            backgroundColor: '#ffffff',
          }}
        >
          <button
            onClick={() => setActiveTab('units')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              color: activeTab === 'units' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'units' ? '2px solid #2563eb' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Layers size={16} />
            Base Units ({units.length})
          </button>
          <button
            onClick={() => setActiveTab('conversions')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              color: activeTab === 'conversions' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'conversions' ? '2px solid #2563eb' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <ArrowRightLeft size={16} />
            Conversions ({conversions.length})
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              style={{
                marginBottom: '1rem',
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

          {activeTab === 'units' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}
              >
                <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                  Standard units of measurement used across fuel, inventory and services
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddUnit(!showAddUnit)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.375rem 0.75rem',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: '#2563eb',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  Add Unit
                </button>
              </div>

              {showAddUnit && (
                <form
                  onSubmit={handleCreateUnit}
                  style={{
                    marginBottom: '1.25rem',
                    padding: '1rem',
                    backgroundColor: '#f8fafc',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.5fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        Code *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. LTR, KG"
                        value={unitCode}
                        onChange={(e) => setUnitCode(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.875rem',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Litre, Kilogram"
                        value={unitName}
                        onChange={(e) => setUnitName(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.875rem',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        Type
                      </label>
                      <select
                        value={unitType}
                        onChange={(e: any) => setUnitType(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.875rem',
                        }}
                      >
                        <option value="volume">Volume</option>
                        <option value="weight">Weight</option>
                        <option value="quantity">Quantity</option>
                        <option value="service">Service</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddUnit(false)}
                      style={{
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.8125rem',
                        background: 'none',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#64748b',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      style={{
                        padding: '0.375rem 0.875rem',
                        fontSize: '0.8125rem',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      {saving ? 'Saving...' : 'Save Unit'}
                    </button>
                  </div>
                </form>
              )}

              {/* Units Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>Code</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>Name</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>Type</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                          Loading units...
                        </td>
                      </tr>
                    ) : (
                      units.map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#1e293b' }}>
                            <span style={{ backgroundColor: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                              {u.code}
                            </span>
                          </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>{u.name}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span
                            style={{
                              textTransform: 'capitalize',
                              fontSize: '0.75rem',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '9999px',
                              backgroundColor:
                                u.unit_type === 'volume'
                                  ? '#e0f2fe'
                                  : u.unit_type === 'weight'
                                  ? '#fef3c7'
                                  : u.unit_type === 'service'
                                  ? '#f3e8ff'
                                  : '#f1f5f9',
                              color:
                                u.unit_type === 'volume'
                                  ? '#0369a1'
                                  : u.unit_type === 'weight'
                                  ? '#b45309'
                                  : u.unit_type === 'service'
                                  ? '#7e22ce'
                                  : '#475569',
                            }}
                          >
                            {u.unit_type}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {u.is_active ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#16a34a', fontSize: '0.75rem' }}>
                              <CheckCircle2 size={13} /> Active
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Inactive</span>
                          )}
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'conversions' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}
              >
                <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                  Define conversions between different units (e.g. 1 Barrel = 159 Litres)
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddConversion(!showAddConversion)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.375rem 0.75rem',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: '#2563eb',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  Add Conversion
                </button>
              </div>

              {showAddConversion && (
                <form
                  onSubmit={handleCreateConversion}
                  style={{
                    marginBottom: '1.25rem',
                    padding: '1rem',
                    backgroundColor: '#f8fafc',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        From Unit *
                      </label>
                      <select
                        value={fromUnitId}
                        onChange={(e) => setFromUnitId(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.875rem',
                        }}
                      >
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.code} - {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        To Unit *
                      </label>
                      <select
                        value={toUnitId}
                        onChange={(e) => setToUnitId(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.875rem',
                        }}
                      >
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.code} - {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        Multiplier * (1 From = X To)
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        placeholder="e.g. 159.00"
                        value={multiplier}
                        onChange={(e) => setMultiplier(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.875rem',
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddConversion(false)}
                      style={{
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.8125rem',
                        background: 'none',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#64748b',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      style={{
                        padding: '0.375rem 0.875rem',
                        fontSize: '0.8125rem',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      {saving ? 'Saving...' : 'Save Conversion'}
                    </button>
                  </div>
                </form>
              )}

              {/* Conversions Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>From Unit</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>Conversion</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>To Unit</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>Multiplier</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>Inverse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversions.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                          No unit conversions configured yet.
                        </td>
                      </tr>
                    ) : (
                      conversions.map((c) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#1e293b' }}>
                            {c.from_unit_code || c.from_unit}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                            1 {c.from_unit_code} = {c.multiplier} {c.to_unit_code}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#1e293b' }}>
                            {c.to_unit_code || c.to_unit}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#2563eb', fontWeight: 500 }}>
                            {c.multiplier}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                            {c.inverse_multiplier || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: '#f8fafc',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              color: '#334155',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
