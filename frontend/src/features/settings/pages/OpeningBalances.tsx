import React, { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchOpeningBalanceBatch,
  createOpeningBalanceBatch,
  saveOpeningBalanceEntries,
  fetchOpeningBalancePreview,
  confirmOpeningBalanceBatch,
  fetchTanks,
  fetchNozzles,
  previewDipConversion,
  type Tank,
  type Nozzle,
  type OpeningBalanceBatch
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { CheckCircle, AlertCircle, RefreshCw, ChevronRight, ChevronLeft, Save, Clock } from 'lucide-react';

export const OpeningBalances: React.FC = () => {
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  // Lists & configs
  const [batch, setBatch] = useState<OpeningBalanceBatch | null>(null);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [nozzles, setNozzles] = useState<Nozzle[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Wizard state: 1: Effective Date, 2: Nozzle Readings, 3: Tank Stock, 4: Preview & Confirm
  const [step, setStep] = useState(1);
  const [effectiveAt, setEffectiveAt] = useState(new Date().toISOString().substring(0, 16));
  const [notes, setNotes] = useState('');

  // Values entered
  const [nozzleReadings, setNozzleReadings] = useState<Record<string, string>>({});
  const [tankBooks, setTankBooks] = useState<Record<string, string>>({});
  const [tankPhysicals, setTankPhysicals] = useState<Record<string, string>>({});
  const [tankRawDips, setTankRawDips] = useState<Record<string, string>>({});
  const [tankDipUnits, setTankDipUnits] = useState<Record<string, string>>({});
  const [tankMethods, setTankMethods] = useState<Record<string, string>>({});
  const [tankReasons, setTankReasons] = useState<Record<string, string>>({});
  const [tankDensities, setTankDensities] = useState<Record<string, string>>({});

  // Calculation badges (badges showing if calculation was exact vs interpolated)
  const [tankCalcBadges, setTankCalcBadges] = useState<Record<string, string>>({});

  // Validation details
  const [validationResult, setValidationResult] = useState<any>(null);

  // Permissions
  const canView = usePermission('opening_balance.view');
  const canConfigure = usePermission('opening_balance.configure');
  const canConfirm = usePermission('opening_balance.confirm');

  const loadInitialData = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId) return;
    setLoading(true);
    try {
      // 1. Fetch batch
      const batchRes = await fetchOpeningBalanceBatch(selectedOrgId, selectedOutletId);
      
      // 2. Fetch forecourt components
      const tankData = await fetchTanks(selectedOrgId, selectedOutletId, { status: 'active' });
      const nozzleData = await fetchNozzles(selectedOrgId, selectedOutletId, { status: 'active' });

      setTanks(tankData);
      setNozzles(nozzleData);

      if (batchRes.exists && batchRes.batch) {
        const activeBatch = batchRes.batch;
        setBatch(activeBatch);
        setEffectiveAt(activeBatch.effective_at.substring(0, 16));
        setNotes(activeBatch.notes || '');

        // Populate readings
        const nReadings: Record<string, string> = {};
        activeBatch.nozzle_balances.forEach((nb) => {
          nReadings[nb.nozzle_id] = String(nb.totalizer_reading);
        });
        setNozzleReadings(nReadings);

        const tBooks: Record<string, string> = {};
        const tPhys: Record<string, string> = {};
        const tRawDips: Record<string, string> = {};
        const tUnits: Record<string, string> = {};
        const tMethods: Record<string, string> = {};
        const tReasons: Record<string, string> = {};
        const tDensities: Record<string, string> = {};

        activeBatch.tank_balances.forEach((tb) => {
          tBooks[tb.tank_id] = String(tb.book_quantity);
          tPhys[tb.tank_id] = String(tb.physical_quantity);
          tRawDips[tb.tank_id] = tb.raw_dip_value ? String(tb.raw_dip_value) : '';
          tUnits[tb.tank_id] = tb.raw_dip_unit || 'millimetre';
          tMethods[tb.tank_id] = tb.conversion_method;
          tReasons[tb.tank_id] = tb.manual_quantity_reason || '';
          tDensities[tb.tank_id] = tb.density ? String(tb.density) : '';
        });

        setTankBooks(tBooks);
        setTankPhysicals(tPhys);
        setTankRawDips(tRawDips);
        setTankDipUnits(tUnits);
        setTankMethods(tMethods);
        setTankReasons(tReasons);
        setTankDensities(tDensities);

        // If batch is already confirmed, jump straight to summary step (4)
        if (activeBatch.status === 'confirmed') {
          setStep(4);
          // Fetch preview details
          const preview = await fetchOpeningBalancePreview(selectedOrgId, selectedOutletId, activeBatch.id);
          setValidationResult(preview);
        } else {
          setStep(2);
        }
      } else {
        setBatch(null);
        setStep(1);
      }
    } catch (err) {
      console.error('Failed to load opening balances:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Handle server-side physical stock volume lookup when raw dip changes
  const handleRawDipChange = async (tankId: string, value: string, unit: string) => {
    setTankRawDips((prev) => ({ ...prev, [tankId]: value }));
    const height = parseFloat(value);
    if (!selectedOrgId || !selectedOutletId || isNaN(height) || height <= 0) {
      return;
    }

    try {
      const conversion = await previewDipConversion(selectedOrgId, selectedOutletId, {
        tank_id: tankId,
        height,
        unit
      });

      // Update physical quantity and conversion method
      setTankPhysicals((prev) => ({ ...prev, [tankId]: String(conversion.volume_litres) }));
      setTankMethods((prev) => ({ ...prev, [tankId]: conversion.method }));
      
      const badge = conversion.method === 'calibration_exact' ? 'Exact Match' : 'Interpolated';
      setTankCalcBadges((prev) => ({ ...prev, [tankId]: badge }));
    } catch (err) {
      // If error (e.g. no assignment or outside calibration chart range), fallback to manual
      setTankMethods((prev) => ({ ...prev, [tankId]: 'manual_quantity' }));
      setTankCalcBadges((prev) => ({ ...prev, [tankId]: 'Error: Fallback to manual' }));
    }
  };

  const handleCreateBatch = async () => {
    if (!selectedOrgId || !selectedOutletId) return;
    setActionLoading(true);
    try {
      const activeBatch = await createOpeningBalanceBatch(selectedOrgId, selectedOutletId, {
        effective_at: new Date(effectiveAt).toISOString(),
        notes: notes.trim() || null
      });
      setBatch(activeBatch);
      setStep(2);
    } catch (err: any) {
      alert(err.message || 'Failed to initialize batch.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEntries = async () => {
    if (!selectedOrgId || !selectedOutletId || !batch) return;

    // Validate that manual quantity entries have reasons
    for (const t of tanks) {
      const method = tankMethods[t.id] || 'manual_quantity';
      const reason = tankReasons[t.id]?.trim();
      if (method === 'manual_quantity' && !reason) {
        alert(`A reason is required for manually overriding the physical quantity of tank: ${t.name} (${t.code})`);
        return;
      }
    }

    setActionLoading(true);

    const payload = {
      batch_id: batch.id,
      nozzles: nozzles.map((n) => ({
        nozzle_id: n.id,
        totalizer_reading: parseFloat(nozzleReadings[n.id]) || 0,
        notes: ''
      })),
      tanks: tanks.map((t) => ({
        tank_id: t.id,
        book_quantity: parseFloat(tankBooks[t.id]) || 0,
        physical_quantity: parseFloat(tankPhysicals[t.id]) || 0,
        raw_dip_value: tankRawDips[t.id] ? parseFloat(tankRawDips[t.id]) : null,
        raw_dip_unit: tankDipUnits[t.id] || 'millimetre',
        density: tankDensities[t.id] ? parseFloat(tankDensities[t.id]) : null,
        conversion_method: tankMethods[t.id] || 'manual_quantity',
        manual_quantity_reason: tankReasons[t.id] || null
      }))
    };

    try {
      const updatedBatch = await saveOpeningBalanceEntries(selectedOrgId, selectedOutletId, payload);
      setBatch(updatedBatch);
      
      // Fetch validation details
      const preview = await fetchOpeningBalancePreview(selectedOrgId, selectedOutletId, batch.id);
      setValidationResult(preview);
      setStep(4);
    } catch (err: any) {
      alert(err.message || 'Failed to save balances. Check for negative quantities or capacity tolerance.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmBatch = async () => {
    if (!selectedOrgId || !selectedOutletId || !batch) return;
    setActionLoading(true);
    try {
      const confirmed = await confirmOpeningBalanceBatch(selectedOrgId, selectedOutletId, batch.id);
      setBatch(confirmed);
      // Refresh list
      loadInitialData();
    } catch (err: any) {
      alert(err.message || 'Failed to confirm opening balances.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!selectedOrgId || !selectedOutletId) {
    return (
      <div className="management-page">
        <PageHeader title="Opening Balances" subtitle="Configure opening stocks and totalizers" />
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertCircle size={40} className="text-muted" style={{ margin: '0 auto 1rem' }} />
          <p className="text-muted">Please select an organisation and an outlet in the sidebar to configure opening balances.</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view opening balances.</p>
      </div>
    );
  }

  const isConfirmed = batch?.status === 'confirmed';

  return (
    <div className="management-page" style={{ paddingBottom: '3rem' }}>
      <PageHeader 
        title="Opening Balances Setup" 
        subtitle="Establish initial starting point for forecourt stock levels and nozzle meter totalizers"
      />

      {/* Wizard Steps indicator */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', background: 'var(--bg-card)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
        {[
          { num: 1, label: 'Effective Date' },
          { num: 2, label: 'Nozzle Meter Readings' },
          { num: 3, label: 'Tank Stock Levels' },
          { num: 4, label: 'Preview & Confirm' }
        ].map((s) => (
          <div 
            key={s.num} 
            style={{ 
              flex: 1, 
              textAlign: 'center', 
              padding: '0.5rem', 
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              background: step === s.num ? 'var(--color-accent)' : 'transparent',
              color: step === s.num ? '#fff' : 'var(--color-text-muted)',
              border: step === s.num ? 'none' : '1px solid var(--border-color)'
            }}
          >
            {s.num}. {s.label}
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading configuration wizard...</p>
        </div>
      ) : (
        <div className="card" style={{ padding: '2rem' }}>
          
          {/* STEP 1: Effective Date */}
          {step === 1 && (
            <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h2 className="h3" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ClockIcon size={22} style={{ color: 'var(--color-accent)' }} />
                <span>Choose Effective Date & Time</span>
              </h2>
              <p className="text-muted">
                Choose the exact date and time starting point. All future meter readings, shifts, sales, and stock movements will begin from this date.
              </p>

              <div className="form-group">
                <label className="form-label" htmlFor="effective_at">Effective Date & Time *</label>
                <input
                  id="effective_at"
                  type="datetime-local"
                  className="form-control"
                  value={effectiveAt}
                  onChange={(e) => setEffectiveAt(e.target.value)}
                  disabled={!canConfigure}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="notes">Notes / Remarks</label>
                <textarea
                  id="notes"
                  className="form-control"
                  rows={3}
                  placeholder="e.g. Initial setup for outlet launch"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canConfigure}
                />
              </div>

              {canConfigure && (
                <button className="btn btn-primary" onClick={handleCreateBatch} disabled={actionLoading} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {actionLoading ? 'Initializing...' : 'Initialize Configuration'}
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          )}

          {/* STEP 2: Nozzle Readings */}
          {step === 2 && (
            <div>
              <h2 className="h3" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>Initial Nozzle Totalizer Readings</span>
              </h2>
              <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                Enter the starting mechanical or electronic cumulative meter readings for each active nozzle. Decimals are supported.
              </p>

              <div className="data-table-container" style={{ marginBottom: '2rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Dispenser</th>
                      <th>Nozzle Code</th>
                      <th>Connected Tank</th>
                      <th>Product</th>
                      <th>Initial Totalizer Reading *</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nozzles.map((n) => (
                      <tr key={n.id}>
                        <td>{n.dispenser_name || '—'}</td>
                        <td><code style={{ color: 'var(--color-accent)' }}>{n.code}</code></td>
                        <td>{n.tank_name || '—'}</td>
                        <td>{n.product_name || '—'}</td>
                        <td>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            className="form-control"
                            style={{ width: '200px' }}
                            value={nozzleReadings[n.id] || ''}
                            onChange={(e) => setNozzleReadings(prev => ({ ...prev, [n.id]: e.target.value }))}
                            disabled={isConfirmed || !canConfigure}
                            placeholder="0.000"
                            required
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn btn-secondary" onClick={() => setStep(1)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ChevronLeft size={16} />
                  <span>Back</span>
                </button>
                <button className="btn btn-primary" onClick={() => setStep(3)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Next: Tank Stock</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Tank Stock */}
          {step === 3 && (
            <div>
              <h2 className="h3" style={{ marginBottom: '0.5rem' }}>Initial Tank Physical & Book Stocks</h2>
              <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                Provide book quantity and physical quantity. Enter raw dip measurements to trigger server-side conversion via calibration assignments.
              </p>

              <div className="data-table-container" style={{ marginBottom: '2rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tank</th>
                      <th>Product</th>
                      <th>Capacity (L)</th>
                      <th>Raw Dip Value</th>
                      <th>Unit</th>
                      <th>Physical Stock (L) *</th>
                      <th>Book Stock (L) *</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tanks.map((t) => {
                      const method = tankMethods[t.id] || 'manual_quantity';
                      const badge = tankCalcBadges[t.id];
                      return (
                        <tr key={t.id}>
                          <td><strong>{t.name}</strong> ({t.code})</td>
                          <td>{t.product_name || '—'}</td>
                          <td>{t.capacity}</td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              className="form-control"
                              style={{ width: '120px' }}
                              value={tankRawDips[t.id] || ''}
                              onChange={(e) => handleRawDipChange(t.id, e.target.value, tankDipUnits[t.id] || 'millimetre')}
                              disabled={isConfirmed || !canConfigure}
                              placeholder="0.00"
                            />
                          </td>
                          <td>
                            <select
                              className="form-control"
                              style={{ width: '130px' }}
                              value={tankDipUnits[t.id] || 'millimetre'}
                              onChange={(e) => {
                                setTankDipUnits(prev => ({ ...prev, [t.id]: e.target.value }));
                                handleRawDipChange(t.id, tankRawDips[t.id] || '', e.target.value);
                              }}
                              disabled={isConfirmed || !canConfigure}
                            >
                              <option value="millimetre">Millimetres (mm)</option>
                              <option value="centimetre">Centimetres (cm)</option>
                              <option value="inch">Inches (in)</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              className="form-control"
                              style={{ width: '150px' }}
                              value={tankPhysicals[t.id] || ''}
                              onChange={(e) => {
                                setTankPhysicals(prev => ({ ...prev, [t.id]: e.target.value }));
                                if (method !== 'manual_quantity') {
                                  setTankMethods(prev => ({ ...prev, [t.id]: 'manual_quantity' }));
                                  setTankCalcBadges(prev => ({ ...prev, [t.id]: 'Manual Override' }));
                                }
                              }}
                              disabled={isConfirmed || !canConfigure}
                              placeholder="0.00"
                              required
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              className="form-control"
                              style={{ width: '150px' }}
                              value={tankBooks[t.id] || ''}
                              onChange={(e) => setTankBooks(prev => ({ ...prev, [t.id]: e.target.value }))}
                              disabled={isConfirmed || !canConfigure}
                              placeholder="0.00"
                              required
                            />
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span className="badge badge-secondary" style={{ textTransform: 'capitalize' }}>
                                {method.replace(/_/g, ' ')}
                              </span>
                              {badge && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{badge}</span>}
                              {method === 'manual_quantity' && (
                                <input
                                  type="text"
                                  className="form-control"
                                  style={{ width: '150px', fontSize: '0.8rem', height: '28px', marginTop: '4px' }}
                                  placeholder="Reason for manual entry *"
                                  value={tankReasons[t.id] || ''}
                                  onChange={(e) => setTankReasons(prev => ({ ...prev, [t.id]: e.target.value }))}
                                  disabled={isConfirmed || !canConfigure}
                                  required
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn btn-secondary" onClick={() => setStep(2)}>
                  <ChevronLeft size={16} />
                  <span>Back</span>
                </button>
                <button className="btn btn-primary" onClick={handleSaveEntries} disabled={actionLoading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Save size={16} />
                  <span>{actionLoading ? 'Saving...' : 'Save & Preview'}</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Preview & Confirm */}
          {step === 4 && (
            <div>
              <h2 className="h3" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={22} style={{ color: isConfirmed ? 'var(--color-success)' : 'var(--color-warning)' }} />
                <span>{isConfirmed ? 'Opening Balances Confirmed' : 'Verification & Confirmation'}</span>
              </h2>

              {isConfirmed ? (
                <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--color-success)', background: 'rgba(34, 197, 94, 0.05)', marginBottom: '1.5rem' }}>
                  <div style={{ fontWeight: 600, color: 'var(--color-success-text)' }}>Atomic opening balance batch is confirmed and locked.</div>
                  <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    Confirmed by {batch?.confirmed_by || 'system'} on {batch?.confirmed_at ? new Date(batch.confirmed_at).toLocaleString() : '—'}. These quantities are immutable.
                  </div>
                </div>
              ) : (
                <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--color-warning)', background: 'rgba(245, 158, 11, 0.05)', marginBottom: '1.5rem' }}>
                  <div style={{ fontWeight: 600, color: 'var(--color-warning-text)' }}>Please verify carefully before confirming.</div>
                  <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    Confirmed opening balances become immutable and establish the start of all future calculation reconciliations. SILENT EDITS WILL BE PROHIBITED.
                  </div>
                </div>
              )}

              {validationResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div>
                    <h3 className="h4" style={{ marginBottom: '0.75rem' }}>Nozzles Summary</h3>
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Nozzle</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Initial Meter Totalizer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validationResult.nozzles.map((n: any) => (
                            <tr key={n.nozzle_id}>
                              <td><strong>{n.nozzle_code}</strong></td>
                              <td>
                                <span className={`badge ${n.is_configured ? 'badge-success' : 'badge-danger'}`}>
                                  {n.is_configured ? 'Configured' : 'Missing'}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{n.reading !== null ? n.reading : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h3 className="h4" style={{ marginBottom: '0.75rem' }}>Tanks Summary</h3>
                    <div className="data-table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Tank</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Book Quantity (L)</th>
                            <th style={{ textAlign: 'right' }}>Physical Quantity (L)</th>
                            <th style={{ textAlign: 'right' }}>Variance (L)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validationResult.tanks.map((t: any) => {
                            const variance = t.physical_quantity !== null && t.book_quantity !== null 
                              ? (parseFloat(t.physical_quantity) - parseFloat(t.book_quantity)).toFixed(2)
                              : '—';
                            return (
                              <tr key={t.tank_id}>
                                <td><strong>{t.tank_code}</strong></td>
                                <td>
                                  <span className={`badge ${t.is_configured ? 'badge-success' : 'badge-danger'}`}>
                                    {t.is_configured ? 'Configured' : 'Missing'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{t.book_quantity !== null ? t.book_quantity : '—'}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{t.physical_quantity !== null ? t.physical_quantity : '—'}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: parseFloat(variance) < 0 ? 'var(--color-danger-text)' : 'var(--color-success-text)' }}>
                                  {variance}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                {!isConfirmed && (
                  <button className="btn btn-secondary" onClick={() => setStep(3)}>
                    <ChevronLeft size={16} />
                    <span>Back to Editing</span>
                  </button>
                )}
                {!isConfirmed && canConfirm && validationResult?.ready && (
                  <button className="btn btn-success" onClick={handleConfirmBatch} disabled={actionLoading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle size={16} />
                    <span>{actionLoading ? 'Confirming...' : 'Confirm and Lock Balances'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

// Simple Clock Icon replacement
const ClockIcon = Clock;
