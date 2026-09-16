import React, { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Ban } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { fetchExpense, voidExpense } from '@/api/client';
import type { Expense } from '@/features/finance/types';

const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
export const ExpenseDetailPage: React.FC = () => {
  const { expenseId } = useParams(); const navigate = useNavigate(); const orgId = useAppSelector((s) => s.ui.selectedOrganizationId); const outletId = useAppSelector((s) => s.ui.selectedOutletId);
  const [row, setRow] = useState<Expense | null>(null); const [error, setError] = useState<string | null>(null);
  const load = async () => { if (orgId && outletId && expenseId) try { setRow(await fetchExpense(orgId, outletId, expenseId)); } catch (e: any) { setError(e?.data?.detail || e.message); } };
  useEffect(() => { load(); }, [orgId, outletId, expenseId]);
  const voidRow = async () => { if (!orgId || !outletId || !expenseId) return; const reason = window.prompt('Reason for voiding this expense (minimum 5 characters):'); if (!reason) return; try { setRow(await voidExpense(orgId, outletId, expenseId, reason)); } catch (e: any) { setError(e?.data?.detail || Object.values(e?.data || {}).flat().join(' ') || e.message); } };
  if (!row) return <div className="card" style={{ margin: 24, padding: 32 }}>{error || 'Loading expense…'}</div>;
  return <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem' }}><PageHeader title={row.expense_number} subtitle="Recorded expense — financial details are immutable." actions={<div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary" onClick={() => navigate('/app/finance/expenses')}><ArrowLeft size={16}/> Back</button>{row.accounting_journal_id && <button className="btn btn-secondary" onClick={() => navigate(`/app/finance/vouchers/${row.accounting_journal_id}`)}><BookOpen size={16}/> View Journal</button>}{row.status === 'active' && <button className="btn btn-danger" onClick={voidRow}><Ban size={16}/> Void</button>}</div>}/>{error && <div className="alert alert-error">{error}</div>}
    {row.status === 'voided' && <div className="alert alert-warning" style={{ marginBottom: 16 }}>Voided: {row.void_reason}</div>}
    <div className="card" style={{ padding: 24 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 22 }}>{[
      ['Date', row.expense_date], ['Category', row.category_name], ['Expense Ledger', `${row.ledger_code_snapshot} · ${row.ledger_name_snapshot}`], ['Paid From', row.payment_account_name], ['Payee', row.payee || '—'], ['Reference', row.reference_number || '—'], ['Amount', money(row.amount)], ['Status', row.status], ['Recorded By', row.created_by_name || '—'],
    ].map(([label, value]) => <div key={label}><div className="text-muted">{label}</div><strong>{value}</strong></div>)}</div>{row.notes && <div style={{ marginTop: 24 }}><div className="text-muted">Notes</div><p>{row.notes}</p></div>}{row.attachment && <a className="btn btn-secondary" href={row.attachment} target="_blank" rel="noreferrer">View Attachment</a>}</div>
  </div>;
};
