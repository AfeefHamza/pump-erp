import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertCircle, Calculator } from 'lucide-react';
import {
  type EmployeeShiftCollection,
  type CashDenominationItem,
  createShiftCollection,
  updateCollection,
} from '@/api/client';

const INDIAN_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

interface CollectionEntryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (col: EmployeeShiftCollection) => void;
  orgId: string;
  outletId: string;
  shiftId: string;
  employeeId: string;
  employeeName: string;
  collectionToEdit?: EmployeeShiftCollection | null;
}

export const CollectionEntryDrawer: React.FC<CollectionEntryDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
  orgId,
  outletId,
  shiftId,
  employeeId,
  employeeName,
  collectionToEdit,
}) => {
  const isEditing = Boolean(collectionToEdit);

  const [method, setMethod] = useState<'cash' | 'card' | 'upi'>('cash');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [providerName, setProviderName] = useState('');
  const [terminalReference, setTerminalReference] = useState('');
  const [notes, setNotes] = useState('');

  // Cash Denominations
  const [showDenominations, setShowDenominations] = useState(false);
  const [denomCounts, setDenomCounts] = useState<Record<number, number>>({});

  // Duplicate Reference Override
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [isDuplicateError, setIsDuplicateError] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (collectionToEdit) {
      setMethod(collectionToEdit.collection_method);
      setAmount(String(collectionToEdit.amount));
      setOccurredAt(collectionToEdit.occurred_at ? collectionToEdit.occurred_at.slice(0, 16) : '');
      setReferenceNumber(collectionToEdit.reference_number || '');
      setProviderName(collectionToEdit.provider_name || '');
      setTerminalReference(collectionToEdit.terminal_or_account_reference || '');
      setNotes(collectionToEdit.notes || '');

      if (collectionToEdit.denominations && collectionToEdit.denominations.length > 0) {
        setShowDenominations(true);
        const map: Record<number, number> = {};
        collectionToEdit.denominations.forEach((d) => {
          map[Number(d.denomination_value)] = d.quantity;
        });
        setDenomCounts(map);
      } else {
        setShowDenominations(false);
        setDenomCounts({});
      }
    } else {
      setMethod('cash');
      setAmount('');
      setOccurredAt('');
      setReferenceNumber('');
      setProviderName('');
      setTerminalReference('');
      setNotes('');
      setShowDenominations(false);
      setDenomCounts({});
    }
    setAllowDuplicate(false);
    setOverrideReason('');
    setIsDuplicateError(false);
    setError(null);
  }, [collectionToEdit, isOpen]);

  // Denomination Total calculation
  const calculatedDenomTotal = useMemo(() => {
    return INDIAN_DENOMINATIONS.reduce((sum, val) => {
      const qty = denomCounts[val] || 0;
      return sum + val * qty;
    }, 0);
  }, [denomCounts]);

  const denomDifference = useMemo(() => {
    const entered = Number(amount) || 0;
    return entered - calculatedDenomTotal;
  }, [amount, calculatedDenomTotal]);

  const handleDenomQtyChange = (val: number, qtyStr: string) => {
    const qty = Math.max(0, parseInt(qtyStr, 10) || 0);
    setDenomCounts((prev) => ({ ...prev, [val]: qty }));
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const enteredAmount = Number(amount);
    if (!enteredAmount || enteredAmount <= 0) {
      setError('Collection amount must be positive.');
      return;
    }

    // Denomination match validation
    if (method === 'cash' && showDenominations) {
      if (calculatedDenomTotal !== enteredAmount) {
        setError(
          `Denomination total (₹${calculatedDenomTotal.toFixed(2)}) does not match entered cash amount (₹${enteredAmount.toFixed(2)}). Difference: ₹${denomDifference.toFixed(2)}`
        );
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    const denomItems: CashDenominationItem[] | undefined =
      method === 'cash' && showDenominations
        ? INDIAN_DENOMINATIONS.filter((val) => (denomCounts[val] || 0) > 0).map((val) => ({
            denomination_value: val,
            quantity: denomCounts[val],
            calculated_amount: val * denomCounts[val],
          }))
        : undefined;

    try {
      let result: EmployeeShiftCollection;
      if (isEditing && collectionToEdit) {
        result = await updateCollection(orgId, outletId, collectionToEdit.id, {
          amount: enteredAmount.toFixed(2),
          occurred_at: occurredAt ? new Date(occurredAt).toISOString() : undefined,
          reference_number: referenceNumber.trim() || undefined,
          provider_name: providerName.trim() || undefined,
          terminal_or_account_reference: terminalReference.trim() || undefined,
          notes: notes.trim() || undefined,
          denominations: denomItems,
        });
      } else {
        result = await createShiftCollection(orgId, outletId, shiftId, {
          employee_id: employeeId,
          collection_method: method,
          amount: enteredAmount.toFixed(2),
          occurred_at: occurredAt ? new Date(occurredAt).toISOString() : undefined,
          reference_number: referenceNumber.trim() || undefined,
          provider_name: providerName.trim() || undefined,
          terminal_or_account_reference: terminalReference.trim() || undefined,
          notes: notes.trim() || undefined,
          denominations: denomItems,
          allow_duplicate_reference: allowDuplicate,
          override_reason: allowDuplicate ? overrideReason.trim() : undefined,
        });
      }
      onSuccess(result);
      onClose();
    } catch (err: any) {
      console.error('Failed to record collection:', err);
      const msg = err.message || 'Failed to record collection.';
      setError(msg);
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate reference')) {
        setIsDuplicateError(true);
      }
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
              {isEditing ? 'Edit Collection Record' : 'Record Employee Collection'}
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
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={16} style={{ marginTop: '0.15rem', flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Collection Method Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
              Collection Method *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              {(['cash', 'card', 'upi'] as const).map((m) => {
                const selected = method === m;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={isEditing}
                    onClick={() => setMethod(m)}
                    style={{
                      padding: '0.65rem',
                      borderRadius: '6px',
                      border: selected ? '2px solid var(--color-accent, #0f766e)' : '1px solid var(--border-color, #cbd5e1)',
                      backgroundColor: selected ? 'var(--color-accent-light, #ccfbf1)' : '#fff',
                      color: selected ? 'var(--color-accent, #0f766e)' : 'var(--text-main, #0f172a)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      cursor: isEditing ? 'not-allowed' : 'pointer',
                      fontSize: '0.825rem',
                      textAlign: 'center',
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collection Amount & Occurred Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Amount Handed Over (₹) *
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
                Handover Time
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

          {/* Cash Denominations Section */}
          {method === 'cash' && (
            <div
              style={{
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '8px',
                padding: '1rem',
                backgroundColor: 'var(--table-header-bg, #f8fafc)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.875rem' }}>
                  <Calculator size={16} style={{ color: 'var(--color-accent, #0f766e)' }} />
                  <span>Count Denominations (Optional)</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showDenominations}
                    onChange={(e) => setShowDenominations(e.target.checked)}
                  />
                  <span>Enable breakdown</span>
                </label>
              </div>

              {showDenominations && (
                <div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color, #cbd5e1)' }}>
                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left' }}>Note</th>
                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>Count</th>
                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {INDIAN_DENOMINATIONS.map((val) => {
                        const qty = denomCounts[val] || '';
                        const lineTotal = val * (denomCounts[val] || 0);
                        return (
                          <tr key={val} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>₹{val}</td>
                            <td style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={qty}
                                onChange={(e) => handleDenomQtyChange(val, e.target.value)}
                                style={{
                                  width: '70px',
                                  padding: '0.25rem 0.4rem',
                                  textAlign: 'center',
                                  borderRadius: '4px',
                                  border: '1px solid var(--border-color, #cbd5e1)',
                                }}
                              />
                            </td>
                            <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: 500 }}>
                              ₹{lineTotal.toLocaleString('en-IN')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Denomination Total Bar */}
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.65rem 0.75rem',
                      borderRadius: '6px',
                      backgroundColor: denomDifference === 0 ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-danger-bg, #fee2e2)',
                      border: denomDifference === 0 ? '1px solid var(--color-success-text, #15803d)' : '1px solid var(--color-danger-text, #b91c1c)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                    }}
                  >
                    <span>Counted Total: ₹{calculatedDenomTotal.toFixed(2)}</span>
                    <span>
                      {denomDifference === 0 ? (
                        <span style={{ color: 'var(--color-success-text, #15803d)' }}>Exact match</span>
                      ) : (
                        <span style={{ color: 'var(--color-danger-text, #b91c1c)' }}>
                          Diff: ₹{Math.abs(denomDifference).toFixed(2)} {denomDifference > 0 ? 'remaining' : 'exceeded'}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Card / UPI Details */}
          {(method === 'card' || method === 'upi') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                    Provider / Bank / App
                  </label>
                  <input
                    type="text"
                    className="input"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                    placeholder={method === 'upi' ? 'e.g. PhonePe / GooglePay / Paytm' : 'e.g. HDFC POS / PineLabs'}
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                    Transaction Reference #
                  </label>
                  <input
                    type="text"
                    className="input"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                    placeholder="UTR / Auth Code / TXN ID"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                  Terminal or Account Reference (Optional)
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                  placeholder="POS TID or UPI QR ID"
                  value={terminalReference}
                  onChange={(e) => setTerminalReference(e.target.value)}
                />
              </div>

              {/* Duplicate reference override if triggered */}
              {isDuplicateError && (
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-warning-bg, #ffedd5)',
                    border: '1px solid var(--color-warning-text, #c2410c)',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', fontWeight: 600, color: 'var(--color-warning-text, #c2410c)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={allowDuplicate}
                      onChange={(e) => setAllowDuplicate(e.target.checked)}
                    />
                    <span>Authorize Duplicate Reference with Override Reason</span>
                  </label>
                  {allowDuplicate && (
                    <input
                      type="text"
                      className="input"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', marginTop: '0.5rem', fontSize: '0.825rem' }}
                      placeholder="Mandatory override reason (e.g. Split transaction verified on POS receipt)"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      required={allowDuplicate}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
              Notes
            </label>
            <textarea
              className="input"
              rows={2}
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
              placeholder="Handover notes, bag number, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Action buttons */}
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
              disabled={isSubmitting || (method === 'cash' && showDenominations && denomDifference !== 0)}
              style={{ backgroundColor: 'var(--color-accent, #0f766e)', color: '#fff', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '6px', fontWeight: 500 }}
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Collection' : 'Record Collection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
