import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '@/api/client';
import { FormField } from './FormField';
import { FormError } from './FormError';
import { CheckCircle2 } from 'lucide-react';

export const ForgotPasswordForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldError(null);

    if (!email.trim()) {
      setFieldError('Email address is required.');
      return;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setFieldError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      await requestPasswordReset({ email: email.trim() });
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred while requesting password reset.';
      setError(message);
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
          Check your email
        </h3>
        <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '24px' }}>
          We have sent a password reset link to <strong>{email}</strong> if the account exists in our system.
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
          Return to Sign In
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormError error={error} />

      <FormField label="Work Email Address" error={fieldError || undefined} required htmlFor="email">
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldError) setFieldError(null);
          }}
          disabled={isLoading}
          placeholder="you@company.com"
          className={`form-input ${fieldError ? 'error' : ''}`}
          style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          autoComplete="email"
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
        {isLoading ? 'Sending link...' : 'Send Reset Link'}
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
          Back to Sign In
        </Link>
      </div>
    </form>
  );
};
