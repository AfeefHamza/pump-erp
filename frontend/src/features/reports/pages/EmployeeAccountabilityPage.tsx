import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchEmployeeAccountabilityReport, fetchEmployees, type Employee } from '@/api/client';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import type { EmployeeAccountabilityReport } from '@/features/reports/types';

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));

export const EmployeeAccountabilityPage: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const initial = { from_date: today(), to_date: today(), employee_id: '' };
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [data, setData] = useState<EmployeeAccountabilityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (orgId && outletId) fetchEmployees(orgId, { outlet: outletId, status: 'active' }).then(setEmployees).catch(() => setEmployees([]));
  }, [orgId, outletId]);
  const load = useCallback(async () => {
    if (!orgId || !outletId) return;
    setLoading(true);
    try {
      setData(await fetchEmployeeAccountabilityReport(orgId, outletId, {
        from_date: filters.from_date, to_date: filters.to_date,
        ...(filters.employee_id ? { employee_id: filters.employee_id } : {}),
      }));
      setError(null);
    } catch (err: any) { setError(err?.data?.detail || err.message || 'Could not load the report.'); }
    finally { setLoading(false); }
  }, [orgId, outletId, filters]);
  useEffect(() => { load(); }, [load]);
  if (!orgId || !outletId) return <div className="card" style={{ margin: 24, padding: 32 }}>Select an organisation and outlet to view reports.</div>;
  return <div style={{ maxWidth: 1550, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Employee Accountability" subtitle={data?.basis || 'Recorded employee settlement responsibility.'} backLink={{ to: '/app/reports', label: 'Back to Reports' }}/>
    {error && <div className="alert alert-error">{error}</div>}
    <div className="card" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 18 }}>
      <label>From<input className="input" type="date" value={draft.from_date} onChange={(event) => setDraft({ ...draft, from_date: event.target.value })}/></label>
      <label>To<input className="input" type="date" value={draft.to_date} onChange={(event) => setDraft({ ...draft, to_date: event.target.value })}/></label>
      <label>Employee<select className="input" value={draft.employee_id} onChange={(event) => setDraft({ ...draft, employee_id: event.target.value })}><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_code} · {employee.display_name}</option>)}</select></label>
      <button className="btn btn-primary" disabled={loading} onClick={() => setFilters(draft)}>{loading ? 'Loading…' : 'Apply'}</button>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 18 }}>
      {[['Employees', String(data?.summary.employee_count || 0)], ['Shift Settlements', String(data?.summary.shift_settlement_count || 0)], ['Total Shortage', money(data?.summary.shortage || '0')], ['Total Excess', money(data?.summary.excess || '0')]].map(([label, value]) => <div className="card" style={{ padding: 16 }} key={label}><div className="text-muted">{label}</div><strong style={{ fontSize: 21 }}>{value}</strong></div>)}
    </div>
    <div className="card" style={{ overflowX: 'auto', marginBottom: 18 }}>
      <div style={{ padding: '16px 18px 8px' }}><strong>Employee summary</strong></div>
      <table className="data-table"><thead><tr><th>Employee</th><th>Shifts</th><th style={{ textAlign: 'right' }}>Sales</th><th style={{ textAlign: 'right' }}>Cash</th><th style={{ textAlign: 'right' }}>Digital</th><th style={{ textAlign: 'right' }}>Credit</th><th style={{ textAlign: 'right' }}>Shortage</th><th style={{ textAlign: 'right' }}>Excess</th></tr></thead><tbody>
        {!data?.employees.length ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30 }}>No recorded employee settlements found.</td></tr> : data.employees.map((row) => <tr key={row.employee_id}><td><strong>{row.employee_name}</strong><div className="text-muted">{row.employee_code}</div></td><td>{row.shift_count}</td><td style={{ textAlign: 'right' }}>{money(row.expected_sales)}</td><td style={{ textAlign: 'right' }}>{money(row.cash)}</td><td style={{ textAlign: 'right' }}>{money(row.digital)}</td><td style={{ textAlign: 'right' }}>{money(row.credit)}</td><td style={{ textAlign: 'right' }}>{money(row.shortage)}</td><td style={{ textAlign: 'right' }}>{money(row.excess)}</td></tr>)}
      </tbody></table>
    </div>
    <div className="card" style={{ overflowX: 'auto' }}>
      <div style={{ padding: '16px 18px 8px' }}><strong>Shift-level accountability</strong><div className="text-muted">Select a row to inspect the underlying Shift Card.</div></div>
      <table className="data-table"><thead><tr><th>Date / Shift</th><th>Employee</th><th style={{ textAlign: 'right' }}>Expected</th><th style={{ textAlign: 'right' }}>Accounted</th><th style={{ textAlign: 'right' }}>Cash</th><th style={{ textAlign: 'right' }}>Card / UPI / Fleet</th><th style={{ textAlign: 'right' }}>Credit</th><th>Result</th></tr></thead><tbody>
        {!data?.details.length ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30 }}>No accountability details found.</td></tr> : data.details.map((row) => <tr key={row.settlement_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/operations/shift-cards/entry/${row.shift_card_id}`)}><td><strong>{row.business_date}</strong><div className="text-muted">{row.shift_name}</div></td><td>{row.employee_name}<div className="text-muted">{row.employee_code}</div></td><td style={{ textAlign: 'right' }}>{money(row.expected_sales)}</td><td style={{ textAlign: 'right' }}>{money(row.accounted)}</td><td style={{ textAlign: 'right' }}>{money(row.cash)}</td><td style={{ textAlign: 'right' }}>{money(row.card)} / {money(row.upi)} / {money(row.fleet_card)}</td><td style={{ textAlign: 'right' }}>{money(row.credit)}</td><td><span className={`status-badge ${row.result === 'balanced' ? 'success' : row.result === 'shortage' ? 'danger' : 'warning'}`}>{row.result}</span></td></tr>)}
      </tbody></table>
    </div>
  </div>;
};
