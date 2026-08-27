import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector, setOutlet } from '@/app/store';
import { refreshUser } from '@/features/auth/authSlice';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchOutlets,
  createOutlet,
  updateOutlet,
  fetchOutlet,
  type OutletDetail,
  ApiError
} from '@/api/client';
import { Search, Plus, Ban, CheckCircle, RefreshCw, X, Edit2, MapPin, Mail, Phone, Store } from 'lucide-react';
import { PageHeader } from '@/components/navigation/PageHeader';

export const OutletsManagement: React.FC = () => {
  const { outletId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  // Lists and loading
  const [outlets, setOutlets] = useState<OutletDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Drawer status
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [editingOutlet, setEditingOutlet] = useState<OutletDetail | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    outlet_type: 'fuel_station',
    operating_brand_code: 'IOCL',
    operating_brand_name: 'Indian Oil (IOCL)',
    dealer_code: '',
    phone_number: '',
    email: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    district: '',
    state: '',
    postal_code: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Permissions
  const canView = usePermission('outlet.view');
  const canCreate = usePermission('outlet.create');
  const canUpdate = usePermission('outlet.update');
  const canDeactivate = usePermission('outlet.deactivate');

  // Choices lists
  const brandChoices = [
    { code: 'IOCL', name: 'Indian Oil (IOCL)' },
    { code: 'BPCL', name: 'Bharat Petroleum (BPCL)' },
    { code: 'HPCL', name: 'Hindustan Petroleum (HPCL)' },
    { code: 'Nayara', name: 'Nayara Energy' },
    { code: 'Shell', name: 'Shell' },
    { code: 'Jio-bp', name: 'Jio-bp' },
    { code: 'Independent', name: 'Independent' },
    { code: 'Other', name: 'Other (Custom Brand)' }
  ];

  const outletTypes = [
    { code: 'fuel_station', name: 'Fuel Station' },
    { code: 'fuel_and_ev', name: 'Fuel & EV Station' },
    { code: 'ev_station', name: 'EV Station' },
    { code: 'other', name: 'Other' }
  ];

  // Fetch list of outlets
  const loadOutlets = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const data = await fetchOutlets(selectedOrgId);
      setOutlets(data);
    } catch (err) {
      console.error('Failed to fetch outlets:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOutlets();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadOutlets]);

  // Open Drawer in Edit Mode
  const openEditDrawer = useCallback((outlet: OutletDetail) => {
    setEditingOutlet(outlet);
    setDrawerMode('edit');
    setFormErrors({});
    setGeneralError(null);
    setFormData({
      name: outlet.name || '',
      code: outlet.code || '',
      outlet_type: outlet.outlet_type || 'fuel_station',
      operating_brand_code: outlet.operating_brand_code || 'IOCL',
      operating_brand_name: outlet.operating_brand_name || '',
      dealer_code: outlet.dealer_code || '',
      phone_number: outlet.phone_number || '',
      email: outlet.email || '',
      address_line_1: outlet.address_line_1 || '',
      address_line_2: outlet.address_line_2 || '',
      city: outlet.city || '',
      district: outlet.district || '',
      state: outlet.state || '',
      postal_code: outlet.postal_code || '',
    });
    setIsDrawerOpen(true);
  }, []);

  // Sync route param with drawer opening
  useEffect(() => {
    if (outletId && outlets.length > 0) {
      const outlet = outlets.find((o) => o.id === outletId);
      if (outlet) {
        const timer = setTimeout(() => {
          openEditDrawer(outlet);
        }, 0);
        return () => clearTimeout(timer);
      } else {
        // Fetch outlet details if it's not present in pre-loaded list
        const loadSingleOutlet = async () => {
          if (!selectedOrgId) return;
          try {
            const data = await fetchOutlet(selectedOrgId, outletId);
            const timer = setTimeout(() => {
              openEditDrawer(data);
            }, 0);
            return () => clearTimeout(timer);
          } catch (err) {
            console.error('Failed to fetch single outlet:', err);
            navigate('/app/settings/outlets');
          }
        };
        loadSingleOutlet();
      }
    } else if (!outletId && isDrawerOpen && drawerMode === 'edit') {
      const timer = setTimeout(() => {
        setIsDrawerOpen(false);
        setEditingOutlet(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [outletId, outlets, openEditDrawer, isDrawerOpen, drawerMode, selectedOrgId, navigate]);

  // Handle drawer close
  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setEditingOutlet(null);
    if (outletId) {
      navigate('/app/settings/outlets');
    }
  };

  // Open Add Drawer
  const openAddDrawer = () => {
    setDrawerMode('add');
    setEditingOutlet(null);
    setFormErrors({});
    setGeneralError(null);
    setFormData({
      name: '',
      code: '',
      outlet_type: 'fuel_station',
      operating_brand_code: 'IOCL',
      operating_brand_name: 'Indian Oil (IOCL)',
      dealer_code: '',
      phone_number: '',
      email: '',
      address_line_1: '',
      address_line_2: '',
      city: '',
      district: '',
      state: '',
      postal_code: '',
    });
    setIsDrawerOpen(true);
  };

  // Sync location state from selector
  useEffect(() => {
    const state = location.state as { openAdd?: boolean } | null;
    if (state && state.openAdd) {
      const timer = setTimeout(() => {
        openAddDrawer();
      }, 0);
      // Clear the state so it doesn't open again on page refresh
      navigate(location.pathname, { replace: true, state: {} });
      return () => clearTimeout(timer);
    }
  }, [location, navigate]);

  // Form field change handler
  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      // Keep brand name in sync unless code is 'Other'
      if (field === 'operating_brand_code') {
        if (value !== 'Other') {
          updated.operating_brand_name = brandChoices.find((b) => b.code === value)?.name || value;
        } else {
          updated.operating_brand_name = '';
        }
      }
      return updated;
    });

    if (formErrors[field]) {
      setFormErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  // Submit Outlet save (Create or Edit)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;

    setActionLoading(true);
    setFormErrors({});
    setGeneralError(null);

    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim(),
        outlet_type: formData.outlet_type as 'fuel_station' | 'fuel_and_ev' | 'ev_station' | 'other',
        operating_brand_code: formData.operating_brand_code,
        operating_brand_name: formData.operating_brand_name.trim(),
        dealer_code: formData.dealer_code.trim() || undefined,
        phone_number: formData.phone_number.trim() || undefined,
        email: formData.email.trim() || undefined,
        address_line_1: formData.address_line_1.trim() || undefined,
        address_line_2: formData.address_line_2.trim() || undefined,
        city: formData.city.trim() || undefined,
        district: formData.district.trim() || undefined,
        state: formData.state.trim() || undefined,
        postal_code: formData.postal_code.trim() || undefined,
      };

      if (drawerMode === 'add') {
        const newOutlet = await createOutlet(selectedOrgId, payload);
        handleCloseDrawer();
        loadOutlets();
        const result = await dispatch(refreshUser()).unwrap();
        const currentOrg = result.organisations.find((org) => org.id === selectedOrgId);
        const exists = currentOrg?.outlets.some((o) => o.id === newOutlet.id);
        if (exists) {
          dispatch(setOutlet(newOutlet.id));
        }
      } else if (editingOutlet) {
        await updateOutlet(selectedOrgId, editingOutlet.id, payload);
        handleCloseDrawer();
        loadOutlets();
        await dispatch(refreshUser());
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.data && typeof err.data === 'object') {
        const errorsObj: Record<string, string> = {};
        Object.entries(err.data).forEach(([key, val]) => {
          if (Array.isArray(val) && val.length > 0) {
            errorsObj[key] = val[0];
          } else if (typeof val === 'string') {
            errorsObj[key] = val;
          }
        });
        setFormErrors(errorsObj);
        setGeneralError(err.message || 'Failed to save outlet.');
      } else {
        setGeneralError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle status (Active / Inactive)
  const handleToggleStatus = async (outlet: OutletDetail) => {
    if (!selectedOrgId) return;
    const isDeactivating = outlet.status === 'active';
    const actionText = isDeactivating ? 'deactivate' : 'reactivate';

    if (!confirm(`Are you sure you want to ${actionText} the outlet "${outlet.name}"?`)) {
      return;
    }

    try {
      const nextStatus = isDeactivating ? 'inactive' : 'active';
      await updateOutlet(selectedOrgId, outlet.id, { status: nextStatus });
      loadOutlets();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'An error occurred while updating the status.');
    }
  };

  // Filtering
  const filteredOutlets = outlets.filter((o) => {
    const matchesSearch =
      o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.operating_brand_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.city || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && o.status === 'active') ||
      (statusFilter === 'inactive' && o.status === 'inactive');

    return matchesSearch && matchesStatus;
  });

  if (!canView) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', margin: '2rem' }}>
        <Store size={48} style={{ color: 'var(--color-danger-text)', opacity: 0.8, marginBottom: '1rem' }} />
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>You do not have the required permissions to view outlets list.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ position: 'relative', minHeight: 'calc(100vh - var(--topbar-height) - var(--space-xl))' }}>
      <PageHeader
        title="Outlets"
        subtitle="Manage fuel-station outlets in this organisation"
        backLink={{ to: '/app/settings', label: 'Back to Settings' }}
        actions={canCreate && (
          <button 
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={openAddDrawer}
          >
            <Plus size={18} />
            <span>Add Outlet</span>
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
            placeholder="Search by name, code, brand, or city..."
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
          <option value="active">Active Outlets</option>
          <option value="inactive">Inactive Outlets</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading outlets...</p>
        </div>
      ) : (
        <div className="card">
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Outlet Name</th>
                  <th>Code</th>
                  <th>Operating Brand</th>
                  <th>City / District</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOutlets.map((outlet) => (
                  <tr key={outlet.id}>
                    <td>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{outlet.name}</span>
                        {outlet.outlet_type !== 'fuel_station' && (
                          <span className="badge badge-secondary" style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                            {outlet.outlet_type.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      {(outlet.phone_number || outlet.email) && (
                        <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem', display: 'flex', gap: '0.75rem' }}>
                          {outlet.phone_number && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                              <Phone size={10} /> {outlet.phone_number}
                            </span>
                          )}
                          {outlet.email && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                              <Mail size={10} /> {outlet.email}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <code style={{ fontSize: '0.9rem', color: 'var(--color-accent)' }}>{outlet.code}</code>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{outlet.operating_brand_name || 'No Brand'}</div>
                      {outlet.dealer_code && (
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>Dealer Code: {outlet.dealer_code}</div>
                      )}
                    </td>
                    <td>
                      {outlet.city || outlet.district ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <MapPin size={12} className="text-muted" />
                          <span>
                            {[outlet.city, outlet.district].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${outlet.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                        {outlet.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {canUpdate && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => navigate(`/app/settings/outlets/${outlet.id}`)}
                            title="Edit Outlet"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {canDeactivate && (
                          outlet.status === 'active' ? (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleToggleStatus(outlet)}
                              title="Deactivate Outlet"
                            >
                              <Ban size={14} />
                            </button>
                          ) : (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleToggleStatus(outlet)}
                              title="Reactivate Outlet"
                            >
                              <CheckCircle size={14} />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredOutlets.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                      <p className="text-muted">No outlets found matching your criteria.</p>
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
                <Store size={20} style={{ color: 'var(--color-accent)' }} />
                <span>{drawerMode === 'add' ? 'Add New Outlet' : 'Edit Outlet'}</span>
              </h3>
              <button className="btn-close" onClick={handleCloseDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="slider-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', overflowY: 'auto', height: 'calc(100% - 65px)' }}>
              {generalError && (
                <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                  <span>{generalError}</span>
                </div>
              )}

              {/* Basic Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Outlet Name *</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.name ? 'error' : ''}`}
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    required
                  />
                  {formErrors.name && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.name}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Outlet Code *</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.code ? 'error' : ''}`}
                    placeholder="e.g. OUT-001"
                    value={formData.code}
                    onChange={(e) => handleInputChange('code', e.target.value)}
                    required
                  />
                  {formErrors.code && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.code}</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Outlet Type</label>
                  <select
                    className="form-control"
                    value={formData.outlet_type}
                    onChange={(e) => handleInputChange('outlet_type', e.target.value)}
                  >
                    {outletTypes.map((t) => (
                      <option key={t.code} value={t.code}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Operating Brand</label>
                  <select
                    className="form-control"
                    value={formData.operating_brand_code}
                    onChange={(e) => handleInputChange('operating_brand_code', e.target.value)}
                  >
                    {brandChoices.map((b) => (
                      <option key={b.code} value={b.code}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.operating_brand_code === 'Other' && (
                <div className="form-group">
                  <label className="form-label">Custom Brand Name *</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.operating_brand_name ? 'error' : ''}`}
                    placeholder="Enter custom operating brand name"
                    value={formData.operating_brand_name}
                    onChange={(e) => handleInputChange('operating_brand_name', e.target.value)}
                    required
                  />
                  {formErrors.operating_brand_name && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.operating_brand_name}</span>}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Dealer Code (Optional)</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.dealer_code ? 'error' : ''}`}
                    value={formData.dealer_code}
                    onChange={(e) => handleInputChange('dealer_code', e.target.value)}
                  />
                  {formErrors.dealer_code && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.dealer_code}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Phone Number (Optional)</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.phone_number ? 'error' : ''}`}
                    placeholder="e.g. +91 99999 99999"
                    value={formData.phone_number}
                    onChange={(e) => handleInputChange('phone_number', e.target.value)}
                  />
                  {formErrors.phone_number && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.phone_number}</span>}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email Address (Optional)</label>
                <input
                  type="email"
                  className={`form-control ${formErrors.email ? 'error' : ''}`}
                  placeholder="e.g. outlet@company.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                />
                {formErrors.email && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.email}</span>}
              </div>

              {/* Address Fields */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-main)' }}>Location Address</h4>
              </div>

              <div className="form-group">
                <label className="form-label">Address Line 1</label>
                <input
                  type="text"
                  className={`form-control ${formErrors.address_line_1 ? 'error' : ''}`}
                  value={formData.address_line_1}
                  onChange={(e) => handleInputChange('address_line_1', e.target.value)}
                />
                {formErrors.address_line_1 && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.address_line_1}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Address Line 2</label>
                <input
                  type="text"
                  className={`form-control ${formErrors.address_line_2 ? 'error' : ''}`}
                  value={formData.address_line_2}
                  onChange={(e) => handleInputChange('address_line_2', e.target.value)}
                />
                {formErrors.address_line_2 && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.address_line_2}</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.city ? 'error' : ''}`}
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                  />
                  {formErrors.city && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.city}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">District</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.district ? 'error' : ''}`}
                    value={formData.district}
                    onChange={(e) => handleInputChange('district', e.target.value)}
                  />
                  {formErrors.district && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.district}</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">State</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.state ? 'error' : ''}`}
                    value={formData.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                  />
                  {formErrors.state && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.state}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Postal Code</label>
                  <input
                    type="text"
                    className={`form-control ${formErrors.postal_code ? 'error' : ''}`}
                    value={formData.postal_code}
                    onChange={(e) => handleInputChange('postal_code', e.target.value)}
                  />
                  {formErrors.postal_code && <span className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{formErrors.postal_code}</span>}
                </div>
              </div>

              {/* Actions */}
              <div className="slider-actions" style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={handleCloseDrawer}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                  disabled={actionLoading}
                >
                  {actionLoading && <RefreshCw className="animate-spin" size={14} />}
                  <span>Save Outlet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
