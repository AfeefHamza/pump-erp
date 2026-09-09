// frontend/src/features/inventory/pages/FuelStockDashboardPage.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchFuelStockSummary,
  fetchDayCloseInventoryReadiness,
  recalculateTankChronology
} from '@/api/client';
import type {
  TankStockSummaryResponse,
  DayCloseInventoryReadiness
} from '@/features/inventory/types';
import { PageHeader } from '@/components/navigation/PageHeader';
import { StockAdjustmentDrawer } from '../components/StockAdjustmentDrawer';
import {
  Layers,
  Sliders,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Droplet,
  ShieldAlert,
  Gauge
} from 'lucide-react';

export const FuelStockDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [summaryData, setSummaryData] = useState<TankStockSummaryResponse | null>(null);
  const [readiness, setReadiness] = useState<DayCloseInventoryReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTankForAdjustment, setSelectedTankForAdjustment] = useState<string | undefined>(undefined);

  const loadData = async () => {
    if (!selectedOrgId || !selectedOutletId) return;
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [sumRes, readyRes] = await Promise.all([
        fetchFuelStockSummary(selectedOrgId, selectedOutletId),
        fetchDayCloseInventoryReadiness(selectedOrgId, selectedOutletId, today).catch(() => null),
      ]);
      setSummaryData(sumRes);
      setReadiness(readyRes);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load fuel stock data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedOrgId, selectedOutletId]);

  const handleRecalculate = async (tankId: string) => {
    if (!selectedOrgId || !selectedOutletId) return;
    setRecalculatingId(tankId);
    try {
      await recalculateTankChronology(selectedOrgId, selectedOutletId, tankId);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to recalculate tank chronology.');
    } finally {
      setRecalculatingId(null);
    }
  };

  const handleOpenAdjustment = (tankId?: string) => {
    setSelectedTankForAdjustment(tankId);
    setDrawerOpen(true);
  };

  // Aggregates
  const aggregates = useMemo(() => {
    if (!summaryData) return { totalBook: 0, totalPhysical: 0, netVariance: 0, capacity: 0 };
    let totalBook = 0;
    let totalPhysical = 0;
    let capacity = 0;

    summaryData.tanks.forEach((t) => {
      totalBook += parseFloat(t.current_book_stock) || 0;
      capacity += parseFloat(t.capacity) || 0;
      if (t.latest_physical_stock) {
        totalPhysical += parseFloat(t.latest_physical_stock) || 0;
      }
    });

    return {
      totalBook,
      totalPhysical,
      netVariance: totalPhysical > 0 ? totalPhysical - totalBook : 0,
      capacity,
    };
  }, [summaryData]);

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <PageHeader
        title="Fuel Stock Ledger"
        subtitle="Real-time book balances, latest physical dip observations, and operational stock variance."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={loadData}
              disabled={loading}
              className="btn btn-secondary"
              title="Refresh Stock Data"
              style={{ padding: '0.65rem' }}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => handleOpenAdjustment()}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Sliders size={16} />
              <span>Record Stock Adjustment</span>
            </button>
          </div>
        }
      />

      {/* Error Banner */}
      {error && (
        <div
          style={{
            backgroundColor: 'var(--color-danger-bg, #fee2e2)',
            color: 'var(--color-danger-text, #b91c1c)',
            border: '1px solid rgba(185, 28, 28, 0.2)',
            borderRadius: 'var(--radius-md, 6px)',
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Day Close Inventory Readiness Banner */}
      {readiness && (
        <div
          className="card"
          style={{
            padding: '1.25rem 1.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            backgroundColor: readiness.ready ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-warning-bg, #ffedd5)',
            border: `1px solid ${readiness.ready ? 'rgba(21, 128, 61, 0.25)' : 'rgba(194, 65, 12, 0.25)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            {readiness.ready ? (
              <CheckCircle2 size={22} style={{ color: 'var(--color-success-text, #15803d)', flexShrink: 0, marginTop: '2px' }} />
            ) : (
              <AlertTriangle size={22} style={{ color: 'var(--color-warning-text, #c2410c)', flexShrink: 0, marginTop: '2px' }} />
            )}
            <div>
              <h4
                style={{
                  margin: 0,
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: readiness.ready ? 'var(--color-success-text, #15803d)' : 'var(--color-warning-text, #c2410c)',
                }}
              >
                {readiness.ready
                  ? 'Inventory Ready for Day Close'
                  : 'Day Close Inventory Attention Required'}
              </h4>
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.825rem',
                  color: readiness.ready ? 'var(--color-success-text, #15803d)' : 'var(--color-warning-text, #c2410c)',
                  opacity: 0.9,
                }}
              >
                {readiness.ready
                  ? 'All tanker receipts, operational movements, and dip variances are acknowledged and aligned.'
                  : `${readiness.unacknowledged_variances_count} unacknowledged variance(s), ${readiness.unconfirmed_receipts_count} unconfirmed receipt(s), and ${readiness.conflicted_tanks_count} chronology conflict(s).`}
              </p>
            </div>
          </div>

          {(readiness.unacknowledged_variances_count > 0 || readiness.unconfirmed_receipts_count > 0) && (
            <button
              onClick={() => navigate('/app/purchases/tanker-receipts')}
              className="btn btn-primary btn-sm"
              style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              Review Tanker Receipts
            </button>
          )}
        </div>
      )}

      {/* Aggregate KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        {/* Book Stock */}
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Book Stock</span>
            <div className="stat-card-icon-wrapper">
              <Layers size={18} />
            </div>
          </div>
          <div className="stat-card-value font-mono">
            {aggregates.totalBook.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '4px' }}>L</span>
          </div>
          <div className="stat-card-desc" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Across {summaryData?.tanks.length || 0} active storage tanks
          </div>
        </div>

        {/* Physical Stock */}
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Physical Stock</span>
            <div className="stat-card-icon-wrapper" style={{ color: 'var(--color-success-text)' }}>
              <Gauge size={18} />
            </div>
          </div>
          <div className="stat-card-value font-mono">
            {aggregates.totalPhysical.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '4px' }}>L</span>
          </div>
          <div className="stat-card-desc" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            From latest calibrated tank dips
          </div>
        </div>

        {/* Net Variance */}
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Net Dip Variance</span>
            <div
              className="stat-card-icon-wrapper"
              style={{
                color: aggregates.netVariance >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)',
              }}
            >
              {aggregates.netVariance >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            </div>
          </div>
          <div
            className="stat-card-value font-mono"
            style={{
              color: aggregates.netVariance >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)',
            }}
          >
            {aggregates.netVariance >= 0 ? '+' : ''}
            {aggregates.netVariance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '4px' }}>L</span>
          </div>
          <div className="stat-card-desc" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Physical dip minus calculated book stock
          </div>
        </div>

        {/* Storage Utilization */}
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Capacity Fill</span>
            <div className="stat-card-icon-wrapper" style={{ color: '#2563eb' }}>
              <Droplet size={18} />
            </div>
          </div>
          <div className="stat-card-value font-mono">
            {aggregates.capacity > 0
              ? `${((aggregates.totalBook / aggregates.capacity) * 100).toFixed(1)}%`
              : '0.0%'}
          </div>
          <div className="stat-card-desc" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {aggregates.capacity.toLocaleString()} L total storage volume
          </div>
        </div>
      </div>

      {/* Tanks Summary Grid */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '1rem' }}>
          Tank Stock & Dip Overview
        </h3>

        {loading ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading storage tanks...
          </div>
        ) : !summaryData || summaryData.tanks.length === 0 ? (
          <div className="card empty-state" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div className="empty-state-icon-wrapper" style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }}>
              <Droplet size={36} />
            </div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 0.5rem' }}>
              No storage tanks configured
            </h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
              Configure storage tanks in Settings &gt; Tanks to track fuel inventory.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {summaryData.tanks.map((tank) => {
              const bookStock = parseFloat(tank.current_book_stock) || 0;
              const cap = parseFloat(tank.capacity) || 1;
              const fillPct = Math.min(100, Math.max(0, (bookStock / cap) * 100));

              const dip = tank.latest_dip_details;
              const physicalVol = tank.latest_physical_stock ? parseFloat(tank.latest_physical_stock) : null;
              const variance = tank.variance ? parseFloat(tank.variance) : (physicalVol !== null ? physicalVol - bookStock : null);
              const variancePct = physicalVol !== null && bookStock > 0 ? (variance! / bookStock) * 100 : null;

              return (
                <div
                  key={tank.tank_id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    marginBottom: 0,
                    padding: '1.25rem',
                  }}
                >
                  {/* Card Header */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              color: 'var(--color-accent)',
                              backgroundColor: 'var(--color-accent-light)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {tank.tank_code}
                          </span>
                          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)' }}>
                            {tank.tank_name}
                          </h4>
                        </div>
                        <div style={{ marginTop: '0.25rem' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              backgroundColor: '#f1f5f9',
                              color: '#334155',
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            {tank.product_name}
                          </span>
                        </div>
                      </div>

                      {/* Integrity Badges */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        {tank.has_chronology_conflict && (
                          <span
                            className="status-badge status-warning"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                            title="Backdated transaction detected. Re-project required."
                          >
                            <AlertTriangle size={12} />
                            Chronology Conflict
                          </span>
                        )}
                        {tank.has_negative_balance_history && (
                          <span
                            className="status-badge status-danger"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                            title="Negative balance detected during movement history."
                          >
                            <ShieldAlert size={12} />
                            Negative Balance
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stock & Capacity Gauge */}
                    <div style={{ marginTop: '1rem' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)',
                          marginBottom: '6px',
                        }}
                      >
                        <span>
                          Current Book Stock: <strong style={{ color: 'var(--text-main)' }}>{bookStock.toLocaleString()} L</strong>
                        </span>
                        <span>
                          Capacity: <strong>{cap.toLocaleString()} L</strong> ({fillPct.toFixed(1)}%)
                        </span>
                      </div>

                      <div
                        style={{
                          width: '100%',
                          height: '8px',
                          backgroundColor: '#e2e8f0',
                          borderRadius: '4px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${fillPct}%`,
                            backgroundColor: fillPct > 90 ? '#f59e0b' : fillPct < 15 ? '#ef4444' : 'var(--color-accent, #0f766e)',
                            borderRadius: '4px',
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>

                    {/* Physical Dip vs Book Stock Grid */}
                    <div
                      style={{
                        marginTop: '1rem',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        backgroundColor: 'var(--bg-main, #f8fafc)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #e2e8f0)',
                      }}
                    >
                      <div>
                        <span
                          style={{
                            display: 'block',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Latest Physical Dip
                        </span>
                        {dip ? (
                          <div style={{ marginTop: '2px' }}>
                            <div style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-main)' }}>
                              {parseFloat(dip.volume).toLocaleString()} L
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {dip.dip_height} {dip.dip_unit} ({dip.source_type})
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {new Date(dip.measured_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', display: 'block', marginTop: '4px' }}>
                            No dip recorded
                          </span>
                        )}
                      </div>

                      <div>
                        <span
                          style={{
                            display: 'block',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Calculated Variance
                        </span>
                        {variance !== null ? (
                          <div style={{ marginTop: '2px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                color: variance >= 0 ? 'var(--color-success-text, #15803d)' : 'var(--color-danger-text, #b91c1c)',
                                backgroundColor: variance >= 0 ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-danger-bg, #fee2e2)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              {variance >= 0 ? '+' : ''}
                              {variance.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L
                            </span>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {variancePct !== null
                                ? `${variancePct >= 0 ? '+' : ''}${variancePct.toFixed(2)}% of book`
                                : ''}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', display: 'block', marginTop: '4px' }}>
                            Variance unavailable
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div
                    style={{
                      marginTop: '1.25rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid var(--border-color, #e2e8f0)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <button
                        onClick={() => handleOpenAdjustment(tank.tank_id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-accent, #0f766e)',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline',
                        }}
                      >
                        Adjust Stock
                      </button>
                      {tank.has_chronology_conflict && (
                        <button
                          onClick={() => handleRecalculate(tank.tank_id)}
                          disabled={recalculatingId === tank.tank_id}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-warning-text, #c2410c)',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'underline',
                          }}
                        >
                          {recalculatingId === tank.tank_id ? 'Recalculating...' : 'Recalculate Projection'}
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => navigate(`/app/inventory/fuel-stock/${tank.tank_id}`)}
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>View Movement Ledger</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stock Adjustment Slide-over Drawer */}
      <StockAdjustmentDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={loadData}
        tanks={summaryData?.tanks || []}
        defaultTankId={selectedTankForAdjustment}
      />
    </div>
  );
};
