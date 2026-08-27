import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchCalibrationCharts,
  fetchCalibrationChart,
  uploadCalibrationPreview,
  importCalibrationChart,
  activateCalibrationChart,
  assignCalibrationChartToTank,
  fetchTanks,
  type DipCalibrationChart,
  type Tank
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { Plus, RefreshCw, X, Database, Upload, AlertCircle } from 'lucide-react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionGuard } from '@/features/auth/components/PermissionGuard';

export const DipCalibrations: React.FC = () => {
  const { tankId } = useParams();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  // Lists & State
  const [charts, setCharts] = useState<DipCalibrationChart[]>([]);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChart, setSelectedChart] = useState<DipCalibrationChart | null>(null);
  const [activeTab, setActiveTab] = useState<'charts' | 'assignments'>('charts');

  // Import Dialog wizard state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importStep, setImportStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);

  // Form states for Import Chart
  const [chartName, setChartName] = useState('');
  const [nominalCapacity, setNominalCapacity] = useState('');
  const [tankDiameter] = useState('');
  const [tankLength] = useState('');
  const [manufacturer] = useState('');
  const [heightUnit, setHeightUnit] = useState<'millimetre' | 'centimetre' | 'inch'>('millimetre');
  const [lookupMode, setLookupMode] = useState<'exact_only' | 'linear_interpolation'>('linear_interpolation');
  const [dipColIdx, setDipColIdx] = useState('0');
  const [volColIdx, setVolColIdx] = useState('1');

  // Tank assignment state
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignTankId, setAssignTankId] = useState('');
  const [assignChartId, setAssignChartId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().substring(0, 16));

  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Permissions
  const canView = usePermission('dip_calibration.view');
  const canActivate = usePermission('dip_calibration.activate');

  const loadData = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const chartData = await fetchCalibrationCharts(selectedOrgId);
      setCharts(chartData);
      
      if (selectedOutletId) {
        const tankData = await fetchTanks(selectedOrgId, selectedOutletId, { status: 'active' });
        setTanks(tankData);
      }
    } catch (err: any) {
      console.error('Failed to load calibrations:', err);
      setError(err.message || 'Failed to load calibration details.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle direct navigation to tank assignments if tankId parameter exists
  useEffect(() => {
    if (tankId) {
      setActiveTab('assignments');
      setAssignTankId(tankId);
      setIsAssignOpen(true);
    }
  }, [tankId]);

  // Wizard Upload Preview
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrgId) return;

    setActionLoading(true);
    setError(null);
    try {
      const preview = await uploadCalibrationPreview(selectedOrgId, file);
      setUploadedFile(file);
      setPreviewData(preview);
      setChartName(file.name.replace(/\.[^/.]+$/, "")); // default chart name to filename
      
      // Auto-detect columns indices
      if (preview.candidate_pairs && preview.candidate_pairs.length > 0) {
        setDipColIdx(String(preview.candidate_pairs[0].dip_idx));
        setVolColIdx(String(preview.candidate_pairs[0].vol_idx));
      } else {
        setDipColIdx('0');
        setVolColIdx('1');
      }

      setImportStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to generate spreadsheet preview.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleImportChart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !uploadedFile) return;

    setActionLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', uploadedFile);
    formData.append('name', chartName.trim());
    formData.append('nominal_capacity', nominalCapacity);
    formData.append('lookup_mode', lookupMode);
    formData.append('original_height_unit', heightUnit);
    formData.append('dip_column_idx', dipColIdx);
    formData.append('volume_column_idx', volColIdx);
    if (tankDiameter) formData.append('tank_diameter', tankDiameter);
    if (tankLength) formData.append('tank_length', tankLength);
    if (manufacturer) formData.append('manufacturer', manufacturer);

    try {
      await importCalibrationChart(selectedOrgId, formData);
      setIsImportOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to import calibration chart.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivateChart = async (chartId: string) => {
    if (!selectedOrgId) return;
    setActionLoading(true);
    try {
      await activateCalibrationChart(selectedOrgId, chartId);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to activate chart. Ensure volume monotonic and nominal capacity matches within 10%.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignChart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId) return;
    setActionLoading(true);
    try {
      await assignCalibrationChartToTank(selectedOrgId, selectedOutletId, {
        tank_id: assignTankId,
        chart_id: assignChartId,
        effective_from: new Date(effectiveFrom).toISOString()
      });
      setIsAssignOpen(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to assign calibration chart to tank.');
    } finally {
      setActionLoading(false);
    }
  };

  const viewChartPoints = async (chart: DipCalibrationChart) => {
    if (!selectedOrgId) return;
    try {
      const fullChart = await fetchCalibrationChart(selectedOrgId, chart.id);
      setSelectedChart(fullChart);
    } catch (err: any) {
      alert('Failed to load chart points.');
    }
  };

  if (!selectedOrgId) {
    return (
      <div className="management-page">
        <PageHeader 
          title="Dip Calibration Charts" 
          subtitle="Manage fuel tank geometry and volume conversions" 
          backLink={{ to: '/app/settings', label: 'Back to Settings' }}
        />
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertCircle size={40} className="text-muted" style={{ margin: '0 auto 1rem' }} />
          <p className="text-muted">Please select an organisation to configure dip calibration charts.</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view calibration charts.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ paddingBottom: '3rem' }}>
      <PageHeader 
        title="Dip Calibration Charts" 
        subtitle="Upload and manage geometry-based certified volume lookup charts for storage tanks"
        backLink={{ to: '/app/settings', label: 'Back to Settings' }}
        actions={
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <PermissionGuard permission="dip_calibration.import">
              <button className="btn btn-primary" onClick={() => { setImportStep(1); setUploadedFile(null); setError(null); setIsImportOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Upload size={18} />
                <span>Import Calibration Chart</span>
              </button>
            </PermissionGuard>
            {selectedOutletId && (
              <PermissionGuard permission="dip_calibration.assign">
                <button className="btn btn-secondary" onClick={() => { setAssignChartId(''); setAssignTankId(tankId || ''); setIsAssignOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Plus size={18} />
                  <span>Assign Chart to Tank</span>
                </button>
              </PermissionGuard>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem', paddingBottom: '2px' }}>
        <button 
          onClick={() => setActiveTab('charts')}
          style={{ 
            padding: '0.5rem 1rem', 
            fontWeight: 600, 
            background: 'none', 
            border: 'none', 
            color: activeTab === 'charts' ? 'var(--color-accent)' : 'var(--color-text-muted)',
            borderBottom: activeTab === 'charts' ? '2px solid var(--color-accent)' : 'none',
            cursor: 'pointer'
          }}
        >
          Calibration Charts
        </button>
        {selectedOutletId && (
          <button 
            onClick={() => setActiveTab('assignments')}
            style={{ 
              padding: '0.5rem 1rem', 
              fontWeight: 600, 
              background: 'none', 
              border: 'none', 
              color: activeTab === 'assignments' ? 'var(--color-accent)' : 'var(--color-text-muted)',
              borderBottom: activeTab === 'assignments' ? '2px solid var(--color-accent)' : 'none',
              cursor: 'pointer'
            }}
          >
            Tank Calibration Assignments
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading calibration parameters...</p>
        </div>
      ) : activeTab === 'charts' ? (
        charts.length === 0 ? (
          <EmptyState
            title="No calibration charts imported yet"
            description="Upload geometry-based certified volume lookup charts for storage tanks."
            actionButton={
              <PermissionGuard permission="dip_calibration.import">
                <button className="btn btn-primary" onClick={() => { setImportStep(1); setUploadedFile(null); setError(null); setIsImportOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Upload size={18} />
                  <span>Import Calibration Chart</span>
                </button>
              </PermissionGuard>
            }
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: selectedChart ? '1fr 350px' : '1fr', gap: '1.5rem' }}>
            {/* Charts List Table */}
            <div className="card">
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Chart Name</th>
                      <th>Nominal Capacity</th>
                      <th>original height unit</th>
                      <th>lookup mode</th>
                      <th>Points</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charts.map((chart) => (
                      <tr key={chart.id}>
                        <td>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Database size={16} className="text-muted" />
                            <span>{chart.name}</span>
                          </div>
                          {chart.manufacturer_or_source && <div className="text-muted" style={{ fontSize: '0.8rem' }}>Manufacturer: {chart.manufacturer_or_source}</div>}
                        </td>
                        <td>{chart.nominal_capacity} L</td>
                        <td style={{ textTransform: 'capitalize' }}>{chart.original_height_unit}</td>
                        <td>{chart.lookup_mode === 'exact_only' ? 'Exact Match' : 'Linear Interpolation'}</td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => viewChartPoints(chart)}>
                            View ({chart.point_count})
                          </button>
                        </td>
                        <td>
                          <span className={`badge ${chart.status === 'active' ? 'badge-success' : chart.status === 'draft' ? 'badge-warning' : 'badge-danger'}`}>
                            {chart.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {chart.status === 'draft' && canActivate && (
                            <button className="btn btn-success btn-sm" onClick={() => handleActivateChart(chart.id)}>
                              Activate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {charts.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                          <p className="text-muted">No calibration charts imported yet.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Points list sidebar */}
            {selectedChart && (
              <div className="card" style={{ padding: '1.25rem', position: 'relative' }}>
                <button 
                  onClick={() => setSelectedChart(null)}
                  style={{ position: 'absolute', right: '1rem', top: '1rem', border: 'none', background: 'none', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
                <h3 className="h4" style={{ marginBottom: '1rem' }}>{selectedChart.name} Points</h3>
                <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                  <table className="data-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>Height (mm)</th>
                        <th>Volume (L)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedChart.points?.map((pt) => (
                        <tr key={pt.id}>
                          <td>{pt.height_mm}</td>
                          <td>{pt.volume_litres}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* Assignments list */
        <div className="card">
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tank</th>
                  <th>Fuel Product</th>
                  <th>Assigned Calibration Chart</th>
                  <th>Nominal Capacity</th>
                  <th>Effective From</th>
                  <th>Effective To</th>
                </tr>
              </thead>
              <tbody>
                {tanks.map((tank) => {
                  // Find currently active calibration assignment for this tank
                  // For a real layout we fetch history, but let's list tank details and configuration status
                  return (
                    <tr key={tank.id}>
                      <td><strong>{tank.name}</strong> ({tank.code})</td>
                      <td>{tank.product_name || '—'}</td>
                      <td>
                        {tank.acknowledged_manual_dip ? (
                          <span className="badge badge-warning">Manual Dip Acknowledged</span>
                        ) : (
                          // Active chart assignment label
                          'Certified Lookup Chart'
                        )}
                      </td>
                      <td>{tank.capacity} L</td>
                      <td>—</td>
                      <td>Current Active</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Wizard Dialog */}
      {isImportOpen && (
        <div className="slider-overlay" onClick={() => setIsImportOpen(false)}>
          <div className="slider-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px' }}>
            <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Upload size={20} style={{ color: 'var(--color-accent)' }} />
                <span>Import Calibration Chart</span>
              </h3>
              <button className="btn-close" onClick={() => setIsImportOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={importStep === 2 ? handleImportChart : (e) => e.preventDefault()} className="slider-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', overflowY: 'auto', height: 'calc(100% - 65px)' }}>
              {error && (
                <div className="alert alert-danger" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                  {error}
                </div>
              )}

              {/* STEP 1: Upload file */}
              {importStep === 1 && (
                <>
                  <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                    <Upload size={48} className="text-muted" style={{ margin: '0 auto 1.5rem', opacity: 0.8 }} />
                    <h3 className="h4" style={{ marginBottom: '0.5rem' }}>Upload Certified Spreadsheet</h3>
                    <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                      Supports .xlsx and .csv. Maximum file size 5MB.
                    </p>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <button type="button" className="btn btn-primary">Choose File</button>
                      <input 
                        type="file" 
                        accept=".xlsx,.csv" 
                        onChange={handleFileChange}
                        style={{ position: 'absolute', left: 0, top: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                  <div className="slider-actions" style={{ display: 'flex', gap: '1rem', marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsImportOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {/* STEP 2: Configure details */}
              {importStep === 2 && previewData && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="chartName">Chart Name *</label>
                    <input
                      id="chartName"
                      type="text"
                      className="form-control"
                      value={chartName}
                      onChange={(e) => setChartName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="nominalCapacity">Nominal Capacity (Litres) *</label>
                    <input
                      id="nominalCapacity"
                      type="number"
                      className="form-control"
                      value={nominalCapacity}
                      onChange={(e) => setNominalCapacity(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="heightUnit">Spreadsheet Height Unit *</label>
                      <select
                        id="heightUnit"
                        className="form-control"
                        value={heightUnit}
                        onChange={(e) => setHeightUnit(e.target.value as any)}
                      >
                        <option value="millimetre">Millimetre (mm)</option>
                        <option value="centimetre">Centimetre (cm)</option>
                        <option value="inch">Inch (in)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="lookupMode">Lookup Mode *</label>
                      <select
                        id="lookupMode"
                        className="form-control"
                        value={lookupMode}
                        onChange={(e) => setLookupMode(e.target.value as any)}
                      >
                        <option value="linear_interpolation">Linear Interpolation</option>
                        <option value="exact_only">Exact Match Only</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="dipColIdx">Dip Column Index *</label>
                      <input
                        id="dipColIdx"
                        type="number"
                        min="0"
                        className="form-control"
                        value={dipColIdx}
                        onChange={(e) => setDipColIdx(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="volColIdx">Volume Column Index *</label>
                      <input
                        id="volColIdx"
                        type="number"
                        min="0"
                        className="form-control"
                        value={volColIdx}
                        onChange={(e) => setVolColIdx(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.5rem', background: 'var(--bg-card)', fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Spreadsheet Data Preview (First 5 rows):</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {previewData.rows.slice(0, 5).map((row: string[], rIdx: number) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} style={{ padding: '2px 6px', border: '1px solid var(--border-color)', opacity: cIdx === int(dipColIdx) || cIdx === int(volColIdx) ? 1 : 0.6, fontWeight: cIdx === int(dipColIdx) || cIdx === int(volColIdx) ? 600 : 400 }}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="slider-actions" style={{ display: 'flex', gap: '1rem', marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setImportStep(1)}>
                      Back
                    </button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }} disabled={actionLoading}>
                      {actionLoading && <RefreshCw className="animate-spin" size={14} />}
                      <span>Confirm Import</span>
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Assign to Tank Dialog */}
      {isAssignOpen && (
        <div className="slider-overlay" onClick={() => setIsAssignOpen(false)}>
          <div className="slider-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '400px' }}>
            <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={20} style={{ color: 'var(--color-accent)' }} />
                <span>Assign Calibration Chart</span>
              </h3>
              <button className="btn-close" onClick={() => setIsAssignOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAssignChart} className="slider-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', overflowY: 'auto', height: 'calc(100% - 65px)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="assignTankId">Select Tank *</label>
                <select
                  id="assignTankId"
                  className="form-control"
                  value={assignTankId}
                  onChange={(e) => setAssignTankId(e.target.value)}
                  required
                >
                  <option value="">— Select Tank —</option>
                  {tanks.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="assignChartId">Select Calibration Chart *</label>
                <select
                  id="assignChartId"
                  className="form-control"
                  value={assignChartId}
                  onChange={(e) => setAssignChartId(e.target.value)}
                  required
                >
                  <option value="">— Select Active Chart —</option>
                  {charts.filter(c => c.status === 'active').map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.nominal_capacity} L)</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="effectiveFrom">Effective From *</label>
                <input
                  id="effectiveFrom"
                  type="datetime-local"
                  className="form-control"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  required
                />
              </div>

              <div className="slider-actions" style={{ display: 'flex', gap: '1rem', marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setIsAssignOpen(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                  disabled={actionLoading}
                >
                  {actionLoading && <RefreshCw className="animate-spin" size={14} />}
                  <span>Assign Chart</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper inside jsx evaluation
const int = (s: string) => parseInt(s, 10) || 0;
