import React from 'react';
import { FormField } from './FormField';

interface OutletFormProps {
  data: Record<string, string>;
  onChange: (field: string, value: string) => void;
  errors: Record<string, string>;
  orgAddress: Record<string, string>;
}

export const OutletForm: React.FC<OutletFormProps> = ({ data, onChange, errors, orgAddress }) => {
  const brandChoices = [
    { code: 'IOCL', name: 'Indian Oil (IOCL)' },
    { code: 'BPCL', name: 'Bharat Petroleum (BPCL)' },
    { code: 'HPCL', name: 'Hindustan Petroleum (HPCL)' },
    { code: 'Nayara', name: 'Nayara Energy' },
    { code: 'Shell', name: 'Shell' },
    { code: 'Jio-bp', name: 'Jio-bp' },
    { code: 'Independent', name: 'Independent' },
    { code: 'Other', name: 'Other (Custom Brand)' }
  ];

  const outletTypes = [
    { code: 'fuel_station', name: 'Fuel Station' },
    { code: 'fuel_and_ev', name: 'Fuel & EV Station' },
    { code: 'ev_station', name: 'EV Station' },
    { code: 'other', name: 'Other' }
  ];

  const handleSameAddress = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      onChange('address_line_1', orgAddress.address_line_1 || '');
      onChange('address_line_2', orgAddress.address_line_2 || '');
      onChange('city', orgAddress.city || '');
      onChange('district', orgAddress.district || '');
      onChange('state', orgAddress.state || '');
      onChange('postal_code', orgAddress.postal_code || '');
    } else {
      onChange('address_line_1', '');
      onChange('address_line_2', '');
      onChange('city', '');
      onChange('district', '');
      onChange('state', '');
      onChange('postal_code', '');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 'var(--space-xs)' }}>
        First Outlet Details
      </h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
        Configure details for the first retail location or fuel outlet.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="Outlet Name *" error={errors.name} required htmlFor="outlet_name">
          <input
            id="outlet_name"
            className={`form-input ${errors.name ? 'error' : ''}`}
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
            required
          />
        </FormField>

        <FormField label="Outlet Code *" error={errors.code} required htmlFor="outlet_code">
          <input
            id="outlet_code"
            className={`form-input ${errors.code ? 'error' : ''}`}
            value={data.code || ''}
            onChange={(e) => onChange('code', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
            placeholder="e.g. OUT-001"
            required
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="Outlet Type *" error={errors.outlet_type} htmlFor="outlet_type">
          <select
            id="outlet_type"
            className="form-input"
            value={data.outlet_type || 'fuel_station'}
            onChange={(e) => onChange('outlet_type', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
          >
            {outletTypes.map((t) => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Operating Brand *" error={errors.operating_brand_code} htmlFor="operating_brand_code">
          <select
            id="operating_brand_code"
            className="form-input"
            value={data.operating_brand_code || 'IOCL'}
            onChange={(e) => {
              const brand = e.target.value;
              onChange('operating_brand_code', brand);
              if (brand !== 'Other') {
                onChange('operating_brand_name', brandChoices.find(b => b.code === brand)?.name || brand);
              } else {
                onChange('operating_brand_name', '');
              }
            }}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
          >
            {brandChoices.map((b) => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>
        </FormField>
      </div>

      {data.operating_brand_code === 'Other' && (
        <FormField label="Custom Brand Name *" error={errors.operating_brand_name} required htmlFor="operating_brand_name">
          <input
            id="operating_brand_name"
            className={`form-input ${errors.operating_brand_name ? 'error' : ''}`}
            value={data.operating_brand_name || ''}
            onChange={(e) => onChange('operating_brand_name', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
            required
          />
        </FormField>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="Dealer Code (Optional)" error={errors.dealer_code} htmlFor="dealer_code">
          <input
            id="dealer_code"
            className={`form-input ${errors.dealer_code ? 'error' : ''}`}
            value={data.dealer_code || ''}
            onChange={(e) => onChange('dealer_code', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>

        <FormField label="Outlet Email (Optional)" error={errors.email} htmlFor="outlet_email">
          <input
            id="outlet_email"
            type="email"
            className={`form-input ${errors.email ? 'error' : ''}`}
            value={data.email || ''}
            onChange={(e) => onChange('email', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="Outlet Phone (Optional)" error={errors.phone_number} htmlFor="outlet_phone">
          <input
            id="outlet_phone"
            className={`form-input ${errors.phone_number ? 'error' : ''}`}
            value={data.phone_number || ''}
            onChange={(e) => onChange('phone_number', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>

        <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: '24px' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              onChange={handleSameAddress}
              style={{ width: '16px', height: '16px', accentColor: 'var(--color-accent)' }}
            />
            <span>Same as organisation address</span>
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="Address Line 1" error={errors.address_line_1} htmlFor="outlet_address_line_1">
          <input
            id="outlet_address_line_1"
            className={`form-input ${errors.address_line_1 ? 'error' : ''}`}
            value={data.address_line_1 || ''}
            onChange={(e) => onChange('address_line_1', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>

        <FormField label="Address Line 2 (Optional)" error={errors.address_line_2} htmlFor="outlet_address_line_2">
          <input
            id="outlet_address_line_2"
            className={`form-input ${errors.address_line_2 ? 'error' : ''}`}
            value={data.address_line_2 || ''}
            onChange={(e) => onChange('address_line_2', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="City" error={errors.city} htmlFor="outlet_city">
          <input
            id="outlet_city"
            className={`form-input ${errors.city ? 'error' : ''}`}
            value={data.city || ''}
            onChange={(e) => onChange('city', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>

        <FormField label="District (Optional)" error={errors.district} htmlFor="outlet_district">
          <input
            id="outlet_district"
            className={`form-input ${errors.district ? 'error' : ''}`}
            value={data.district || ''}
            onChange={(e) => onChange('district', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>

        <FormField label="State" error={errors.state} htmlFor="outlet_state">
          <input
            id="outlet_state"
            className={`form-input ${errors.state ? 'error' : ''}`}
            value={data.state || ''}
            onChange={(e) => onChange('state', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="Postal Code" error={errors.postal_code} htmlFor="outlet_postal_code">
          <input
            id="outlet_postal_code"
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
