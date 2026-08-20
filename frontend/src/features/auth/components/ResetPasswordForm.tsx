import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { confirmPasswordReset, ApiError } from '@/api/client';
import { FormField } from './FormField';
import { PasswordInput } from './PasswordInput';
import { FormError } from './FormError';
import { CheckCircle2 } from 'lucide-react';

export const ResetPasswordForm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid') || '';
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; passwordConfirm?: string }>({});

  const validate = () => {
    const errors: { password?: string; passwordConfirm?: string } = {};

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters long.';
    }

    if (!passwordConfirm) {
      errors.passwordConfirm = 'Please confirm your password.';
    } else if (password !== passwordConfirm) {
      errors.passwordConfirm = 'Passwords do not match.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!uid || !token) {
      setError('Missing token or user identifier. Please request a new password reset link.');
      return;
    }

    if (!validate()) return;

    setIsLoading(true);
    try {
      await confirmPasswordReset({
        uid,
        token,
        password,
        password_confirm: passwordConfirm,
      });
      setSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const data = err.data as Record<string, unknown> | undefined;
        if (data && typeof data === 'object') {
          const mappedErrors: { password?: string; passwordConfirm?: string } = {};
          if (data.password) mappedErrors.password = Array.isArray(data.password) ? data.password[0] : String(data.password);
          if (data.password_confirm) mappedErrors.passwordConfirm = Array.isArray(data.password_confirm) ? data.password_confirm[0] : String(data.password_confirm);
          setFieldErrors(mappedErrors);
        }
        setError(err.message);
      } else {
        const message = err instanceof Error ? err.message : 'An error occurred while resetting password.';
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          color: '#10b981',
          marginBottom: '16px',
        }}>
          <CheckCircle2 size={24} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#ffffff', marginBottom: '8px' }}>
          Password Reset Complete
        </h3>
        <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '24px' }}>
          Your password has been successfully updated. You can now log in with your new password.
        </p>
        <Link
          to="/login"
          style={{
            display: 'inline-block',
            width: '100%',
            height: '44px',
            lineHeight: '44px',
            textAlign: 'center',
            backgroundColor: '#10b981',
            color: '#ffffff',
            borderRadius: '6px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Proceed to Sign In
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormError error={error} />

      <FormField label="New Password" error={fieldErrors.password} required htmlFor="password">
        <PasswordInput
          id="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: undefined }));
          }}
          disabled={isLoading}
          placeholder="••••••••"
          error={!!fieldErrors.password}
          style={{ height: '40px', boxSizing: 'border-box' }}
          autoComplete="new-password"
          required
        />
      </FormField>

      <FormField label="Confirm New Password" error={fieldErrors.passwordConfirm} required htmlFor="passwordConfirm">
        <PasswordInput
          id="passwordConfirm"
          value={passwordConfirm}
          onChange={(e) => {
            setPasswordConfirm(e.target.value);
            if (fieldErrors.passwordConfirm) setFieldErrors(prev => ({ ...prev, passwordConfirm: undefined }));
          }}
          disabled={isLoading}
          placeholder="••••••••"
          error={!!fieldErrors.passwordConfirm}
          style={{ height: '40px', boxSizing: 'border-box' }}
          autoComplete="new-password"
          required
        />
      </FormField>

      <button
        type="submit"
        disabled={isLoading}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '44px',
          fontWeight: 600,
          fontSize: '0.95rem',
          marginBottom: '16px',
          backgroundColor: '#10b981',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.7 : 1,
          transition: 'background-color 0.2s',
        }}
      >
        {isLoading ? 'Resetting password...' : 'Reset Password'}
      </button>

      <div style={{ textAlign: 'center', fontSize: '0.875rem' }}>
        <Link
          to="/login"
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Cancel and Sign In
        </Link>
      </div>
    </form>
  );
};
