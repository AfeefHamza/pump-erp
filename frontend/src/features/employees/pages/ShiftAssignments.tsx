import React, { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchRosterWorkspace,
  saveRosterWorkspace,
  fetchShiftDefinitions,
  type ShiftDefinition,
  type RosterWorkspaceResponse
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { Calendar, UserPlus, Trash2, AlertTriangle, AlertCircle, RefreshCw, Layers, ShieldCheck } from 'lucide-react';

export const ShiftAssignments: React.FC = () => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  // States
  const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().substring(0, 10));
  
  const [workspace, setWorkspace] = useState<RosterWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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

  // Selected Employee to add form
  const [addEmployeeId, setAddEmployeeId] = useState('');
  const [addDesignationId, setAddDesignationId] = useState('');
  const [addPrimaryCashier, setAddPrimaryCashier] = useState(false);

  // Permissions
  const canView = usePermission('shift_roster.view');
  const canConfigure = usePermission('shift_roster.create') || usePermission('shift_roster.update');

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

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

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
    } catch (err) {
      console.error('Failed to load roster workspace:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, selectedShiftId, businessDate]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Actions
  const handleAddStaff = () => {
    if (!workspace || !addEmployeeId || !addDesignationId) return;

    // Verify employee not already added
    if (localAssignments.some((a) => a.employee_id === addEmployeeId)) {
      alert('Employee is already assigned to this roster.');
      return;
    }

    const availableStaff = workspace.available_staff || [];
    // If roster exists, we can extract from it or fetch from workspace
    let employeeObj = availableStaff.find(e => e.id === addEmployeeId);
    if (!employeeObj && workspace.roster) {
      // Find inside existing staff assignments
      const existing = workspace.roster.staff_assignments.find(sa => sa.employee_id === addEmployeeId);
      employeeObj = existing?.employee_details;
    }

    if (!employeeObj) return;

    const designationObj = employeeObj.designation_details; // default designation

    setLocalAssignments((prev) => [
      ...prev,
      {
        employee_id: addEmployeeId,
        display_name: employeeObj!.display_name,
        duty_designation_id: addDesignationId,
        duty_designation_name: designationObj.name,
        is_primary_cashier: addPrimaryCashier,
        nozzle_ids: [],
        notes: '',
      }
    ]);

    // Reset inputs
    setAddEmployeeId('');
    setAddPrimaryCashier(false);
  };

  const handleRemoveStaff = (employeeId: string) => {
    setLocalAssignments((prev) => prev.filter((a) => a.employee_id !== employeeId));
  };

  const handleTogglePrimaryCashier = (employeeId: string) => {
    setLocalAssignments((prev) =>
      prev.map((a) => ({
        ...a,
        is_primary_cashier: a.employee_id === employeeId ? !a.is_primary_cashier : false
      }))
    );
  };

  const handleNozzleAssignmentChange = (employeeId: string, nozzleId: string, checked: boolean) => {
    setLocalAssignments((prev) =>
      prev.map((a) => {
        if (a.employee_id === employeeId) {
          const nextNozzles = checked
            ? [...a.nozzle_ids, nozzleId]
            : a.nozzle_ids.filter((id) => id !== nozzleId);
          return { ...a, nozzle_ids: nextNozzles };
        }
        // If nozzle assigned to another employee, remove it from them (prevent duplicate assignments)
        if (checked && a.nozzle_ids.includes(nozzleId)) {
          return { ...a, nozzle_ids: a.nozzle_ids.filter((id) => id !== nozzleId) };
        }
        return a;
      })
    );
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
      alert('Roster planning saved successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to save roster workspace configurations.');
    } finally {
      setActionLoading(false);
    }
  };

  // Group nozzles by dispenser
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

  // Find who has this nozzle assigned locally
  const getLocallyAssignedStaff = (nozzleId: string) => {
    const assigned = localAssignments.find((a) => a.nozzle_ids.includes(nozzleId));
    return assigned ? assigned.display_name : null;
  };

  if (!selectedOrgId || !selectedOutletId) {
    return (
      <div className="management-page">
        <PageHeader title="Shift Assignments Planning" subtitle="Roster staff and allocate nozzles" />
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertCircle size={40} className="text-muted" style={{ margin: '0 auto 1rem' }} />
          <p className="text-muted">Please select an organisation and an outlet in the sidebar to configure shift assignments.</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view shift rosters.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ paddingBottom: '4rem' }}>
      <PageHeader 
        title="Shift Assignments Planner" 
        subtitle="Dated roster planning: assign duties and map nozzles to pump attendants"
      />

      {/* Roster date/shift selector bar */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
              <option key={s.id} value={s.id}>{s.name} ({s.code} : {s.starts_at.substring(0, 5)}-{s.ends_at.substring(0, 5)})</option>
            ))}
          </select>
        </div>

        <button 
          className="btn btn-primary"
          onClick={handleSaveWorkspace}
          disabled={actionLoading || !canConfigure || localAssignments.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}
        >
          {actionLoading ? 'Saving...' : 'Save Roster Planning'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading planning workspace...</p>
        </div>
      ) : workspace ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* Main workspace */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Staff Assigned Table */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h2 className="h4" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={18} style={{ color: 'var(--color-accent)' }} />
                <span>Rostered Staff ({localAssignments.length})</span>
              </h2>

              {/* Add staff fast entry form */}
              {canConfigure && (
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem' }}>
                  <select
                    className="form-control"
                    style={{ flex: 1, minWidth: '200px' }}
                    value={addEmployeeId}
                    onChange={(e) => {
                      setAddEmployeeId(e.target.value);
                      // Default designation
                      const available = workspace.available_staff || [];
                      const emp = available.find(x => x.id === e.target.value);
                      if (emp) {
                        setAddDesignationId(emp.designation_id);
                      }
                    }}
                  >
                    <option value="">— Select Attendant —</option>
                    {(workspace.available_staff || []).map((e) => (
                      <option key={e.id} value={e.id}>{e.display_name} ({e.employee_code} - {e.designation_details.name})</option>
                    ))}
                  </select>

                  <select
                    className="form-control"
                    style={{ flex: 1, minWidth: '200px' }}
                    value={addDesignationId}
                    onChange={(e) => setAddDesignationId(e.target.value)}
                    disabled={!addEmployeeId}
                  >
                    <option value="">— Duty Designation —</option>
                    {addEmployeeId && (workspace.available_staff || []).find(e => e.id === addEmployeeId)?.designation_details && (
                      <option value={(workspace.available_staff || []).find(e => e.id === addEmployeeId)!.designation_id}>
                        {(workspace.available_staff || []).find(e => e.id === addEmployeeId)!.designation_details.name} (Attendant Default)
                      </option>
                    )}
                  </select>

                  <button className="btn btn-secondary" onClick={handleAddStaff} disabled={!addEmployeeId} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <UserPlus size={16} />
                    <span>Assign</span>
                  </button>
                </div>
              )}

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Duty Role</th>
                      <th>Nozzles Allocated</th>
                      <th>Primary Cashier</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localAssignments.map((a) => (
                      <tr key={a.employee_id}>
                        <td><strong>{a.display_name}</strong></td>
                        <td>{a.duty_designation_name}</td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {a.nozzle_ids.map((nid) => {
                              const nz = workspace.nozzles.find(n => n.id === nid);
                              return (
                                <span key={nid} className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                                  {nz ? nz.code : 'Nozzle'}
                                </span>
                              );
                            })}
                            {a.nozzle_ids.length === 0 && <span className="text-muted" style={{ fontSize: '0.8rem' }}>None</span>}
                          </div>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={a.is_primary_cashier}
                            onChange={() => handleTogglePrimaryCashier(a.employee_id)}
                            disabled={!canConfigure}
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {canConfigure && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleRemoveStaff(a.employee_id)}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {localAssignments.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                          <p className="text-muted">No staff assigned to this shift roster yet.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Forecourt group nozzle allocator */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h2 className="h4" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Layers size={18} style={{ color: 'var(--color-accent)' }} />
                <span>Forecourt Nozzle Allocator</span>
              </h2>
              <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                Grouped by multi-product dispenser (MPD). Allocate nozzle to rostered employee by selecting checkbox next to nozzle.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {Object.keys(dispenserGroups).map((dId) => {
                  const disp = dispenserGroups[dId];
                  return (
                    <div key={dId} className="card" style={{ padding: '1rem', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                      <div style={{ fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{disp.dispenserName}</span>
                        <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>MPD</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {disp.nozzles.map((nz) => {
                          const assignedStaff = getLocallyAssignedStaff(nz.id);
                          return (
                            <div key={nz.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0' }}>
                              <div>
                                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{nz.name} (<code style={{ color: 'var(--color-accent)' }}>{nz.code}</code>)</div>
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>Product: {nz.product_name} | Tank: {nz.tank_code}</div>
                              </div>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {assignedStaff && (
                                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-accent)', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {assignedStaff}
                                  </span>
                                )}
                                <select
                                  className="form-control"
                                  style={{ width: '120px', fontSize: '0.8rem', height: '28px', padding: '0 4px' }}
                                  value={localAssignments.find(a => a.nozzle_ids.includes(nz.id))?.employee_id || ''}
                                  onChange={(e) => {
                                    const empId = e.target.value;
                                    if (empId) {
                                      handleNozzleAssignmentChange(empId, nz.id, true);
                                    } else {
                                      // find who has it and unassign
                                      const current = localAssignments.find(a => a.nozzle_ids.includes(nz.id));
                                      if (current) {
                                        handleNozzleAssignmentChange(current.employee_id, nz.id, false);
                                      }
                                    }
                                  }}
                                  disabled={!canConfigure}
                                >
                                  <option value="">— Unassigned —</option>
                                  {localAssignments.map((a) => (
                                    <option key={a.employee_id} value={a.employee_id}>{a.display_name}</option>
                                  ))}
                                </select>
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

          {/* Roster settings summary sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 600, marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <ShieldCheck size={18} style={{ color: 'var(--color-success)' }} />
                <span>Roster Info</span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                <div><strong>Outlet:</strong> {workspace.roster?.outlet || selectedOutletId}</div>
                <div><strong>Date:</strong> {businessDate}</div>
                <div><strong>Status:</strong> {workspace.exists ? (workspace.roster?.is_locked ? 'Locked' : 'Editable Plan') : 'Unsaved Draft'}</div>
              </div>
            </div>

            {/* Warn unassigned nozzles */}
            {workspace.nozzles.some(n => !localAssignments.some(a => a.nozzle_ids.includes(n.id))) && (
              <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--color-warning)', background: 'rgba(245, 158, 11, 0.05)' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 600, color: 'var(--color-warning-text)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  <AlertTriangle size={18} />
                  <span>Unallocated Nozzles</span>
                </div>
                <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                  Some active nozzles have not been assigned to any attendant for this shift. Check allocations before saving.
                </p>
              </div>
            )}
          </div>

        </div>
      ) : null}
    </div>
  );
};
