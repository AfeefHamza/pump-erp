import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/app/store';
import { signup, clearAuthError } from '@/features/auth/authSlice';
import { FormField } from './FormField';
import { PasswordInput } from './PasswordInput';
import { FormError } from './FormError';

export const SignupForm: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticationStatus, authenticationError } = useAppSelector((state) => state.auth);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    password: '',
    passwordConfirm: '',
    organisationName: '',
    organisationCode: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isLoading = authenticationStatus === 'loading';

  const validate = () => {
    const errors: Record<string, string> = {};

    if (!formData.fullName.trim()) {
      errors.fullName = 'Full name is required.';
    }

    if (!formData.email.trim()) {
      errors.email = 'Work email is required.';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!formData.password) {
      errors.password = 'Password is required.';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters long.';
    }

    if (!formData.passwordConfirm) {
      errors.passwordConfirm = 'Please confirm your password.';
    } else if (formData.password !== formData.passwordConfirm) {
      errors.passwordConfirm = 'Passwords do not match.';
    }

    if (!formData.organisationName.trim()) {
      errors.organisationName = 'Organisation name is required.';
    }

    if (!formData.organisationCode.trim()) {
      errors.organisationCode = 'Organisation code is required.';
    } else if (!/^[A-Za-z0-9_-]+$/.test(formData.organisationCode)) {
      errors.organisationCode = 'Code can only contain letters, numbers, hyphens, and underscores.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(clearAuthError());

    if (!validate()) return;

    const payload = {
      full_name: formData.fullName.trim(),
      email: formData.email.trim(),
      phone_number: formData.phoneNumber.trim() || undefined,
      password: formData.password,
      password_confirm: formData.passwordConfirm,
      organisation_name: formData.organisationName.trim(),
      organisation_code: formData.organisationCode.trim(),
    };

    const result = await dispatch(signup(payload));
    if (signup.fulfilled.match(result)) {
      const fromPath = (location.state as { from?: { pathname?: string } | null } | null)?.from?.pathname;
      const safeRedirect = fromPath && fromPath.startsWith('/') && !fromPath.startsWith('//') ? fromPath : '/app/dashboard';
      navigate(safeRedirect);
    } else if (signup.rejected.match(result)) {
      const errors = result.payload as {
        full_name?: string | string[];
        email?: string | string[];
        phone_number?: string | string[];
        password?: string | string[];
        password_confirm?: string | string[];
        organisation_name?: string | string[];
        organisation_code?: string | string[];
        detail?: string;
        non_field_errors?: string[];
      } | undefined;

      if (errors && typeof errors === 'object' && !errors.detail && !errors.non_field_errors) {
        const mappedErrors: Record<string, string> = {};
        if (errors.full_name) mappedErrors.fullName = Array.isArray(errors.full_name) ? errors.full_name[0] : String(errors.full_name);
        if (errors.email) mappedErrors.email = Array.isArray(errors.email) ? errors.email[0] : String(errors.email);
        if (errors.phone_number) mappedErrors.phoneNumber = Array.isArray(errors.phone_number) ? errors.phone_number[0] : String(errors.phone_number);
        if (errors.password) mappedErrors.password = Array.isArray(errors.password) ? errors.password[0] : String(errors.password);
        if (errors.password_confirm) mappedErrors.passwordConfirm = Array.isArray(errors.password_confirm) ? errors.password_confirm[0] : String(errors.password_confirm);
        if (errors.organisation_name) mappedErrors.organisationName = Array.isArray(errors.organisation_name) ? errors.organisation_name[0] : String(errors.organisation_name);
        if (errors.organisation_code) mappedErrors.organisationCode = Array.isArray(errors.organisation_code) ? errors.organisation_code[0] : String(errors.organisation_code);
        setFieldErrors(mappedErrors);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormError error={authenticationError} />

      <h3 style={{ fontSize: '0.9rem', color: '#94a3b8', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '6px', marginBottom: '16px', fontWeight: 600 }}>
        OWNER ACCOUNT DETAILS
      </h3>

      <FormField label="Full Name" error={fieldErrors.fullName} required htmlFor="fullName">
        <input
          id="fullName"
          name="fullName"
          type="text"
          value={formData.fullName}
          onChange={handleChange}
          disabled={isLoading}
          placeholder="e.g. John Doe"
          className={`form-input ${fieldErrors.fullName ? 'error' : ''}`}
          style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          required
        />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <FormField label="Work Email" error={fieldErrors.email} required htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            disabled={isLoading}
            placeholder="you@company.com"
            className={`form-input ${fieldErrors.email ? 'error' : ''}`}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
            required
          />
        </FormField>

        <FormField label="Phone Number" error={fieldErrors.phoneNumber} htmlFor="phoneNumber">
          <input
            id="phoneNumber"
            name="phoneNumber"
            type="tel"
            value={formData.phoneNumber}
            onChange={handleChange}
            disabled={isLoading}
            placeholder="+919876543210"
            className={`form-input ${fieldErrors.phoneNumber ? 'error' : ''}`}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <FormField label="Password" error={fieldErrors.password} required htmlFor="password">
          <PasswordInput
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            disabled={isLoading}
            placeholder="••••••••"
            error={!!fieldErrors.password}
            style={{ height: '40px', boxSizing: 'border-box' }}
            required
          />
        </FormField>

        <FormField label="Confirm Password" error={fieldErrors.passwordConfirm} required htmlFor="passwordConfirm">
          <PasswordInput
            id="passwordConfirm"
            name="passwordConfirm"
            value={formData.passwordConfirm}
            onChange={handleChange}
            disabled={isLoading}
            placeholder="••••••••"
            error={!!fieldErrors.passwordConfirm}
            style={{ height: '40px', boxSizing: 'border-box' }}
            required
          />
        </FormField>
      </div>

      <h3 style={{ fontSize: '0.9rem', color: '#94a3b8', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '6px', marginTop: '24px', marginBottom: '16px', fontWeight: 600 }}>
        ORGANISATION DETAILS
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
        <FormField label="Organisation Name" error={fieldErrors.organisationName} required htmlFor="organisationName">
          <input
            id="organisationName"
            name="organisationName"
            type="text"
            value={formData.organisationName}
            onChange={handleChange}
            disabled={isLoading}
            placeholder="e.g. Apex Fuel Services"
            className={`form-input ${fieldErrors.organisationName ? 'error' : ''}`}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
            required
          />
        </FormField>

        <FormField label="Code (e.g. APEX)" error={fieldErrors.organisationCode} required htmlFor="organisationCode">
          <input
            id="organisationCode"
            name="organisationCode"
            type="text"
            value={formData.organisationCode}
            onChange={handleChange}
            disabled={isLoading}
            placeholder="APEX"
            className={`form-input ${fieldErrors.organisationCode ? 'error' : ''}`}
            style={{ width: '100%', height: '40px', padding: '8px 12px', boxSizing: 'border-box' }}
            required
          />
        </FormField>
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
          marginTop: '16px',
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
        {isLoading ? 'Creating account...' : 'Create Account'}
      </button>

      <div style={{
        textAlign: 'center',
        fontSize: '0.875rem',
        color: '#94a3b8',
        marginTop: 'var(--space-md)'
      }}>
        Already have an account?{' '}
        <Link
          to="/login"
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            fontWeight: 600,
          }}
          onClick={() => dispatch(clearAuthError())}
        >
          Sign In
        </Link>
      </div>
    </form>
  );
};
