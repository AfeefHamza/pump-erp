import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import {
  type Customer,
  type OutletResponse,
  createCustomer,
  updateCustomer,
} from '@/api/client';

interface CustomerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (customer: Customer) => void;
  customer?: Customer | null;
  orgId: string;
  outlets?: OutletResponse[];
}

export const CustomerDrawer: React.FC<CustomerDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
  customer,
  orgId,
  outlets = [],
}) => {
  const isEditing = Boolean(customer);

  const [customerCode, setCustomerCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [customerType, setCustomerType] = useState<Customer['customer_type']>('business');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [creditDays, setCreditDays] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [notes, setNotes] = useState('');
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customer) {
      setCustomerCode(customer.customer_code || '');
      setDisplayName(customer.display_name || '');
      setCustomerType(customer.customer_type || 'business');
      setPhoneNumber(customer.phone_number || '');
      setAlternatePhone(customer.alternate_phone_number || '');
      setEmail(customer.email || '');
      setBillingAddress(customer.billing_address || '');
      setGstin(customer.GSTIN || '');
      setCreditLimit(customer.credit_limit ? String(customer.credit_limit) : '');
      setCreditDays(customer.credit_days !== null && customer.credit_days !== undefined ? String(customer.credit_days) : '');
      setStatus(customer.status || 'active');
      setNotes(customer.notes || '');
      setSelectedOutletIds(customer.assigned_outlets?.map((o) => o.id) || []);
    } else {
      setCustomerCode('');
      setDisplayName('');
      setCustomerType('business');
      setPhoneNumber('');
      setAlternatePhone('');
      setEmail('');
      setBillingAddress('');
      setGstin('');
      setCreditLimit('');
      setCreditDays('');
      setStatus('active');
      setNotes('');
      setSelectedOutletIds([]);
    }
    setError(null);
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerCode.trim() || !displayName.trim()) {
      setError('Customer code and display name are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload: Partial<Customer> & { outlet_ids?: string[] } = {
      customer_code: customerCode.trim().toUpperCase(),
      display_name: displayName.trim(),
      customer_type: customerType,
      phone_number: phoneNumber.trim() || null,
      alternate_phone_number: alternatePhone.trim() || null,
      email: email.trim() || null,
      billing_address: billingAddress.trim() || null,
      GSTIN: gstin.trim().toUpperCase() || null,
      credit_limit: creditLimit ? creditLimit : null,
      credit_days: creditDays ? parseInt(creditDays, 10) : null,
      status,
      notes: notes.trim() || null,
      outlet_ids: selectedOutletIds.length > 0 ? selectedOutletIds : undefined,
    };

    try {
      let saved: Customer;
      if (isEditing && customer) {
        saved = await updateCustomer(orgId, customer.id, payload);
      } else {
        saved = await createCustomer(orgId, payload);
      }
      onSuccess(saved);
      onClose();
    } catch (err: any) {
      console.error('Failed to save customer:', err);
      setError(err.message || 'Failed to save customer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleOutlet = (outletId: string) => {
    setSelectedOutletIds((prev) =>
      prev.includes(outletId) ? prev.filter((id) => id !== outletId) : [...prev, outletId]
    );
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
          maxWidth: '520px',
          height: '100%',
          backgroundColor: 'var(--bg-card, #ffffff)',
          boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.15))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Drawer Header */}
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
              {isEditing ? 'Edit Customer' : 'Add Credit Customer'}
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.825rem', color: 'var(--text-muted, #64748b)' }}>
              Fuel credit customer account & credit limit settings.
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
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Customer Code *
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', textTransform: 'uppercase' }}
                placeholder="e.g. CUST01"
                value={customerCode}
                onChange={(e) => setCustomerCode(e.target.value)}
                disabled={isEditing}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Customer Type
              </label>
              <select
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                value={customerType}
                onChange={(e) => setCustomerType(e.target.value as any)}
              >
                <option value="business">Business / Corporate</option>
                <option value="individual">Individual</option>
                <option value="government">Government Agency</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
              Display Name *
            </label>
            <input
              type="text"
              className="input"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
              placeholder="e.g. Sharma Transport Logistics"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Phone Number
              </label>
              <input
                type="tel"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                placeholder="+91 9876543210"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Alternate Phone
              </label>
              <input
                type="tel"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                placeholder="Optional"
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Email
              </label>
              <input
                type="email"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                placeholder="accounts@transport.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                GSTIN
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', textTransform: 'uppercase' }}
                placeholder="e.g. 29ABCDE1234F1Z5"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Credit Limit (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                placeholder="0.00 (No limit if empty)"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Credit Days
              </label>
              <input
                type="number"
                step="1"
                min="0"
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                placeholder="e.g. 15"
                value={creditDays}
                onChange={(e) => setCreditDays(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
              Billing Address
            </label>
            <textarea
              className="input"
              rows={2}
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
              placeholder="Street, City, PIN"
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
            />
          </div>

          {outlets.length > 1 && (
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Authorized Outlets (Leave unselected for all outlets)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '100px', overflowY: 'auto' }}>
                {outlets.map((outlet) => {
                  const checked = selectedOutletIds.includes(outlet.id);
                  return (
                    <label
                      key={outlet.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.35rem 0.6rem',
                        backgroundColor: checked ? 'var(--color-accent-light, #ccfbf1)' : 'var(--table-header-bg, #f1f5f9)',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        border: checked ? '1px solid var(--color-accent, #0f766e)' : '1px solid var(--border-color, #e2e8f0)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOutlet(outlet.id)}
                      />
                      <span>{outlet.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
              Internal Notes
            </label>
            <textarea
              className="input"
              rows={2}
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
              placeholder="Credit terms, authorized vehicles, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {isEditing && (
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, marginBottom: '0.35rem', color: 'var(--text-main, #0f172a)' }}>
                Account Status
              </label>
              <select
                className="input"
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)' }}
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive / Suspended</option>
              </select>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ marginTop: 'auto', paddingTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ padding: '0.6rem 1.25rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ padding: '0.6rem 1.5rem', backgroundColor: 'var(--color-accent, #0f766e)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 500 }}
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Customer' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
