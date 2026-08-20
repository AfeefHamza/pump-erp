import React from 'react';
import { FormField } from './FormField';

interface OrganisationFormProps {
  data: Record<string, string>;
  onChange: (field: string, value: string) => void;
  errors: Record<string, string>;
}

export const OrganisationForm: React.FC<OrganisationFormProps> = ({ data, onChange, errors }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 'var(--space-xs)' }}>
        Organisation Details
      </h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
        Configure the primary details and legal identification of your business.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="Organisation Name *" error={errors.name} required htmlFor="name">
          <input
            id="name"
            className={`form-input ${errors.name ? 'error' : ''}`}
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
            required
          />
        </FormField>

        <FormField label="Legal Name" error={errors.legal_name} htmlFor="legal_name">
          <input
            id="legal_name"
            className={`form-input ${errors.legal_name ? 'error' : ''}`}
            value={data.legal_name || ''}
            onChange={(e) => onChange('legal_name', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="Trade Name (Optional)" error={errors.trade_name} htmlFor="trade_name">
          <input
            id="trade_name"
            className={`form-input ${errors.trade_name ? 'error' : ''}`}
            value={data.trade_name || ''}
            onChange={(e) => onChange('trade_name', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>

        <FormField label="Business Email (Optional)" error={errors.email} htmlFor="email">
          <input
            id="email"
            type="email"
            className={`form-input ${errors.email ? 'error' : ''}`}
            value={data.email || ''}
            onChange={(e) => onChange('email', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="GSTIN (Optional)" error={errors.gstin} htmlFor="gstin">
          <input
            id="gstin"
            className={`form-input ${errors.gstin ? 'error' : ''}`}
            value={data.gstin || ''}
            onChange={(e) => onChange('gstin', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
            placeholder="e.g. 29AAAAA1111A1Z1"
          />
        </FormField>

        <FormField label="PAN (Optional)" error={errors.pan} htmlFor="pan">
          <input
            id="pan"
            className={`form-input ${errors.pan ? 'error' : ''}`}
            value={data.pan || ''}
            onChange={(e) => onChange('pan', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
            placeholder="e.g. ABCDE1234F"
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="Phone Number (Optional)" error={errors.phone_number} htmlFor="phone_number">
          <input
            id="phone_number"
            className={`form-input ${errors.phone_number ? 'error' : ''}`}
            value={data.phone_number || ''}
            onChange={(e) => onChange('phone_number', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>

        <FormField label="Address Line 1" error={errors.address_line_1} htmlFor="address_line_1">
          <input
            id="address_line_1"
            className={`form-input ${errors.address_line_1 ? 'error' : ''}`}
            value={data.address_line_1 || ''}
            onChange={(e) => onChange('address_line_1', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="Address Line 2 (Optional)" error={errors.address_line_2} htmlFor="address_line_2">
          <input
            id="address_line_2"
            className={`form-input ${errors.address_line_2 ? 'error' : ''}`}
            value={data.address_line_2 || ''}
            onChange={(e) => onChange('address_line_2', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>

        <FormField label="City" error={errors.city} htmlFor="city">
          <input
            id="city"
            className={`form-input ${errors.city ? 'error' : ''}`}
            value={data.city || ''}
            onChange={(e) => onChange('city', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="District (Optional)" error={errors.district} htmlFor="district">
          <input
            id="district"
            className={`form-input ${errors.district ? 'error' : ''}`}
            value={data.district || ''}
            onChange={(e) => onChange('district', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>

        <FormField label="State" error={errors.state} htmlFor="state">
          <input
            id="state"
            className={`form-input ${errors.state ? 'error' : ''}`}
            value={data.state || ''}
            onChange={(e) => onChange('state', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>

        <FormField label="Postal Code" error={errors.postal_code} htmlFor="postal_code">
          <input
            id="postal_code"
            className={`form-input ${errors.postal_code ? 'error' : ''}`}
            value={data.postal_code || ''}
            onChange={(e) => onChange('postal_code', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>
      </div>
    </div>
  );
};
