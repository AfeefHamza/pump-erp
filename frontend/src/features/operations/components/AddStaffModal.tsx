import React, { useState } from 'react';
import { addShiftStaff, type AddShiftStaffPayload } from '@/api/client';
import { UserPlus, X, AlertCircle, Fuel } from 'lucide-react';

interface AddStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orgId: string;
  outletId: string;
  shiftId: string;
  availableEmployees: Array<{
    id: string;
    employee_code: string;
    display_name: string;
    designation_id?: string;
    designation_name?: string;
  }>;
  designations: Array<{
    id: string;
    code: string;
    name: string;
    requires_nozzle_assignment?: boolean;
  }>;
  unassignedNozzles: Array<{
    id: string;
    code: string;
    name: string;
    product_name?: string;
    dispenser_name?: string;
  }>;
}

export const AddStaffModal: React.FC<AddStaffModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  orgId,
  outletId,
  shiftId,
  availableEmployees,
  designations,
  unassignedNozzles,
}) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedDesignationId, setSelectedDesignationId] = useState('');
  const [selectedNozzleIds, setSelectedNozzleIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEmployeeChange = (empId: string) => {
    setSelectedEmployeeId(empId);
    const emp = availableEmployees.find(e => e.id === empId);
    if (emp && emp.designation_id) {
      setSelectedDesignationId(emp.designation_id);
    }
  };

  const toggleNozzle = (nozzleId: string) => {
    setSelectedNozzleIds(prev =>
      prev.includes(nozzleId) ? prev.filter(id => id !== nozzleId) : [...prev, nozzleId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      setError('Please select an employee.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload: AddShiftStaffPayload = {
      employee_id: selectedEmployeeId,
      duty_designation_id: selectedDesignationId || null,
      notes: notes.trim() || undefined,
      assigned_nozzle_ids: selectedNozzleIds.length > 0 ? selectedNozzleIds : undefined,
    };

    try {
      await addShiftStaff(orgId, outletId, shiftId, payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to add staff member to shift.');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          borderRadius: '14px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-surface, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: 'rgba(14, 165, 233, 0.12)',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserPlus size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                Add Staff Member to Shift
              </h3>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary, #64748b)' }}>
                Assign an employee for non-nozzle duty or allocate unassigned pumps
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary, #64748b)',
              padding: '4px',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {error && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#dc2626',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Employee Selection */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary, #0f172a)' }}>
                Select Employee <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => handleEmployeeChange(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  backgroundColor: 'var(--bg-input, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">-- Choose active outlet employee --</option>
                {availableEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.display_name} ({emp.employee_code}) {emp.designation_name ? `• ${emp.designation_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Duty Designation */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary, #0f172a)' }}>
                Duty Designation <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>(Optional override)</span>
              </label>
              <select
                value={selectedDesignationId}
                onChange={(e) => setSelectedDesignationId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  backgroundColor: 'var(--bg-input, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Default (From Employee Master Profile)</option>
                {designations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                Allows designating as Cashier, Forecourt Supervisor, Manager, or Helper for this shift.
              </p>
            </div>

            {/* Unassigned Nozzles (Optional Direct Assignment) */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary, #0f172a)' }}>
                <Fuel size={15} color="#0284c7" /> Assign Unattended Nozzles <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>(Optional)</span>
              </label>
              {unassignedNozzles.length === 0 ? (
                <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: 'var(--bg-surface, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', fontSize: '0.8125rem', color: 'var(--text-secondary, #64748b)' }}>
                  All nozzles are currently actively assigned. To transfer an in-use nozzle to this employee, use the <strong>Handover</strong> action on that nozzle.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '120px', overflowY: 'auto', padding: '0.5rem', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px' }}>
                  {unassignedNozzles.map((nz) => {
                    const isChecked = selectedNozzleIds.includes(nz.id);
                    return (
                      <button
                        key={nz.id}
                        type="button"
                        onClick={() => toggleNozzle(nz.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.375rem 0.75rem',
                          borderRadius: '6px',
                          border: isChecked ? '1px solid #0284c7' : '1px solid var(--border-color, #cbd5e1)',
                          backgroundColor: isChecked ? 'rgba(14, 165, 233, 0.12)' : 'var(--bg-surface, #ffffff)',
                          color: isChecked ? '#0284c7' : 'var(--text-primary, #0f172a)',
                          fontSize: '0.8125rem',
                          cursor: 'pointer',
                          fontWeight: isChecked ? 600 : 400,
                        }}
                      >
                        <span>{nz.code}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                          ({nz.product_name || nz.name})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Operational Notes */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary, #0f172a)' }}>
                Notes / Assignment Reason <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>(Optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Added for rush hour relief / cash management"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  backgroundColor: 'var(--bg-input, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '0.875rem',
                  resize: 'none',
                }}
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border-color, #e2e8f0)',
              backgroundColor: 'var(--bg-surface, #f8fafc)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #cbd5e1)',
                backgroundColor: 'transparent',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.875rem',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedEmployeeId}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                fontSize: '0.875rem',
                cursor: submitting || !selectedEmployeeId ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                opacity: submitting || !selectedEmployeeId ? 0.65 : 1,
              }}
            >
              {submitting ? 'Adding...' : 'Add to Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
