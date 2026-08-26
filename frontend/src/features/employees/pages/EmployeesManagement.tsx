import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchEmployees,
  createEmployee,
  updateEmployee,
  fetchDesignations,
  fetchOutlets,
  type Employee,
  type EmployeeDesignation,
  type OutletResponse
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { Search, Plus, Ban, CheckCircle, RefreshCw, X, Edit2, Users, Phone, Briefcase, AlertCircle } from 'lucide-react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionGuard } from '@/features/auth/components/PermissionGuard';

export const EmployeesManagement: React.FC = () => {
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  // Lists & configs
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [designations, setDesignations] = useState<EmployeeDesignation[]>([]);
  const [outlets, setOutlets] = useState<OutletResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [designationFilter, setDesignationFilter] = useState('');
  const [outletFilter, setOutletFilter] = useState('');

  // Drawer status
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    employee_code: '',
    display_name: '',
    phone_number: '',
    alternate_phone_number: '',
    address: '',
    date_of_birth: '',
    joined_on: '',
    left_on: '',
    designation_id: '',
    status: 'active',
    notes: '',
  });
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>([]);
  const [primaryOutletId, setPrimaryOutletId] = useState('');

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Confirm Toggle Status Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    employee: Employee | null;
    action: 'deactivate' | 'reactivate';
  }>({
    isOpen: false,
    employee: null,
    action: 'deactivate'
  });

  // Permissions
  const canView = usePermission('employee.view');
  const canUpdate = usePermission('employee.update');
  const canDeactivate = usePermission('employee.deactivate');

  const loadData = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const empData = await fetchEmployees(selectedOrgId, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        designation: designationFilter || undefined,
        outlet: outletFilter || undefined
      });
      setEmployees(empData);

      const desData = await fetchDesignations(selectedOrgId);
      setDesignations(desData);

      const outletData = await fetchOutlets(selectedOrgId);
      setOutlets(outletData);
    } catch (err) {
      console.error('Failed to load employees data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, statusFilter, designationFilter, outletFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAddDrawer = () => {
    setDrawerMode('add');
    setEditingEmployee(null);
    setFormErrors({});
    setGeneralError(null);
    setFormData({
      employee_code: '',
      display_name: '',
      phone_number: '',
      alternate_phone_number: '',
      address: '',
      date_of_birth: '',
      joined_on: new Date().toISOString().substring(0, 10),
      left_on: '',
      designation_id: designations[0]?.id || '',
      status: 'active',
      notes: '',
    });
    setSelectedOutlets([]);
    setPrimaryOutletId('');
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (employee: Employee) => {
    setDrawerMode('edit');
    setEditingEmployee(employee);
    setFormErrors({});
    setGeneralError(null);
    setFormData({
      employee_code: employee.employee_code,
      display_name: employee.display_name,
      phone_number: employee.phone_number || '',
      alternate_phone_number: employee.alternate_phone_number || '',
      address: employee.address || '',
      date_of_birth: employee.date_of_birth || '',
      joined_on: employee.joined_on || '',
      left_on: employee.left_on || '',
      designation_id: employee.designation_id,
      status: employee.status,
      notes: employee.notes || '',
    });

    const activeAssignments = employee.outlet_assignments || [];
    setSelectedOutlets(activeAssignments.map(a => a.outlet_id));
    const primary = activeAssignments.find(a => a.is_primary);
    setPrimaryOutletId(primary ? primary.outlet_id : '');
    
    setIsDrawerOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleOutletToggle = (outletId: string) => {
    setSelectedOutlets((prev) => {
      if (prev.includes(outletId)) {
        const next = prev.filter((id) => id !== outletId);
        if (primaryOutletId === outletId) {
          setPrimaryOutletId(next[0] || '');
        }
        return next;
      } else {
        const next = [...prev, outletId];
        if (!primaryOutletId) {
          setPrimaryOutletId(outletId);
        }
        return next;
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;

    setActionLoading(true);
    setFormErrors({});
    setGeneralError(null);

    const outletAssignments = selectedOutlets.map((id) => ({
      outlet_id: id,
      is_primary: id === primaryOutletId,
      effective_from: formData.joined_on || null,
      effective_to: formData.left_on || null,
    }));

    const payload = {
      employee_code: formData.employee_code.trim().toUpperCase(),
      display_name: formData.display_name.trim(),
      phone_number: formData.phone_number.trim() || null,
      alternate_phone_number: formData.alternate_phone_number.trim() || null,
      address: formData.address.trim() || null,
      date_of_birth: formData.date_of_birth || null,
      joined_on: formData.joined_on || null,
      left_on: formData.left_on || null,
      designation_id: formData.designation_id,
      status: formData.status,
      notes: formData.notes.trim() || null,
      outlet_assignments: outletAssignments,
    };

    try {
      if (drawerMode === 'add') {
        await createEmployee(selectedOrgId, payload);
        alert('Employee created successfully.');
      } else if (editingEmployee) {
        await updateEmployee(selectedOrgId, editingEmployee.id, payload);
        alert('Employee updated successfully.');
      }
      setIsDrawerOpen(false);
      loadData();
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
        setGeneralError(err.message || 'An unexpected error occurred while saving.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleStatusClick = (employee: Employee) => {
    setConfirmModal({
      isOpen: true,
      employee,
      action: employee.status === 'active' ? 'deactivate' : 'reactivate'
    });
  };

  const handleConfirmToggleStatus = async () => {
    const { employee, action } = confirmModal;
    if (!selectedOrgId || !employee) return;

    try {
      await updateEmployee(selectedOrgId, employee.id, {
        status: action === 'deactivate' ? 'inactive' : 'active'
      });
      setConfirmModal({ isOpen: false, employee: null, action: 'deactivate' });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update status.');
    }
  };

  // Local filter
  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  if (!selectedOrgId) {
    return (
      <div className="management-page">
        <PageHeader title="Employees" subtitle="Manage operational workers" />
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertCircle size={40} className="text-muted" style={{ margin: '0 auto 1rem' }} />
          <p className="text-muted">Please select an organisation to view the Employee Master list.</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view employees list.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ position: 'relative', minHeight: 'calc(100vh - 120px)' }}>
      <PageHeader 
        title="Employee Master" 
        subtitle="Manage and configure operational pump attendants, cashiers and supervisors"
        actions={
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/app/employees/designations')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Briefcase size={18} />
              <span>Designations</span>
            </button>
            <PermissionGuard permission="employee.create">
              <button className="btn btn-primary" onClick={openAddDrawer} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} />
                <span>Add Employee</span>
              </button>
            </PermissionGuard>
          </div>
        }
      />

      {/* Filters Bar */}
      <div className="filters-bar" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
          <Search style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={16} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Search by code or display name..."
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
          <option value="active">Active Employees</option>
          <option value="inactive">Inactive Employees</option>
        </select>
        <select
          className="form-control"
          style={{ width: '200px' }}
          value={designationFilter}
          onChange={(e) => setDesignationFilter(e.target.value)}
        >
          <option value="">All Designations</option>
          {designations.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          className="form-control"
          style={{ width: '200px' }}
          value={outletFilter}
          onChange={(e) => setOutletFilter(e.target.value)}
        >
          <option value="">All Outlets</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading employees...</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <EmptyState
          title="No employees found"
          description="Start by adding your first employee to the database."
          actionButton={
            <PermissionGuard permission="employee.create">
              <button className="btn btn-primary" onClick={openAddDrawer} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} />
                <span>Add Employee</span>
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
                  <th>Employee Name</th>
                  <th>Code</th>
                  <th>Designation</th>
                  <th>Joined Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={16} className="text-muted" />
                        <span>{emp.display_name}</span>
                      </div>
                      {emp.phone_number && (
                        <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          <Phone size={12} /> {emp.phone_number}
                        </div>
                      )}
                    </td>
                    <td>
                      <code style={{ fontSize: '0.9rem', color: 'var(--color-accent)' }}>{emp.employee_code}</code>
                    </td>
                    <td>
                      <span className="badge badge-secondary" style={{ textTransform: 'capitalize' }}>
                        {emp.designation_details?.name || '—'}
                      </span>
                    </td>
                    <td>{emp.joined_on || '—'}</td>
                    <td>
                      <span className={`badge ${emp.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                        {emp.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {canUpdate && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditDrawer(emp)}
                            title="Edit Employee"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {canDeactivate && (
                          emp.status === 'active' ? (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleToggleStatusClick(emp)}
                              title="Deactivate Employee"
                            >
                              <Ban size={14} />
                            </button>
                          ) : (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleToggleStatusClick(emp)}
                              title="Reactivate Employee"
                            >
                              <CheckCircle size={14} />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                      <p className="text-muted">No employees found.</p>
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
        <>
          <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)} />
          <div className="drawer active" style={{ width: '550px' }}>
            <div className="drawer-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <h2 className="h3">{drawerMode === 'add' ? 'Add Employee' : 'Edit Employee'}</h2>
              <button className="btn-close" onClick={() => setIsDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {generalError && (
                <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', color: 'var(--color-danger-text)', fontSize: '0.9rem' }}>
                  {generalError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="employee_code">Employee Code *</label>
                  <input
                    id="employee_code"
                    name="employee_code"
                    type="text"
                    className={`form-control ${formErrors.employee_code ? 'is-invalid' : ''}`}
                    placeholder="e.g. EMP001"
                    value={formData.employee_code}
                    onChange={handleInputChange}
                    disabled={drawerMode === 'edit'}
                    required
                  />
                  {formErrors.employee_code && <div className="invalid-feedback">{formErrors.employee_code}</div>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="display_name">Display Name *</label>
                  <input
                    id="display_name"
                    name="display_name"
                    type="text"
                    className={`form-control ${formErrors.display_name ? 'is-invalid' : ''}`}
                    placeholder="e.g. John Doe"
                    value={formData.display_name}
                    onChange={handleInputChange}
                    required
                  />
                  {formErrors.display_name && <div className="invalid-feedback">{formErrors.display_name}</div>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="phone_number">Phone Number</label>
                  <input
                    id="phone_number"
                    name="phone_number"
                    type="text"
                    className="form-control"
                    placeholder="e.g. +91 9999999999"
                    value={formData.phone_number}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="alternate_phone_number">Alternate Phone Number</label>
                  <input
                    id="alternate_phone_number"
                    name="alternate_phone_number"
                    type="text"
                    className="form-control"
                    value={formData.alternate_phone_number}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="designation_id">Designation *</label>
                <select
                  id="designation_id"
                  name="designation_id"
                  className="form-control"
                  value={formData.designation_id}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">— Select Designation —</option>
                  {designations.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="joined_on">Joining Date</label>
                  <input
                    id="joined_on"
                    name="joined_on"
                    type="date"
                    className="form-control"
                    value={formData.joined_on}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="left_on">Leaving Date</label>
                  <input
                    id="left_on"
                    name="left_on"
                    type="date"
                    className="form-control"
                    value={formData.left_on}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="address">Address</label>
                <textarea
                  id="address"
                  name="address"
                  className="form-control"
                  rows={2}
                  value={formData.address}
                  onChange={handleInputChange}
                />
              </div>

              {/* Outlet Assignments Selector */}
              <div className="form-group">
                <label className="form-label">Outlet Access Assignments</label>
                <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '-0.25rem', marginBottom: '0.5rem' }}>
                  Assign the outlets this employee works at. Select one primary outlet.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-color)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                  {outlets.map((o) => {
                    const isChecked = selectedOutlets.includes(o.id);
                    return (
                      <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleOutletToggle(o.id)}
                          />
                          <span>{o.name}</span>
                        </label>
                        {isChecked && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="primary_outlet"
                              checked={primaryOutletId === o.id}
                              onChange={() => setPrimaryOutletId(o.id)}
                            />
                            <span>Primary</span>
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Save Employee'}
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsDrawerOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Confirm Deactivate Modal */}
      {confirmModal.isOpen && (
        <>
          <div className="modal-overlay" onClick={() => setConfirmModal({ isOpen: false, employee: null, action: 'deactivate' })} />
          <div className="modal" style={{ width: '400px', padding: '1.5rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)', position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1100 }}>
            <h3 className="h4" style={{ marginBottom: '1rem' }}>
              {confirmModal.action === 'deactivate' ? 'Deactivate Employee?' : 'Reactivate Employee?'}
            </h3>
            <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Are you sure you want to {confirmModal.action} <strong>{confirmModal.employee?.display_name}</strong>?
              {confirmModal.action === 'deactivate' && ' Deactivated employees cannot receive new shift assignments.'}
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmModal({ isOpen: false, employee: null, action: 'deactivate' })}>
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
