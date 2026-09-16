import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Search, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { fetchDigitalSettlements } from '@/api/client';
import type { DigitalSettlementListResponse } from '@/features/finance/types';

const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
const methodName = (value: string) => ({ card: 'Card', upi: 'UPI', fleet_card: 'Fleet Card' }[value] || value);

export const DigitalSettlementsPage: React.FC = () => {
  const navigate = useNavigate(); const orgId = useAppSelector((s) => s.ui.selectedOrganizationId); const outletId = useAppSelector((s) => s.ui.selectedOutletId);
  const [data, setData] = useState<DigitalSettlementListResponse | null>(null); const [search, setSearch] = useState(''); const [status, setStatus] = useState('active'); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!orgId || !outletId) return; try { setData(await fetchDigitalSettlements(orgId, outletId, { status, ...(search ? { search } : {}) })); setError(null); } catch (e: any) { setError(e?.data?.detail || e.message); } }, [orgId, outletId, search, status]);
  useEffect(() => { load(); }, [load]);
  if (!orgId || !outletId) return <div className="card" style={{ margin: 24, padding: 32 }}>Select an organisation and outlet to view settlements.</div>;
  const summary = data?.summary;
  return <div style={{ maxWidth: 1450, margin: '0 auto', padding: '1.5rem' }}><PageHeader title="Digital Settlements" subtitle="Match Shift Card collections to card, UPI and fleet-card credits received in the bank." actions={<button className="btn btn-primary" onClick={() => navigate('/app/finance/settlements/new')}><Plus size={16}/> New Settlement</button>}/>{error && <div className="alert alert-error">{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14, marginBottom: 18 }}>{[
      ['Pending Collections', `${summary?.pending_count || 0} · ${money(summary?.pending_amount || '0')}`], ['Gross Settled', money(summary?.settled_gross || '0')], ['Charges', money(summary?.charges_total || '0')], ['Net Bank Credit', money(summary?.net_received || '0')],
    ].map(([label,value]) => <div className="card" style={{ padding: 18 }} key={label}><div className="text-muted">{label}</div><strong style={{ fontSize: 22 }}>{value}</strong></div>)}</div>
    <div className="card" style={{ padding: 16, display: 'flex', gap: 12, marginBottom: 18 }}><div style={{ position: 'relative', flex: 1 }}><Search size={16} style={{ position: 'absolute', left: 10, top: 12 }}/><input className="input" style={{ width: '100%', paddingLeft: 32 }} placeholder="Settlement, provider or bank reference" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}/></div><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="voided">Voided</option><option value="all">All</option></select><button className="btn btn-secondary" onClick={load}>Search</button></div>
    <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>Settlement</th><th>Provider / Method</th><th>Bank Account</th><th style={{ textAlign: 'right' }}>Gross</th><th style={{ textAlign: 'right' }}>Deductions</th><th style={{ textAlign: 'right' }}>Net Credit</th><th>Status</th></tr></thead><tbody>{!data?.results.length ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 44 }}><CreditCard size={28}/><div>No settlements found.</div></td></tr> : data.results.map((row) => <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/finance/settlements/${row.id}`)}><td>{row.settlement_date}</td><td><strong>{row.settlement_number}</strong><div className="text-muted">{row.bank_reference}</div></td><td>{row.provider_name}<div className="text-muted">{methodName(row.collection_method)}</div></td><td>{row.payment_account_name}</td><td style={{ textAlign: 'right' }}>{money(row.gross_amount)}</td><td style={{ textAlign: 'right' }}>{money(String(Number(row.charges_amount) + Number(row.tds_amount)))}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(row.net_amount)}</td><td><span className={`status-badge ${row.status === 'active' ? 'success' : 'neutral'}`}>{row.status}</span></td></tr>)}</tbody></table></div>
  </div>;
};
