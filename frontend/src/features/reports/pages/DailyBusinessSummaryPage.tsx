import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDailyBusinessSummary } from '@/api/client';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import type { DailyBusinessSummary } from '@/features/reports/types';

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));

export const DailyBusinessSummaryPage: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [draft, setDraft] = useState({ from_date: today(), to_date: today() });
  const [filters, setFilters] = useState(draft);
  const [data, setData] = useState<DailyBusinessSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!orgId || !outletId) return;
    setLoading(true);
    try { setData(await fetchDailyBusinessSummary(orgId, outletId, filters)); setError(null); }
    catch (err: any) { setError(err?.data?.detail || err.message || 'Could not load the report.'); }
    finally { setLoading(false); }
  }, [orgId, outletId, filters]);
  useEffect(() => { load(); }, [load]);
  if (!orgId || !outletId) return <div className="card" style={{ margin: 24, padding: 32 }}>Select an organisation and outlet to view reports.</div>;
  const summary = data?.summary;
  const cards = [
    ['Total Sales', summary?.sales_total], ['Fuel Sales', summary?.fuel_sales],
    ['Cash Collected', summary?.cash_collections], ['Digital Collections', summary?.digital_collections],
    ['Credit Sales', summary?.credit_sales], ['Shift Expenses', summary?.shift_expenses],
    ['Shortage', summary?.shortage], ['Excess', summary?.excess],
  ];
  return <div style={{ maxWidth: 1500, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Daily Business Summary" subtitle={data?.basis || 'Recorded shift and business totals.'} backLink={{ to: '/app/reports', label: 'Back to Reports' }}/>
    {error && <div className="alert alert-error">{error}</div>}
    <div className="card" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 18 }}>
      <label>From<input className="input" type="date" value={draft.from_date} onChange={(event) => setDraft({ ...draft, from_date: event.target.value })}/></label>
      <label>To<input className="input" type="date" value={draft.to_date} onChange={(event) => setDraft({ ...draft, to_date: event.target.value })}/></label>
      <button className="btn btn-primary" disabled={loading} onClick={() => setFilters(draft)}>{loading ? 'Loading…' : 'Apply'}</button>
      <span className="text-muted" style={{ marginLeft: 'auto' }}>{summary?.recorded_shift_count || 0} recorded shifts</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 18 }}>
      {cards.map(([label, value]) => <div className="card" style={{ padding: 16 }} key={label}><div className="text-muted">{label}</div><strong style={{ fontSize: 21 }}>{money(value || '0')}</strong></div>)}
    </div>
    <div className="card" style={{ marginBottom: 18, overflowX: 'auto' }}>
      <div style={{ padding: '16px 18px 8px' }}><strong>Fuel product summary</strong></div>
      <table className="data-table"><thead><tr><th>Product</th><th style={{ textAlign: 'right' }}>Quantity</th><th>Unit</th><th style={{ textAlign: 'right' }}>Sales</th></tr></thead><tbody>
        {!data?.fuel_products.length ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 28 }}>No recorded fuel sales in this period.</td></tr> : data.fuel_products.map((row) => <tr key={row.product_id}><td><strong>{row.product_name}</strong><div className="text-muted">{row.product_code}</div></td><td style={{ textAlign: 'right' }}>{Number(row.quantity).toLocaleString('en-IN', { minimumFractionDigits: 3 })}</td><td>{row.unit}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(row.amount)}</td></tr>)}
      </tbody></table>
    </div>
    <div className="card" style={{ overflowX: 'auto' }}>
      <div style={{ padding: '16px 18px 8px' }}><strong>Recorded shifts</strong><div className="text-muted">Select a row to open its Shift Cards and accounting posting.</div></div>
      <table className="data-table"><thead><tr><th>Date / Shift</th><th style={{ textAlign: 'right' }}>Fuel Sales</th><th style={{ textAlign: 'right' }}>Cash</th><th style={{ textAlign: 'right' }}>Digital</th><th style={{ textAlign: 'right' }}>Credit</th><th style={{ textAlign: 'right' }}>Short / Excess</th></tr></thead><tbody>
        {!data?.shifts.length ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}>No financially locked shifts found.</td></tr> : data.shifts.map((row) => <tr key={row.posting_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/operations/shift-cards/parent/${row.shift_id}`)}><td><strong>{row.business_date} · {row.shift_name}</strong><div className="text-muted">Posting v{row.posting_version}{row.cash_account_name ? ` · ${row.cash_account_name}` : ''}</div></td><td style={{ textAlign: 'right' }}>{money(row.fuel_sales)}</td><td style={{ textAlign: 'right' }}>{money(row.cash)}</td><td style={{ textAlign: 'right' }}>{money(row.digital)}</td><td style={{ textAlign: 'right' }}>{money(row.credit)}</td><td style={{ textAlign: 'right' }}>{money(row.shortage)} / {money(row.excess)}</td></tr>)}
      </tbody></table>
    </div>
  </div>;
};
