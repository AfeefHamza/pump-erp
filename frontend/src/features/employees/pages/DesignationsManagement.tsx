import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchDesignations,
  createDesignation,
  updateDesignation,
  type EmployeeDesignation
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { Search, Plus, Ban, CheckCircle, RefreshCw, X, Edit2, Briefcase, ChevronLeft, AlertCircle } from 'lucide-react';

export const DesignationsManagement: React.FC = () => {
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  // Lists & State
  const [designations, setDesignations] = useState<EmployeeDesignation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [editingDesignation, setEditingDesignation] = useState<EmployeeDesignation | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    requires_nozzle_assignment: false,
    is_active: true,
    display_order: '0',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Permissions
  const canView = usePermission('employee_designation.view');
  const canCreate = usePermission('employee_designation.create');
  const canUpdate = usePermission('employee_designation.update');
  const canDeactivate = usePermission('employee_designation.deactivate');

  const loadDesignations = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const data = await fetchDesignations(selectedOrgId, {
        search: searchTerm || undefined
      });
      setDesignations(data);
    } catch (err) {
      console.error('Failed to load designations:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, searchTerm]);

  useEffect(() => {
    loadDesignations();
  }, [loadDesignations]);

  const openAddDrawer = () => {
    setDrawerMode('add');
    setEditingDesignation(null);
    setFormErrors({});
    setGeneralError(null);
    setFormData({
      code: '',
      name: '',
      description: '',
      requires_nozzle_assignment: false,
      is_active: true,
      display_order: String(designations.length + 1),
    });
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (desig: EmployeeDesignation) => {
    setDrawerMode('edit');
    setEditingDesignation(desig);
    setFormErrors({});
    setGeneralError(null);
    setFormData({
      code: desig.code,
      name: desig.name,
      description: desig.description || '',
      requires_nozzle_assignment: desig.requires_nozzle_assignment,
      is_active: desig.is_active,
      display_order: String(desig.display_order),
    });
    setIsDrawerOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;

    setActionLoading(true);
    setFormErrors({});
    setGeneralError(null);

    const payload = {
      code: formData.code.trim().toUpperCase(),
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      requires_nozzle_assignment: formData.requires_nozzle_assignment,
      is_active: formData.is_active,
      display_order: parseInt(formData.display_order, 10) || 0,
    };

    try {
      if (drawerMode === 'add') {
        await createDesignation(selectedOrgId, payload);
      } else if (editingDesignation) {
        await updateDesignation(selectedOrgId, editingDesignation.id, payload);
      }
      setIsDrawerOpen(false);
      loadDesignations();
    } catch (err: any) {
      if (err.data) {
        const errors = err.data;
        const formatted: Record<string, string> = {};
        Object.keys(errors).forEach((key) => {
          const val = errors[key];
          formatted[key] = Array.isArray(val) ? val[0] : String(val);
        });
        setFormErrors(formatted);
      } else {
        setGeneralError(err.message || 'An error occurred while saving.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleStatus = async (desig: EmployeeDesignation) => {
    if (!selectedOrgId) return;
    try {
      await updateDesignation(selectedOrgId, desig.id, {
        is_active: !desig.is_active
      });
      loadDesignations();
    } catch (err: any) {
      alert(err.message || 'Failed to update status.');
    }
  };

  if (!selectedOrgId) {
    return (
      <div className="management-page">
        <PageHeader 
          title="Designations" 
          subtitle="Configure operational job roles" 
          backLink={{ to: '/app/settings', label: 'Back to Settings' }}
        />
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertCircle size={40} className="text-muted" style={{ margin: '0 auto 1rem' }} />
          <p className="text-muted">Please select an organisation to configure designation list.</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view designations.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ position: 'relative', minHeight: 'calc(100vh - 120px)' }}>
      <PageHeader 
        title="Employee Designations" 
        subtitle="Manage job profiles, duties, nozzle allocations, and system roles"
        backLink={{ to: '/app/settings', label: 'Back to Settings' }}
        actions={
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/app/settings/employees')} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <ChevronLeft size={16} />
              <span>Back to Employees</span>
            </button>
            {canCreate && (
              <button className="btn btn-primary" onClick={openAddDrawer} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} />
                <span>Add Designation</span>
              </button>
            )}
          </div>
        }
      />

      {/* Search Filter */}
      <div className="filters-bar" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative', flex: '1', maxWidth: '350px' }}>
          <Search style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={16} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Search designation code or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading designations...</p>
        </div>
      ) : (
        <div className="card">
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Designation Name</th>
                  <th>Code</th>
                  <th>Requires Nozzles</th>
                  <th>System Role</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {designations.map((desig) => (
                  <tr key={desig.id}>
                    <td>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Briefcase size={16} className="text-muted" />
                        <span>{desig.name}</span>
                      </div>
                      {desig.description && <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>{desig.description}</div>}
                    </td>
                    <td>
                      <code style={{ fontSize: '0.9rem', color: 'var(--color-accent)' }}>{desig.code}</code>
                    </td>
                    <td>
                      <span className={`badge ${desig.requires_nozzle_assignment ? 'badge-primary' : 'badge-secondary'}`}>
                        {desig.requires_nozzle_assignment ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${desig.is_system ? 'badge-success' : 'badge-secondary'}`}>
                        {desig.is_system ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${desig.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {desig.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {canUpdate && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditDrawer(desig)}
                            title="Edit Designation"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {!desig.is_system && canDeactivate && (
                          desig.is_active ? (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleToggleStatus(desig)}
                              title="Deactivate Designation"
                            >
                              <Ban size={14} />
                            </button>
                          ) : (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleToggleStatus(desig)}
                              title="Reactivate Designation"
                            >
                              <CheckCircle size={14} />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {designations.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                      <p className="text-muted">No designations found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Drawer */}
      {isDrawerOpen && (
        <div className="slider-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="slider-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '450px' }}>
            <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Briefcase size={20} style={{ color: 'var(--color-accent)' }} />
                <span>{drawerMode === 'add' ? 'Add Designation' : 'Edit Designation'}</span>
              </h3>
              <button className="btn-close" onClick={() => setIsDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
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
                <label className="form-label" htmlFor="code">Designation Code *</label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  className={`form-control ${formErrors.code ? 'is-invalid' : ''}`}
                  placeholder="e.g. DSM, CASHIER"
                  value={formData.code}
                  onChange={handleInputChange}
                  disabled={drawerMode === 'edit'}
                  required
                />
                {formErrors.code && <div className="invalid-feedback">{formErrors.code}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="name">Designation Name *</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  className={`form-control ${formErrors.name ? 'is-invalid' : ''}`}
                  placeholder="e.g. Pump Attendant"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
                {formErrors.name && <div className="invalid-feedback">{formErrors.name}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  className="form-control"
                  rows={3}
                  value={formData.description}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  id="requires_nozzle_assignment"
                  name="requires_nozzle_assignment"
                  type="checkbox"
                  checked={formData.requires_nozzle_assignment}
                  onChange={handleCheckboxChange}
                  style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                />
                <label htmlFor="requires_nozzle_assignment" style={{ userSelect: 'none', fontWeight: 500, cursor: 'pointer' }}>Requires Nozzle Assignment</label>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="display_order">Display Order</label>
                <input
                  id="display_order"
                  name="display_order"
                  type="number"
                  className="form-control"
                  value={formData.display_order}
                  onChange={handleInputChange}
                />
              </div>

              {drawerMode === 'edit' && !editingDesignation?.is_system && (
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    id="is_active"
                    name="is_active"
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={handleCheckboxChange}
                    style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                  />
                  <label htmlFor="is_active" style={{ userSelect: 'none', fontWeight: 500, cursor: 'pointer' }}>Active status</label>
                </div>
              )}

              <div className="slider-actions" style={{ display: 'flex', gap: '1rem', marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setIsDrawerOpen(false)}
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
                  <span>Save Designation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
