import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '@/features/auth/authSlice';
import permissionsReducer from '@/features/auth/permissionsSlice';
import { uiReducer } from '@/app/store';
import { DigitalSettlementFormPage } from '../pages/DigitalSettlementFormPage';
import { DigitalSettlementsPage } from '../pages/DigitalSettlementsPage';
import * as api from '@/api/client';

vi.mock('@/api/client', () => ({
  fetchPendingDigitalCollections: vi.fn(),
  fetchPaymentAccountOptions: vi.fn(),
  createDigitalSettlement: vi.fn(),
  fetchDigitalSettlements: vi.fn(),
}));

const store = () => configureStore({
  reducer: { auth: authReducer, permissions: permissionsReducer, ui: uiReducer },
  preloadedState: {
    ui: { selectedOrganizationId: 'org-1', selectedOutletId: 'outlet-1', sidebarExpanded: true },
  },
});

const renderPage = (node: React.ReactNode) => render(
  <Provider store={store()}><MemoryRouter>{node}</MemoryRouter></Provider>,
);

const collections = [
  {
    id: 'collection-1', collection_method: 'card' as const, amount: '500.00',
    occurred_at: '2026-09-15T09:00:00Z', provider_name: 'HDFC',
    reference_number: 'CARD-001', terminal_or_account_reference: 'T-01',
    employee_name: 'Asha', shift_id: 'shift-1', shift_card_id: null,
  },
  {
    id: 'collection-2', collection_method: 'card' as const, amount: '500.00',
    occurred_at: '2026-09-15T10:00:00Z', provider_name: 'HDFC',
    reference_number: 'CARD-002', terminal_or_account_reference: 'T-01',
    employee_name: 'Manu', shift_id: 'shift-1', shift_card_id: null,
  },
  {
    id: 'collection-3', collection_method: 'upi' as const, amount: '250.00',
    occurred_at: '2026-09-15T11:00:00Z', provider_name: 'PhonePe',
    reference_number: 'UPI-001', terminal_or_account_reference: null,
    employee_name: 'Asha', shift_id: 'shift-1', shift_card_id: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchPendingDigitalCollections).mockResolvedValue(collections);
  vi.mocked(api.fetchPaymentAccountOptions).mockResolvedValue([
    { id: 'bank-1', organisation: 'org-1', code: 'BANK', name: 'SBI Current', account_type: 'bank', opening_balance: '0.00', current_balance: '5000.00', display_order: 0, is_active: true },
    { id: 'cash-1', organisation: 'org-1', code: 'CASH', name: 'Main Cash', account_type: 'cash', opening_balance: '0.00', current_balance: '1000.00', display_order: 0, is_active: true },
  ]);
});

describe('Digital settlements', () => {
  it('groups pending collections by method and provider and calculates the net credit', async () => {
    renderPage(<DigitalSettlementFormPage />);
    const group = await screen.findByLabelText('Provider and Method');
    expect(screen.getByRole('option', { name: /HDFC · Card · 2 collections/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /PhonePe · UPI · 1 collections/ })).toBeInTheDocument();

    fireEvent.change(group, { target: { value: 'card|hdfc' } });
    expect(await screen.findByText('CARD-001')).toBeInTheDocument();
    expect(screen.queryByText('UPI-001')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
    fireEvent.change(screen.getByLabelText('Gateway Charges'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('TDS Deducted'), { target: { value: '10' } });

    expect(screen.getByText('₹970.00')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'strong' })).toBeInTheDocument();
  });

  it('offers only bank accounts and enables save only after required settlement data', async () => {
    renderPage(<DigitalSettlementFormPage />);
    await waitFor(() => expect(api.fetchPaymentAccountOptions).toHaveBeenCalledWith('org-1', 'outlet-1'));
    expect(screen.getByRole('option', { name: 'SBI Current' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Main Cash' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Provider and Method'), { target: { value: 'card|hdfc' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Select All' }));
    fireEvent.change(screen.getByLabelText('Bank Account'), { target: { value: 'bank-1' } });
    fireEvent.change(screen.getByLabelText('Bank Reference'), { target: { value: 'UTR-001' } });
    expect(screen.getByRole('button', { name: /Save Settlement/ })).toBeEnabled();
  });

  it('renders pending and settled totals on the settlement register', async () => {
    vi.mocked(api.fetchDigitalSettlements).mockResolvedValue({
      results: [],
      summary: {
        pending_count: 3, pending_amount: '1250.00', settled_gross: '1000.00',
        charges_total: '20.00', net_received: '970.00',
      },
    });
    renderPage(<DigitalSettlementsPage />);
    expect(await screen.findByText('Digital Settlements')).toBeInTheDocument();
    expect(screen.getByText('3 · ₹1,250.00')).toBeInTheDocument();
    expect(screen.getByText('₹970.00')).toBeInTheDocument();
  });
});
