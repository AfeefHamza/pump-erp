import React, { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchRosterWorkspace,
  saveRosterWorkspace,
  fetchShiftDefinitions,
  fetchDesignations,
  type ShiftDefinition,
  type RosterWorkspaceResponse,
  type EmployeeDesignation
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import {
  Calendar,
  UserPlus,
  Trash2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Layers,
  ShieldCheck,
  Edit2,
  Plus,
  X,
  Check,
  Save,
  RotateCcw
} from 'lucide-react';

export const ShiftAssignments: React.FC = () => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  // States
  const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().substring(0, 10));
  
  const [workspace, setWorkspace] = useState<RosterWorkspaceResponse | null>(null);
  const [designations, setDesignations] = useState<EmployeeDesignation[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Local editing states (in-progress roster modifications)
  const [localAssignments, setLocalAssignments] = useState<Array<{
    employee_id: string;
    display_name: string;
    duty_designation_id: string;
    duty_designation_name: string;
    is_primary_cashier: boolean;
    nozzle_ids: string[];
    notes: string;
  }>>([]);

  const [notes, setNotes] = useState('');

  // Side Drawer States
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null); // null means "Assign Employee", truthy means "Edit"
  const [drawerEmployeeId, setDrawerEmployeeId] = useState('');
  const [drawerDesignationId, setDrawerDesignationId] = useState('');
  const [drawerPrimaryCashier, setDrawerPrimaryCashier] = useState(false);
  const [drawerNozzleIds, setDrawerNozzleIds] = useState<string[]>([]);
  const [drawerNotes, setDrawerNotes] = useState('');

  // Permissions
  const canView = usePermission('shift_roster.view');
  const canCreate = usePermission('shift_roster.create');
  const canUpdate = usePermission('shift_roster.update');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const loadShifts = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId) return;
    try {
      const response = await fetchShiftDefinitions(selectedOrgId, selectedOutletId, { status: 'active' });
      setShifts(response.shifts || []);
      if (response.shifts && response.shifts.length > 0) {
        setSelectedShiftId(response.shifts[0].id);
      }
    } catch (err) {
      console.error('Failed to load shifts:', err);
    }
  }, [selectedOrgId, selectedOutletId]);

  const loadDesignations = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      const data = await fetchDesignations(selectedOrgId);
      setDesignations(data || []);
    } catch (err) {
      console.error('Failed to load designations:', err);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    loadShifts();
    loadDesignations();
  }, [loadShifts, loadDesignations]);

  const loadWorkspace = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId || !selectedShiftId || !businessDate) return;
    setLoading(true);
    try {
      const data = await fetchRosterWorkspace(selectedOrgId, selectedOutletId, businessDate, selectedShiftId);
      setWorkspace(data);
      setNotes(data.roster?.notes || '');
      
      if (data.exists && data.roster) {
        // Map staff assignments from roster
        const mapped = data.roster.staff_assignments.map((sa) => ({
          employee_id: sa.employee_id,
          display_name: sa.employee_details.display_name,
          duty_designation_id: sa.duty_designation_id,
          duty_designation_name: sa.duty_designation_details.name,
          is_primary_cashier: sa.is_primary_cashier,
          nozzle_ids: sa.nozzle_assignments.map(na => na.nozzle_id),
          notes: sa.notes || '',
        }));
        setLocalAssignments(mapped);
      } else {
        setLocalAssignments([]);
      }
    } catch (err: any) {
      console.error('Failed to load roster workspace:', err);
      showToast(err.message || 'Failed to load roster workspace.', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, selectedShiftId, businessDate]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Helper to compare current local changes with database state
  const isModified = () => {
    if (!workspace || !workspace.exists) return false;
    
    const savedNotes = workspace.roster?.notes || '';
    if (notes.trim() !== savedNotes.trim()) return true;

    const savedStaff = workspace.roster?.staff_assignments || [];
    if (localAssignments.length !== savedStaff.length) return true;

    for (const local of localAssignments) {
      const saved = savedStaff.find(s => s.employee_id === local.employee_id);
      if (!saved) return true;
      if (saved.duty_designation_id !== local.duty_designation_id) return true;
      if (saved.is_primary_cashier !== local.is_primary_cashier) return true;
      if ((saved.notes || '') !== (local.notes || '')) return true;

      const savedNozzles = saved.nozzle_assignments.map(na => na.nozzle_id);
      if (local.nozzle_ids.length !== savedNozzles.length) return true;
      const allMatch = local.nozzle_ids.every(id => savedNozzles.includes(id));
      if (!allMatch) return true;
    }

    return false;
  };

  // Actions
  const handleCreateRoster = async () => {
    if (!selectedOrgId || !selectedOutletId || !selectedShiftId || !businessDate) return;
    setActionLoading(true);

    const payload = {
      business_date: businessDate,
      shift_definition_id: selectedShiftId,
      notes: '',
      assignments: []
    };

    try {
      const response = await saveRosterWorkspace(selectedOrgId, selectedOutletId, payload);
      setWorkspace(response);
      setNotes('');
      setLocalAssignments([]);
      showToast('Roster planning initialized successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      let errMsg = 'Failed to create roster.';
      if (err.data && typeof err.data === 'object') {
        const data = err.data as Record<string, any>;
        errMsg = Object.entries(data)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
          .join('; ');
      } else if (err.message) {
        errMsg = err.message;
      }
      showToast(errMsg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveWorkspace = async () => {
    if (!selectedOrgId || !selectedOutletId || !selectedShiftId || !businessDate) return;
    setActionLoading(true);

    const payload = {
      business_date: businessDate,
      shift_definition_id: selectedShiftId,
      notes: notes.trim() || null,
      assignments: localAssignments.map((a) => ({
        employee_id: a.employee_id,
        duty_designation_id: a.duty_designation_id,
        is_primary_cashier: a.is_primary_cashier,
        notes: a.notes || null,
        nozzle_ids: a.nozzle_ids,
      }))
    };

    try {
      const response = await saveRosterWorkspace(selectedOrgId, selectedOutletId, payload);
      setWorkspace(response);
      setNotes(response.roster?.notes || '');
      
      const mapped = response.roster?.staff_assignments.map((sa) => ({
        employee_id: sa.employee_id,
        display_name: sa.employee_details.display_name,
        duty_designation_id: sa.duty_designation_id,
        duty_designation_name: sa.duty_designation_details.name,
        is_primary_cashier: sa.is_primary_cashier,
        nozzle_ids: sa.nozzle_assignments.map(na => na.nozzle_id),
        notes: sa.notes || '',
      })) || [];
      setLocalAssignments(mapped);
      
      showToast('Shift planning assignments saved successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      let errMsg = 'Failed to save roster configurations.';
      if (err.data && typeof err.data === 'object') {
        const data = err.data as Record<string, any>;
        errMsg = Object.entries(data)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
          .join('; ');
      } else if (err.message) {
        errMsg = err.message;
      }
      showToast(errMsg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Group active nozzles by dispenser
  const getDispensersGroup = () => {
    if (!workspace) return {};
    const group: Record<string, { dispenserName: string; nozzles: any[] }> = {};
    workspace.nozzles.forEach((n) => {
      if (!group[n.dispenser_id]) {
        group[n.dispenser_id] = { dispenserName: n.dispenser_name, nozzles: [] };
      }
      group[n.dispenser_id].nozzles.push(n);
    });
    return group;
  };

  const dispenserGroups = getDispensersGroup();

  // Find who has this nozzle assigned locally (excluding current employee if specified)
  const getLocallyAssignedStaffName = (nozzleId: string, excludeEmployeeId?: string) => {
    const assigned = localAssignments.find(
      (a) => a.employee_id !== excludeEmployeeId && a.nozzle_ids.includes(nozzleId)
    );
    return assigned ? assigned.display_name : null;
  };

  // Drawer Opening
  const handleOpenAssignDrawer = () => {
    setEditingEmployeeId(null);
    setDrawerEmployeeId('');
    setDrawerDesignationId('');
    setDrawerPrimaryCashier(false);
    setDrawerNozzleIds([]);
    setDrawerNotes('');
    setDrawerOpen(true);
  };

  const handleOpenEditDrawer = (employeeId: string) => {
    const target = localAssignments.find((a) => a.employee_id === employeeId);
    if (!target) return;

    setEditingEmployeeId(employeeId);
    setDrawerEmployeeId(target.employee_id);
    setDrawerDesignationId(target.duty_designation_id);
    setDrawerPrimaryCashier(target.is_primary_cashier);
    setDrawerNozzleIds([...target.nozzle_ids]);
    setDrawerNotes(target.notes);
    setDrawerOpen(true);
  };

  const handleRemoveAssignment = (employeeId: string) => {
    setLocalAssignments((prev) => prev.filter((a) => a.employee_id !== employeeId));
    showToast('Employee removed locally. Click Save Changes to commit.', 'success');
  };

  const handleTogglePrimaryCashierInline = (employeeId: string) => {
    setLocalAssignments((prev) =>
      prev.map((a) => ({
        ...a,
        is_primary_cashier: a.employee_id === employeeId ? !a.is_primary_cashier : false
      }))
    );
  };

  // Drawer Save Actions
  const handleApplyDrawer = () => {
    if (!drawerEmployeeId) {
      alert('Please select an employee.');
      return;
    }
    if (!drawerDesignationId) {
      alert('Please select a duty designation.');
      return;
    }

    const availableStaff = workspace?.available_staff || [];
    
    // Check duplicates if not editing
    if (!editingEmployeeId && localAssignments.some((la) => la.employee_id === drawerEmployeeId)) {
      alert('Employee is already assigned to this roster.');
      return;
    }

    let employeeName = '';
    if (editingEmployeeId) {
      const match = localAssignments.find((la) => la.employee_id === drawerEmployeeId);
      employeeName = match ? match.display_name : '';
    } else {
      const match = availableStaff.find((e) => e.id === drawerEmployeeId);
      employeeName = match ? match.display_name : '';
    }

    const designationObj = designations.find((d) => d.id === drawerDesignationId);
    const designationName = designationObj ? designationObj.name : '';

    const newAssignmentObj = {
      employee_id: drawerEmployeeId,
      display_name: employeeName,
      duty_designation_id: drawerDesignationId,
      duty_designation_name: designationName,
      is_primary_cashier: drawerPrimaryCashier,
      nozzle_ids: drawerNozzleIds,
      notes: drawerNotes
    };

    let updatedAssignments = [...localAssignments];

    // Enforce single primary cashier locally
    if (drawerPrimaryCashier) {
      updatedAssignments = updatedAssignments.map((la) => ({
        ...la,
        is_primary_cashier: la.employee_id === drawerEmployeeId ? true : false
      }));
    }

    if (editingEmployeeId) {
      updatedAssignments = updatedAssignments.map((la) =>
        la.employee_id === drawerEmployeeId ? newAssignmentObj : la
      );
    } else {
      updatedAssignments.push(newAssignmentObj);
    }

    setLocalAssignments(updatedAssignments);
    setDrawerOpen(false);
    showToast(
      editingEmployeeId ? 'Employee assignment updated locally.' : 'Employee assigned locally. Click Save Changes to commit.',
      'success'
    );
  };

  const handleNozzleCheckboxChange = (nozzleId: string, checked: boolean) => {
    if (checked) {
      setDrawerNozzleIds((prev) => [...prev, nozzleId]);
    } else {
      setDrawerNozzleIds((prev) => prev.filter((id) => id !== nozzleId));
    }
  };

  const renderEmptyState = () => {
    return (
      <div className="empty-state-card">
        <div className="empty-state-icon-wrapper">
          <Calendar size={32} />
        </div>
        <h3 className="h3" style={{ margin: 0 }}>No roster has been planned for this shift.</h3>
        <p className="text-muted" style={{ margin: '0.5rem 0 1rem', maxWidth: '400px' }}>
          Choose a business date and shift definition, then click the button below to initialize a roster plan for this outlet.
        </p>
        <button
          className="btn btn-primary"
          onClick={handleCreateRoster}
          disabled={actionLoading || !canCreate}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 auto' }}
        >
          {actionLoading ? <RefreshCw className="animate-spin" size={16} /> : <Plus size={16} />}
          <span>Create Roster</span>
        </button>
        {!canCreate && (
          <span className="text-muted" style={{ fontSize: '0.8rem', color: 'var(--color-danger-text)', display: 'block', marginTop: '0.5rem' }}>
            You do not have permission to create rosters.
          </span>
        )}
      </div>
    );
  };

  if (!selectedOrgId || !selectedOutletId) {
    return (
      <div className="management-page">
        <PageHeader title="Shift Assignments Planning" subtitle="Roster staff and allocate nozzles" />
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center', borderRadius: 'var(--radius-lg)' }}>
          <AlertCircle size={40} className="text-muted" style={{ margin: '0 auto 1rem', color: 'var(--color-accent)' }} />
          <p className="text-muted" style={{ fontSize: '1rem' }}>Please select an organisation and an outlet in the sidebar to configure shift assignments.</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem', borderRadius: 'var(--radius-lg)' }}>
        <AlertCircle size={40} style={{ color: 'var(--color-danger-text)', margin: '0 auto 1rem' }} />
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view shift rosters.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ paddingBottom: '4rem' }}>
      {/* Premium Styling Block */}
      <style>{`
        .planner-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .selector-bar {
          background-color: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 1.25rem;
          display: flex;
          gap: 1.5rem;
          align-items: flex-end;
          flex-wrap: wrap;
          box-shadow: var(--shadow-sm);
        }

        .workspace-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.5rem;
        }

        .workspace-title-box {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .workspace-actions {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        .empty-state-card {
          background-color: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 4rem 2rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          box-shadow: var(--shadow-sm);
          max-width: 600px;
          margin: 3rem auto;
        }

        .empty-state-icon-wrapper {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background-color: rgba(15, 118, 110, 0.1);
          color: var(--color-accent);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.5rem;
        }

        .roster-grid {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 1.5rem;
          align-items: start;
        }

        @media (max-width: 1024px) {
          .roster-grid {
            grid-template-columns: 1fr;
          }
        }

        .card-premium {
          background-color: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          box-shadow: var(--shadow-sm);
          transition: all 0.2s ease;
        }

        .card-premium:hover {
          box-shadow: var(--shadow-md);
        }

        .badge-premium {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.6rem;
          border-radius: 50px;
          font-size: 0.75rem;
          font-weight: 600;
          line-height: 1;
        }

        .badge-cashier {
          background-color: var(--color-accent-light);
          color: var(--color-accent-text);
          border: 1px solid rgba(15, 118, 110, 0.2);
        }

        .badge-nozzle {
          background-color: var(--color-info-bg);
          color: var(--color-info-text);
          border: 1px solid rgba(3, 105, 161, 0.2);
        }

        .badge-unassigned {
          background-color: var(--color-warning-bg);
          color: var(--color-warning-text);
          border: 1px solid rgba(194, 65, 12, 0.2);
        }

        .badge-assigned {
          background-color: var(--color-success-bg);
          color: var(--color-success-text);
          border: 1px solid rgba(21, 128, 61, 0.2);
        }

        /* Right-side Drawer classes */
        .drawer-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          z-index: 1000;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.2s ease, visibility 0.2s ease;
        }

        .drawer-backdrop.open {
          opacity: 1;
          visibility: visible;
        }

        .drawer-content {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 480px;
          max-width: 100%;
          background-color: var(--bg-card);
          box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
          z-index: 1001;
          display: flex;
          flex-direction: column;
          transform: translateX(100%);
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .drawer-backdrop.open .drawer-content {
          transform: translateX(0);
        }

        .drawer-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .drawer-body {
          padding: 1.5rem;
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .drawer-footer {
          padding: 1.25rem 1.5rem;
          border-top: 1px solid var(--border-color);
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          background-color: var(--bg-main);
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .form-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-main);
        }

        .form-control {
          background-color: var(--bg-main);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: var(--text-main);
          outline: none;
          transition: border-color 0.15s ease;
        }

        .form-control:focus {
          border-color: var(--color-accent);
        }

        .dispenser-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
        }

        .dispenser-card {
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          background-color: var(--bg-main);
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .dispenser-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--color-accent);
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 0.375rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .nozzle-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
          padding: 0.25rem 0;
        }

        .toast-box {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          z-index: 1050;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .toast-item {
          background-color: var(--bg-card);
          border-left: 4px solid var(--color-accent);
          box-shadow: var(--shadow-lg);
          padding: 0.75rem 1.25rem;
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 250px;
          animation: slideIn 0.2s ease-out;
        }

        .toast-item.toast-success {
          border-left-color: var(--color-success-text);
          color: var(--color-success-text);
          background-color: #f0fdf4;
        }

        .toast-item.toast-error {
          border-left-color: var(--color-danger-text);
          color: var(--color-danger-text);
          background-color: #fef2f2;
        }

        @keyframes slideIn {
          from {
            transform: translateY(1rem);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      <PageHeader 
        title="Shift Assignments Planner" 
        subtitle="Dated roster planning: assign duties and map nozzles to pump attendants"
      />

      {/* Selectors Bar */}
      <div className="selector-bar">
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ marginBottom: '4px' }}>Business Date</label>
          <input
            type="date"
            className="form-control"
            style={{ width: '200px' }}
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
          />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ marginBottom: '4px' }}>Shift Definition</label>
          <select
            className="form-control"
            style={{ width: '250px' }}
            value={selectedShiftId}
            onChange={(e) => setSelectedShiftId(e.target.value)}
          >
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code} : {s.starts_at.substring(0, 5)}-{s.ends_at.substring(0, 5)})
              </option>
            ))}
          </select>
        </div>

        {workspace && workspace.exists && (
          <div className="workspace-actions" style={{ marginLeft: 'auto' }}>
            {isModified() && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (confirm('Discard your unsaved roster modifications?')) {
                    loadWorkspace();
                  }
                }}
                disabled={actionLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <RotateCcw size={16} />
                <span>Discard Changes</span>
              </button>
            )}

            <button
              className="btn btn-primary"
              onClick={handleSaveWorkspace}
              disabled={actionLoading || !canUpdate || !isModified()}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {actionLoading ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
              <span>Save Changes</span>
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '6rem' }}>
          <RefreshCw className="animate-spin" size={36} style={{ opacity: 0.5, margin: '0 auto 1rem', color: 'var(--color-accent)' }} />
          <p className="text-muted" style={{ fontSize: '1rem' }}>Loading planning workspace...</p>
        </div>
      ) : workspace ? (
        !workspace.exists ? (
          renderEmptyState()
        ) : (
          <div className="planner-container" style={{ marginTop: '1.5rem' }}>
            <div className="workspace-header">
              <div className="workspace-title-box">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h2 className="h3" style={{ margin: 0 }}>Roster Workspace</h2>
                  {isModified() && (
                    <span className="badge-premium" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>
                      Unsaved Local Changes
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="roster-grid">
              
              {/* Main Content Areas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* Rostered Staff Card */}
                <div className="card-premium">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 className="h4" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Calendar size={18} style={{ color: 'var(--color-accent)' }} />
                      <span>Rostered Staff ({localAssignments.length})</span>
                    </h3>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleOpenAssignDrawer}
                      disabled={!canUpdate}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      <Plus size={14} />
                      <span>Assign Employee</span>
                    </button>
                  </div>

                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Duty Designation</th>
                          <th>Nozzles Assigned</th>
                          <th>Primary Cashier</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {localAssignments.map((a) => (
                          <tr key={a.employee_id}>
                            <td>
                              <div>
                                <strong>{a.display_name}</strong>
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                  {(workspace.available_staff || []).find((x) => x.id === a.employee_id)?.employee_code || 'Attendant'}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span style={{ fontWeight: 500 }}>{a.duty_designation_name}</span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {a.nozzle_ids.map((nid) => {
                                  const nz = workspace.nozzles.find((n) => n.id === nid);
                                  return (
                                    <span key={nid} className="badge-premium badge-nozzle">
                                      {nz ? nz.code : 'Nozzle'}
                                    </span>
                                  );
                                })}
                                {a.nozzle_ids.length === 0 && (
                                  <span className="text-muted" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>None</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input
                                  type="checkbox"
                                  checked={a.is_primary_cashier}
                                  onChange={() => handleTogglePrimaryCashierInline(a.employee_id)}
                                  disabled={!canUpdate}
                                  style={{ cursor: canUpdate ? 'pointer' : 'not-allowed', width: '16px', height: '16px' }}
                                />
                                {a.is_primary_cashier && (
                                  <span className="badge-premium badge-cashier">
                                    Primary Cashier
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleOpenEditDrawer(a.employee_id)}
                                  disabled={!canUpdate}
                                  title="Edit Assignment"
                                  style={{ padding: '4px 8px' }}
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleRemoveAssignment(a.employee_id)}
                                  disabled={!canUpdate}
                                  title="Remove Assignment"
                                  style={{ padding: '4px 8px' }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {localAssignments.length === 0 && (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', padding: '3rem' }}>
                              <AlertCircle size={32} className="text-muted" style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
                              <p className="text-muted" style={{ margin: 0 }}>No staff assigned to this shift roster yet.</p>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={handleOpenAssignDrawer}
                                disabled={!canUpdate}
                                style={{ marginTop: '0.75rem' }}
                              >
                                Assign First Employee
                              </button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Forecourt Summary Grouped by Dispenser */}
                <div className="card-premium">
                  <h3 className="h4" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Layers size={18} style={{ color: 'var(--color-accent)' }} />
                    <span>Forecourt Allocation Summary</span>
                  </h3>
                  <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                    Visual list of multi-product dispensers (MPDs) and nozzle allocation status.
                  </p>

                  <div className="dispenser-grid">
                    {Object.keys(dispenserGroups).map((dId) => {
                      const disp = dispenserGroups[dId];
                      return (
                        <div key={dId} className="dispenser-card">
                          <div className="dispenser-title">
                            <span>{disp.dispenserName}</span>
                            <span className="badge-premium" style={{ backgroundColor: 'rgba(15, 118, 110, 0.08)', color: 'var(--color-accent)' }}>MPD</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {disp.nozzles.map((nz) => {
                              const localStaffName = getLocallyAssignedStaffName(nz.id);
                              return (
                                <div key={nz.id} className="nozzle-row">
                                  <div>
                                    <span style={{ fontWeight: 600 }}>{nz.code}</span>
                                    <span className="text-muted" style={{ fontSize: '0.75rem', marginLeft: '0.5rem' }}>({nz.product_name})</span>
                                  </div>
                                  <div>
                                    {localStaffName ? (
                                      <span className="badge-premium badge-assigned">
                                        {localStaffName}
                                      </span>
                                    ) : (
                                      <span className="badge-premium badge-unassigned">
                                        Unassigned
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Sidebar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Roster Metadata */}
                <div className="card-premium">
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 600, marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    <ShieldCheck size={18} style={{ color: 'var(--color-success-text)' }} />
                    <span>Roster Details</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <div><strong>Outlet ID:</strong> <code style={{ fontSize: '0.75rem' }}>{selectedOutletId}</code></div>
                    <div><strong>Business Date:</strong> {businessDate}</div>
                    <div><strong>Status:</strong> {workspace.exists ? 'Roster Planned' : 'Draft'}</div>
                  </div>
                </div>

                {/* General Roster Notes */}
                <div className="card-premium">
                  <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem' }}>Roster Notes</div>
                  <textarea
                    className="form-control"
                    rows={4}
                    value={notes}
                    placeholder="General shift plan details or roster notes..."
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={!canUpdate}
                    style={{ resize: 'none', fontSize: '0.85rem' }}
                  />
                </div>

                {/* Warnings Section */}
                {workspace.nozzles.some((n) => !getLocallyAssignedStaffName(n.id)) && (
                  <div className="card-premium" style={{ borderLeft: '4px solid var(--color-warning-text)', backgroundColor: '#fffbeb' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 600, color: 'var(--color-warning-text)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                      <AlertTriangle size={18} />
                      <span>Unallocated Nozzles</span>
                    </div>
                    <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                      Some active forecourt nozzles are not mapped to any attendant. Please check assignments before saving.
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )
      ) : null}

      {/* Side Drawer Component */}
      <div className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)}>
        <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-header">
            <h3 className="h4" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserPlus size={18} style={{ color: 'var(--color-accent)' }} />
              <span>{editingEmployeeId ? 'Edit Assignment' : 'Assign Employee'}</span>
            </h3>
            <button
              onClick={() => setDrawerOpen(false)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={20} />
            </button>
          </div>

          <div className="drawer-body">
            <div className="form-group">
              <label className="form-label">Select Employee</label>
              <select
                className="form-control"
                value={drawerEmployeeId}
                disabled={!!editingEmployeeId}
                onChange={(e) => {
                  const empId = e.target.value;
                  setDrawerEmployeeId(empId);
                  const emp = (workspace?.available_staff || []).find((x) => x.id === empId);
                  if (emp) {
                    setDrawerDesignationId(emp.designation_id);
                  }
                }}
              >
                <option value="">— Choose Attendant —</option>
                {(workspace?.available_staff || [])
                  .filter((e) => editingEmployeeId ? e.id === editingEmployeeId : !localAssignments.some((la) => la.employee_id === e.id))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.display_name} ({e.employee_code} - {e.designation_details.name})
                    </option>
                  ))
                }
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Duty Designation</label>
              <select
                className="form-control"
                value={drawerDesignationId}
                onChange={(e) => setDrawerDesignationId(e.target.value)}
              >
                <option value="">— Select Roster Designation —</option>
                {designations.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="drawerPrimaryCashier"
                  checked={drawerPrimaryCashier}
                  onChange={(e) => setDrawerPrimaryCashier(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="drawerPrimaryCashier" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                  Set as Primary Cashier
                </label>
              </div>
              {drawerPrimaryCashier && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-warning-text)', marginTop: '0.25rem', fontWeight: 500 }}>
                  * This will clear the primary cashier status on all other assigned employees.
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Nozzle Allocations</label>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', maxHeight: '250px', overflowY: 'auto', backgroundColor: 'var(--bg-main)' }}>
                {Object.keys(dispenserGroups).map((dId) => {
                  const disp = dispenserGroups[dId];
                  return (
                    <div key={dId} style={{ marginBottom: '1rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-accent)', marginBottom: '0.375rem' }}>
                        {disp.dispenserName}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {disp.nozzles.map((nz) => {
                          const assignedToOtherName = getLocallyAssignedStaffName(nz.id, drawerEmployeeId);
                          const isAssignedToOther = !!assignedToOtherName;
                          const isChecked = drawerNozzleIds.includes(nz.id);
                          
                          return (
                            <div key={nz.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', width: '100%', margin: 0, cursor: isAssignedToOther ? 'not-allowed' : 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isAssignedToOther}
                                  onChange={(e) => handleNozzleCheckboxChange(nz.id, e.target.checked)}
                                  style={{ width: '14px', height: '14px', cursor: isAssignedToOther ? 'not-allowed' : 'pointer' }}
                                />
                                <span style={{ textDecoration: isAssignedToOther ? 'line-through' : 'none', color: isAssignedToOther ? 'var(--text-muted)' : 'inherit' }}>
                                  {nz.name} ({nz.code} - {nz.product_name})
                                </span>
                              </label>
                              {isAssignedToOther && (
                                <span className="badge-premium" style={{ fontSize: '0.7rem', backgroundColor: 'var(--border-color)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  Assigned to {assignedToOtherName}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {Object.keys(dispenserGroups).length === 0 && (
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>No nozzles available for this outlet.</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Duty Assignment Notes (Optional)</label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Specific notes or remarks for this employee's shift assignment..."
                value={drawerNotes}
                onChange={(e) => setDrawerNotes(e.target.value)}
                style={{ resize: 'none' }}
              />
            </div>
          </div>

          <div className="drawer-footer">
            <button className="btn btn-secondary" onClick={() => setDrawerOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleApplyDrawer}>
              {editingEmployeeId ? 'Apply Updates' : 'Add Assignment'}
            </button>
          </div>
        </div>
      </div>

      {/* Toast Messages */}
      {toast && (
        <div className="toast-box">
          <div className={`toast-item toast-${toast.type}`}>
            {toast.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

