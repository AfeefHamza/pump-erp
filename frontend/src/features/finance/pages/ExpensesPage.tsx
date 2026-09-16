import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Tags } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { createExpenseCategory, deactivateExpenseCategory, fetchExpenseCategories, fetchExpenses, fetchLedgerAccounts } from '@/api/client';
import type { Expense, ExpenseCategory, ExpenseCategoryInput } from '@/features/finance/types';
import type { LedgerAccount } from '@/features/accounting/types';

const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));

export const ExpensesPage: React.FC = () => {
  const navigate = useNavigate();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [tab, setTab] = useState<'expenses' | 'categories'>('expenses');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [ledgers, setLedgers] = useState<LedgerAccount[]>([]);
  const [activeTotal, setActiveTotal] = useState('0.00');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState<ExpenseCategoryInput>({ code: '', name: '', ledger_account_id: '', description: '' });

  const load = useCallback(async () => {
    if (!orgId || !outletId) return;
    try {
      const [expenseData, categoryData, ledgerData] = await Promise.all([
        fetchExpenses(orgId, outletId), fetchExpenseCategories(orgId), fetchLedgerAccounts(orgId, { account_type: 'expense' }),
      ]);
      setExpenses(expenseData.results); setActiveTotal(expenseData.summary.active_total);
      setCategories(categoryData); setLedgers(ledgerData.filter((row) => !row.is_group && row.is_active));
    } catch (err: any) { setError(err?.data?.detail || err.message || 'Failed to load expenses.'); }
  }, [orgId, outletId]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => expenses.filter((row) => {
    const q = search.toLowerCase();
    return !q || row.expense_number.toLowerCase().includes(q) || row.category_name.toLowerCase().includes(q) || (row.payee || '').toLowerCase().includes(q);
  }), [expenses, search]);

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault(); if (!orgId) return;
    try { await createExpenseCategory(orgId, categoryForm); setCategoryForm({ code: '', name: '', ledger_account_id: '', description: '' }); setShowCategoryForm(false); await load(); }
    catch (err: any) { setError(err?.data?.detail || Object.values(err?.data || {}).flat().join(' ') || err.message); }
  };

  if (!orgId || !outletId) return <div className="card" style={{ margin: 24, padding: 32 }}>Select an organisation and outlet to view expenses.</div>;
  return <div style={{ maxWidth: 1450, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Expenses" subtitle="Record operating expenses and keep every cash or bank outflow linked to its journal." actions={<button className="btn btn-primary" onClick={() => navigate('/app/finance/expenses/new')}><Plus size={16}/> New Expense</button>}/>
    {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
    <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}><button className={`btn ${tab === 'expenses' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('expenses')}>Expenses</button><button className={`btn ${tab === 'categories' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('categories')}><Tags size={16}/> Categories</button></div>
    {tab === 'expenses' ? <>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,1fr) 220px', gap: 16, marginBottom: 18 }}>
        <div className="card" style={{ padding: 16, position: 'relative' }}><Search size={16} style={{ position: 'absolute', left: 28, top: 28 }}/><input className="input" style={{ width: '100%', paddingLeft: 34 }} placeholder="Search expense, category or payee" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
        <div className="card" style={{ padding: 16 }}><div className="text-muted">Active expenses</div><strong style={{ fontSize: 22 }}>{money(activeTotal)}</strong></div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Expense</th><th>Date</th><th>Category</th><th>Paid From</th><th>Payee / Reference</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th></tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>No expenses found.</td></tr> : filtered.map((row) => <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/finance/expenses/${row.id}`)}><td><strong>{row.expense_number}</strong></td><td>{row.expense_date}</td><td>{row.category_name}</td><td>{row.payment_account_name}</td><td>{row.payee || row.reference_number || '—'}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(row.amount)}</td><td><span className={`status-badge ${row.status === 'active' ? 'success' : 'neutral'}`}>{row.status}</span></td></tr>)}</tbody></table></div>
    </> : <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}><button className="btn btn-primary" onClick={() => setShowCategoryForm(!showCategoryForm)}><Plus size={16}/> New Category</button></div>
      {showCategoryForm && <form className="card" onSubmit={saveCategory} style={{ padding: 20, marginBottom: 18 }}><h3 style={{ marginTop: 0 }}>New Expense Category</h3><div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', gap: 14 }}><label>Code<input className="input" required value={categoryForm.code} onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value.toUpperCase() })}/></label><label>Name<input className="input" required value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}/></label><label>Expense Ledger<select className="input" required value={categoryForm.ledger_account_id} onChange={(e) => setCategoryForm({ ...categoryForm, ledger_account_id: e.target.value })}><option value="">Select expense ledger</option>{ledgers.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label></div><div style={{ marginTop: 14, display: 'flex', gap: 8 }}><button className="btn btn-primary">Save Category</button><button type="button" className="btn btn-secondary" onClick={() => setShowCategoryForm(false)}>Cancel</button></div></form>}
      <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Code</th><th>Category</th><th>Expense Ledger</th><th>Status</th><th></th></tr></thead><tbody>{categories.map((row) => <tr key={row.id}><td>{row.code}</td><td><strong>{row.name}</strong></td><td>{row.ledger_account_code} · {row.ledger_account_name}</td><td><span className={`status-badge ${row.is_active ? 'success' : 'neutral'}`}>{row.is_active ? 'Active' : 'Inactive'}</span></td><td>{row.is_active && <button className="btn btn-ghost" onClick={async () => { if (window.confirm(`Deactivate ${row.name}?`)) { await deactivateExpenseCategory(orgId, row.id); await load(); } }}>Deactivate</button>}</td></tr>)}</tbody></table></div>
    </>}
  </div>;
};
