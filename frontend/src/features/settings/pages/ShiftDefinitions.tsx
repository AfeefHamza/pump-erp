import React, { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchShiftDefinitions,
  createShiftDefinition,
  updateShiftDefinition,
  type ShiftDefinition
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { Plus, Ban, CheckCircle, RefreshCw, X, Edit2, Clock, AlertTriangle, AlertCircle } from 'lucide-react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionGuard } from '@/features/auth/components/PermissionGuard';

export const ShiftDefinitions: React.FC = () => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  // State
  const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
  const [warnings, setWarnings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [editingShift, setEditingShift] = useState<ShiftDefinition | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    starts_at: '06:00',
    ends_at: '14:00',
    display_order: '0',
    is_active: true,
    notes: '',
    crosses_midnight: false,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Confirm Toggle Status Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    shift: ShiftDefinition | null;
    action: 'deactivate' | 'reactivate';
  }>({
    isOpen: false,
    shift: null,
    action: 'deactivate'
  });

  // Permissions
  const canView = usePermission('shift_definition.view');
  const canUpdate = usePermission('shift_definition.update');
  const canDeactivate = usePermission('shift_definition.deactivate');

  const loadShifts = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId) return;
    setLoading(true);
    try {
      const response = await fetchShiftDefinitions(selectedOrgId, selectedOutletId, {
        status: statusFilter === 'all' ? undefined : statusFilter
      });
      setShifts(response.shifts || []);
      setWarnings(response.warnings || []);
    } catch (err) {
      console.error('Failed to load shift definitions:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, statusFilter]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  const openAddDrawer = () => {
    setDrawerMode('add');
    setEditingShift(null);
    setFormErrors({});
    setGeneralError(null);
    setFormData({
      code: '',
      name: '',
      starts_at: '06:00',
      ends_at: '14:00',
      display_order: String(shifts.length + 1),
      is_active: true,
      notes: '',
      crosses_midnight: false,
    });
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (shift: ShiftDefinition) => {
    setDrawerMode('edit');
    setEditingShift(shift);
    setFormErrors({});
    setGeneralError(null);
    setFormData({
      code: shift.code,
      name: shift.name,
      starts_at: shift.starts_at.substring(0, 5), // Format HH:MM
      ends_at: shift.ends_at.substring(0, 5),
      display_order: String(shift.display_order),
      is_active: shift.is_active,
      notes: shift.notes || '',
      crosses_midnight: shift.crosses_midnight,
    });
    setIsDrawerOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'starts_at' || name === 'ends_at') {
        if (next.starts_at && next.ends_at) {
          next.crosses_midnight = next.ends_at < next.starts_at;
        }
      }
      return next;
    });
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId) return;

    if (formData.starts_at === formData.ends_at) {
      setFormErrors({ starts_at: 'Start and end times cannot be equal (zero-duration shift).', ends_at: 'Start and end times cannot be equal (zero-duration shift).' });
      return;
    }

    setActionLoading(true);
    setFormErrors({});
    setGeneralError(null);

    const payload = {
      code: formData.code.trim().toUpperCase(),
      name: formData.name.trim(),
      starts_at: formData.starts_at + ':00', // Append seconds
      ends_at: formData.ends_at + ':00',
      display_order: parseInt(formData.display_order, 10) || 0,
      is_active: formData.is_active,
      notes: formData.notes.trim() || null,
    };

    try {
      if (drawerMode === 'add') {
        const response = await createShiftDefinition(selectedOrgId, selectedOutletId, payload);
        setShifts(response.shifts || []);
        setWarnings(response.warnings || []);
        alert('Shift created successfully.');
      } else if (editingShift) {
        const response = await updateShiftDefinition(selectedOrgId, selectedOutletId, editingShift.id, payload);
        setShifts(response.shifts || []);
        setWarnings(response.warnings || []);
        alert('Shift updated successfully.');
      }
      setIsDrawerOpen(false);
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
        setGeneralError(err.message || 'An error occurred while saving the shift.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleStatusClick = (shift: ShiftDefinition) => {
    setConfirmModal({
      isOpen: true,
      shift,
      action: shift.is_active ? 'deactivate' : 'reactivate'
    });
  };

  const handleConfirmToggleStatus = async () => {
    const { shift, action } = confirmModal;
    if (!selectedOrgId || !selectedOutletId || !shift) return;

    try {
      const response = await updateShiftDefinition(selectedOrgId, selectedOutletId, shift.id, {
        is_active: action === 'reactivate'
      });
      setShifts(response.shifts || []);
      setWarnings(response.warnings || []);
      setConfirmModal({ isOpen: false, shift: null, action: 'deactivate' });
    } catch (err: any) {
      alert(err.message || 'Failed to update shift status.');
    }
  };

  if (!selectedOrgId || !selectedOutletId) {
    return (
      <div className="management-page">
        <PageHeader title="Shift Definitions" subtitle="Define and configure operational shifts" />
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertCircle size={40} className="text-muted" style={{ margin: '0 auto 1rem' }} />
          <p className="text-muted">Please select an organisation and an outlet in the sidebar to configure shifts.</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view shift definitions.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ position: 'relative', minHeight: 'calc(100vh - 120px)' }}>
      <PageHeader 
        title="Shift Definitions" 
        subtitle="Manage daily shifts, overnight settings and timings for this outlet"
        actions={
          <PermissionGuard permission="shift_definition.create">
            <button className="btn btn-primary" onClick={openAddDrawer} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={18} />
              <span>Add Shift</span>
            </button>
          </PermissionGuard>
        }
      />

      {/* Warnings Panel */}
      {warnings.length > 0 && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', borderLeft: '4px solid var(--color-warning)', background: 'rgba(245, 158, 11, 0.05)' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 600, color: 'var(--color-warning-text)', marginBottom: '0.5rem' }}>
            <AlertTriangle size={18} />
            <span>Shift Time Overlaps Detected ({warnings.length})</span>
          </div>
          <ul style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {warnings.map((w, index) => (
              <li key={index}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div className="filters-bar" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <select
          className="form-control"
          style={{ width: '200px' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Shifts Only</option>
          <option value="inactive">Inactive Shifts Only</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading shift definitions...</p>
        </div>
      ) : shifts.length === 0 ? (
        <EmptyState
          title="No shift definitions found"
          description="Define and configure operational shifts for this outlet."
          actionButton={
            <PermissionGuard permission="shift_definition.create">
              <button className="btn btn-primary" onClick={openAddDrawer} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} />
                <span>Add Shift</span>
              </button>
            </PermissionGuard>
          }
        />
      ) : (
        <div className="card">
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Shift Name</th>
                  <th>Code</th>
                  <th>Starts At</th>
                  <th>Ends At</th>
                  <th>Overnight</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift.id}>
                    <td>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Clock size={16} className="text-muted" />
                        <span>{shift.name}</span>
                      </div>
                      {shift.notes && <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>{shift.notes}</div>}
                    </td>
                    <td>
                      <code style={{ fontSize: '0.9rem', color: 'var(--color-accent)' }}>{shift.code}</code>
                    </td>
                    <td>{shift.starts_at.substring(0, 5)}</td>
                    <td>{shift.ends_at.substring(0, 5)}</td>
                    <td>
                      <span className={`badge ${shift.crosses_midnight ? 'badge-warning' : 'badge-secondary'}`}>
                        {shift.crosses_midnight ? 'Yes (Overnight)' : 'No'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{shift.duration_display || '—'}</span>
                    </td>
                    <td>
                      <span className={`badge ${shift.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {shift.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {canUpdate && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditDrawer(shift)}
                            title="Edit Shift"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {canDeactivate && (
                          shift.is_active ? (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleToggleStatusClick(shift)}
                              title="Deactivate Shift"
                            >
                              <Ban size={14} />
                            </button>
                          ) : (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleToggleStatusClick(shift)}
                              title="Reactivate Shift"
                            >
                              <CheckCircle size={14} />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {shifts.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                      <p className="text-muted">No shift definitions found.</p>
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
                <Clock size={20} style={{ color: 'var(--color-accent)' }} />
                <span>{drawerMode === 'add' ? 'Add Shift Definition' : 'Edit Shift Definition'}</span>
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
                <label className="form-label" htmlFor="code">Shift Code *</label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  className={`form-control ${formErrors.code ? 'is-invalid' : ''}`}
                  placeholder="e.g. MORNING, NIGHT"
                  value={formData.code}
                  onChange={handleInputChange}
                  disabled={drawerMode === 'edit'}
                  required
                />
                {formErrors.code && <div className="invalid-feedback">{formErrors.code}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="name">Shift Name *</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  className={`form-control ${formErrors.name ? 'is-invalid' : ''}`}
                  placeholder="e.g. Morning Shift, Night Shift"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
                {formErrors.name && <div className="invalid-feedback">{formErrors.name}</div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="starts_at">Starts At *</label>
                  <input
                    id="starts_at"
                    name="starts_at"
                    type="time"
                    className={`form-control ${formErrors.starts_at ? 'is-invalid' : ''}`}
                    value={formData.starts_at}
                    onChange={handleInputChange}
                    required
                  />
                  {formErrors.starts_at && <div className="invalid-feedback">{formErrors.starts_at}</div>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="ends_at">Ends At *</label>
                  <input
                    id="ends_at"
                    name="ends_at"
                    type="time"
                    className={`form-control ${formErrors.ends_at ? 'is-invalid' : ''}`}
                    value={formData.ends_at}
                    onChange={handleInputChange}
                    required
                  />
                  {formErrors.ends_at && <div className="invalid-feedback">{formErrors.ends_at}</div>}
                </div>
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  id="crosses_midnight"
                  name="crosses_midnight"
                  type="checkbox"
                  checked={formData.crosses_midnight}
                  disabled
                  style={{ width: '18px', height: '18px' }}
                />
                <label htmlFor="crosses_midnight" style={{ userSelect: 'none', fontWeight: 500, opacity: 0.7 }}>
                  Overnight Shift (Automatically calculated)
                </label>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="display_order">Display Order</label>
                <input
                  id="display_order"
                  name="display_order"
                  type="number"
                  className={`form-control ${formErrors.display_order ? 'is-invalid' : ''}`}
                  value={formData.display_order}
                  onChange={handleInputChange}
                />
                {formErrors.display_order && <div className="invalid-feedback">{formErrors.display_order}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="notes">Notes / Timing description</label>
                <textarea
                  id="notes"
                  name="notes"
                  className="form-control"
                  rows={3}
                  placeholder="e.g. Starts 6 AM till 2 PM"
                  value={formData.notes}
                  onChange={handleInputChange}
                />
              </div>

              {drawerMode === 'edit' && (
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
                  <span>Save Shift</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Deactivate/Reactivate Modal */}
      {confirmModal.isOpen && (
        <>
          <div className="modal-overlay" onClick={() => setConfirmModal({ isOpen: false, shift: null, action: 'deactivate' })} />
          <div className="modal" style={{ width: '400px', padding: '1.5rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)', position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1100 }}>
            <h3 className="h4" style={{ marginBottom: '1rem' }}>
              {confirmModal.action === 'deactivate' ? 'Deactivate Shift Definition?' : 'Reactivate Shift Definition?'}
            </h3>
            <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Are you sure you want to {confirmModal.action} the shift <strong>{confirmModal.shift?.name}</strong>?
              {confirmModal.action === 'deactivate' && ' Deactivating it will prevent future rosters from using it.'}
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmModal({ isOpen: false, shift: null, action: 'deactivate' })}>
                Cancel
              </button>
              <button 
                className={`btn ${confirmModal.action === 'deactivate' ? 'btn-danger' : 'btn-primary'}`}
                onClick={handleConfirmToggleStatus}
              >
                {confirmModal.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
