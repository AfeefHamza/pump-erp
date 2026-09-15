export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface LedgerAccount {
  id: string;
  parent: string | null;
  parent_name: string | null;
  code: string;
  name: string;
  account_type: AccountType;
  normal_balance: 'debit' | 'credit';
  is_group: boolean;
  allow_manual_posting: boolean;
  system_key: string | null;
  description: string;
  display_order: number;
  is_active: boolean;
}

export interface LedgerAccountInput {
  parent_id?: string | null;
  code: string;
  name: string;
  account_type: AccountType;
  is_group: boolean;
  allow_manual_posting: boolean;
  description?: string;
  display_order?: number;
}

export interface JournalLine {
  id: string;
  sequence: number;
  account: string;
  account_code_snapshot: string;
  account_name_snapshot: string;
  description: string;
  debit: string;
  credit: string;
  party_type: string;
  party_id: string | null;
  party_name_snapshot: string;
}

export interface JournalEntry {
  id: string;
  journal_number: string;
  entry_date: string;
  source_type: string;
  source_id: string | null;
  reference: string;
  narration: string;
  total_debit: string;
  total_credit: string;
  status: 'posted' | 'reversed';
  reversal_of: string | null;
  reversal_entry_id: string | null;
  reversal_reason: string;
  created_by_name: string | null;
  created_at: string;
  lines: JournalLine[];
}

export interface JournalEntryInput {
  client_request_id: string;
  entry_date: string;
  reference?: string;
  narration: string;
  lines: Array<{ account_id: string; description?: string; debit: string; credit: string }>;
}

export interface TrialBalanceRow {
  account_id: string;
  code: string;
  name: string;
  account_type: AccountType;
  debit: string;
  credit: string;
  closing_debit: string;
  closing_credit: string;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  total_debit: string;
  total_credit: string;
}

export interface AccountingPeriodLock {
  id: string;
  outlet: string | null;
  outlet_name: string | null;
  month: string;
  reason: string;
  locked_by_name: string | null;
  locked_at: string;
  unlocked_at: string | null;
  unlock_reason: string;
  is_active: boolean;
}
