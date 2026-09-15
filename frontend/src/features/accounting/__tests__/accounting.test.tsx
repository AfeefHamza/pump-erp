import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '@/features/auth/authSlice';
import permissionsReducer from '@/features/auth/permissionsSlice';
import { uiReducer } from '@/app/store';
import * as api from '@/api/client';
import { ChartOfAccountsPage } from '../pages/ChartOfAccountsPage';
import { JournalVoucherFormPage } from '../pages/JournalVoucherFormPage';
import { AccountingPeriodsPage } from '../pages/AccountingPeriodsPage';

vi.mock('@/api/client', () => ({
  fetchLedgerAccounts: vi.fn(), fetchTrialBalance: vi.fn(), createJournalEntry: vi.fn(),
  fetchAccountingPeriodLocks: vi.fn(), createAccountingPeriodLock: vi.fn(), unlockAccountingPeriod: vi.fn(),
}));

const store = () => configureStore({ reducer: { auth: authReducer, permissions: permissionsReducer, ui: uiReducer }, preloadedState: { ui: { selectedOrganizationId: 'org-1', selectedOutletId: 'outlet-1', sidebarExpanded: true } } });
const renderPage = (node: React.ReactNode) => render(<Provider store={store()}><MemoryRouter>{node}</MemoryRouter></Provider>);
const accounts = [
  { id: 'cash', parent: 'assets', parent_name: 'Assets', code: '1200', name: 'Accounts Receivable', account_type: 'asset' as const, normal_balance: 'debit' as const, is_group: false, allow_manual_posting: true, system_key: 'accounts_receivable', description: '', display_order: 0, is_active: true },
  { id: 'income', parent: 'income-group', parent_name: 'Income', code: '4300', name: 'Service Income', account_type: 'income' as const, normal_balance: 'credit' as const, is_group: false, allow_manual_posting: true, system_key: 'service_income', description: '', display_order: 0, is_active: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchLedgerAccounts).mockResolvedValue(accounts);
  vi.mocked(api.fetchTrialBalance).mockResolvedValue({ rows: [], total_debit: '0.00', total_credit: '0.00' });
  vi.mocked(api.fetchAccountingPeriodLocks).mockResolvedValue([]);
});

describe('Accounting core', () => {
  it('renders the working Chart of Accounts and Trial Balance views', async () => {
    renderPage(<ChartOfAccountsPage />);
    expect(await screen.findByText('Accounts Receivable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trial Balance' }));
    expect(screen.getByText('No postings for this outlet.')).toBeInTheDocument();
  });

  it('requires the direct-save voucher to balance before posting', async () => {
    renderPage(<JournalVoucherFormPage />);
    const selects = await screen.findAllByLabelText('Ledger account');
    fireEvent.change(selects[0], { target: { value: 'cash' } }); fireEvent.change(selects[1], { target: { value: 'income' } });
    const debits = screen.getAllByLabelText('Debit amount'); const credits = screen.getAllByLabelText('Credit amount');
    fireEvent.change(debits[0], { target: { value: '1000' } }); fireEvent.change(credits[1], { target: { value: '900' } });
    expect(screen.getByText('Difference: 100.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Post Journal Voucher/ })).toBeDisabled();
    fireEvent.change(credits[1], { target: { value: '1000' } });
    expect(screen.getByText('Balanced and ready to post')).toBeInTheDocument();
  });

  it('shows a separate audited monthly period control', async () => {
    renderPage(<AccountingPeriodsPage />);
    expect(await screen.findByText('Accounting Periods')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lock Month/ })).toBeInTheDocument();
    expect(screen.getByText(/not an operational Day Close/i)).toBeInTheDocument();
  });
});
