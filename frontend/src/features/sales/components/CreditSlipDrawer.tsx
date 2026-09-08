import React, { useState, useEffect } from 'react';
import { X, AlertCircle, AlertTriangle, Plus } from 'lucide-react';
import {
  type Customer,
  type FuelCreditSlip,
  fetchCustomers,
  fetchCustomerCreditPosition,
  fetchOperationalShiftDetail,
  createShiftCreditSlip,
} from '@/api/client';
import { CustomerDrawer } from './CustomerDrawer';

interface CreditSlipDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (slip?: FuelCreditSlip) => void;
  orgId: string;
  outletId: string;
  shiftId: string;
  preselectedEmployeeId?: string;
  preselectedNozzleId?: string;
}

export const CreditSlipDrawer: React.FC<CreditSlipDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
  orgId,
  outletId,
  shiftId,
  preselectedEmployeeId,
  preselectedNozzleId,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shiftData, setShiftData] = useState<any | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerPosition, setCustomerPosition] = useState<any | null>(null);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(preselectedEmployeeId || '');
  const [selectedNozzleId, setSelectedNozzleId] = useState(preselectedNozzleId || '');
  const [quantity, setQuantity] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [customerReference, setCustomerReference] = useState('');
  const [physicalSlipNumber, setPhysicalSlipNumber] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [notes, setNotes] = useState('');

  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && orgId && outletId && shiftId) {
      fetchCustomers(orgId, { status: 'active' })
        .then((custs) => setCustomers(custs))
        .catch((e: any) => console.error(e));

      fetchOperationalShiftDetail(orgId, outletId, shiftId)
        .then((s: any) => {
          setShiftData(s);
          if (!selectedEmployeeId && s.shift?.staff_members?.length > 0) {
            const firstStaff = s.shift.staff_members[0];
            const firstEmpId = firstStaff.source_employee || firstStaff.source_employee_id || firstStaff.id;
            if (firstEmpId) setSelectedEmployeeId(firstEmpId);
          }
          if (s.shift?.status === 'closed' && s.shift?.closed_at) {
            setOccurredAt(new Date(s.shift.closed_at).toISOString().slice(0, 16));
          } else {
            setOccurredAt(new Date().toISOString().slice(0, 16));
          }
        })
        .catch((e: any) => console.error(e));
    }
  }, [isOpen, orgId, outletId, shiftId]);

  useEffect(() => {
    if (preselectedEmployeeId) setSelectedEmployeeId(preselectedEmployeeId);
  }, [preselectedEmployeeId]);

  useEffect(() => {
    if (preselectedNozzleId) setSelectedNozzleId(preselectedNozzleId);
  }, [preselectedNozzleId]);

  // Load customer position when customer selected
  useEffect(() => {
    if (selectedCustomerId && orgId) {
      fetchCustomerCreditPosition(orgId, selectedCustomerId, outletId)
        .then((pos) => setCustomerPosition(pos))
        .catch((e) => console.error(e));
    } else {
      setCustomerPosition(null);
    }
  }, [selectedCustomerId, orgId, outletId]);

  // Helper getters
  const getMeterNozzleId = (m: any): string => m?.nozzle || m?.nozzle_id || m?.id || '';
  const getMeterUnitPrice = (m: any): number => {
    if (!m) return 0;
    if (m.unit_price && !isNaN(Number(m.unit_price))) return Number(m.unit_price);
    if (m.price_segments && m.price_segments.length > 0) {
      const active = m.price_segments.find((seg: any) => !seg.ends_at) || m.price_segments[m.price_segments.length - 1];
      return active?.unit_price ? Number(active.unit_price) || 0 : 0;
    }
    return 0;
  };

  // Determine available nozzles and prices
  const availableMeters: any[] = shiftData?.shift?.meters || [];
  const selectedMeter = availableMeters.find((m: any) => getMeterNozzleId(m) === selectedNozzleId);
  const applicablePrice = getMeterUnitPrice(selectedMeter);
  const calculatedAmount = quantity && applicablePrice ? (Number(quantity) * applicablePrice).toFixed(2) : '0.00';

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      setError('Please select a customer.');
      return;
    }
    if (!selectedEmployeeId) {
      setError('Please select an attendant.');
      return;
    }
    if (!selectedNozzleId || !selectedMeter) {
      setError('Please select a nozzle.');
      return;
    }
    if (!selectedMeter.product_id) {
      setError('Selected nozzle does not have an associated fuel product.');
      return;
    }
    const qtyNum = Number(quantity);
    if (!qtyNum || qtyNum <= 0) {
      setError('Quantity must be greater than 0.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const slip = await createShiftCreditSlip(orgId, outletId, shiftId, {
        customer_id: selectedCustomerId,
        employee_id: selectedEmployeeId,
        product_id: selectedMeter.product_id,
        nozzle_id: selectedNozzleId,
        quantity: qtyNum.toFixed(3),
        occurred_at: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        vehicle_number: vehicleNumber.trim() || undefined,
        driver_name: driverName.trim() || undefined,
        customer_reference: customerReference.trim() || undefined,
        physical_slip_number: physicalSlipNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onSuccess(slip);
      onClose();
    } catch (err: any) {
      console.error('Failed to create credit slip:', err);
      setError(err.message || 'Failed to issue credit slip.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickCustomerSuccess = (newCust: Customer) => {
    setCustomers((prev) => [newCust, ...prev]);
    setSelectedCustomerId(newCust.id);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'flex-end',
        zIndex: 1000,
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          height: '100%',
          backgroundColor: 'var(--bg-card, #ffffff)',
          boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.15))',
          display: 'flex',
          flexDirection: 'column',
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
            background: 'var(--table-header-bg, #f8fafc)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
              Issue Fuel Credit Slip
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.825rem', color: 'var(--text-muted, #64748b)' }}>
              Attributed to attendant nozzle interval without creating duplicate fuel sales.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted, #64748b)',
              padding: '0.4rem',
              borderRadius: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {error && (
            <div
              style={{
                backgroundColor: 'var(--color-danger-bg, #fee2e2)',
                color: 'var(--color-danger-text, #b91c1c)',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Selection */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-main, #0f172a)' }}>
                Customer *
              </label>
              <button
                type="button"
                onClick={() => setIsQuickCustomerOpen(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-accent, #0f766e)',
                  fontSize: '0.775rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                }}
              >
                <Plus size={13} /> Quick Add Customer
              </button>
            </div>
            <select
              className="input"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              required
            >
              <option value="">Select an active customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customer_code} - {c.display_name} {c.credit_limit ? `(Limit: ₹${c.credit_limit})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Credit Position Banner if customer selected */}
          {customerPosition && (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: '6px',
                backgroundColor: customerPosition.is_credit_limit_exceeded ? 'var(--color-danger-bg, #fee2e2)' : 'var(--table-header-bg, #f8fafc)',
                border: customerPosition.is_credit_limit_exceeded ? '1px solid var(--color-danger-text, #b91c1c)' : '1px solid var(--border-color, #e2e8f0)',
                fontSize: '0.825rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: customerPosition.is_credit_limit_exceeded ? 'var(--color-danger-text, #b91c1c)' : 'var(--text-main, #0f172a)' }}>
                <span>Outstanding Credit: ₹{Number(customerPosition.outstanding_credit_amount).toFixed(2)}</span>
                <span>Limit: {Number(customerPosition.credit_limit) > 0 ? `₹${Number(customerPosition.credit_limit).toFixed(2)}` : 'No Limit'}</span>
              </div>
              {customerPosition.is_credit_limit_exceeded && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-danger-text, #b91c1c)', marginTop: '0.3rem', fontSize: '0.775rem' }}>
                  <AlertTriangle size={14} />
                  <span>Warning: This customer has exceeded their credit limit!</span>
                </div>
              )}
            </div>
          )}

          {/* Attendant Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
              Attendant (DSM) *
            </label>
            <select
              className="input"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              required
            >
              <option value="">Select shift attendant...</option>
              {shiftData?.shift?.staff_members?.map((s: any) => {
                const empId = s.source_employee || s.source_employee_id || s.id;
                const empName = s.employee_name_snapshot || s.employee_name || 'Attendant';
                const desig = s.designation_snapshot || s.designation_name || 'Attendant';
                return (
                  <option key={empId} value={empId}>
                    {empName} ({desig})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Nozzle & Product Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Nozzle *
              </label>
              <select
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                value={selectedNozzleId}
                onChange={(e) => setSelectedNozzleId(e.target.value)}
                required
              >
                <option value="">Select nozzle...</option>
                {availableMeters.map((m: any) => {
                  const nId = getMeterNozzleId(m);
                  const price = getMeterUnitPrice(m);
                  return (
                    <option key={nId} value={nId}>
                      {m.nozzle_code} - {m.product_name} (₹{price.toFixed(2)}/L)
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Fuel Price (Locked)
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--table-header-bg, #f1f5f9)' }}
                value={applicablePrice ? `₹${applicablePrice.toFixed(2)} / L` : '—'}
                disabled
              />
            </div>
          </div>

          {/* Quantity & Calculated Amount Preview */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Quantity (Litres) *
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '1rem', fontWeight: 600 }}
                placeholder="0.000"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Server Amount Preview (₹)
              </label>
              <div
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '6px',
                  backgroundColor: 'var(--color-accent-light, #ccfbf1)',
                  color: 'var(--color-accent, #0f766e)',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                ₹{Number(calculatedAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Vehicle & Driver details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Vehicle Number
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', textTransform: 'uppercase' }}
                placeholder="e.g. KA-01-AB-1234"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Driver Name
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                placeholder="e.g. Ramesh"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Physical Slip #
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                placeholder="Slip book leaf number"
                value={physicalSlipNumber}
                onChange={(e) => setPhysicalSlipNumber(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Issue Time
              </label>
              <input
                type="datetime-local"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '0.825rem' }}
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
              Customer Reference
            </label>
            <input
              type="text"
              className="input"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
              placeholder="PO / Indent Ref"
              value={customerReference}
              onChange={(e) => setCustomerReference(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
              Notes
            </label>
            <textarea
              className="input"
              rows={2}
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
              placeholder="Authorization details, special terms, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div style={{ marginTop: 'auto', paddingTop: '1.25rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ backgroundColor: 'var(--color-accent, #0f766e)', color: '#fff', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '6px', fontWeight: 500 }}
            >
              {isSubmitting ? 'Issuing Slip...' : 'Save Credit Slip'}
            </button>
          </div>
        </form>
      </div>

      {/* Quick Customer Drawer */}
      <CustomerDrawer
        isOpen={isQuickCustomerOpen}
        onClose={() => setIsQuickCustomerOpen(false)}
        onSuccess={handleQuickCustomerSuccess}
        orgId={orgId}
      />
    </div>
  );
};
