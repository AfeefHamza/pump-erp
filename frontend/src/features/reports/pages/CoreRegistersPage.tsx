import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchCoreReportPack } from '@/api/client';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import type { CoreReportPack } from '@/features/reports/types';

type Section = 'sales' | 'purchases' | 'stock' | 'payments';
const sections: Array<{ key: Section; label: string }> = [
  { key: 'sales', label: 'Sales Invoices' },
  { key: 'purchases', label: 'Purchase Bills' },
  { key: 'stock', label: 'Fuel Stock Movements' },
  { key: 'payments', label: 'Payment Modes' },
];
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: string) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(Number(value || 0));
const qty = (value: string) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const CoreRegistersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('section');
  const section: Section = sections.some((item) => item.key === requested) ? requested as Section : 'sales';
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const initial = { from_date: today(), to_date: today() };
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [data, setData] = useState<CoreReportPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !outletId) return;
    setLoading(true);
    try {
      setData(await fetchCoreReportPack(orgId, outletId, filters));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load the report.');
    } finally {
      setLoading(false);
    }
  }, [orgId, outletId, filters]);
  useEffect(() => { load(); }, [load]);

  if (!orgId || !outletId) return <div className="card" style={{ margin: 24, padding: 32 }}>Select an organisation and outlet to view reports.</div>;

  const selectSection = (next: Section) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('section', next);
    setSearchParams(nextParams);
  };
  const active = data?.[section];

  return <div style={{ maxWidth: 1550, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Core Registers" subtitle={data?.basis[section] || 'Recorded transaction registers.'} backLink={{ to: '/app/reports', label: 'Back to Reports' }}/>
    {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
    <div className="card" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginBottom: 16 }}>
      <label>From<input className="input" type="date" value={draft.from_date} onChange={(event) => setDraft({ ...draft, from_date: event.target.value })}/></label>
      <label>To<input className="input" type="date" value={draft.to_date} onChange={(event) => setDraft({ ...draft, to_date: event.target.value })}/></label>
      <button type="button" className="btn btn-primary" disabled={loading} onClick={() => setFilters(draft)}>{loading ? 'Loading…' : 'Apply'}</button>
      <span className="text-muted" style={{ marginLeft: 'auto' }}>{active?.count || 0} record(s)</span>
    </div>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {sections.map((item) => <button key={item.key} type="button" className={`btn ${section === item.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => selectSection(item.key)}>{item.label}</button>)}
    </div>

    {active?.truncated && <div className="alert alert-secondary" style={{ marginBottom: 14 }}>Showing the first 1,000 rows. Reduce the date range to see every transaction.</div>}

    {data && section === 'sales' && <>
      <SummaryCards values={[
        ['Invoices', String(data.sales.count)], ['Invoice Total', money(data.sales.totals.total)],
        ['Tax', money(data.sales.totals.tax)], ['Outstanding', money(data.sales.totals.outstanding)],
      ]}/>
      <ReportTable headers={['Date / Invoice', 'Customer', 'Type / Basis', 'Subtotal', 'Tax', 'Total', 'Paid', 'Outstanding']} empty="No active sales invoices in this period.">
        {data.sales.rows.map((row) => <tr key={row.invoice_id} onClick={() => navigate(`/app/sales/invoices/${row.invoice_id}`)} style={{ cursor: 'pointer' }}><td><strong>{row.invoice_number}</strong><div className="text-muted">{row.invoice_date}</div></td><td>{row.customer_name}</td><td>{row.invoice_type === 'cash' ? 'Cash' : 'Credit'}{row.contains_credit_slips && <div className="text-muted">Credit-slip billing</div>}</td><MoneyCell value={row.subtotal}/><MoneyCell value={row.tax_total}/><MoneyCell value={row.grand_total} strong/><MoneyCell value={row.amount_paid}/><MoneyCell value={row.outstanding}/></tr>)}
      </ReportTable>
    </>}

    {data && section === 'purchases' && <>
      <SummaryCards values={[
        ['Bills', String(data.purchases.count)], ['Purchase Total', money(data.purchases.totals.total)],
        ['Tax', money(data.purchases.totals.tax)], ['Outstanding', money(data.purchases.totals.outstanding)],
      ]}/>
      <ReportTable headers={['Date / Bill', 'Supplier', 'Supplier Invoice', 'Purchase Type', 'Taxable', 'Tax', 'Total', 'Outstanding']} empty="No active purchase bills in this period.">
        {data.purchases.rows.map((row) => <tr key={row.bill_id} onClick={() => navigate(`/app/purchases/purchase-bills/${row.bill_id}`)} style={{ cursor: 'pointer' }}><td><strong>{row.bill_number}</strong><div className="text-muted">{row.invoice_date}</div></td><td>{row.supplier_name}</td><td>{row.supplier_invoice_number}</td><td>{row.purchase_type.replace('_', ' ')}</td><MoneyCell value={row.taxable_value}/><MoneyCell value={row.tax_total}/><MoneyCell value={row.grand_total} strong/><MoneyCell value={row.outstanding}/></tr>)}
      </ReportTable>
    </>}

    {data && section === 'stock' && <>
      <SummaryCards values={[
        ['Movements', String(data.stock.count)], ['Inward', `${qty(data.stock.totals.inward)} L`],
        ['Outward', `${qty(data.stock.totals.outward)} L`], ['Net Movement', `${qty(data.stock.totals.net)} L`],
      ]}/>
      <ReportTable headers={['Date', 'Tank / Product', 'Movement', 'Direction', 'Quantity', 'Source']} empty="No fuel stock movements in this period.">
        {data.stock.rows.map((row) => <tr key={row.movement_id} onClick={() => navigate(`/app/inventory/fuel-stock/${row.tank_id}`)} style={{ cursor: 'pointer' }}><td>{row.business_date || row.effective_at.slice(0, 10)}</td><td><strong>{row.tank_code}</strong><div className="text-muted">{row.product_name}</div></td><td>{row.movement_label}</td><td><span className={`status-badge ${row.direction === 'IN' ? 'success' : 'warning'}`}>{row.direction}</span></td><td style={{ textAlign: 'right', fontWeight: 700 }}>{qty(row.quantity)} L</td><td>{row.source_type.replaceAll('_', ' ')}</td></tr>)}
      </ReportTable>
    </>}

    {data && section === 'payments' && <>
      <SummaryCards values={[
        ['Total Accounted', money(data.payments.totals.total)], ['Cash', money(data.payments.totals.cash)],
        ['Digital', money(data.payments.totals.digital)], ['Credit', money(data.payments.totals.credit)],
      ]}/>
      <ReportTable headers={['Date / Shift', 'Cash', 'Card', 'UPI', 'Fleet Card', 'Credit', 'Total']} empty="No financially locked shift postings in this period.">
        {data.payments.rows.map((row) => <tr key={row.posting_id} onClick={() => navigate(`/app/operations/shift-cards/parent/${row.shift_id}`)} style={{ cursor: 'pointer' }}><td><strong>{row.shift_name}</strong><div className="text-muted">{row.business_date}</div></td><MoneyCell value={row.cash}/><MoneyCell value={row.card}/><MoneyCell value={row.upi}/><MoneyCell value={row.fleet_card}/><MoneyCell value={row.credit}/><MoneyCell value={row.total} strong/></tr>)}
      </ReportTable>
    </>}
  </div>;
};

const SummaryCards: React.FC<{ values: Array<[string, string]> }> = ({ values }) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 16 }}>
  {values.map(([label, value]) => <div className="card" style={{ padding: 16 }} key={label}><div className="text-muted">{label}</div><strong style={{ fontSize: 21 }}>{value}</strong></div>)}
</div>;

const ReportTable: React.FC<{ headers: string[]; empty: string; children: React.ReactNode }> = ({ headers, empty, children }) => {
  const hasRows = React.Children.count(children) > 0;
  const numericHeaders = new Set(['Subtotal', 'Tax', 'Taxable', 'Total', 'Paid', 'Outstanding', 'Quantity', 'Cash', 'Card', 'UPI', 'Fleet Card', 'Credit']);
  return <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr>{headers.map((header) => <th key={header} style={numericHeaders.has(header) ? { textAlign: 'right' } : undefined}>{header}</th>)}</tr></thead><tbody>{hasRows ? children : <tr><td colSpan={headers.length} style={{ textAlign: 'center', padding: 30 }}>{empty}</td></tr>}</tbody></table></div>;
};

const MoneyCell: React.FC<{ value: string; strong?: boolean }> = ({ value, strong }) => <td style={{ textAlign: 'right', fontWeight: strong ? 700 : undefined }}>{money(value)}</td>;
