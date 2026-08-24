import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector, setOrganization, setOutlet } from '@/app/store';
import { refreshUser } from '@/features/auth/authSlice';
import { completeOnboarding, type OrganisationResponse } from '@/api/client';
import { OnboardingLayout } from '../components/OnboardingLayout';
import { OnboardingProgress } from '../components/OnboardingProgress';
import { OrganisationForm } from '../components/OrganisationForm';
import { OutletForm } from '../components/OutletForm';
import { FinancialYearForm } from '../components/FinancialYearForm';
import { ReviewSection } from '../components/ReviewSection';

interface OnboardingInnerProps {
  currentOrg: OrganisationResponse;
}

const OnboardingInner: React.FC<OnboardingInnerProps> = ({ currentOrg }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [orgData, setOrgData] = useState<Record<string, string>>(() => ({
    name: currentOrg.name || ''
  }));
  const [outletData, setOutletData] = useState<Record<string, string>>({
    outlet_type: 'fuel_station',
    operating_brand_code: 'IOCL',
    operating_brand_name: 'Indian Oil (IOCL)'
  });
  const [fyData, setFyData] = useState<Record<string, string>>({});
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleOrgChange = (field: string, val: string) => {
    setOrgData(prev => ({ ...prev, [field]: val }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleOutletChange = (field: string, val: string) => {
    setOutletData(prev => ({ ...prev, [field]: val }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleFyChange = (field: string, val: string) => {
    setFyData(prev => ({ ...prev, [field]: val }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateStep = (stepNumber: number): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (stepNumber === 1) {
      if (!orgData.name?.trim()) newErrors.name = 'Organisation name is required.';
      if (orgData.email && !/\S+@\S+\.\S+/.test(orgData.email)) newErrors.email = 'Please enter a valid email address.';
    } else if (stepNumber === 2) {
      if (!outletData.name?.trim()) newErrors.name = 'Outlet name is required.';
      if (!outletData.code?.trim()) newErrors.code = 'Outlet code is required.';
      if (outletData.operating_brand_code === 'Other' && !outletData.operating_brand_name?.trim()) {
        newErrors.operating_brand_name = 'Custom brand name is required.';
      }
    } else if (stepNumber === 3) {
      if (!fyData.name?.trim()) newErrors.name = 'Financial year name is required.';
      if (!fyData.start_date) newErrors.start_date = 'Start date is required.';
      if (!fyData.end_date) newErrors.end_date = 'End date is required.';
      if (fyData.start_date && fyData.end_date && new Date(fyData.end_date) <= new Date(fyData.start_date)) {
        newErrors.end_date = 'End date must be after start date.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await completeOnboarding(currentOrg.id, {
        org_data: orgData,
        outlet_data: outletData,
        fy_data: fyData
      });

      // 1. Refresh User context to get updated organisation status
      await dispatch(refreshUser()).unwrap();
      
      // 2. Select the organization and outlet in UI
      dispatch(setOrganization(response.organisation.id));
      dispatch(setOutlet(response.outlet.id));
      
      // 3. Navigate to Dashboard
      navigate('/app/dashboard');
    } catch (err) {
      const apiError = err as { data?: Record<string, string[] | string>; message?: string };
      if (apiError.data && typeof apiError.data === 'object') {
        const apiErrors: Record<string, string> = {};
        const errorList: string[] = [];
        
        const parseErrors = (obj: unknown, prefix = '') => {
          if (obj && typeof obj === 'object') {
            if (Array.isArray(obj)) {
              if (obj.length > 0) {
                const first = obj[0];
                if (typeof first === 'object') {
                  parseErrors(first, prefix);
                } else {
                  const cleanedPrefix = prefix.replace(/\.$/, '');
                  apiErrors[cleanedPrefix] = String(first);
                  errorList.push(`${cleanedPrefix}: ${first}`);
                }
              }
            } else {
              for (const [k, v] of Object.entries(obj)) {
                parseErrors(v, `${prefix}${k}.`);
              }
            }
          } else if (obj !== undefined && obj !== null) {
            const cleanedPrefix = prefix.replace(/\.$/, '');
            apiErrors[cleanedPrefix] = String(obj);
            errorList.push(`${cleanedPrefix}: ${obj}`);
          }
        };

        parseErrors(apiError.data);
        setErrors(apiErrors);
        setSubmitError(`Validation errors occurred: ${errorList.join(', ')}`);
      } else {
        setSubmitError(apiError.message || 'Onboarding failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '450px' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-accent)' }}>
          Welcome to Pump ERP
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
          Let's get your business profile and first outlet set up.
        </p>
      </div>

      <OnboardingProgress currentStep={step} />

      {submitError && (
        <div style={{
          padding: 'var(--space-md)',
          backgroundColor: 'var(--color-danger-bg)',
          color: 'var(--color-danger-text)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-md)',
          fontSize: '0.875rem',
          fontWeight: 500,
          border: '1px solid currentColor'
        }}>
          {submitError}
        </div>
      )}

      <div style={{ flex: 1, marginBottom: 'var(--space-xl)' }}>
        {step === 1 && (
          <OrganisationForm
            data={orgData}
            onChange={handleOrgChange}
            errors={errors}
          />
        )}
        {step === 2 && (
          <OutletForm
            data={outletData}
            onChange={handleOutletChange}
            errors={errors}
            orgAddress={orgData}
          />
        )}
        {step === 3 && (
          <FinancialYearForm
            data={fyData}
            onChange={handleFyChange}
            errors={errors}
          />
        )}
        {step === 4 && (
          <ReviewSection
            orgData={orgData}
            outletData={outletData}
            fyData={fyData}
          />
        )}
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        justifyContent: step === 1 ? 'flex-end' : 'space-between',
        borderTop: '1px solid var(--border-color)',
        paddingTop: 'var(--space-md)'
      }}>
        {step > 1 && (
          <button
            onClick={handleBack}
            disabled={isSubmitting}
            className="btn btn-secondary"
            style={{
              height: '40px',
              padding: '0 var(--space-lg)',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Back
          </button>
        )}

        {step < 4 ? (
          <button
            onClick={handleNext}
            className="btn btn-primary"
            style={{
              height: '40px',
              padding: '0 var(--space-lg)',
              backgroundColor: 'var(--color-accent)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: '#ffffff',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Next Step
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="btn btn-primary"
            style={{
              height: '40px',
              padding: '0 var(--space-lg)',
              backgroundColor: 'var(--color-accent)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: '#ffffff',
              fontWeight: 600,
              cursor: 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {isSubmitting ? 'Saving...' : 'Complete Setup'}
          </button>
        )}
      </div>
    </div>
  );
};

export const OnboardingPage: React.FC = () => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const { currentUser } = useAppSelector((state) => state.auth);
  
  const currentOrg = currentUser?.organisations.find(o => o.id === selectedOrgId) || currentUser?.organisations[0];

  if (!currentOrg) {
    return (
      <OnboardingLayout>
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <h2 style={{ color: 'var(--color-danger-text)' }}>No Organisation Found</h2>
          <p style={{ marginTop: 'var(--space-md)', color: 'var(--text-muted)' }}>
            Please contact support or log in with an owner account.
          </p>
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout>
      <OnboardingInner key={currentOrg.id} currentOrg={currentOrg} />
    </OnboardingLayout>
  );
};
