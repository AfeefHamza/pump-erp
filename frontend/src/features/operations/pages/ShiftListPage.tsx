import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import {
  fetchShiftCardsList,
  fetchShiftDefinitions,
  type EmployeeShiftCardItem,
  type ShiftDefinition
} from '@/api/client';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import {
  Plus,
  RefreshCw,
  Lock,
  Unlock,
  FileText
} from 'lucide-react';

export const ShiftListPage: React.FC = () => {
  const navigate = useNavigate();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const canOpenShift = usePermission('shift.open');
  const canViewShift = usePermission('shift.view');

  const [cardsList, setCardsList] = useState<EmployeeShiftCardItem[]>([]);
  const [shiftDefinitions, setShiftDefinitions] = useState<ShiftDefinition[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'void'>('all');
  const [selectedShiftDefFilter, setSelectedShiftDefFilter] = useState<string>('');
  const [businessDateFilter, setBusinessDateFilter] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    if (!selectedOrgId || !selectedOutletId || !canViewShift) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchShiftCardsList(selectedOrgId, selectedOutletId, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        shift_definition_id: selectedShiftDefFilter || undefined,
        business_date: businessDateFilter || undefined,
      });
      setCardsList(data || []);
    } catch (err: any) {
      console.error('Failed to load shift cards:', err);
      setError(err.message || 'Failed to fetch shift cards.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, selectedOutletId, canViewShift, statusFilter, selectedShiftDefFilter, businessDateFilter]);

  useEffect(() => {
    if (!selectedOrgId || !selectedOutletId) return;
    fetchShiftDefinitions(selectedOrgId, selectedOutletId)
      .then((res) => setShiftDefinitions(res.shifts || []))
      .catch((err) => console.error('Failed to load shift definitions:', err));
  }, [selectedOrgId, selectedOutletId]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  if (!canViewShift) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', margin: '2rem' }}>
        <h2 className="h3">Permission Denied</h2>
        <p className="text-muted">You do not have permission to view shift cards.</p>
      </div>
    );
  }

  return (
    <div className="management-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <PageHeader
          title="Shift Cards & Operations"
          subtitle="Document-based daily shift card entry, meter readings, collection accounting, and parent shift reconciliation."
        />

        {canOpenShift && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/app/operations/shift-cards/entry')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, padding: '0.65rem 1.25rem' }}
          >
            <Plus size={18} /> + New Shift Card
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#991b1b', padding: '0.85rem 1.25rem', borderRadius: '6px', marginBottom: '1.25rem' }}>
          {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div
        className="card"
        style={{
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          background: '#fff'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Date:</label>
          <input
            type="date"
            className="form-control"
            style={{ width: '160px', padding: '0.4rem 0.6rem' }}
            value={businessDateFilter}
            onChange={(e) => setBusinessDateFilter(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Shift:</label>
          <select
            className="form-control"
            style={{ width: '180px', padding: '0.4rem 0.6rem' }}
            value={selectedShiftDefFilter}
            onChange={(e) => setSelectedShiftDefFilter(e.target.value)}
          >
            <option value="">All Shifts</option>
            {shiftDefinitions.map((sd) => (
              <option key={sd.id} value={sd.id}>
                {sd.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Status:</label>
          <select
            className="form-control"
            style={{ width: '130px', padding: '0.4rem 0.6rem' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="void">Void Only</option>
          </select>
        </div>

        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            setBusinessDateFilter('');
            setSelectedShiftDefFilter('');
            setStatusFilter('all');
          }}
          style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem', marginLeft: 'auto' }}
        >
          Reset Filters
        </button>

        <button
          type="button"
          className="btn btn-outline"
          onClick={loadCards}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem' }}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Shift Cards Table */}
      <div className="card" style={{ padding: '1.25rem', background: '#fff' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            Loading shift cards...
          </div>
        ) : cardsList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
            <FileText size={48} color="#94a3b8" style={{ marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#334155', margin: '0 0 0.5rem 0' }}>
              No Shift Cards Found
            </h3>
            <p className="text-muted" style={{ maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
              No employee shift cards match the selected filters. Click below to enter a new Shift Card.
            </p>
            {canOpenShift && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/app/operations/shift-cards/entry')}
              >
                <Plus size={16} /> Enter New Shift Card
              </button>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem' }}>Business Date & Shift</th>
                  <th style={{ padding: '0.75rem' }}>Card #</th>
                  <th style={{ padding: '0.75rem' }}>Attendant (DSM)</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Fuel Sold (L)</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Sales Amount (₹)</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Accounted (₹)</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Discrepancy (₹)</th>
                  <th style={{ padding: '0.75rem' }}>Shift Lock</th>
                  <th style={{ padding: '0.75rem' }}>Card Status</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cardsList.map((card) => {
                  const diff = card.difference_amount || 0;
                  const isBal = Math.abs(diff) < 0.01;
                  const isExcess = diff > 0;
                  return (
                    <tr key={card.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontWeight: 600 }}>{card.parent_shift.business_date}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {card.parent_shift.shift_definition.name} ({card.parent_shift.shift_definition.starts_at} - {card.parent_shift.shift_definition.ends_at})
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem', fontWeight: 700 }}>
                        #{card.sequence}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontWeight: 600 }}>{card.employee.display_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{card.employee.employee_code}</div>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>
                        {parseFloat(card.total_litres_sold as any || '0').toFixed(3)} L
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        ₹{parseFloat(card.total_sale_amount as any || '0').toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>
                        ₹{parseFloat(card.total_collected_amount as any || '0').toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        {isBal ? (
                          <span style={{ color: '#065f46', fontWeight: 600 }}>Balanced</span>
                        ) : isExcess ? (
                          <span style={{ color: '#d97706', fontWeight: 700 }}>+₹{diff.toFixed(2)} Excess</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 700 }}>-₹{Math.abs(diff).toFixed(2)} Shortage</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {card.parent_shift?.is_locked ? (
                          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                            <Lock size={12} /> Locked
                          </span>
                        ) : (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                            <Unlock size={12} /> Open
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span className={`badge ${card.status === 'active' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.75rem' }}>
                          {card.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => navigate(`/app/operations/shift-cards/entry/${card.id}`)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => navigate(`/app/operations/shift-cards/parent/${card.parent_shift.id}`)}
                            title="View Parent Shift Overview"
                          >
                            Shift Overview
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
