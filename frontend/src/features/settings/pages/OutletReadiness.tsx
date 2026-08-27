import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { fetchOutletReadiness, type OutletReadinessCheck } from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { ClipboardCheck, CheckCircle2, AlertTriangle, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

export const OutletReadiness: React.FC = () => {
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [readiness, setReadiness] = useState<OutletReadinessCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canView = usePermission('outlet.view');

  const loadReadiness = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOutletReadiness(selectedOrgId, selectedOutletId);
      setReadiness(data);
    } catch (err: any) {
      console.error('Failed to load readiness:', err);
      setError(err.message || 'Failed to fetch operational readiness check.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, canView]);

  useEffect(() => {
    loadReadiness();
  }, [loadReadiness]);

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view outlet operational readiness check.</p>
      </div>
    );
  }

  if (!selectedOrgId || !selectedOutletId) {
    return (
      <div className="management-page">
        <PageHeader 
          title="Outlet Operational Readiness" 
          subtitle="Verify if this outlet is configured for operation" 
          backLink={{ to: '/app/settings', label: 'Back to Settings' }}
        />
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertCircle size={40} className="text-muted" style={{ margin: '0 auto 1rem' }} />
          <p className="text-muted">Please select both an organisation and an active outlet from the sidebar to view readiness status.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ paddingBottom: '3rem' }}>
      <PageHeader 
        title="Outlet Operational Readiness" 
        subtitle="Verify forecourt structure, shift setups, employee lists and opening balances before opening"
        backLink={{ to: '/app/settings', label: 'Back to Settings' }}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '5rem' }}>
          <Loader2 className="animate-spin" size={36} style={{ color: 'var(--color-accent)', margin: '0 auto 1rem' }} />
          <p className="text-muted">Analyzing forecourt setup and configurations...</p>
        </div>
      ) : error ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', border: '1px solid var(--color-danger)' }}>
          <AlertCircle size={40} className="text-danger" style={{ margin: '0 auto 1rem' }} />
          <p style={{ color: 'var(--color-danger-text)', fontWeight: 600 }}>{error}</p>
          <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={loadReadiness}>
            Retry Check
          </button>
        </div>
      ) : readiness ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* Main Checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2 className="h4" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ClipboardCheck size={20} style={{ color: 'var(--color-accent)' }} />
              <span>Setup Checklist</span>
            </h2>

            {readiness.checks.map((check) => {
              const link = readiness.resolution_links[check.id];
              return (
                <div 
                  key={check.id} 
                  className="card" 
                  style={{ 
                    padding: '1.25rem', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    borderLeft: check.passed ? '4px solid var(--color-success)' : '4px solid var(--color-danger)',
                    transition: 'transform 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateX(4px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    {check.passed ? (
                      <CheckCircle2 size={20} style={{ color: 'var(--color-success)', marginTop: '2px', flexShrink: 0 }} />
                    ) : (
                      <AlertCircle size={20} style={{ color: 'var(--color-danger)', marginTop: '2px', flexShrink: 0 }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{check.name}</div>
                      <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>{check.details}</div>
                    </div>
                  </div>

                  {!check.passed && link && (
                    <button 
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
                      onClick={() => navigate(link)}
                    >
                      <span>Resolve</span>
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Status Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Status Panel */}
            <div 
              className="card" 
              style={{ 
                padding: '1.5rem', 
                textAlign: 'center',
                background: readiness.ready ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: readiness.ready ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: readiness.ready ? 'var(--color-success-text)' : 'var(--color-danger-text)' }}>
                Outlet Status
              </div>
              <div className="h1" style={{ margin: '0.5rem 0', fontWeight: 800, color: readiness.ready ? 'var(--color-success-text)' : 'var(--color-danger-text)' }}>
                {readiness.ready ? 'Ready' : 'Not Ready'}
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                {readiness.ready 
                  ? 'All core features are configured correctly. Shift operations can now be started.' 
                  : 'Complete all mandatory setup items to activate forecourt operations.'}
              </p>
            </div>

            {/* Warnings/Alerts Panel */}
            {readiness.warnings.length > 0 && (
              <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--color-warning)' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--color-warning-text)' }}>
                  <AlertTriangle size={18} />
                  <span>Warnings ({readiness.warnings.length})</span>
                </div>
                <ul style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {readiness.warnings.map((warn, i) => (
                    <li key={i}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

        </div>
      ) : null}
    </div>
  );
};
