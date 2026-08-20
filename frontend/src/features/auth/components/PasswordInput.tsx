import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({ error, ...props }) => {
  const [showPassword, setShowPassword] = useState(false);

  const toggleShow = () => {
    setShowPassword(prev => !prev);
  };

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
      <input
        type={showPassword ? 'text' : 'password'}
        {...props}
        style={{
          width: '100%',
          paddingRight: '40px',
          ...props.style,
        }}
        className={`form-input ${error ? 'error' : ''}`}
      />
      <button
        type="button"
        onClick={toggleShow}
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: '12px',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
};
