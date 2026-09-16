import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '@/features/auth/authSlice';
import permissionsReducer from '@/features/auth/permissionsSlice';
import { uiReducer } from '@/app/store';
import { ExpenseFormPage } from '../pages/ExpenseFormPage';
import { CashBankTransferFormPage } from '../pages/CashBankTransferFormPage';
import * as api from '@/api/client';

vi.mock('@/api/client', () => ({
  fetchExpenseCategories: vi.fn(), fetchPaymentAccountOptions: vi.fn(),
  createExpense: vi.fn(), createCashBankTransfer: vi.fn(),
}));

const store = () => configureStore({
  reducer: { auth: authReducer, permissions: permissionsReducer, ui: uiReducer },
  preloadedState: { ui: { selectedOrganizationId: 'org-1', selectedOutletId: 'outlet-1', sidebarExpanded: true } },
});
const renderPage = (node: React.ReactNode) => render(<Provider store={store()}><MemoryRouter>{node}</MemoryRouter></Provider>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchExpenseCategories).mockResolvedValue([{ id: 'cat-1', code: 'GENERAL', name: 'General Expense', ledger_account: 'ledger-1', ledger_account_code: '6100', ledger_account_name: 'General Expenses', display_order: 0, is_active: true }]);
  vi.mocked(api.fetchPaymentAccountOptions).mockResolvedValue([
    { id: 'cash-1', organisation: 'org-1', code: 'CASH', name: 'Main Cash', account_type: 'cash', opening_balance: '0.00', current_balance: '1000.00', display_order: 0, is_active: true },
    { id: 'bank-1', organisation: 'org-1', code: 'BANK', name: 'SBI Current', account_type: 'bank', opening_balance: '0.00', current_balance: '5000.00', display_order: 0, is_active: true },
  ]);
});

describe('Expenses and cash banking', () => {
  it('renders a full-page expense form with category and payment account choices', async () => {
    renderPage(<ExpenseFormPage />);
    expect(await screen.findByText('Record Expense')).toBeInTheDocument();
    await waitFor(() => expect(api.fetchExpenseCategories).toHaveBeenCalledWith('org-1', true));
    expect(screen.getByRole('option', { name: /General Expense/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Main Cash/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Expense/i })).toBeDisabled();
  });

  it('derives cash deposit from cash-to-bank account selection', async () => {
    renderPage(<CashBankTransferFormPage />);
    await waitFor(() => expect(api.fetchPaymentAccountOptions).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('From Account'), { target: { value: 'cash-1' } });
    fireEvent.change(screen.getByLabelText('To Account'), { target: { value: 'bank-1' } });
    expect(screen.getByText('Cash Deposit')).toBeInTheDocument();
  });
});
