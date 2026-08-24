import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { 
  inspectPublicActivation, 
  submitPublicActivation, 
  type PublicActivationResponse, 
  ApiError 
} from '@/api/client';
import { useAppDispatch, useAppSelector } from '@/app/store';
import { refreshUser } from '@/features/auth/authSlice';
import { Check, ShieldAlert, Key, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';

export const PublicActivation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const currentUser = useAppSelector((state) => state.auth.currentUser);

  // States
  const [activation, setActivation] = useState<PublicActivationResponse | null>(null);
  const [inspectLoading, setInspectLoading] = useState(true);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // Form states
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activationSuccess, setActivationSuccess] = useState(false);

  // Password Validation flags
  const hasMinLen = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const isMatch = password && password === confirmPassword;

  const isFormValid = hasMinLen && hasUpper && hasLower && hasNumber && hasSpecial && isMatch;

  useEffect(() => {
    if (!token) {
      const timer = setTimeout(() => {
        setInspectError('Activation token is missing from the URL.');
        setInspectLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const verifyToken = async () => {
      try {
        const data = await inspectPublicActivation(token);
        setActivation(data);
      } catch (err: unknown) {
        setInspectError(err instanceof Error ? err.message : 'The activation link is invalid, expired, or has already been used.');
      } finally {
        setInspectLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitError(null);

    // If user already exists in the system (meaning they need to be logged in first)
    // Wait, the inspect response status or inspect details will tell us. Or we can just try submitting.
    // If it's an existing user, we submit without password (or the backend handles the mapping).
    setSubmitLoading(true);
    try {
      await submitPublicActivation({
        token,
        password: password || undefined
      });
      
      // Refresh redux user state
      await dispatch(refreshUser());
      setActivationSuccess(true);
      
      // Redirect in 3 seconds to app dashboard
      setTimeout(() => {
        navigate('/app/dashboard');
      }, 3000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const errorData = err.data as { detail?: string; non_field_errors?: string[] } | null;
        const detail = errorData?.detail || errorData?.non_field_errors?.[0] || err.message;
        setSubmitError(detail);
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Failed to activate account.');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  if (inspectLoading) {
    return (
      <div className="login-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 className="animate-spin" size={48} style={{ color: 'var(--primary)', margin: '0 auto 1rem' }} />
          <p className="text-muted">Verifying activation token...</p>
        </div>
      </div>
    );
  }

  if (inspectError) {
    return (
      <div className="login-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '1rem' }}>
        <div className="login-card" style={{ maxWidth: '450px', width: '100%', padding: '2rem', textAlign: 'center' }}>
          <ShieldAlert size={48} style={{ color: 'var(--danger)', margin: '0 auto 1rem' }} />
          <h2 className="h3" style={{ marginBottom: '1rem' }}>Activation Failed</h2>
          <p className="text-muted" style={{ marginBottom: '2rem', fontSize: '0.95rem' }}>{inspectError}</p>
          <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block', width: '100%' }}>
            Go to Login
          </Link>
        </div>
      </div>
    );
  }



  return (
    <div className="login-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1.5rem' }}>
      <div className="login-card" style={{ maxWidth: '480px', width: '100%', padding: '2.5rem' }}>
        <div className="login-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', color: 'var(--primary)' }}>
            <Sparkles size={20} />
            <span style={{ fontWeight: 700, letterSpacing: '0.05em', fontSize: '1.1rem', textTransform: 'uppercase' }}>Pump ERP</span>
          </div>
          <h2 className="h3">Join {activation?.organisation_name}</h2>
          <p className="text-muted" style={{ marginTop: '0.5rem' }}>
            Setting up access for <strong style={{ color: 'white' }}>{activation?.email}</strong>
          </p>
        </div>

        {activationSuccess ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(var(--success-rgb), 0.15)', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 1.5rem' }}>
              <Check size={32} style={{ color: 'var(--success)' }} />
            </div>
            <h3 className="h4" style={{ marginBottom: '0.75rem' }}>Account Activated!</h3>
            <p className="text-muted">You have been logged in. Redirecting you to the dashboard...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {submitError && (
              <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <ShieldAlert size={16} />
                <span>{submitError}</span>
              </div>
            )}

            {currentUser ? (
              // Case 1: User is already logged in
              currentUser.email.toLowerCase() === activation?.email.toLowerCase() ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="alert alert-success" style={{ fontSize: '0.9rem', background: 'rgba(var(--success-rgb), 0.08)' }}>
                    You are logged in as <strong>{currentUser.email}</strong>. Accepting this activation will link you to {activation?.organisation_name} immediately.
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitLoading}>
                    {submitLoading ? 'Accepting Invitation...' : 'Accept Invitation & Continue'}
                  </button>
                </div>
              ) : (
                // Logged in user does not match the activation email
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="alert alert-warning" style={{ fontSize: '0.9rem' }}>
                    You are currently logged in as <strong>{currentUser.email}</strong>, which does not match the invitation email <strong>{activation?.email}</strong>.
                  </div>
                  <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                    Please log out and sign in with the correct account, or open the link in a private window.
                  </p>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => {
                      // Navigate to login or display logout helper
                      navigate('/login');
                    }}
                    style={{ width: '100%' }}
                  >
                    Go to Login Page
                  </button>
                </div>
              )
            ) : (
              // Case 2: Guest User. Need to determine if they exist globally or are brand new.
              // We check if the server throws "An account with this email already exists" or if they just choose password.
              // To guide the user: if they already have a Pump ERP account, we show log-in guidance.
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', padding: '1rem', borderRadius: '6px', fontSize: '0.9rem' }}>
                  <strong>Already have a Pump ERP account?</strong><br />
                  <span className="text-muted">Please <Link to="/login" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>log in first</Link>, then click the activation link again to join.</span>
                </div>

                <div className="form-group">
                  <label className="form-label">Create Password</label>
                  <div style={{ position: 'relative' }}>
                    <Key style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} size={16} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-control"
                      style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'white', opacity: 0.5, cursor: 'pointer' }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-control"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                {/* Password Strength Validation Rules Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.15)', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: hasMinLen ? 'var(--success)' : 'rgba(255,255,255,0.4)' }}>
                    <Check size={12} /> Min 8 characters
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: hasUpper ? 'var(--success)' : 'rgba(255,255,255,0.4)' }}>
                    <Check size={12} /> Uppercase letter
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: hasLower ? 'var(--success)' : 'rgba(255,255,255,0.4)' }}>
                    <Check size={12} /> Lowercase letter
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: hasNumber ? 'var(--success)' : 'rgba(255,255,255,0.4)' }}>
                    <Check size={12} /> Number
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: hasSpecial ? 'var(--success)' : 'rgba(255,255,255,0.4)' }}>
                    <Check size={12} /> Special character
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: isMatch ? 'var(--success)' : 'rgba(255,255,255,0.4)' }}>
                    <Check size={12} /> Passwords match
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%', marginTop: '0.5rem' }} 
                  disabled={!isFormValid || submitLoading}
                >
                  {submitLoading ? 'Activating Account...' : 'Activate Account'}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
