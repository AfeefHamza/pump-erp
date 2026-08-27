import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchFuelProducts,
  createFuelProduct,
  updateFuelProduct,
  type FuelProduct,
  ApiError
} from '@/api/client';
import { Search, Plus, Ban, CheckCircle, RefreshCw, X, Edit2, Fuel } from 'lucide-react';
import { PageHeader } from '@/components/navigation/PageHeader';

export const FuelProducts: React.FC = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  // State
  const [products, setProducts] = useState<FuelProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [editingProduct, setEditingProduct] = useState<FuelProduct | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    short_name: '',
    category: 'petrol',
    custom_category_name: '',
    unit: 'litre',
    display_order: '0',
    is_active: true,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    product: FuelProduct | null;
    action: 'deactivate' | 'reactivate';
  }>({
    isOpen: false,
    product: null,
    action: 'deactivate'
  });

  // Permissions
  const canView = usePermission('fuel_product.view');
  const canCreate = usePermission('fuel_product.create');
  const canUpdate = usePermission('fuel_product.update');
  const canDeactivate = usePermission('fuel_product.deactivate');

  const categories = [
    { value: 'petrol', label: 'Petrol' },
    { value: 'diesel', label: 'Diesel' },
    { value: 'premium_petrol', label: 'Premium Petrol' },
    { value: 'premium_diesel', label: 'Premium Diesel' },
    { value: 'cng', label: 'CNG' },
    { value: 'adblue', label: 'AdBlue' },
    { value: 'other', label: 'Other' },
  ];

  const units = [
    { value: 'litre', label: 'Litre' },
    { value: 'kilogram', label: 'Kilogram' },
  ];

  const loadProducts = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const data = await fetchFuelProducts(selectedOrgId);
      setProducts(data);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const openEditDrawer = useCallback((product: FuelProduct) => {
    setEditingProduct(product);
    setDrawerMode('edit');
    setFormErrors({});
    setGeneralError(null);
    setFormData({
      code: product.code || '',
      name: product.name || '',
      short_name: product.short_name || '',
      category: product.category || 'petrol',
      custom_category_name: product.custom_category_name || '',
      unit: product.unit || 'litre',
      display_order: String(product.display_order ?? 0),
      is_active: product.is_active,
    });
    setIsDrawerOpen(true);
  }, []);

  // Synchronize router parameters
  useEffect(() => {
    if (productId && products.length > 0) {
      const product = products.find((p) => p.id === productId);
      if (product) {
        openEditDrawer(product);
      } else {
        navigate('/app/settings/products');
      }
    } else if (!productId && isDrawerOpen && drawerMode === 'edit') {
      setIsDrawerOpen(false);
      setEditingProduct(null);
    }
  }, [productId, products, openEditDrawer, isDrawerOpen, drawerMode, navigate]);

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setEditingProduct(null);
    if (productId) {
      navigate('/app/settings/products');
    }
  };

  const openAddDrawer = () => {
    setDrawerMode('add');
    setEditingProduct(null);
    setFormErrors({});
    setGeneralError(null);
    setFormData({
      code: '',
      name: '',
      short_name: '',
      category: 'petrol',
      custom_category_name: '',
      unit: 'litre',
      display_order: '0',
      is_active: true,
    });
    setIsDrawerOpen(true);
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    setActionLoading(true);
    setGeneralError(null);
    setFormErrors({});

    const payload = {
      code: formData.code.trim(),
      name: formData.name.trim(),
      short_name: formData.short_name.trim() || null,
      category: formData.category as FuelProduct['category'],
      custom_category_name: formData.category === 'other' ? formData.custom_category_name.trim() : null,
      unit: formData.unit as FuelProduct['unit'],
      display_order: parseInt(formData.display_order) || 0,
      is_active: formData.is_active,
    };

    try {
      if (drawerMode === 'add') {
        await createFuelProduct(selectedOrgId, payload);
      } else if (editingProduct) {
        await updateFuelProduct(selectedOrgId, editingProduct.id, payload);
      }
      handleCloseDrawer();
      loadProducts();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 400 && typeof err.data === 'object' && err.data !== null) {
          const errors = err.data as Record<string, string[] | string>;
          const formatted: Record<string, string> = {};
          Object.keys(errors).forEach((key) => {
            const val = errors[key];
            formatted[key] = Array.isArray(val) ? val[0] : String(val);
          });
          setFormErrors(formatted);
        } else {
          setGeneralError(err.message);
        }
      } else {
        setGeneralError('An unexpected error occurred.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleStatusClick = (product: FuelProduct) => {
    setConfirmModal({
      isOpen: true,
      product,
      action: product.is_active ? 'deactivate' : 'reactivate'
    });
  };

  const handleConfirmToggleStatus = async () => {
    const { product, action } = confirmModal;
    if (!selectedOrgId || !product) return;

    try {
      await updateFuelProduct(selectedOrgId, product.id, {
        is_active: action === 'reactivate'
      });
      setConfirmModal({ isOpen: false, product: null, action: 'deactivate' });
      loadProducts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update status.');
    }
  };

  // Filter list
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.short_name || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && p.is_active) ||
      (statusFilter === 'inactive' && !p.is_active);

    return matchesSearch && matchesStatus;
  });

  if (!canView) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', margin: '2rem' }}>
        <Fuel size={48} style={{ color: 'var(--color-danger-text)', opacity: 0.8, marginBottom: '1rem' }} />
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>You do not have the required permissions to view fuel products.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ position: 'relative', minHeight: 'calc(100vh - var(--topbar-height) - var(--space-xl))' }}>
      <PageHeader
        title="Fuel Products"
        subtitle="Configure active fuel types and operational products in the organisation"
        backLink={{ to: '/app/settings', label: 'Back to Settings' }}
        actions={canCreate && (
          <button 
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={openAddDrawer}
          >
            <Plus size={18} />
            <span>Add Product</span>
          </button>
        )}
      />

      {/* Filters Bar */}
      <div className="filters-bar" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
          <Search style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={16} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Search by name, code, or short name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="form-control"
          style={{ width: '180px' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Products</option>
          <option value="inactive">Inactive Products</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading fuel products...</p>
        </div>
      ) : (
        <div className="card">
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Code</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Display Order</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {p.short_name && <div className="text-muted" style={{ fontSize: '0.8rem' }}>Short Name: {p.short_name}</div>}
                    </td>
                    <td>
                      <code style={{ fontSize: '0.9rem', color: 'var(--color-accent)' }}>{p.code}</code>
                    </td>
                    <td>
                      <span style={{ textTransform: 'capitalize' }}>
                        {p.category === 'other' && p.custom_category_name ? p.custom_category_name : p.category.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <span style={{ textTransform: 'capitalize' }}>{p.unit}</span>
                    </td>
                    <td>{p.display_order}</td>
                    <td>
                      <span className={`badge ${p.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {p.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {canUpdate && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => navigate(`/app/settings/products/${p.id}`)}
                            title="Edit Product"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {canDeactivate && (
                          p.is_active ? (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleToggleStatusClick(p)}
                              title="Deactivate Product"
                            >
                              <Ban size={14} />
                            </button>
                          ) : (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleToggleStatusClick(p)}
                              title="Reactivate Product"
                            >
                              <CheckCircle size={14} />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                      <p className="text-muted">No fuel products configured yet.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Drawer */}
      {isDrawerOpen && (
        <div className="slider-overlay" onClick={handleCloseDrawer}>
          <div className="slider-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px' }}>
            <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Fuel size={20} style={{ color: 'var(--color-accent)' }} />
                <span>{drawerMode === 'add' ? 'Add Fuel Product' : 'Edit Fuel Product'}</span>
              </h3>
              <button className="btn-close" onClick={handleCloseDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="slider-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', overflowY: 'auto', height: 'calc(100% - 65px)' }}>
              {generalError && (
                <div className="alert alert-danger" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                  {generalError}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Product Name *</label>
                <input
                  type="text"
                  className={`form-control ${formErrors.name ? 'error' : ''}`}
                  placeholder="e.g. Regular Petrol"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                />
                {formErrors.name && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.name}</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Product Code *</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.code ? 'error' : ''}`}
                    placeholder="e.g. MS"
                    value={formData.code}
                    onChange={(e) => handleInputChange('code', e.target.value)}
                    required
                    disabled={drawerMode === 'edit'} // Lock code on edit
                  />
                  {formErrors.code && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.code}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Short Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. ULG"
                    value={formData.short_name}
                    onChange={(e) => handleInputChange('short_name', e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="form-control"
                    value={formData.category}
                    onChange={(e) => handleInputChange('category', e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Stock Unit</label>
                  <select
                    className="form-control"
                    value={formData.unit}
                    onChange={(e) => handleInputChange('unit', e.target.value)}
                  >
                    {units.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.category === 'other' && (
                <div className="form-group">
                  <label className="form-label">Custom Category Name *</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.custom_category_name ? 'error' : ''}`}
                    placeholder="e.g. Bio-Fuel"
                    value={formData.custom_category_name}
                    onChange={(e) => handleInputChange('custom_category_name', e.target.value)}
                    required
                  />
                  {formErrors.custom_category_name && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.custom_category_name}</span>}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                <div className="form-group">
                  <label className="form-label">Display Order</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.display_order}
                    onChange={(e) => handleInputChange('display_order', e.target.value)}
                  />
                </div>

                {drawerMode === 'edit' && (
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={formData.is_active}
                      onChange={(e) => handleInputChange('is_active', e.target.checked)}
                      disabled={!canDeactivate}
                      style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                    />
                    <label htmlFor="is_active" style={{ cursor: 'pointer', fontWeight: 500 }}>Active Status</label>
                  </div>
                )}
              </div>

              <div className="slider-footer" style={{ marginTop: 'auto', display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseDrawer} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Deactivate Modal */}
      {confirmModal.isOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 className="h4" style={{ margin: 0 }}>Confirm Status Update</h3>
            <p className="text-muted">
              Are you sure you want to <strong>{confirmModal.action}</strong> the fuel product "{confirmModal.product?.name}"?
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmModal({ isOpen: false, product: null, action: 'deactivate' })}>
                Cancel
              </button>
              <button 
                className={`btn ${confirmModal.action === 'deactivate' ? 'btn-danger' : 'btn-success'}`}
                onClick={handleConfirmToggleStatus}
              >
                Yes, Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
