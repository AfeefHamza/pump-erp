import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchTanks,
  createTank,
  updateTank,
  fetchFuelProducts,
  type Tank,
  type FuelProduct,
  ApiError
} from '@/api/client';
import { Search, Plus, Ban, CheckCircle, RefreshCw, X, Edit2, Database, AlertCircle } from 'lucide-react';

export const TanksManagement: React.FC = () => {
  const { tankId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  // Lists & Loading
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [activeProducts, setActiveProducts] = useState<FuelProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'maintenance'>('all');

  // Drawer status
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [editingTank, setEditingTank] = useState<Tank | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    product: '',
    capacity: '',
    safe_fill_capacity: '',
    dead_stock_level: '',
    low_stock_threshold: '',
    manufacturer: '',
    serial_number: '',
    commissioned_on: '',
    status: 'active',
    notes: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    tank: Tank | null;
    status: 'active' | 'inactive' | 'maintenance';
  }>({
    isOpen: false,
    tank: null,
    status: 'active'
  });

  // Permissions
  const canView = usePermission('tank.view');
  const canCreate = usePermission('tank.create');
  const canUpdate = usePermission('tank.update');
  const canDeactivate = usePermission('tank.deactivate');

  const statusChoices = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'maintenance', label: 'Maintenance' },
  ];

  // Fetch list of tanks
  const loadTanks = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId) return;
    setLoading(true);
    try {
      const data = await fetchTanks(selectedOrgId, selectedOutletId);
      setTanks(data);
    } catch (err) {
      console.error('Failed to load tanks:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId]);

  // Fetch active products to choose from
  const loadProducts = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      const data = await fetchFuelProducts(selectedOrgId, { status: 'active' });
      setActiveProducts(data);
    } catch (err) {
      console.error('Failed to load fuel products:', err);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    loadTanks();
    loadProducts();
  }, [loadTanks, loadProducts]);

  useEffect(() => {
    const state = location.state as { openAdd?: boolean } | null;
    if (state && state.openAdd && activeProducts.length > 0) {
      navigate(location.pathname, { replace: true, state: {} });
      openAddDrawer();
    }
  }, [location, activeProducts, navigate]);

  // Open Drawer in Edit Mode
  const openEditDrawer = useCallback((tank: Tank) => {
    setEditingTank(tank);
    setDrawerMode('edit');
    setFormErrors({});
    setGeneralError(null);
    setFormData({
      code: tank.code || '',
      name: tank.name || '',
      product: tank.product || '',
      capacity: String(tank.capacity || ''),
      safe_fill_capacity: tank.safe_fill_capacity ? String(tank.safe_fill_capacity) : '',
      dead_stock_level: tank.dead_stock_level ? String(tank.dead_stock_level) : '',
      low_stock_threshold: tank.low_stock_threshold ? String(tank.low_stock_threshold) : '',
      manufacturer: tank.manufacturer || '',
      serial_number: tank.serial_number || '',
      commissioned_on: tank.commissioned_on || '',
      status: tank.status || 'active',
      notes: tank.notes || '',
    });
    setIsDrawerOpen(true);
  }, []);

  // Sync route param with drawer opening
  useEffect(() => {
    if (tankId && tanks.length > 0) {
      const tank = tanks.find((t) => t.id === tankId);
      if (tank) {
        openEditDrawer(tank);
      } else {
        navigate('/app/inventory/tanks');
      }
    } else if (!tankId && isDrawerOpen && drawerMode === 'edit') {
      setIsDrawerOpen(false);
      setEditingTank(null);
    }
  }, [tankId, tanks, openEditDrawer, isDrawerOpen, drawerMode, navigate]);

  // Handle drawer close
  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setEditingTank(null);
    if (tankId) {
      navigate('/app/inventory/tanks');
    }
  };

  // Open Add Drawer
  const openAddDrawer = () => {
    setDrawerMode('add');
    setEditingTank(null);
    setFormErrors({});
    setGeneralError(null);
    setFormData({
      code: '',
      name: '',
      product: activeProducts.length > 0 ? activeProducts[0].id : '',
      capacity: '',
      safe_fill_capacity: '',
      dead_stock_level: '',
      low_stock_threshold: '',
      manufacturer: '',
      serial_number: '',
      commissioned_on: '',
      status: 'active',
      notes: '',
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
    if (!selectedOrgId || !selectedOutletId) return;
    setActionLoading(true);
    setGeneralError(null);
    setFormErrors({});

    const payload = {
      code: formData.code.trim(),
      name: formData.name.trim(),
      product: formData.product,
      capacity: formData.capacity.trim(),
      safe_fill_capacity: formData.safe_fill_capacity.trim() || null,
      dead_stock_level: formData.dead_stock_level.trim() || null,
      low_stock_threshold: formData.low_stock_threshold.trim() || null,
      manufacturer: formData.manufacturer.trim() || null,
      serial_number: formData.serial_number.trim() || null,
      commissioned_on: formData.commissioned_on || null,
      status: formData.status as any,
      notes: formData.notes.trim() || null,
    };

    try {
      if (drawerMode === 'add') {
        await createTank(selectedOrgId, selectedOutletId, payload);
      } else if (editingTank) {
        await updateTank(selectedOrgId, selectedOutletId, editingTank.id, payload);
      }
      handleCloseDrawer();
      loadTanks();
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

  const handleStatusChangeClick = (tank: Tank, newStatus: 'active' | 'inactive' | 'maintenance') => {
    setConfirmModal({
      isOpen: true,
      tank,
      status: newStatus
    });
  };

  const handleConfirmStatusChange = async () => {
    const { tank, status } = confirmModal;
    if (!selectedOrgId || !selectedOutletId || !tank) return;

    try {
      await updateTank(selectedOrgId, selectedOutletId, tank.id, { status });
      setConfirmModal({ isOpen: false, tank: null, status: 'active' });
      loadTanks();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update tank status.');
    }
  };

  // Filter list
  const filteredTanks = tanks.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.product_name || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && t.status === 'active') ||
      (statusFilter === 'inactive' && t.status === 'inactive') ||
      (statusFilter === 'maintenance' && t.status === 'maintenance');

    return matchesSearch && matchesStatus;
  });

  if (!selectedOutletId) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', margin: '2rem' }}>
        <Database size={48} style={{ color: 'var(--color-accent)', opacity: 0.8, marginBottom: '1rem' }} />
        <h2 className="h3">Select an Outlet</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>Please select an outlet from the sidebar selector to manage storage tanks.</p>
      </div>
    );
  }

  if (!canView) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', margin: '2rem' }}>
        <Database size={48} style={{ color: 'var(--color-danger-text)', opacity: 0.8, marginBottom: '1rem' }} />
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>You do not have the required permissions to view tanks.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ position: 'relative', minHeight: 'calc(100vh - var(--topbar-height) - var(--space-xl))' }}>
      <div className="management-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="h2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Database style={{ color: 'var(--color-accent)' }} size={28} />
            <span>Storage Tanks</span>
          </h1>
          <p className="text-muted">Configure and monitor underground fuel storage tanks and capacity rules</p>
        </div>
        {canCreate && (
          <button
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={openAddDrawer}
          >
            <Plus size={18} />
            <span>Add Tank</span>
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="filters-bar" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
          <Search style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={16} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Search by tank name, code, or product..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="form-control"
          style={{ width: '180px' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Tanks</option>
          <option value="inactive">Inactive Tanks</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading tanks...</p>
        </div>
      ) : (
        <div className="card">
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tank Details</th>
                  <th>Code</th>
                  <th>Fuel Product</th>
                  <th>Capacity</th>
                  <th>Thresholds</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTanks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      {t.serial_number && <div className="text-muted" style={{ fontSize: '0.75rem' }}>S/N: {t.serial_number}</div>}
                    </td>
                    <td>
                      <code style={{ fontSize: '0.9rem', color: 'var(--color-accent)' }}>{t.code}</code>
                    </td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{t.product_name}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {parseFloat(t.capacity).toLocaleString('en-IN')} {t.product_unit}s
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>
                        <div>Safe Fill: {t.safe_fill_capacity ? `${parseFloat(t.safe_fill_capacity).toLocaleString('en-IN')} ${t.product_unit}s` : '—'}</div>
                        <div className="text-muted">Low Limit: {t.low_stock_threshold ? `${parseFloat(t.low_stock_threshold).toLocaleString('en-IN')} ${t.product_unit}s` : '—'}</div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${t.status === 'active' ? 'badge-success' : t.status === 'inactive' ? 'badge-danger' : 'badge-warning'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {canUpdate && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => navigate(`/app/inventory/tanks/${t.id}`)}
                            title="Edit Tank Details"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {canDeactivate && (
                          t.status === 'active' ? (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleStatusChangeClick(t, 'inactive')}
                              title="Deactivate Tank"
                            >
                              <Ban size={14} />
                            </button>
                          ) : (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleStatusChangeClick(t, 'active')}
                              title="Activate Tank"
                            >
                              <CheckCircle size={14} />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredTanks.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                      <p className="text-muted">No underground storage tanks configured for this outlet yet.</p>
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
          <div className="slider-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '550px' }}>
            <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={20} style={{ color: 'var(--color-accent)' }} />
                <span>{drawerMode === 'add' ? 'Add Storage Tank' : 'Edit Storage Tank'}</span>
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

              {/* Calibration Chart Info Notice */}
              <div className="alert alert-info" style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Dip Calibration Notice</strong>
                  <p style={{ margin: '0.15rem 0 0 0' }}>Calibration charts and dip lookup formulas are not configured for this tank yet. Readings will be based on physical volumes.</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Tank Name *</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.name ? 'error' : ''}`}
                    placeholder="e.g. Tank 1 (Petrol)"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    required
                  />
                  {formErrors.name && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.name}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Tank Code *</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.code ? 'error' : ''}`}
                    placeholder="e.g. TK-01"
                    value={formData.code}
                    onChange={(e) => handleInputChange('code', e.target.value)}
                    required
                    disabled={drawerMode === 'edit'} // Lock code on edit
                  />
                  {formErrors.code && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.code}</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Stored Fuel Product *</label>
                  <select
                    className={`form-control ${formErrors.product ? 'error' : ''}`}
                    value={formData.product}
                    onChange={(e) => handleInputChange('product', e.target.value)}
                    required
                  >
                    <option value="">Select a product...</option>
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                  {formErrors.product && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.product}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Capacity (Litres) *</label>
                  <input
                    type="number"
                    step="0.01"
                    className={`form-control ${formErrors.capacity ? 'error' : ''}`}
                    placeholder="e.g. 15000"
                    value={formData.capacity}
                    onChange={(e) => handleInputChange('capacity', e.target.value)}
                    required
                  />
                  {formErrors.capacity && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.capacity}</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Safe-Fill Capacity (Litres)</label>
                  <input
                    type="number"
                    step="0.01"
                    className={`form-control ${formErrors.safe_fill_capacity ? 'error' : ''}`}
                    placeholder="e.g. 14500"
                    value={formData.safe_fill_capacity}
                    onChange={(e) => handleInputChange('safe_fill_capacity', e.target.value)}
                  />
                  {formErrors.safe_fill_capacity && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.safe_fill_capacity}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Dead-Stock Level (Litres)</label>
                  <input
                    type="number"
                    step="0.01"
                    className={`form-control ${formErrors.dead_stock_level ? 'error' : ''}`}
                    placeholder="e.g. 500"
                    value={formData.dead_stock_level}
                    onChange={(e) => handleInputChange('dead_stock_level', e.target.value)}
                  />
                  {formErrors.dead_stock_level && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.dead_stock_level}</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Low Stock Warning Limit</label>
                  <input
                    type="number"
                    step="0.01"
                    className={`form-control ${formErrors.low_stock_threshold ? 'error' : ''}`}
                    placeholder="e.g. 2000"
                    value={formData.low_stock_threshold}
                    onChange={(e) => handleInputChange('low_stock_threshold', e.target.value)}
                  />
                  {formErrors.low_stock_threshold && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.low_stock_threshold}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Tank Status</label>
                  <select
                    className="form-control"
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    disabled={drawerMode === 'add'}
                  >
                    {statusChoices.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Manufacturer</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Owens Corning"
                    value={formData.manufacturer}
                    onChange={(e) => handleInputChange('manufacturer', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Serial Number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. SN-983274"
                    value={formData.serial_number}
                    onChange={(e) => handleInputChange('serial_number', e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Commissioned Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={formData.commissioned_on}
                  onChange={(e) => handleInputChange('commissioned_on', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  placeholder="Enter any maintenance notes or instructions..."
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                />
              </div>

              <div className="slider-footer" style={{ marginTop: 'auto', display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseDrawer} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Save Tank'}
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
              Are you sure you want to change the status of tank "{confirmModal.tank?.name}" to <strong>{confirmModal.status}</strong>?
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmModal({ isOpen: false, tank: null, status: 'active' })}>
                Cancel
              </button>
              <button 
                className={`btn ${confirmModal.status === 'inactive' ? 'btn-danger' : confirmModal.status === 'maintenance' ? 'btn-warning' : 'btn-success'}`}
                onClick={handleConfirmStatusChange}
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
