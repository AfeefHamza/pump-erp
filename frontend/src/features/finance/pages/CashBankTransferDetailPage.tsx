import React, { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Ban, ArrowRight } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import { fetchCashBankTransfer, voidCashBankTransfer } from '@/api/client';
import type { CashBankTransfer } from '@/features/finance/types';

const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
const labels = { cash_deposit: 'Cash Deposit', bank_withdrawal: 'Bank Withdrawal', account_transfer: 'Account Transfer' };
export const CashBankTransferDetailPage: React.FC = () => {
  const { transferId } = useParams(); const navigate = useNavigate(); const orgId = useAppSelector((s) => s.ui.selectedOrganizationId); const outletId = useAppSelector((s) => s.ui.selectedOutletId);
  const [row, setRow] = useState<CashBankTransfer | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (orgId && outletId && transferId) fetchCashBankTransfer(orgId, outletId, transferId).then(setRow).catch((e) => setError(e?.data?.detail || e.message)); }, [orgId, outletId, transferId]);
  const voidRow = async () => { if (!orgId || !outletId || !transferId) return; const reason = window.prompt('Reason for voiding this transfer (minimum 5 characters):'); if (!reason) return; try { setRow(await voidCashBankTransfer(orgId, outletId, transferId, reason)); } catch (e: any) { setError(e?.data?.detail || Object.values(e?.data || {}).flat().join(' ') || e.message); } };
  if (!row) return <div className="card" style={{ margin: 24, padding: 32 }}>{error || 'Loading transfer…'}</div>;
  return <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}><PageHeader title={row.transfer_number} subtitle={`${labels[row.transfer_type]} — recorded account movement is immutable.`} actions={<div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary" onClick={() => navigate('/app/finance/cash-banking')}><ArrowLeft size={16}/> Back</button>{row.accounting_journal_id && <button className="btn btn-secondary" onClick={() => navigate(`/app/finance/vouchers/${row.accounting_journal_id}`)}><BookOpen size={16}/> View Journal</button>}{row.status === 'active' && <button className="btn btn-danger" onClick={voidRow}><Ban size={16}/> Void</button>}</div>}/>{error && <div className="alert alert-error">{error}</div>}{row.status === 'voided' && <div className="alert alert-warning" style={{ marginBottom: 16 }}>Voided: {row.void_reason}</div>}
    <div className="card" style={{ padding: 28 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '26px 0' }}><div><div className="text-muted">From</div><h2>{row.from_account_name}</h2></div><ArrowRight size={30}/><div><div className="text-muted">To</div><h2>{row.to_account_name}</h2></div></div><div style={{ textAlign: 'center', fontSize: 30, fontWeight: 800, marginBottom: 28 }}>{money(row.amount)}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>{[['Date', row.transfer_date], ['Type', labels[row.transfer_type]], ['Status', row.status], ['Reference', row.reference_number || '—'], ['Recorded By', row.created_by_name || '—'], ['Notes', row.notes || '—']].map(([a,b]) => <div key={a}><div className="text-muted">{a}</div><strong>{b}</strong></div>)}</div></div>
  </div>;
};
