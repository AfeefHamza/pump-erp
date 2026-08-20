import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/store';
import { login, clearAuthError } from '@/features/auth/authSlice';
import { FormField } from './FormField';
import { PasswordInput } from './PasswordInput';
import { FormError } from './FormError';

export const LoginForm: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticationStatus, authenticationError } = useAppSelector((state) => state.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const isLoading = authenticationStatus === 'loading';

  const validate = () => {
    const errors: { email?: string; password?: string } = {};
    if (!email) {
      errors.email = 'Email address is required.';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(clearAuthError());

    if (!validate()) return;

    const result = await dispatch(login({ email, password }));
    if (login.fulfilled.match(result)) {
      const fromPath = (location.state as { from?: { pathname?: string } | null } | null)?.from?.pathname;
      const safeRedirect = fromPath && fromPath.startsWith('/') && !fromPath.startsWith('//') ? fromPath : '/app/dashboard';
      navigate(safeRedirect);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormError error={authenticationError} />

      <FormField label="Email Address" error={fieldErrors.email} required htmlFor="email">
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: undefined }));
          }}
          disabled={isLoading}
          placeholder="you@company.com"
          className={`form-input ${fieldErrors.email ? 'error' : ''}`}
          style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          autoComplete="email"
          required
        />
      </FormField>

      <FormField
        label="Password"
        error={fieldErrors.password}
        required
        htmlFor="password"
      >
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
          autoComplete="current-password"
          style={{ height: '40px', boxSizing: 'border-box' }}
          required
        />
      </FormField>

      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: 'var(--space-md)',
      }}>
        <Link
          to="/forgot-password"
          style={{
            fontSize: '0.8125rem',
            color: '#38bdf8',
            textDecoration: 'none',
            fontWeight: 500,
          }}
          onClick={() => dispatch(clearAuthError())}
        >
          Forgot password?
        </Link>
      </div>

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
          marginBottom: 'var(--space-md)',
          backgroundColor: '#10b981',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.7 : 1,
          transition: 'background-color 0.2s',
        }}
      >
        {isLoading ? 'Signing in...' : 'Sign In'}
      </button>

      <div style={{
        textAlign: 'center',
        fontSize: '0.875rem',
        color: '#94a3b8',
        marginTop: 'var(--space-md)'
      }}>
        Don't have an account?{' '}
        <Link
          to="/signup"
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            fontWeight: 600,
          }}
          onClick={() => dispatch(clearAuthError())}
        >
          Create an organisation owner account
        </Link>
      </div>
    </form>
  );
};
