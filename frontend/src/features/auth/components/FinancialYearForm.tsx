import React from 'react';
import { FormField } from './FormField';

interface FinancialYearFormProps {
  data: Record<string, string>;
  onChange: (field: string, value: string) => void;
  errors: Record<string, string>;
}

export const FinancialYearForm: React.FC<FinancialYearFormProps> = ({ data, onChange, errors }) => {
  React.useEffect(() => {
    // Proactively suggest standard Indian Financial Year if fields are empty
    if (!data.start_date || !data.end_date || !data.name) {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth(); // 0 is Jan, 3 is April
      
      let startYear = currentYear;
      if (currentMonth < 3) {
        startYear = currentYear - 1;
      }
      const endYear = startYear + 1;
      
      const suggestedStart = `${startYear}-04-01`;
      const suggestedEnd = `${endYear}-03-31`;
      const suggestedName = `FY ${startYear}-${String(endYear).slice(-2)}`;
      
      if (!data.name) onChange('name', suggestedName);
      if (!data.start_date) onChange('start_date', suggestedStart);
      if (!data.end_date) onChange('end_date', suggestedEnd);
    }
  }, [data.start_date, data.end_date, data.name, onChange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 'var(--space-xs)' }}>
        Default Financial Year Setup
      </h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
        Specify the initial open accounting period. For Indian businesses, the financial year runs from April 1 to March 31.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-md)' }}>
        <FormField label="Financial Year Name *" error={errors.name} required htmlFor="fy_name">
          <input
            id="fy_name"
            className={`form-input ${errors.name ? 'error' : ''}`}
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
            required
            placeholder="e.g. FY 2026-27"
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <FormField label="Start Date *" error={errors.start_date} required htmlFor="fy_start">
          <input
            id="fy_start"
            type="date"
            className={`form-input ${errors.start_date ? 'error' : ''}`}
            value={data.start_date || ''}
            onChange={(e) => onChange('start_date', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
            required
          />
        </FormField>

        <FormField label="End Date *" error={errors.end_date} required htmlFor="fy_end">
          <input
            id="fy_end"
            type="date"
            className={`form-input ${errors.end_date ? 'error' : ''}`}
            value={data.end_date || ''}
            onChange={(e) => onChange('end_date', e.target.value)}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
            required
          />
        </FormField>
      </div>
    </div>
  );
};
