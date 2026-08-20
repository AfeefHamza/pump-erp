import React from 'react';
import { AlertCircle } from 'lucide-react';

interface FormErrorProps {
  error: string | null;
}

export const FormError: React.FC<FormErrorProps> = ({ error }) => {
  if (!error) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px',
      marginBottom: '16px',
      borderRadius: '6px',
      backgroundColor: 'var(--color-danger-bg)',
      border: '1px solid var(--color-danger-border)',
      color: 'var(--color-danger-text)',
      fontSize: '0.875rem',
      fontWeight: 500,
    }}>
      <AlertCircle size={16} style={{ flexShrink: 0 }} />
      <span>{error}</span>
    </div>
  );
};
