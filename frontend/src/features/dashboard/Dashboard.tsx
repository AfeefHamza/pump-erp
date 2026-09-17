import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BarChart3, Clock, Coins, CreditCard, Droplet,
  Fuel, Gauge, RefreshCw, ReceiptText, TrendingDown, Truck, Users, WalletCards,
} from 'lucide-react';
import { fetchManagementDashboard } from '@/api/client';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import type { ManagementDashboard } from './types';

const money = (value: string) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(Number(value || 0));
const quantity = (value: string) => `${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} L`;
const displayDate = (value: string) => new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`));

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const canView = usePermission('dashboard.view');
  const [data, setData] = useState<ManagementDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !outletId || !canView) return;
    setLoading(true);
    try {
      setData(await fetchManagementDashboard(orgId, outletId));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load the management dashboard.');
    } finally {
      setLoading(false);
    }
  }, [orgId, outletId, canView]);

  useEffect(() => { load(); }, [load]);

  if (!orgId || !outletId) {
    return <div className="card" style={{ margin: 24, padding: 32 }}>Select an organisation and outlet to view the dashboard.</div>;
  }
  if (!canView) {
    return <div className="card" style={{ margin: 24, padding: 32 }}>You do not have permission to view the management dashboard.</div>;
  }

  const metrics = data ? [
    { label: 'Recorded Sales', value: money(data.recorded.sales_total), detail: `${data.recorded.recorded_shift_count} financially locked shift(s)`, icon: Fuel, path: '/app/reports/daily-business-summary' },
    { label: 'Cash Collected', value: money(data.recorded.cash_collections), detail: 'Recorded shift cash', icon: Coins, path: '/app/reports/daily-business-summary' },
    { label: 'Digital Collected', value: money(data.recorded.digital_collections), detail: 'Card, UPI and fleet card', icon: CreditCard, path: '/app/reports/daily-business-summary' },
    { label: 'Pending Settlement', value: money(data.settlements.pending_amount), detail: `${data.settlements.pending_count} unsettled collection(s)`, icon: WalletCards, path: '/app/finance/settlements' },
    { label: 'Customer Outstanding', value: money(data.receivables.customer_outstanding), detail: `${money(data.receivables.unbilled_credit)} unbilled fuel credit`, icon: Users, path: '/app/reports' },
    { label: 'Supplier Outstanding', value: money(data.payables.supplier_outstanding), detail: `${money(data.payables.supplier_overdue)} overdue`, icon: Truck, path: '/app/reports' },
    { label: 'Fuel Book Stock', value: quantity(data.stock.total_book_stock), detail: `${data.stock.total_tanks} active tank(s)`, icon: Droplet, path: '/app/inventory/fuel-stock' },
    { label: 'Shortage / Excess', value: `${money(data.recorded.shortage)} / ${money(data.recorded.excess)}`, detail: 'Recorded employee settlements', icon: AlertTriangle, path: '/app/reports/employee-accountability' },
  ] : [];

  const quickActions = [
    { label: 'Shift Cards', icon: Clock, path: '/app/operations/shift-cards' },
    { label: 'Record Dip', icon: Gauge, path: '/app/operations/dip-readings' },
    { label: 'Credit Slip', icon: ReceiptText, path: '/app/sales/credit-slips' },
    { label: 'Record Expense', icon: TrendingDown, path: '/app/finance/expenses/new' },
    { label: 'Receive Tanker', icon: Truck, path: '/app/purchases/tanker-receipts/new' },
    { label: 'View Reports', icon: BarChart3, path: '/app/reports' },
  ];

  return <div className="dashboard-page">
    <PageHeader
      title="Management Dashboard"
      subtitle={data ? `${data.outlet.name} · Business date ${displayDate(data.business_date)}` : 'Live outlet overview'}
      actions={<button type="button" className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={16}/>{loading ? 'Refreshing…' : 'Refresh'}</button>}
    />
    {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
    {data && <div className="dashboard-basis"><span className="dashboard-live-dot"/> <strong>Recorded data</strong><span>{data.basis}</span><span className="dashboard-date-pill">{displayDate(data.business_date)}</span></div>}

    <div className="quick-actions-grid dashboard-quick-actions">
      {quickActions.map(({ label, icon: Icon, path }) => <button key={label} type="button" className="quick-action-button" onClick={() => navigate(path)}><Icon className="quick-action-icon" size={20}/><span>{label}</span></button>)}
    </div>

    {!data && loading ? <div className="card" style={{ padding: 36, textAlign: 'center' }}>Loading dashboard…</div> : data && <>
      <div className="dashboard-kpi-grid">
        {metrics.map(({ label, value, detail, icon: Icon, path }) => <button key={label} type="button" className="dashboard-kpi-card" onClick={() => navigate(path)}>
          <div className="dashboard-kpi-head"><span>{label}</span><span className="dashboard-kpi-icon"><Icon size={18}/></span></div>
          <strong>{value}</strong>
          <small>{detail}</small>
        </button>)}
      </div>

      <div className="dashboard-section-grid">
        <section className="card dashboard-panel" style={{ overflowX: 'auto' }}>
          <div className="dashboard-card-header"><h3 className="dashboard-card-title">Fuel sales by product</h3><button className="btn btn-link" onClick={() => navigate('/app/reports/daily-business-summary')}>Full report <ArrowRight size={15}/></button></div>
          <table className="data-table"><thead><tr><th>Product</th><th style={{ textAlign: 'right' }}>Quantity</th><th style={{ textAlign: 'right' }}>Recorded Sales</th></tr></thead><tbody>
            {!data.fuel_products.length ? <tr><td colSpan={3} style={{ textAlign: 'center', padding: 28 }}>No financially locked fuel sales for this business date.</td></tr> : data.fuel_products.map((row) => <tr key={row.product_id}><td><strong>{row.product_name}</strong><div className="text-muted">{row.product_code}</div></td><td style={{ textAlign: 'right' }}>{Number(row.quantity).toLocaleString('en-IN', { minimumFractionDigits: 3 })} {row.unit}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(row.amount)}</td></tr>)}
          </tbody></table>
        </section>

        <section className="card dashboard-panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}><strong>Shift status</strong><button className="btn btn-link" onClick={() => navigate('/app/operations/shift-cards')}>Open Shift Cards</button></div>
          {[['Recorded', data.operations.recorded_shift_count, '#16a34a'], ['Open', data.operations.open_shift_count, '#2563eb'], ['Awaiting recording', data.operations.awaiting_recording_count, '#d97706']].map(([label, value, color]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--border-color)' }}><span>{label}</span><strong style={{ color: String(color) }}>{value}</strong></div>)}
          {!!data.operations.open_shifts.length && <div style={{ marginTop: 14 }}>{data.operations.open_shifts.map((shift) => <button key={shift.shift_id} type="button" onClick={() => navigate(`/app/operations/shift-cards/parent/${shift.shift_id}`)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '9px 0', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}><span>{shift.shift_name}<span className="text-muted"> · {shift.business_date}</span></span>{shift.is_stale && <span className="status-badge danger">Stale</span>}</button>)}</div>}
        </section>
      </div>

      <div className="dashboard-section-grid">
        <section className="card dashboard-panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><strong>Tank stock</strong><button className="btn btn-link" onClick={() => navigate('/app/inventory/fuel-stock')}>Fuel Stock <ArrowRight size={15}/></button></div>
          {!data.stock.tanks.length ? <div className="text-muted" style={{ padding: 20, textAlign: 'center' }}>No active tanks configured.</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>{data.stock.tanks.map((tank) => {
            const pct = Math.max(0, Math.min(100, Number(tank.utilization_pct)));
            const color = tank.level === 'critical' ? '#dc2626' : tank.level === 'low' ? '#d97706' : '#0f766e';
            return <div key={tank.tank_id}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}><span><strong>{tank.tank_code}</strong> · {tank.product_name}<div className="text-muted">{tank.tank_name}</div></span><span style={{ textAlign: 'right' }}><strong>{quantity(tank.book_stock)}</strong><div className="text-muted">of {quantity(tank.capacity)} · {pct.toFixed(1)}%</div></span></div><div style={{ height: 8, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: color }}/></div></div>;
          })}</div>}
        </section>

        <section className="card dashboard-panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}><strong>Attention required</strong><span className="status-badge warning">{data.alerts.length}</span></div>
          {!data.alerts.length ? <div style={{ padding: 24, textAlign: 'center', color: '#15803d' }}>No operational alerts.</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{data.alerts.map((alert, index) => <button key={`${alert.type}-${index}`} type="button" onClick={() => navigate(alert.path)} style={{ padding: 12, borderRadius: 8, border: `1px solid ${alert.severity === 'danger' ? '#fecaca' : '#fde68a'}`, background: alert.severity === 'danger' ? '#fef2f2' : '#fffbeb', textAlign: 'left', cursor: 'pointer' }}><strong style={{ display: 'block', color: alert.severity === 'danger' ? '#b91c1c' : '#92400e' }}>{alert.title}</strong><span style={{ fontSize: 12, lineHeight: 1.5 }}>{alert.detail}</span></button>)}</div>}
        </section>
      </div>
    </>}
  </div>;
};
