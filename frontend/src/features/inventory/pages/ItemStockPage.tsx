import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, ClipboardCheck, History, Package, Plus, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { fetchItemStockLedger, fetchItemStockSummary } from '@/api/client';
import type { ItemStockSummary } from '@/features/sales/types';

type LedgerRow = { id: string; effective_date: string; movement_type: string; direction: 'IN' | 'OUT'; quantity: string; running_balance: string; description: string; source_type: string };

export const ItemStockPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [rows, setRows] = useState<ItemStockSummary[]>([]);
  const [selected, setSelected] = useState<ItemStockSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const success = (location.state as { success?: string } | null)?.success || null;

  const load = () => {
    if (orgId && outletId) fetchItemStockSummary(orgId, outletId).then(setRows).catch((err) => setError(err.message));
  };
  useEffect(load, [orgId, outletId]);

  const selectItem = async (item: ItemStockSummary) => {
    setSelected(item);
    if (orgId && outletId) setLedger(await fetchItemStockLedger(orgId, outletId, item.item_id));
  };

  const visible = rows.filter((row) => `${row.item_code} ${row.item_name}`.toLowerCase().includes(search.toLowerCase()));
  const totalUnits = rows.reduce((sum, row) => sum + Number(row.current_quantity || 0), 0);
  const lowStock = rows.filter((row) => Number(row.reorder_level) > 0 && Number(row.current_quantity) <= Number(row.reorder_level)).length;
  const negativeHistory = rows.filter((row) => row.has_negative_balance_history).length;

  return <div className="erp-page inventory-adjustment-page">
    <PageHeader title="Inventory Adjustments" subtitle="Review item balances and append-only stock corrections." actions={<button className="btn btn-primary" onClick={() => navigate('/app/inventory/adjustments/new')}><Plus size={16}/> New Adjustment</button>}/>
    {error && <div className="alert alert-danger">{error}</div>}
    {success && <div className="alert alert-success">{success}</div>}

    <div className="inventory-stat-grid">
      <div className="inventory-stat"><span>Tracked Items</span><strong>{rows.length}</strong><Package size={20}/></div>
      <div className="inventory-stat"><span>Total Units on Hand</span><strong>{totalUnits.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</strong><ClipboardCheck size={20}/></div>
      <div className="inventory-stat warning"><span>At / Below Reorder</span><strong>{lowStock}</strong><ArrowDownToLine size={20}/></div>
      <div className="inventory-stat danger"><span>Negative-stock History</span><strong>{negativeHistory}</strong><History size={20}/></div>
    </div>

    <section className="erp-document-card inventory-register-card">
      <div className="inventory-register-toolbar"><div><span className="erp-section-kicker">Stock register</span><h2>Current Item Balances</h2></div><div className="search-field"><Search size={16}/><input className="input" placeholder="Search item name or code" value={search} onChange={(e) => setSearch(e.target.value)}/></div></div>
      <div className="erp-line-table-wrap"><table className="data-table"><thead><tr><th>Item</th><th>Unit</th><th className="number">On Hand</th><th className="number">Reorder Level</th><th>Status</th><th/></tr></thead><tbody>{visible.length === 0 ? <tr><td colSpan={6} className="erp-empty-cell"><Package size={28}/><span>No tracked stock items.</span></td></tr> : visible.map((item) => { const low = Number(item.current_quantity) <= Number(item.reorder_level) && Number(item.reorder_level) > 0; return <tr key={item.item_id} className={selected?.item_id === item.item_id ? 'selected-row' : ''} onClick={() => selectItem(item)}><td><strong>{item.item_name}</strong><small>{item.item_code}</small></td><td>{item.unit}</td><td className="number"><strong>{item.current_quantity}</strong></td><td className="number">{item.reorder_level}</td><td><span className={`status-badge ${low ? 'warning' : 'success'}`}>{low ? 'Low stock' : 'Available'}</span></td><td><button type="button" className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); selectItem(item); }}>View ledger</button></td></tr>; })}</tbody></table></div>
    </section>

    {selected && <section className="erp-document-card inventory-ledger-card"><div className="erp-section-heading"><div><span className="erp-section-kicker">Movement history</span><h2>{selected.item_name} Ledger</h2><p>{selected.item_code} · Current balance {selected.current_quantity} {selected.unit}</p></div></div><div className="erp-line-table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Movement</th><th>Description</th><th className="number">In</th><th className="number">Out</th><th className="number">Balance</th></tr></thead><tbody>{ledger.length === 0 ? <tr><td colSpan={6} className="erp-empty-cell">No stock movements recorded.</td></tr> : ledger.map((row) => <tr key={row.id}><td>{row.effective_date}</td><td className="capitalize">{row.movement_type.replaceAll('_', ' ')}</td><td>{row.description}</td><td className="number gain-text">{row.direction === 'IN' ? row.quantity : '—'}</td><td className="number loss-text">{row.direction === 'OUT' ? row.quantity : '—'}</td><td className="number"><strong>{row.running_balance}</strong></td></tr>)}</tbody></table></div></section>}
  </div>;
};
