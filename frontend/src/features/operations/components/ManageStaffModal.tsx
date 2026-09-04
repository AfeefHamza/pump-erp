// frontend/src/features/operations/components/ManageStaffModal.tsx
import React, { useState, useEffect } from 'react';
import { X, Users, UserPlus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  fetchEmployees,
  updateShiftAssignments,
  type Employee,
  type OperationalShiftDetailResponse,
} from '@/api/client';

interface ManageStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orgId: string;
  outletId: string;
  shift: OperationalShiftDetailResponse['shift'];
}

interface StaffEntry {
  employee_id: string;
  employee_name: string;
  designation_name: string;
  nozzle_ids: string[];
  notes?: string;
}

export const ManageStaffModal: React.FC<ManageStaffModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  orgId,
  outletId,
  shift,
}) => {
  const [availableEmployees, setAvailableEmployees] = useState<Employee[]>([]);
  const [staffEntries, setStaffEntries] = useState<StaffEntry[]>([]);
  const [selectedNewEmpId, setSelectedNewEmpId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize from current shift data
  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setSelectedNewEmpId('');
    setLoading(true);

    // Fetch active employees for this outlet
    fetchEmployees(orgId, { status: 'active' })
      .then((employees) => {
        // Filter employees assigned to this outlet
        const outletEmps = employees.filter((emp) =>
          emp.outlet_assignments?.some((oa) => oa.outlet_id === outletId || (oa as any).outlet === outletId || (oa as any).outlet_details?.id === outletId)
        );
        setAvailableEmployees(outletEmps.length > 0 ? outletEmps : employees);
      })
      .catch((err) => {
        console.error('Failed to load employees:', err);
      })
      .finally(() => setLoading(false));

    // Map existing shift staff members
    const initialStaff: StaffEntry[] = (shift.staff_members || []).map((sm) => {
      // Find nozzles assigned to this staff member
      const nozzleIds = (shift.meters || [])
        .filter((m) => m.staff_assignment === sm.id || m.employee_id === sm.source_employee)
        .map((m) => m.nozzle);

      return {
        employee_id: sm.source_employee,
        employee_name: sm.employee_name_snapshot,
        designation_name: sm.designation_snapshot,
        nozzle_ids: nozzleIds,
        notes: sm.notes || '',
      };
    });

    setStaffEntries(initialStaff);
  }, [isOpen, orgId, outletId, shift]);

  if (!isOpen) return null;

  const allNozzles = (shift.meters || []).map((m) => ({
    id: m.nozzle,
    code: m.nozzle_code,
    name: m.nozzle_name,
    product: m.product_name,
    dispenser: m.dispenser_name,
  }));

  const handleAddEmployee = () => {
    if (!selectedNewEmpId) return;
    const emp = availableEmployees.find((e) => e.id === selectedNewEmpId);
    if (!emp) return;

    if (staffEntries.some((s) => s.employee_id === emp.id)) {
      setError('This employee is already in the shift staff list.');
      return;
    }

    const newEntry: StaffEntry = {
      employee_id: emp.id,
      employee_name: emp.display_name,
      designation_name: emp.designation_details?.name || 'Staff',
      nozzle_ids: [],
      notes: '',
    };

    setStaffEntries([...staffEntries, newEntry]);
    setSelectedNewEmpId('');
    setError(null);
  };

  const handleRemoveEmployee = (empId: string) => {
    const entry = staffEntries.find((s) => s.employee_id === empId);
    if (entry && entry.nozzle_ids.length > 0) {
      setError(`Cannot remove ${entry.employee_name} while they have nozzles assigned. Reassign their nozzles first.`);
      return;
    }
    setStaffEntries(staffEntries.filter((s) => s.employee_id !== empId));
    setError(null);
  };



  const handleNozzleAssignmentChange = (nozzleId: string, targetEmpId: string) => {
    setStaffEntries((prev) =>
      prev.map((s) => {
        if (s.employee_id === targetEmpId) {
          // Add nozzle to target
          if (!s.nozzle_ids.includes(nozzleId)) {
            return { ...s, nozzle_ids: [...s.nozzle_ids, nozzleId] };
          }
          return s;
        } else {
          // Remove nozzle from previous holder
          return { ...s, nozzle_ids: s.nozzle_ids.filter((nid) => nid !== nozzleId) };
        }
      })
    );
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (staffEntries.length === 0) {
      setError('Shift must have at least one assigned staff member.');
      return;
    }



    // Ensure all active nozzles are assigned
    const assignedNozzleIds = new Set<string>();
    for (const s of staffEntries) {
      for (const nid of s.nozzle_ids) {
        assignedNozzleIds.add(nid);
      }
    }

    for (const n of allNozzles) {
      if (!assignedNozzleIds.has(n.id)) {
        setError(`Nozzle ${n.code} (${n.name}) is unassigned. Every active forecourt nozzle must have an assigned attendant.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        staff_assignments: staffEntries.map((s) => ({
          employee_id: s.employee_id,
          nozzle_ids: s.nozzle_ids,
          notes: s.notes || undefined,
        })),
      };

      await updateShiftAssignments(orgId, outletId, shift.id, payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to update shift assignments:', err);
      let errMsg = 'Failed to update shift assignments.';
      if (err.data && typeof err.data === 'object') {
        const data = err.data as Record<string, any>;
        errMsg = Object.entries(data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('; ');
      } else if (err.message) {
        errMsg = err.message;
      }
      setError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // Employees available to add (not yet in shift)
  const unassignedEmployees = availableEmployees.filter(
    (e) => !staffEntries.some((s) => s.employee_id === e.id)
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          border: '1px solid var(--border-color, #334155)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color, #334155)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={20} />
            </div>
            <div>
              <h3 className="h4" style={{ margin: 0, fontSize: '1.1rem' }}>Manage Shift Staff & Nozzles</h3>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                Add attendants or re-map nozzle handlers during this live shift.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#f87171',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{error}</div>
            </div>
          )}

          {/* Add Employee Section */}
          <div
            style={{
              padding: '1rem',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color, #334155)',
              borderRadius: '8px',
            }}
          >
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
              Add Another Employee to this Shift
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <select
                className="form-input"
                value={selectedNewEmpId}
                onChange={(e) => setSelectedNewEmpId(e.target.value)}
                disabled={loading || unassignedEmployees.length === 0}
                style={{ flex: 1, padding: '0.5rem 0.75rem' }}
              >
                <option value="">
                  {unassignedEmployees.length === 0 ? '— All outlet employees are currently assigned —' : '— Select Employee to Add —'}
                </option>
                {unassignedEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.display_name} ({emp.employee_code} - {emp.designation_details?.name || 'Attendant'})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAddEmployee}
                disabled={!selectedNewEmpId || loading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}
              >
                <UserPlus size={16} /> Add to Shift
              </button>
            </div>
          </div>

          {/* Current Shift Staff Members */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
                Shift Attendants & Staff ({staffEntries.length})
              </h4>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {staffEntries.map((staff) => (
                <div
                  key={staff.employee_id}
                  style={{
                    padding: '1rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color, #334155)',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '1rem' }}>{staff.employee_name}</strong>
                      <span className="text-muted" style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                        ({staff.designation_name})
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {staffEntries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEmployee(staff.employee_id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '0.25rem',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Remove from shift"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Assigned Nozzles for this staff */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>Handling Nozzles:</span>
                    {staff.nozzle_ids.length === 0 ? (
                      <span className="text-muted" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
                        None (Cashier / Supervisory duty)
                      </span>
                    ) : (
                      staff.nozzle_ids.map((nid) => {
                        const n = allNozzles.find((x) => x.id === nid);
                        return (
                          <span
                            key={nid}
                            className="badge"
                            style={{ backgroundColor: '#1e3a8a', color: '#93c5fd', fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                          >
                            {n ? n.code : nid}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Nozzle Handler Mapping */}
          <div>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 600 }}>
              Forecourt Nozzle Handlers ({allNozzles.length})
            </h4>
            <p className="text-muted" style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem' }}>
              Assign each active nozzle to an attendant. One nozzle can only have one attendant at a time.
            </p>

            <div style={{ border: '1px solid var(--border-color, #334155)', borderRadius: '8px', overflow: 'hidden' }}>
              <table className="table" style={{ margin: 0, width: '100%' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg, #f1f5f9)' }}>
                    <th>Nozzle</th>
                    <th>Dispenser</th>
                    <th>Product</th>
                    <th>Assigned Handler</th>
                  </tr>
                </thead>
                <tbody>
                  {allNozzles.map((n) => {
                    const currentHolder = staffEntries.find((s) => s.nozzle_ids.includes(n.id));
                    return (
                      <tr key={n.id}>
                        <td>
                          <strong>{n.code}</strong> <span className="text-muted">({n.name})</span>
                        </td>
                        <td>{n.dispenser}</td>
                        <td>
                          <span className="badge" style={{ backgroundColor: '#0284c7' }}>
                            {n.product}
                          </span>
                        </td>
                        <td>
                          <select
                            className="form-input"
                            value={currentHolder?.employee_id || ''}
                            onChange={(e) => handleNozzleAssignmentChange(n.id, e.target.value)}
                            style={{ width: '100%', padding: '0.4rem 0.6rem' }}
                          >
                            <option value="">— Unassigned —</option>
                            {staffEntries.map((s) => (
                              <option key={s.employee_id} value={s.employee_id}>
                                {s.employee_name} ({s.designation_name})
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderTop: '1px solid var(--border-color, #334155)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || staffEntries.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <CheckCircle2 size={16} />
            <span>{submitting ? 'Saving Assignments...' : 'Save Staff Assignments'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
