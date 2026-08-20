import React from 'react';

interface OnboardingProgressProps {
  currentStep: number;
}

export const OnboardingProgress: React.FC<OnboardingProgressProps> = ({ currentStep }) => {
  const steps = [
    { number: 1, label: 'Organisation' },
    { number: 2, label: 'First Outlet' },
    { number: 3, label: 'Financial Year' },
    { number: 4, label: 'Review' }
  ];

  return (
    <div style={{ marginBottom: 'var(--space-xl)' }}>
      {/* Progress indicators */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
        {/* Connecting bar */}
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '0',
          right: '0',
          height: '2px',
          backgroundColor: 'var(--border-color)',
          zIndex: 0
        }} />
        {/* Filled bar progress */}
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '0',
          width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
          height: '2px',
          backgroundColor: 'var(--color-accent)',
          transition: 'width 0.3s ease',
          zIndex: 0
        }} />

        {steps.map((step) => {
          const isActive = step.number === currentStep;
          const isCompleted = step.number < currentStep;

          return (
            <div key={step.number} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              zIndex: 1,
              flex: 1
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '0.875rem',
                border: '2px solid',
                borderColor: isActive 
                  ? 'var(--color-accent)' 
                  : isCompleted 
                    ? 'var(--color-accent)' 
                    : 'var(--border-color)',
                backgroundColor: isActive 
                  ? 'var(--color-accent)' 
                  : isCompleted 
                    ? 'var(--color-accent)' 
                    : 'var(--bg-card)',
                color: isActive 
                  ? '#ffffff' 
                  : isCompleted 
                    ? '#ffffff' 
                    : 'var(--text-muted)',
                transition: 'all 0.3s ease',
                boxShadow: isActive ? '0 0 0 4px var(--color-accent-light)' : 'none'
              }}>
                {isCompleted ? '✓' : step.number}
              </div>
              <span style={{
                marginTop: 'var(--space-sm)',
                fontSize: '0.75rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--text-main)' : 'var(--text-muted)'
              }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
