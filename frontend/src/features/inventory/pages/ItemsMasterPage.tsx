// frontend/src/features/inventory/pages/ItemsMasterPage.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchItems,
  deactivateItem
} from '@/api/client';
import type { Item, ItemType } from '@/features/inventory/types';
import { PageHeader } from '@/components/navigation/PageHeader';
import { UnitManagementModal } from '@/features/inventory/components/UnitManagementModal';
import {
  Package,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  PowerOff,
  Fuel,
  Boxes,
  Wrench,
  Scale,
  AlertCircle
} from 'lucide-react';

export const ItemsMasterPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  const typeParam = searchParams.get('type') as ItemType | null;

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>(typeParam || 'all');
  const [activeOnly, setActiveOnly] = useState(true);

  // Unit setup remains a small supporting dialog; item creation is a full page.
  const [unitModalOpen, setUnitModalOpen] = useState(false);

  const loadItems = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchItems(selectedOrgId);
      setItems(data);
    } catch (err: any) {
      console.error('Failed to load items:', err);
      setError('Failed to load Item Master catalog.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (typeParam) {
      setSelectedType(typeParam);
    }
  }, [typeParam]);

  const handleTypeTabChange = (type: string) => {
    setSelectedType(type);
    if (type === 'all') {
      searchParams.delete('type');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ type });
    }
  };

  const handleOpenCreate = (type?: ItemType) => {
    const initialType = type || (selectedType !== 'all' ? (selectedType as ItemType) : 'stock_item');
    navigate(`/app/inventory/items/new?type=${initialType}`);
  };

  const handleOpenEdit = (item: Item) => {
    navigate(`/app/inventory/items/${item.id}/edit`);
  };

  const handleDeactivate = async (item: Item) => {
    if (!selectedOrgId || !item.is_active) return;
    if (!window.confirm(`Deactivate item "${item.name}" (${item.code})? It will no longer appear on new transaction selectors.`)) return;

    try {
      await deactivateItem(selectedOrgId, item.id);
      loadItems();
    } catch (err: any) {
      console.error('Failed to update status:', err);
      alert(err?.data?.error || 'Failed to update item status.');
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.hsn_sac && item.hsn_sac.toLowerCase().includes(search.toLowerCase()));

    const matchesType = selectedType === 'all' || item.item_type === selectedType;
    const matchesActive = !activeOnly || item.is_active;

    return matchesSearch && matchesType && matchesActive;
  });

  const countByType = {
    all: items.length,
    fuel: items.filter((i) => i.item_type === 'fuel').length,
    stock_item: items.filter((i) => i.item_type === 'stock_item').length,
    non_stock_item: items.filter((i) => i.item_type === 'non_stock_item').length,
    service: items.filter((i) => i.item_type === 'service').length,
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Page Header */}
      <PageHeader
        title="Item Master"
        subtitle="Canonical product & service master catalog across Fuel, Forecourt, Inventory, Purchases and Sales"
        actions={
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              onClick={() => setUnitModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <Scale size={16} />
              Units & Conversions
            </button>
            <button
              onClick={() => handleOpenCreate()}
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
              New Item
            </button>
          </div>
        }
      />

      {/* Filter Tabs */}
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
            { id: 'all', label: 'All Items', icon: Package, count: countByType.all },
            { id: 'fuel', label: 'Fuel Products', icon: Fuel, count: countByType.fuel },
            { id: 'stock_item', label: 'Stock Items', icon: Boxes, count: countByType.stock_item },
            { id: 'non_stock_item', label: 'Non-Stock', icon: Package, count: countByType.non_stock_item },
            { id: 'service', label: 'Services', icon: Wrench, count: countByType.service },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = selectedType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTypeTabChange(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
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
                <Icon size={16} />
                <span>{tab.label}</span>
                <span
                  style={{
                    backgroundColor: isSelected ? '#dbeafe' : '#f1f5f9',
                    color: isSelected ? '#1e40af' : '#64748b',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: '#64748b', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              style={{ accentColor: '#2563eb' }}
            />
            Active Only
          </label>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ position: 'relative', flex: 1 }}>
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
            placeholder="Search items by code, name, HSN/SAC..."
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
      </div>

      {/* Error State */}
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

      {/* Table Card */}
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
              <th style={{ padding: '0.875rem 1.25rem', fontWeight: 600, color: '#475569' }}>Item Details</th>
              <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#475569' }}>Type</th>
              <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#475569' }}>Tracking Mode</th>
              <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#475569' }}>Base Unit</th>
              <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#475569' }}>Purchase Tax Treatment</th>
              <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#475569' }}>Channel</th>
              <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#475569' }}>Status</th>
              <th style={{ padding: '0.875rem 1.25rem', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  Loading canonical items...
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '3rem', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <Package size={40} style={{ color: '#cbd5e1' }} />
                    <span style={{ fontSize: '1rem', fontWeight: 500, color: '#475569' }}>
                      No items found
                    </span>
                    <span style={{ fontSize: '0.875rem', color: '#94a3b8', maxWidth: '360px' }}>
                      {search
                        ? 'Try adjusting your search filters or clear the search query.'
                        : 'Get started by creating your first canonical item in the catalog.'}
                    </span>
                    <button
                      onClick={() => handleOpenCreate()}
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: '0.8125rem',
                      }}
                    >
                      + Create Item
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredItems.map((it) => {
                const isFuel = it.item_type === 'fuel';
                const isStock = it.item_type === 'stock_item';
                const isService = it.item_type === 'service';

                return (
                  <tr
                    key={it.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      opacity: it.is_active ? 1 : 0.6,
                    }}
                  >
                    {/* Item Details */}
                    <td style={{ padding: '0.875rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isFuel ? '#fef3c7' : isStock ? '#eff6ff' : isService ? '#f3e8ff' : '#f1f5f9',
                            color: isFuel ? '#b45309' : isStock ? '#1d4ed8' : isService ? '#7e22ce' : '#475569',
                          }}
                        >
                          {isFuel ? <Fuel size={18} /> : isStock ? <Package size={18} /> : isService ? <Wrench size={18} /> : <Boxes size={18} />}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{it.name}</span>
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
                              {it.code}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                            {it.hsn_sac && <span>HSN/SAC: {it.hsn_sac}</span>}
                            {it.description && <span>• {it.description}</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span
                        style={{
                          textTransform: 'capitalize',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          padding: '0.25rem 0.625rem',
                          borderRadius: '9999px',
                          backgroundColor: isFuel ? '#fef3c7' : isStock ? '#eff6ff' : isService ? '#f3e8ff' : '#f1f5f9',
                          color: isFuel ? '#b45309' : isStock ? '#1d4ed8' : isService ? '#7e22ce' : '#475569',
                        }}
                      >
                        {it.item_type.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Tracking Mode */}
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          backgroundColor:
                            it.inventory_tracking_mode === 'tank'
                              ? '#fef3c7'
                              : it.inventory_tracking_mode === 'quantity'
                              ? '#ecfdf5'
                              : '#f8fafc',
                          color:
                            it.inventory_tracking_mode === 'tank'
                              ? '#92400e'
                              : it.inventory_tracking_mode === 'quantity'
                              ? '#065f46'
                              : '#64748b',
                          border: `1px solid ${
                            it.inventory_tracking_mode === 'tank'
                              ? '#fde68a'
                              : it.inventory_tracking_mode === 'quantity'
                              ? '#a7f3d0'
                              : '#e2e8f0'
                          }`,
                        }}
                      >
                        {it.inventory_tracking_mode === 'tank' && 'Tank Ledger'}
                        {it.inventory_tracking_mode === 'quantity' && 'Qty Ledger'}
                        {it.inventory_tracking_mode === 'none' && 'No Ledger'}
                      </span>
                    </td>

                    {/* Base Unit */}
                    <td style={{ padding: '0.875rem 1rem', fontWeight: 500, color: '#334155' }}>
                      {it.base_unit_code || it.base_unit_name || it.base_unit}
                    </td>

                    {/* Purchase Tax Treatment */}
                    <td style={{ padding: '0.875rem 1rem' }}>
                      {it.current_purchase_tax_treatment ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 500, color: '#1e293b' }}>
                            {it.current_purchase_tax_treatment.tax_treatment_name}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            ITC: {it.current_purchase_tax_treatment.default_itc_classification.replace('_', ' ')}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>No Default</span>
                      )}
                    </td>

                    {/* Channels */}
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        {it.is_purchasable && (
                          <span style={{ fontSize: '0.6875rem', backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                            Buy
                          </span>
                        )}
                        {it.is_sellable && (
                          <span style={{ fontSize: '0.6875rem', backgroundColor: '#f0fdf4', color: '#15803d', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                            Sell
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '0.875rem 1rem' }}>
                      {it.is_active ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#16a34a', fontSize: '0.8125rem' }}>
                          <CheckCircle2 size={14} /> Active
                        </span>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#94a3b8', fontSize: '0.8125rem' }}>
                          <XCircle size={14} /> Inactive
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleOpenEdit(it)}
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
                        {it.is_active && <button
                          onClick={() => handleDeactivate(it)}
                          title="Deactivate item"
                          style={{
                            padding: '0.375rem',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            backgroundColor: '#ffffff',
                            color: '#dc2626',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <PowerOff size={13} />
                        </button>}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Unit Management Modal */}
      <UnitManagementModal
        isOpen={unitModalOpen}
        onClose={() => setUnitModalOpen(false)}
        onUnitsUpdated={loadItems}
      />
    </div>
  );
};
