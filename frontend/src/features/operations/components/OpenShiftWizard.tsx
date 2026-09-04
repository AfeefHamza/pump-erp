import React, { useState, useEffect } from 'react';
import { useAppSelector } from '@/app/store';
import {
  prepareShiftOpening, openOperationalShift, fetchShiftDefinitions,
  type ShiftDefinition, type ShiftOpenPreparationResponse
} from '@/api/client';
import {
  X, CheckCircle2, AlertCircle, ShieldAlert,
  ArrowRight, ArrowLeft, Clock
} from 'lucide-react';

interface OpenShiftWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onShiftOpened: (shift: any) => void;
}

export const OpenShiftWizard: React.FC<OpenShiftWizardProps> = ({
  isOpen,
  onClose,
  onShiftOpened,
}) => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [shiftDefinitions, setShiftDefinitions] = useState<ShiftDefinition[]>([]);
  const [selectedShiftDefId, setSelectedShiftDefId] = useState<string>('');
  const [businessDate, setBusinessDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [loadingPrep, setLoadingPrep] = useState(false);
  const [prepData, setPrepData] = useState<ShiftOpenPreparationResponse | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);

  // Assignments state: nozzleId -> { employeeId: string }
  const [nozzleAssignments, setNozzleAssignments] = useState<Record<string, string>>({});

  // Manual exceptions: nozzleId -> { reading: string, type: string, reason: string }
  const [manualExceptions, setManualExceptions] = useState<
    Record<string, { reading: string; type: string; reason: string }>
  >({});

  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load shift definitions
  useEffect(() => {
    if (!isOpen || !selectedOrgId || !selectedOutletId) return;
    setStep(1);
    setPrepData(null);
    setPrepError(null);
    setSubmitError(null);
    fetchShiftDefinitions(selectedOrgId, selectedOutletId)
      .then((res) => {
        const active = (res.shifts || []).filter((d) => d.is_active);
        setShiftDefinitions(active);
        if (active.length > 0) {
          setSelectedShiftDefId(active[0].id);
        }
      })
      .catch((err) => console.error('Failed to load shift definitions:', err));
  }, [isOpen, selectedOrgId, selectedOutletId]);

  // When step 1 proceeds, run prepareShiftOpening
  const handleProceedToAssignments = async () => {
    if (!selectedOrgId || !selectedOutletId || !selectedShiftDefId || !businessDate) return;
    setLoadingPrep(true);
    setPrepError(null);
    try {
      const data = await prepareShiftOpening(selectedOrgId, selectedOutletId, selectedShiftDefId, businessDate);
      setPrepData(data);

      if (!data.can_open) {
        if (!data.readiness.ready) {
          setPrepError(`Outlet readiness check failed: ${data.readiness.missing_requirements.join(', ')}`);
        } else if (data.active_open_shift) {
          setPrepError(`Another shift (${data.active_open_shift.shift_name} on ${data.active_open_shift.business_date}) is currently OPEN for this outlet. Only one shift may be open at a time.`);
        } else if (data.existing_shift) {
          setPrepError(`A shift for this definition and business date already exists (Status: ${data.existing_shift.status}).`);
        }
        setLoadingPrep(false);
        return;
      }

      // Pre-fill assignments
      const initialNozzleMap: Record<string, string> = {};
      data.nozzles.forEach((n) => {
        if (n.preselected_employee_id) {
          initialNozzleMap[n.nozzle_id] = n.preselected_employee_id;
        } else if (data.employees.length > 0) {
          initialNozzleMap[n.nozzle_id] = data.employees[0].id;
        }
      });
      setNozzleAssignments(initialNozzleMap);

      // Check nozzles requiring manual exception
      const initialExceptions: Record<string, { reading: string; type: string; reason: string }> = {};
      data.nozzles.forEach((n) => {
        if (n.requires_manual_exception || n.derived_opening_reading === null) {
          initialExceptions[n.nozzle_id] = {
            reading: '',
            type: 'first_time_setup_exception',
            reason: 'Opening reading manual exception',
          };
        }
      });
      setManualExceptions(initialExceptions);

      setStep(2);
    } catch (err: any) {
      setPrepError(err.message || 'Failed to prepare shift opening.');
    } finally {
      setLoadingPrep(false);
    }
  };

  const handleOpenShift = async () => {
    if (!selectedOrgId || !selectedOutletId || !prepData) return;
    setSubmitting(true);
    setSubmitError(null);

    // Group nozzles by employee
    const empToNozzles: Record<string, string[]> = {};
    prepData.nozzles.forEach((n) => {
      const empId = nozzleAssignments[n.nozzle_id];
      if (empId) {
        if (!empToNozzles[empId]) empToNozzles[empId] = [];
        empToNozzles[empId].push(n.nozzle_id);
      }
    });

    const staffAssignmentsPayload = Object.entries(empToNozzles).map(([empId, nIds]) => ({
      employee_id: empId,
      nozzle_ids: nIds,
    }));

    try {
      const shift = await openOperationalShift(selectedOrgId, selectedOutletId, {
        shift_definition_id: selectedShiftDefId,
        business_date: businessDate,
        staff_assignments: staffAssignmentsPayload,
        manual_exceptions: manualExceptions,
        notes,
      });
      onShiftOpened(shift);
      onClose();
    } catch (err: any) {
      console.error('Failed to open shift:', err);
      setSubmitError(err.message || 'Failed to open operational shift.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          borderRadius: '12px',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
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
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(15, 118, 110, 0.1)',
                color: '#0f766e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Clock size={20} />
            </div>
            <div>
              <h2 className="h4" style={{ margin: 0, fontSize: '1.1rem' }}>
                Open Live Operational Shift
              </h2>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                Step {step} of 4: {step === 1 && 'Shift & Business Date'}
                {step === 2 && 'Staff & Nozzle Assignments'}
                {step === 3 && 'Opening Totalizers & Exceptions'}
                {step === 4 && 'Review & Open'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Content */}
        <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1 }}>
          {/* STEP 1: Shift & Date */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>Shift Definition</label>
                <select
                  className="form-input"
                  value={selectedShiftDefId}
                  onChange={(e) => setSelectedShiftDefId(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem' }}
                >
                  {shiftDefinitions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.starts_at} - {d.ends_at}) {d.crosses_midnight ? '• Overnight' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>Business Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={businessDate}
                  onChange={(e) => setBusinessDate(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem' }}
                />
                <span className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.35rem', display: 'block' }}>
                  For overnight shifts, this is the official start business date governing the shift.
                </span>
              </div>

              {prepError && (
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    color: '#f87171',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                  }}
                >
                  <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Cannot Open Shift:</strong>
                    <div style={{ marginTop: '0.25rem' }}>{prepError}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Staff & Nozzle Assignments */}
          {step === 2 && prepData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <h4 style={{ margin: '0.5rem 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600 }}>
                  Active Forecourt Nozzle Assignments ({prepData.nozzles.length})
                </h4>
                <div style={{ border: '1px solid var(--border-color, #334155)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table className="table" style={{ margin: 0, width: '100%' }}>
                    <thead>
                      <tr style={{ background: 'var(--table-header-bg, #f1f5f9)' }}>
                        <th>Nozzle</th>
                        <th>Dispenser</th>
                        <th>Product</th>
                        <th>Current Price</th>
                        <th>Assigned Attendant (DSM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prepData.nozzles.map((n) => (
                        <tr key={n.nozzle_id}>
                          <td>
                            <strong>{n.nozzle_code}</strong> <span className="text-muted">({n.nozzle_name})</span>
                          </td>
                          <td>{n.dispenser_name}</td>
                          <td>
                            <span className="badge" style={{ backgroundColor: '#0284c7' }}>
                              {n.product_name}
                            </span>
                          </td>
                          <td>
                            {n.current_price ? `₹${parseFloat(n.current_price).toFixed(2)}/L` : 'Not set'}
                          </td>
                          <td>
                            <select
                              className="form-input"
                              value={nozzleAssignments[n.nozzle_id] || ''}
                              onChange={(e) =>
                                setNozzleAssignments({
                                  ...nozzleAssignments,
                                  [n.nozzle_id]: e.target.value,
                                })
                              }
                              style={{ width: '100%', padding: '0.4rem 0.6rem' }}
                            >
                              {prepData.employees.map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                  {emp.name} ({emp.designation_name})
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Opening Totalizers & Exceptions */}
          {step === 3 && prepData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                Opening readings are automatically derived from the previous closed shift's closing readings
                or confirmed opening balances. If a mechanical replacement, rollover, or setup exception
                occurred, enter the manual exception with a justification.
              </p>

              <div style={{ border: '1px solid var(--border-color, #334155)', borderRadius: '8px', overflow: 'hidden' }}>
                <table className="table" style={{ margin: 0, width: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg, #f1f5f9)' }}>
                      <th>Nozzle</th>
                      <th>Derived Reading</th>
                      <th>Derivation Source</th>
                      <th>Override / Exception</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prepData.nozzles.map((n) => {
                      const exc = manualExceptions[n.nozzle_id];
                      return (
                        <tr key={n.nozzle_id}>
                          <td>
                            <strong>{n.nozzle_code}</strong>
                          </td>
                          <td>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1.05rem' }}>
                              {n.derived_opening_reading !== null
                                ? parseFloat(n.derived_opening_reading).toFixed(3)
                                : 'Missing'}
                            </span>
                          </td>
                          <td>
                            <span
                              className="badge"
                              style={{
                                backgroundColor: n.opening_source === 'commissioning' ? '#0d9488' : '#334155',
                                color: '#ffffff',
                              }}
                            >
                              {n.opening_source_description}
                            </span>
                          </td>
                          <td>
                            {exc ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <input
                                    type="number"
                                    step="0.001"
                                    placeholder="Reading"
                                    className="form-input"
                                    value={exc.reading}
                                    onChange={(e) =>
                                      setManualExceptions({
                                        ...manualExceptions,
                                        [n.nozzle_id]: { ...exc, reading: e.target.value },
                                      })
                                    }
                                    style={{ width: '110px', padding: '0.35rem' }}
                                  />
                                  <select
                                    className="form-input"
                                    value={exc.type}
                                    onChange={(e) =>
                                      setManualExceptions({
                                        ...manualExceptions,
                                        [n.nozzle_id]: { ...exc, type: e.target.value },
                                      })
                                    }
                                    style={{ padding: '0.35rem' }}
                                  >
                                    <option value="first_time_setup_exception">First Time Setup</option>
                                    <option value="new_or_replaced_meter">Replaced Meter</option>
                                    <option value="meter_reset">Meter Reset</option>
                                    <option value="totalizer_rollover">Rollover</option>
                                    <option value="approved_correction">Approved Correction</option>
                                  </select>
                                </div>
                                <input
                                  type="text"
                                  placeholder="Mandatory reason for exception"
                                  className="form-input"
                                  value={exc.reason}
                                  onChange={(e) =>
                                    setManualExceptions({
                                      ...manualExceptions,
                                      [n.nozzle_id]: { ...exc, reason: e.target.value },
                                    })
                                  }
                                  style={{ width: '100%', padding: '0.35rem', fontSize: '0.8rem' }}
                                />
                                {!n.requires_manual_exception && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = { ...manualExceptions };
                                      delete next[n.nozzle_id];
                                      setManualExceptions(next);
                                    }}
                                    className="btn btn-ghost"
                                    style={{ fontSize: '0.75rem', padding: '0.1rem', color: '#f87171' }}
                                  >
                                    Remove Override
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setManualExceptions({
                                    ...manualExceptions,
                                    [n.nozzle_id]: {
                                      reading: n.derived_opening_reading || '',
                                      type: 'approved_correction',
                                      reason: '',
                                    },
                                  })
                                }
                                className="btn btn-outline"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                              >
                                Manual Override
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 4: Review & Open */}
          {step === 4 && prepData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '1rem',
                  padding: '1.25rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color, #e2e8f0)',
                }}
              >
                <div>
                  <div className="text-muted" style={{ fontSize: '0.8rem' }}>Shift Definition</div>
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>
                    {shiftDefinitions.find((d) => d.id === selectedShiftDefId)?.name}
                  </div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: '0.8rem' }}>Business Date</div>
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>{businessDate}</div>
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>Shift Opening Notes (Optional)</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Normal shift open. Weather clear, DG tested."
                  style={{ width: '100%', padding: '0.6rem' }}
                />
              </div>

              {submitError && (
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    color: '#f87171',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <AlertCircle size={20} />
                  <span>{submitError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-main, #f8fafc)',
          }}
        >
          {step > 1 ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep((s) => (s - 1) as any)}
              disabled={submitting}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>

            {step === 1 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleProceedToAssignments}
                disabled={loadingPrep || !selectedShiftDefId || !businessDate}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                {loadingPrep ? 'Validating...' : 'Next: Assign Staff'} <ArrowRight size={16} />
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep(3)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                Next: Totalizers <ArrowRight size={16} />
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep(4)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                Next: Review & Open <ArrowRight size={16} />
              </button>
            )}

            {step === 4 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOpenShift}
                disabled={submitting}
                style={{
                  backgroundColor: '#16a34a',
                  borderColor: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 600,
                }}
              >
                <CheckCircle2 size={18} />
                {submitting ? 'Opening Shift...' : 'Confirm & Open Shift'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
