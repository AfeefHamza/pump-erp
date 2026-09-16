import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchAccountLedger } from '@/api/client';
import { useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/navigation/PageHeader';
import type { AccountLedger } from '@/features/accounting/types';

const money = (value: string) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));

export const AccountLedgerPage: React.FC = () => {
  const navigate = useNavigate();
  const { accountId } = useParams();
  const orgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const outletId = useAppSelector((state) => state.ui.selectedOutletId);
  const [ledger, setLedger] = useState<AccountLedger | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orgId && outletId && accountId) fetchAccountLedger(orgId, outletId, accountId).then(setLedger).catch((err) => setError(err.message));
  }, [orgId, outletId, accountId]);

  if (!ledger) return <div style={{ padding: 24 }}>{error || 'Loading account ledger…'}</div>;
  return <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title={`${ledger.account.code} · ${ledger.account.name}`} subtitle="Chronological posted entries and running balance for the selected outlet." actions={<button className="btn btn-secondary" onClick={() => navigate('/app/finance/chart-of-accounts')}><ArrowLeft size={16}/> Back</button>}/>
    {error && <div className="alert alert-error">{error}</div>}
    <div className="card" style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>Journal</th><th>Reference</th><th>Description</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th><th style={{ textAlign: 'right' }}>Running Balance</th></tr></thead><tbody>
      {ledger.rows.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 44 }}>No postings for this account.</td></tr> : ledger.rows.map((row, index) => <tr key={`${row.journal_id}-${index}`} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/finance/vouchers/${row.journal_id}`)}><td>{row.entry_date}</td><td><strong>{row.journal_number}</strong></td><td>{row.reference || '—'}</td><td>{row.description}</td><td style={{ textAlign: 'right' }}>{money(row.debit)}</td><td style={{ textAlign: 'right' }}>{money(row.credit)}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(row.running_balance)}</td></tr>)}
    </tbody><tfoot><tr><th colSpan={6}>Closing Balance</th><th style={{ textAlign: 'right' }}>{money(ledger.closing_balance)}</th></tr></tfoot></table></div>
  </div>;
};
