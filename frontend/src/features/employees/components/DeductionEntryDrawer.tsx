import React, { useState, useEffect } from 'react';
import { X, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import {
  type EmployeeShiftDeduction,
  createShiftDeduction,
} from '@/api/client';

interface DeductionEntryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (ded: EmployeeShiftDeduction) => void;
  orgId: string;
  outletId: string;
  shiftId: string;
  employeeId: string;
  employeeName: string;
}

export const DeductionEntryDrawer: React.FC<DeductionEntryDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
  orgId,
  outletId,
  shiftId,
  employeeId,
  employeeName,
}) => {
  const [deductionType, setDeductionType] = useState<'cash_expense' | 'approved_deduction' | 'other_adjustment'>('cash_expense');
  const [direction, setDirection] = useState<'increases_accounted' | 'decreases_accounted'>('increases_accounted');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [description, setDescription] = useState('');
  const [payee, setPayee] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [approvalReason, setApprovalReason] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-set default direction based on type
  useEffect(() => {
    if (deductionType === 'cash_expense') {
      setDirection('increases_accounted');
    } else if (deductionType === 'approved_deduction') {
      setDirection('decreases_accounted');
    }
  }, [deductionType]);

  useEffect(() => {
    if (isOpen) {
      setDeductionType('cash_expense');
      setDirection('increases_accounted');
      setAmount('');
      setOccurredAt('');
      setDescription('');
      setPayee('');
      setReferenceNumber('');
      setApprovalReason('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const enteredAmount = Number(amount) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredAmount <= 0) {
      setError('Amount must be positive.');
      return;
    }
    if (!description.trim()) {
      setError('Description is mandatory.');
      return;
    }
    if (!approvalReason.trim()) {
      setError('Approval reason is mandatory.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const ded = await createShiftDeduction(orgId, outletId, shiftId, {
        employee_id: employeeId,
        deduction_type: deductionType,
        direction,
        amount: enteredAmount.toFixed(2),
        occurred_at: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        description: description.trim(),
        approval_reason: approvalReason.trim(),
        payee: payee.trim() || undefined,
        reference_number: referenceNumber.trim() || undefined,
      });
      onSuccess(ded);
      onClose();
    } catch (err: any) {
      console.error('Failed to create shift deduction:', err);
      setError(err.message || 'Failed to save authorized adjustment.');
    } finally {
      setIsSubmitting(false);
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
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'flex-end',
        zIndex: 1050,
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
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
              Authorized Shift Adjustment / Expense
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.825rem', color: 'var(--text-muted, #64748b)' }}>
              Attendant: <strong>{employeeName}</strong>
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

          {/* Type & Direction */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Adjustment Type *
              </label>
              <select
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                value={deductionType}
                onChange={(e) => setDeductionType(e.target.value as any)}
              >
                <option value="cash_expense">Cash Expense (Paid from shift)</option>
                <option value="approved_deduction">Approved Deduction / Recovery</option>
                <option value="other_adjustment">Other Authorized Adjustment</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Effect on Accounted *
              </label>
              <select
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                value={direction}
                onChange={(e) => setDirection(e.target.value as any)}
              >
                <option value="increases_accounted">Increases Accounted (+)</option>
                <option value="decreases_accounted">Decreases Accounted (-)</option>
              </select>
            </div>
          </div>

          {/* Amount & Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Positive Amount (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '1.1rem', fontWeight: 700 }}
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Time Occurred
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

          {/* Effect Preview Callout */}
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: '6px',
              backgroundColor: direction === 'increases_accounted' ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-warning-bg, #ffedd5)',
              border: direction === 'increases_accounted' ? '1px solid var(--color-success-text, #15803d)' : '1px solid var(--color-warning-text, #c2410c)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            {direction === 'increases_accounted' ? (
              <TrendingUp size={20} style={{ color: 'var(--color-success-text, #15803d)', flexShrink: 0 }} />
            ) : (
              <TrendingDown size={20} style={{ color: 'var(--color-warning-text, #c2410c)', flexShrink: 0 }} />
            )}
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: direction === 'increases_accounted' ? 'var(--color-success-text, #15803d)' : 'var(--color-warning-text, #c2410c)' }}>
              {direction === 'increases_accounted'
                ? `This adjustment increases the employee's accounted amount by ₹${enteredAmount.toFixed(2)}`
                : `This adjustment decreases the employee's accounted amount by ₹${enteredAmount.toFixed(2)}`}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
              Description / Voucher Details *
            </label>
            <input
              type="text"
              className="input"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
              placeholder="e.g. Generator diesel top-up / Tea & snacks expense"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Payee / Vendor
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                placeholder="e.g. Local vendor"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Voucher / Bill #
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                placeholder="Physical voucher #"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
              Approval Reason *
            </label>
            <textarea
              className="input"
              rows={2}
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
              placeholder="Mandatory management approval explanation..."
              value={approvalReason}
              onChange={(e) => setApprovalReason(e.target.value)}
              required
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
              disabled={isSubmitting || enteredAmount <= 0}
              style={{ backgroundColor: 'var(--color-accent, #0f766e)', color: '#fff', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '6px', fontWeight: 500 }}
            >
              {isSubmitting ? 'Approving...' : 'Approve & Record Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
