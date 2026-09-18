import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchOperationalReportPack } from '@/api/client';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import type { OperationalReportPack } from '@/features/reports/types';

type Section = 'shifts' | 'meters' | 'dips' | 'receipts' | 'credit_slips' | 'expenses';
const sections: Array<{ key: Section; label: string }> = [
  { key: 'shifts', label: 'Shift Cards' },
  { key: 'meters', label: 'Meter Readings' },
  { key: 'dips', label: 'Dip Readings' },
  { key: 'receipts', label: 'Tanker Receipts' },
  { key: 'credit_slips', label: 'Credit Slips' },
  { key: 'expenses', label: 'Expenses' },
];
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
const qty = (value: string) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const OperationalRegistersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('section');
  const section: Section = sections.some((item) => item.key === requested) ? requested as Section : 'shifts';
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const initial = { from_date: today(), to_date: today() };
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [data, setData] = useState<OperationalReportPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !outletId) return;
    setLoading(true);
    try {
      setData(await fetchOperationalReportPack(orgId, outletId, filters));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load the operational report.');
    } finally {
      setLoading(false);
    }
  }, [orgId, outletId, filters]);
  useEffect(() => { load(); }, [load]);

  if (!orgId || !outletId) return <div className="card" style={{ margin: 24, padding: 32 }}>Select an outlet to view reports.</div>;
  const active = data?.[section];
  const selectSection = (next: Section) => {
    const params = new URLSearchParams(searchParams);
    params.set('section', next);
    setSearchParams(params);
  };

  return <div className="report-register-page">
    <PageHeader title="Operations & Inventory Reports" subtitle={data?.basis || 'Recorded operational source registers.'} backLink={{ to: '/app/reports', label: 'Back to Reports' }}/>
    {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
    <div className="card report-filter-bar">
      <label>From<input className="input" type="date" value={draft.from_date} onChange={(event) => setDraft({ ...draft, from_date: event.target.value })}/></label>
      <label>To<input className="input" type="date" value={draft.to_date} onChange={(event) => setDraft({ ...draft, to_date: event.target.value })}/></label>
      <button type="button" className="btn btn-primary" disabled={loading} onClick={() => setFilters(draft)}>{loading ? 'Loading…' : 'Apply'}</button>
      <span className="text-muted report-record-count">{active?.count || 0} record(s)</span>
    </div>
    <div className="report-section-tabs">
      {sections.map((item) => <button key={item.key} type="button" className={`btn ${section === item.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => selectSection(item.key)}>{item.label}</button>)}
    </div>
    {active?.truncated && <div className="alert alert-secondary">Showing the first 1,000 rows. Reduce the date range to view all records.</div>}

    {data && section === 'shifts' && <ReportTable headers={['Date / Shift', 'Employee', 'MPD Slip', 'Expected Sales', 'Accounted', 'Difference', 'Status']} empty="No Shift Cards in this period.">
      {data.shifts.rows.map((row) => <tr key={row.card_id} onClick={() => navigate(`/app/operations/shift-cards/entry/${row.card_id}`)}><td><strong>{row.business_date}</strong><div className="text-muted">{row.shift_name}</div></td><td>{row.employee_name}<div className="text-muted">{row.employee_code}</div></td><td>{row.mpd_slip_number || '—'}</td><Money value={row.expected_sales}/><Money value={row.accounted}/><Money value={row.difference}/><td><span className={`status-badge ${row.result === 'balanced' ? 'success' : row.result === 'shortage' ? 'danger' : 'warning'}`}>{row.is_locked ? 'Recorded' : row.result}</span></td></tr>)}
    </ReportTable>}

    {data && section === 'meters' && <ReportTable headers={['Date / Shift', 'Nozzle / Product', 'Employee', 'Opening', 'Closing', 'Testing', 'Net Sale', 'Sale Amount']} empty="No meter readings in this period.">
      {data.meters.rows.map((row) => <tr key={row.meter_id} onClick={() => navigate(`/app/operations/shift-cards/entry/${row.card_id}`)}><td><strong>{row.business_date}</strong><div className="text-muted">{row.shift_name}</div></td><td><strong>{row.nozzle_code}</strong><div className="text-muted">{row.product_name} · {row.tank_code}</div></td><td>{row.employee_name}</td><Quantity value={row.opening}/><Quantity value={row.closing}/><Quantity value={row.testing}/><Quantity value={row.sale_quantity}/><Money value={row.sale_amount}/></tr>)}
    </ReportTable>}

    {data && section === 'dips' && <ReportTable headers={['Date / Shift', 'Tank / Product', 'Reading Type', 'Raw Dip', 'Converted Stock', 'Density', 'Method']} empty="No dip readings in this period.">
      {data.dips.rows.map((row) => <tr key={row.dip_id} onClick={() => navigate('/app/operations/dip-readings')}><td><strong>{row.business_date}</strong><div className="text-muted">{row.shift_name}</div></td><td><strong>{row.tank_code}</strong><div className="text-muted">{row.product_name}</div></td><td>{row.observation_type}</td><td style={{ textAlign: 'right' }}>{row.raw_value} {row.raw_unit}</td><Quantity value={row.quantity}/><td style={{ textAlign: 'right' }}>{row.density || '—'}</td><td>{row.conversion_method.replaceAll('_', ' ')}</td></tr>)}
    </ReportTable>}

    {data && section === 'receipts' && <ReportTable headers={['Date / Receipt', 'Supplier', 'Invoice / Vehicle', 'Products', 'Invoice Qty', 'Accepted Qty', 'Value', 'Status']} empty="No tanker receipts in this period.">
      {data.receipts.rows.map((row) => <tr key={row.receipt_id} onClick={() => navigate(`/app/purchases/tanker-receipts/${row.receipt_id}`)}><td><strong>{row.receipt_number}</strong><div className="text-muted">{row.business_date}</div></td><td>{row.supplier_name}</td><td>{row.invoice_number}<div className="text-muted">{row.vehicle_registration}</div></td><td>{row.products}</td><Quantity value={row.invoice_quantity}/><Quantity value={row.accepted_quantity}/><Money value={row.value}/><td>{row.status}</td></tr>)}
    </ReportTable>}

    {data && section === 'credit_slips' && <><ReportTotal label="Active credit slips" count={data.credit_slips.count} total={data.credit_slips.total}/><ReportTable headers={['Date / Slip', 'Customer', 'Employee / Shift', 'Product', 'Vehicle', 'Quantity', 'Rate', 'Amount']} empty="No active credit slips in this period.">
      {data.credit_slips.rows.map((row) => <tr key={row.slip_id} onClick={() => navigate(`/app/sales/credit-slips/${row.slip_id}`)}><td><strong>{row.slip_number}</strong><div className="text-muted">{row.business_date}</div></td><td>{row.customer_name}</td><td>{row.employee_name}<div className="text-muted">{row.shift_name}</div></td><td>{row.product_name}</td><td>{row.vehicle_number || '—'}</td><Quantity value={row.quantity}/><Money value={row.unit_price}/><Money value={row.amount}/></tr>)}
    </ReportTable></>}

    {data && section === 'expenses' && <><ReportTotal label="Recorded expenses" count={data.expenses.count} total={data.expenses.total}/><ReportTable headers={['Date / Expense', 'Category', 'Paid From', 'Payee', 'Reference', 'Amount']} empty="No active expenses in this period.">
      {data.expenses.rows.map((row) => <tr key={row.expense_id} onClick={() => navigate(`/app/finance/expenses/${row.expense_id}`)}><td><strong>{row.expense_number}</strong><div className="text-muted">{row.expense_date}</div></td><td>{row.category}</td><td>{row.payment_account}</td><td>{row.payee || '—'}</td><td>{row.reference_number || '—'}</td><Money value={row.amount}/></tr>)}
    </ReportTable></>}
  </div>;
};

const ReportTotal: React.FC<{ label: string; count: number; total: string }> = ({ label, count, total }) => <div className="report-total-strip"><div><span className="text-muted">{label}</span><strong>{count}</strong></div><div><span className="text-muted">Total amount</span><strong>{money(total)}</strong></div></div>;
const Money: React.FC<{ value: string }> = ({ value }) => <td style={{ textAlign: 'right', fontWeight: 650 }}>{money(value)}</td>;
const Quantity: React.FC<{ value: string }> = ({ value }) => <td style={{ textAlign: 'right' }}>{qty(value)}</td>;
const ReportTable: React.FC<{ headers: string[]; empty: string; children: React.ReactNode }> = ({ headers, empty, children }) => {
  const hasRows = React.Children.count(children) > 0;
  return <div className="card report-data-card"><table className="data-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{hasRows ? children : <tr><td colSpan={headers.length} className="report-empty-cell">{empty}</td></tr>}</tbody></table></div>;
};
