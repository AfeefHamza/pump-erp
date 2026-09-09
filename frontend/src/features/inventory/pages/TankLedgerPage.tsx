// frontend/src/features/inventory/pages/TankLedgerPage.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchTankMovementLedger,
  fetchFuelStockSummary,
  recalculateTankChronology,
  reverseStockAdjustment
} from '@/api/client';
import type {
  TankMovementLedgerResponse,
  TankStockSummaryItem,
  TankStockMovementItem
} from '@/features/inventory/types';
import { PageHeader } from '@/components/navigation/PageHeader';
import { StockAdjustmentDrawer } from '../components/StockAdjustmentDrawer';
import {
  RefreshCw,
  Sliders,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Calendar,
  Filter,
  X
} from 'lucide-react';

export const TankLedgerPage: React.FC = () => {
  const { tankId } = useParams<{ tankId: string }>();
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const [ledgerData, setLedgerData] = useState<TankMovementLedgerResponse | null>(null);
  const [allTanks, setAllTanks] = useState<TankStockSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [movementType, setMovementType] = useState('ALL');

  // Adjustment Drawer & Reversal Modal
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reversalModalMovement, setReversalModalMovement] = useState<TankStockMovementItem | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  const loadData = async () => {
    if (!selectedOrgId || !selectedOutletId || !tankId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (movementType !== 'ALL') params.movement_type = movementType;

      const [ledgerRes, summaryRes] = await Promise.all([
        fetchTankMovementLedger(selectedOrgId, selectedOutletId, tankId, params),
        fetchFuelStockSummary(selectedOrgId, selectedOutletId),
      ]);
      setLedgerData(ledgerRes);
      setAllTanks(summaryRes.tanks);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load tank stock movement ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedOrgId, selectedOutletId, tankId, startDate, endDate, movementType]);

  const handleRecalculate = async () => {
    if (!selectedOrgId || !selectedOutletId || !tankId) return;
    setRecalculating(true);
    try {
      await recalculateTankChronology(selectedOrgId, selectedOutletId, tankId);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to recalculate tank projection.');
    } finally {
      setRecalculating(false);
    }
  };

  const handleExecuteReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId || !reversalModalMovement) return;
    if (!reversalReason.trim()) {
      setReversalError('Reversal reason is mandatory for audit logging.');
      return;
    }

    setReversalLoading(true);
    setReversalError(null);
    try {
      await reverseStockAdjustment(
        selectedOrgId,
        selectedOutletId,
        reversalModalMovement.source_id,
        reversalReason.trim()
      );
      setReversalModalMovement(null);
      setReversalReason('');
      await loadData();
    } catch (err: any) {
      console.error(err);
      setReversalError(err.response?.data?.detail || err.message || 'Failed to reverse adjustment.');
    } finally {
      setReversalLoading(false);
    }
  };

  const currentTank = allTanks.find((t) => t.tank_id === tankId);

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Breadcrumb & PageHeader */}
      <PageHeader
        backLink={{ to: '/app/inventory/fuel-stock', label: 'Back to Fuel Stock' }}
        title={currentTank ? `${currentTank.tank_name} (${currentTank.tank_code})` : 'Tank Ledger'}
        subtitle="Append-only audit ledger of all physical fuel receipts, dispensing, testing, and adjustments."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={loadData}
              disabled={loading}
              className="btn btn-secondary"
              title="Refresh Ledger"
              style={{ padding: '0.65rem' }}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={14} className={recalculating ? 'animate-spin' : ''} />
              <span>Recalculate Projection</span>
            </button>
            <button
              onClick={() => setDrawerOpen(true)}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Sliders size={16} />
              <span>Stock Adjustment</span>
            </button>
          </div>
        }
      />

      {/* Error alert */}
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

      {/* Tank KPI Summary Bar */}
      {currentTank && (
        <div
          className="card"
          style={{
            padding: '1.25rem 1.5rem',
            marginBottom: '1.5rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.5rem',
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Current Book Stock
            </span>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-main)', marginTop: '2px' }}>
              {parseFloat(currentTank.current_book_stock).toLocaleString()} L
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Capacity: <strong>{parseFloat(currentTank.capacity).toLocaleString()} L</strong> ({currentTank.product_name})
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Latest Dip Observation
            </span>
            {currentTank.latest_dip_details ? (
              <div style={{ marginTop: '2px' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-main)' }}>
                  {parseFloat(currentTank.latest_dip_details.volume).toLocaleString()} L
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {currentTank.latest_dip_details.dip_height} {currentTank.latest_dip_details.dip_unit} ({currentTank.latest_dip_details.source_type})
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '6px' }}>
                No dip recorded
              </div>
            )}
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Ledger Integrity Status
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
              {currentTank.has_chronology_conflict ? (
                <span className="status-badge status-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={12} />
                  Chronology Conflict
                </span>
              ) : (
                <span className="status-badge status-active" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Chronology Clean
                </span>
              )}
              {currentTank.has_negative_balance_history && (
                <span className="status-badge status-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldAlert size={12} />
                  Negative Balance Detected
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div
        className="card"
        style={{
          padding: '0.85rem 1.25rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-muted)' }}>Type:</span>
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              className="form-control"
              style={{ width: 'auto', height: '34px', fontSize: '0.8rem', padding: '4px 8px' }}
            >
              <option value="ALL">All Movements</option>
              <option value="initial_opening_balance">Opening Balance</option>
              <option value="tanker_receipt">Tanker Receipts</option>
              <option value="nozzle_dispensing">Dispensing (Sales)</option>
              <option value="testing_return">Testing Returned</option>
              <option value="stock_adjustment_increase">Stock Increase</option>
              <option value="stock_adjustment_decrease">Stock Decrease</option>
              <option value="reversal">Reversals</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="form-control"
              style={{ width: 'auto', height: '34px', fontSize: '0.8rem', padding: '4px 8px' }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="form-control"
              style={{ width: 'auto', height: '34px', fontSize: '0.8rem', padding: '4px 8px' }}
            />
          </div>
        </div>

        <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
          Total Entries: <strong style={{ color: 'var(--text-main)' }}>{ledgerData?.movements.length || 0}</strong>
        </div>
      </div>

      {/* Movement Ledger Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading movement ledger...
          </div>
        ) : !ledgerData || ledgerData.movements.length === 0 ? (
          <div className="empty-state" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div className="empty-state-icon-wrapper" style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }}>
              <Layers size={36} />
            </div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 0.5rem' }}>
              No stock movements recorded
            </h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
              Confirmed tanker receipts, shift card sales, and adjustments will post here automatically.
            </p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="table data-table">
              <thead>
                <tr>
                  <th style={{ width: '150px' }}>Timestamp</th>
                  <th style={{ width: '140px' }}>Movement Type</th>
                  <th>Source Reference</th>
                  <th style={{ textAlign: 'right', width: '110px' }}>Inflow (+)</th>
                  <th style={{ textAlign: 'right', width: '110px' }}>Outflow (-)</th>
                  <th style={{ textAlign: 'right', width: '130px' }}>Running Balance</th>
                  <th>Notes & Reason</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {ledgerData.movements.map((m) => {
                  const inQty = parseFloat(m.in_quantity) || 0;
                  const outQty = parseFloat(m.out_quantity) || 0;
                  const isInflow = m.direction === 'IN';
                  const runBal = parseFloat(m.running_balance) || 0;
                  const isNegative = m.is_negative_balance;

                  return (
                    <tr
                      key={m.id}
                      style={{
                        backgroundColor: isNegative ? 'rgba(254, 226, 226, 0.25)' : m.is_reversal ? 'rgba(243, 232, 255, 0.3)' : undefined,
                      }}
                    >
                      {/* Timestamp */}
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(m.effective_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>

                      {/* Movement Type Badge */}
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.75rem',
                            backgroundColor: m.is_reversal
                              ? '#f3e8ff'
                              : isInflow
                              ? 'var(--color-success-bg, #dcfce7)'
                              : 'var(--color-danger-bg, #fee2e2)',
                            color: m.is_reversal
                              ? '#7e22ce'
                              : isInflow
                              ? 'var(--color-success-text, #15803d)'
                              : 'var(--color-danger-text, #b91c1c)',
                          }}
                        >
                          {isInflow ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          {m.movement_type.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Source Document Reference */}
                      <td>
                        <div style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-accent)' }}>
                          {m.source_type === 'TANKER_RECEIPT' && (
                            <span
                              onClick={() => navigate(`/app/purchases/tanker-receipts/${m.source_id}`)}
                              style={{ cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Receipt #{m.source_id.slice(0, 8)}
                            </span>
                          )}
                          {m.source_type === 'SHIFT_CARD' && (
                            <span
                              onClick={() => navigate(`/app/operations/shift-cards/entry/${m.source_id}`)}
                              style={{ cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Shift Card #{m.source_id.slice(0, 8)}
                            </span>
                          )}
                          {m.source_type === 'STOCK_ADJUSTMENT' && (
                            <span>Adjustment #{m.source_id.slice(0, 8)}</span>
                          )}
                          {m.source_type === 'OPENING_BALANCE' && <span>Opening Balance</span>}
                          {m.source_type === 'REVERSAL' && <span>Reversal Entry</span>}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ID: {m.id.slice(0, 12)}...</div>
                      </td>

                      {/* Inflow */}
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-success-text)' }}>
                        {inQty > 0 ? `+${inQty.toLocaleString(undefined, { minimumFractionDigits: 3 })} L` : '—'}
                      </td>

                      {/* Outflow */}
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-danger-text)' }}>
                        {outQty > 0 ? `-${outQty.toLocaleString(undefined, { minimumFractionDigits: 3 })} L` : '—'}
                      </td>

                      {/* Running Balance */}
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: isNegative ? 'var(--color-danger-text)' : 'var(--text-main)',
                          }}
                        >
                          {isNegative && <ShieldAlert size={14} style={{ color: 'var(--color-danger-text)' }} />}
                          {runBal.toLocaleString(undefined, { minimumFractionDigits: 3 })} L
                        </span>
                      </td>

                      {/* Notes / Reason */}
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '240px' }} title={m.reason || ''}>
                        {m.reason || '—'}
                      </td>

                      {/* Status / Action */}
                      <td style={{ textAlign: 'center' }}>
                        {m.is_reversal ? (
                          <span className="status-badge" style={{ backgroundColor: '#f3e8ff', color: '#7e22ce', fontSize: '0.75rem' }}>
                            Reversal
                          </span>
                        ) : m.source_type === 'STOCK_ADJUSTMENT' ? (
                          <button
                            onClick={() => {
                              setReversalModalMovement(m);
                              setReversalReason('');
                              setReversalError(null);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '0.75rem', color: 'var(--color-danger-text)' }}
                          >
                            Reverse
                          </button>
                        ) : (
                          <span className="status-badge status-active" style={{ fontSize: '0.75rem' }}>
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock Adjustment Slide-over Drawer */}
      <StockAdjustmentDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={loadData}
        tanks={allTanks}
        defaultTankId={tankId}
      />

      {/* Reversal Confirmation Modal */}
      {reversalModalMovement && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '480px',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.15))',
              marginBottom: 0,
              overflow: 'hidden',
            }}
          >
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RotateCcw size={18} style={{ color: 'var(--color-danger-text)' }} />
                Reverse Stock Adjustment
              </h3>
              <button
                type="button"
                onClick={() => setReversalModalMovement(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleExecuteReversal} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                This will post an offsetting reversal movement to restore tank book balance. Posted records remain immutable in the audit ledger.
              </p>

              {reversalError && (
                <div
                  style={{
                    backgroundColor: 'var(--color-danger-bg, #fee2e2)',
                    color: 'var(--color-danger-text, #b91c1c)',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <AlertCircle size={16} />
                  <span>{reversalError}</span>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  Reason for Reversal <span style={{ color: 'var(--color-danger-text)' }}>*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  className="form-control"
                  style={{ height: 'auto', resize: 'vertical' }}
                  placeholder="Explain why this adjustment is being reversed (e.g. entered in error, recalibrated)..."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReversalModalMovement(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversalLoading}
                  className="btn btn-danger"
                >
                  {reversalLoading ? 'Reversing...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
