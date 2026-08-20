import React from 'react';

interface FormFieldProps {
  label: string;
  error?: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({ label, error, htmlFor, required, children }) => {
  return (
    <div className="form-field" style={{ marginBottom: 'var(--space-md)' }}>
      <label 
        htmlFor={htmlFor} 
        style={{
          display: 'block',
          marginBottom: '6px',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: 'inherit',
        }}
      >
        {label} {required && <span style={{ color: 'var(--color-danger-text)' }}>*</span>}
      </label>
      {children}
      {error && (
        <span 
          style={{
            display: 'block',
            marginTop: '4px',
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'var(--color-danger-text)',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
};
