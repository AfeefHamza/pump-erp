import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  fetchForecourtStructure,
  updateNozzle,
  type ForecourtStructureResponse,
  type ForecourtTankItem
} from '@/api/client';
import { RefreshCw, LayoutGrid, Database, Wrench, AlertTriangle, Plus, Link, Settings, AlertCircle, Edit, Fuel, X } from 'lucide-react';

export const ForecourtSetup: React.FC = () => {
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  // States
  const [structure, setStructure] = useState<ForecourtStructureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Modal for changing nozzle tank connection
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [selectedNozzle, setSelectedNozzle] = useState<{
    id: string;
    code: string;
    name: string;
    tankId: string;
  } | null>(null);
  const [targetTankId, setTargetTankId] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Permissions
  const canTankView = usePermission('tank.view');
  const canTankCreate = usePermission('tank.create');
  const canTankUpdate = usePermission('tank.update');

  const canDispenserView = usePermission('dispenser.view');
  const canDispenserCreate = usePermission('dispenser.create');
  const canDispenserUpdate = usePermission('dispenser.update');

  const canNozzleCreate = usePermission('nozzle.create');
  const canNozzleUpdate = usePermission('nozzle.update');

  // Load Forecourt layout
  const loadStructure = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId) return;
    setLoading(true);
    try {
      const data = await fetchForecourtStructure(selectedOrgId, selectedOutletId);
      setStructure(data);
      calculateConfigurationWarnings(data);
    } catch (err) {
      console.error('Failed to load forecourt layout:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId]);

  useEffect(() => {
    loadStructure();
  }, [loadStructure]);

  // Validation Warnings Check
  const calculateConfigurationWarnings = (data: ForecourtStructureResponse) => {
    const list: string[] = [];

    // 1. Unconnected Nozzles
    const unconnectedNozzles: string[] = [];
    data.dispensers.forEach((d) => {
      d.nozzles.forEach((n) => {
        if (!n.tank || !n.tank.id) {
          unconnectedNozzles.push(`${d.code} - ${n.code}`);
        }
      });
    });
    if (unconnectedNozzles.length > 0) {
      list.push(`${unconnectedNozzles.length} nozzle(s) have no storage tank mapped (e.g. ${unconnectedNozzles.slice(0, 2).join(', ')}).`);
    }

    // 2. Dispensers without nozzles
    const emptyDispensers = data.dispensers.filter((d) => d.nozzles.length === 0);
    if (emptyDispensers.length > 0) {
      list.push(`${emptyDispensers.length} dispenser(s) contain no mapped nozzles (e.g. ${emptyDispensers.map(d => d.code).join(', ')}).`);
    }

    // 3. Tanks with no nozzles attached
    const nozzleTankIds = new Set<string>();
    data.dispensers.forEach((d) => {
      d.nozzles.forEach((n) => {
        if (n.tank && n.tank.id) {
          nozzleTankIds.add(n.tank.id);
        }
      });
    });
    const unmappedTanks = data.tanks.filter((t) => !nozzleTankIds.has(t.id));
    if (unmappedTanks.length > 0) {
      list.push(`${unmappedTanks.length} storage tank(s) supply no nozzles (e.g. ${unmappedTanks.map(t => t.code).join(', ')}).`);
    }

    setWarnings(list);
  };

  // Group Tanks by Fuel Product Category / Name
  const getTanksGroupedByProduct = () => {
    if (!structure) return {};
    const grouped: Record<string, { productName: string; tanks: ForecourtTankItem[] }> = {};
    structure.tanks.forEach((tank) => {
      const prodName = tank.product.name;
      if (!grouped[prodName]) {
        grouped[prodName] = {
          productName: prodName,
          tanks: []
        };
      }
      grouped[prodName].tanks.push(tank);
    });
    return grouped;
  };

  // Open mapping editor modal
  const handleOpenConnect = (nozzle: any) => {
    setSelectedNozzle({
      id: nozzle.id,
      code: nozzle.code,
      name: nozzle.name,
      tankId: nozzle.tank?.id || ''
    });
    setTargetTankId(nozzle.tank?.id || '');
    setModalError(null);
    setIsConnectOpen(true);
  };

  // Save nozzle tank connection
  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !selectedOutletId || !selectedNozzle) return;
    setModalLoading(true);
    setModalError(null);

    try {
      await updateNozzle(selectedOrgId, selectedOutletId, selectedNozzle.id, {
        tank: targetTankId
      });
      setIsConnectOpen(false);
      loadStructure();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to save tank mapping.');
    } finally {
      setModalLoading(false);
    }
  };

  if (!selectedOutletId) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', margin: '2rem' }}>
        <LayoutGrid size={48} style={{ color: 'var(--color-accent)', opacity: 0.8, marginBottom: '1rem' }} />
        <h2 className="h3">Select an Outlet</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>Please select an outlet from the sidebar selector to view the forecourt setup layout.</p>
      </div>
    );
  }

  if (!canTankView && !canDispenserView) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', margin: '2rem' }}>
        <LayoutGrid size={48} style={{ color: 'var(--color-danger-text)', opacity: 0.8, marginBottom: '1rem' }} />
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>You do not have the required permissions to view forecourt setup.</p>
      </div>
    );
  }

  const groupedTanks = getTanksGroupedByProduct();

  return (
    <div className="management-page" style={{ minHeight: 'calc(100vh - var(--topbar-height) - var(--space-xl))' }}>
      <div className="management-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="h2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LayoutGrid style={{ color: 'var(--color-accent)' }} size={28} />
            <span>Forecourt Setup</span>
          </h1>
          <p className="text-muted">Operational mapping view of storage tanks, dispenser units, and nozzles at this outlet</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {canTankCreate && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              onClick={() => navigate('/app/inventory/tanks', { state: { openAdd: true } })}
            >
              <Plus size={14} />
              <span>Add Tank</span>
            </button>
          )}
          {canDispenserCreate && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              onClick={() => navigate('/app/inventory/dispensers-nozzles', { state: { openDispenserAdd: true } })}
            >
              <Plus size={14} />
              <span>Add Dispenser</span>
            </button>
          )}
          {canNozzleCreate && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              onClick={() => navigate('/app/inventory/dispensers-nozzles', { state: { openNozzleAdd: true } })}
            >
              <Plus size={14} />
              <span>Add Nozzle</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <RefreshCw className="animate-spin" size={32} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
          <p className="text-muted">Loading forecourt setup mapping...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Warnings List Bar */}
          {warnings.length > 0 && (
            <div className="alert alert-warning" style={{ borderRadius: 'var(--radius-lg)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                <AlertTriangle size={18} />
                <span>Forecourt Configuration Warnings ({warnings.length})</span>
              </div>
              <ul style={{ margin: '0 0 0 1.25rem', padding: 0, fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {warnings.map((w, index) => (
                  <li key={index}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Master View Layout Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem', alignItems: 'start' }}>
            {/* Tanks Group List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h2 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                <Database size={18} style={{ color: 'var(--color-accent)' }} />
                <span>Storage Tanks</span>
              </h2>

              {Object.keys(groupedTanks).map((prodName) => (
                <div key={prodName} className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: '0.95rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Fuel size={16} className="text-muted" />
                      {prodName}
                    </span>
                    <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                      {groupedTanks[prodName].tanks.length} Tanks
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {groupedTanks[prodName].tanks.map((tank) => (
                      <div key={tank.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--bg-body)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {tank.name}
                            <code style={{ marginLeft: '0.4rem', fontSize: '0.8rem', color: 'var(--color-accent)' }}>{tank.code}</code>
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>
                            Capacity: {parseFloat(tank.capacity).toLocaleString('en-IN')} L
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className={`badge ${tank.status === 'active' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>
                            {tank.status}
                          </span>
                          {canTankUpdate && (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.2rem' }}
                              onClick={() => navigate(`/app/inventory/tanks/${tank.id}`)}
                              title="Edit Tank Master"
                            >
                              <Settings size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {structure?.tanks.length === 0 && (
                <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
                  <p className="text-muted">No storage tanks configured at this outlet yet.</p>
                </div>
              )}
            </div>

            {/* Dispensers Tree List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h2 className="h4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                <Wrench size={18} style={{ color: 'var(--color-accent)' }} />
                <span>Dispenser & Nozzle Mapping</span>
              </h2>

              {structure?.dispensers.map((dispenser) => (
                <div key={dispenser.id} className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    <div>
                      <h3 className="h5" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{dispenser.name}</span>
                        <code style={{ fontSize: '0.85rem', color: 'var(--color-accent)' }}>{dispenser.code}</code>
                      </h3>
                      {dispenser.manufacturer && (
                        <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>
                          {dispenser.manufacturer} {dispenser.model_number ? `— ${dispenser.model_number}` : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`badge ${dispenser.status === 'active' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.75rem' }}>
                        {dispenser.status}
                      </span>
                      {canDispenserUpdate && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/app/inventory/dispensers-nozzles`, { state: { editDispenserId: dispenser.id } })}
                          title="Edit Dispenser details"
                        >
                          <Edit size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Nozzles Mapping Rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {dispenser.nozzles.map((nozzle) => (
                      <div key={nozzle.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1.2fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-body)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        {/* Nozzle Info */}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{nozzle.name}</div>
                          <div className="text-muted" style={{ fontSize: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                            <span>Code: {nozzle.code}</span>
                            {nozzle.nozzle_number && <span># {nozzle.nozzle_number}</span>}
                          </div>
                        </div>

                        {/* Flow direction indicator */}
                        <div style={{ color: 'var(--text-muted)' }}>➔</div>

                        {/* Connected Tank Map */}
                        <div>
                          {nozzle.tank && nozzle.tank.id ? (
                            <div>
                              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
                                <Database size={12} className="text-muted" />
                                <span>{nozzle.tank.name} ({nozzle.tank.code})</span>
                              </div>
                              <span className="badge badge-info" style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', marginTop: '0.25rem', display: 'inline-block' }}>
                                {nozzle.tank.product.name}
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--color-danger-text)', fontWeight: 600, fontSize: '0.85rem' }}>
                              <AlertCircle size={14} />
                              <span>No Tank Mapped</span>
                            </div>
                          )}
                        </div>

                        {/* Edit Mapping Action */}
                        <div>
                          {canNozzleUpdate && (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}
                              onClick={() => handleOpenConnect(nozzle)}
                              title="Connect nozzle to tank"
                            >
                              <Link size={12} />
                              <span>Map Tank</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {dispenser.nozzles.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>No nozzles configured on this dispenser yet.</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {structure?.dispensers.length === 0 && (
                <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
                  <p className="text-muted">No fuel dispensers configured at this outlet yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Connect/Map Tank Modal */}
      {isConnectOpen && selectedNozzle && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <form onSubmit={handleSaveConnection} className="card" style={{ width: '100%', maxWidth: '450px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <h3 className="h4" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Link size={18} style={{ color: 'var(--color-accent)' }} />
                <span>Map Nozzle to Storage Tank</span>
              </h3>
              <button type="button" className="btn-close" onClick={() => setIsConnectOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div className="alert alert-danger" style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                {modalError}
              </div>
            )}

            <div>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
                Map tank supply lines for nozzle: <strong>{selectedNozzle.name} ({selectedNozzle.code})</strong>.
              </p>
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                Note: The nozzle's derived fuel product is automatically synced from the selected tank's fuel type.
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Storage Tank *</label>
              <select
                className="form-control"
                value={targetTankId}
                onChange={(e) => setTargetTankId(e.target.value)}
                required
              >
                <option value="">Select tank connection...</option>
                {structure?.tanks.filter(t => t.status === 'active').map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.code}) — Storing: {t.product.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsConnectOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={modalLoading}>
                {modalLoading ? 'Saving...' : 'Save Connection'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
