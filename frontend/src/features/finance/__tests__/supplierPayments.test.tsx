import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '@/features/auth/authSlice';
import permissionsReducer from '@/features/auth/permissionsSlice';
import { uiReducer } from '@/app/store';
import { SupplierPaymentFormPage } from '../pages/SupplierPaymentFormPage';
import { SupplierPaymentsPage } from '../pages/SupplierPaymentsPage';
import * as api from '@/api/client';

vi.mock('@/api/client', () => ({
  fetchSuppliers: vi.fn(),
  fetchPaymentAccountOptions: vi.fn(),
  fetchSupplierOpenBills: vi.fn(),
  createSupplierPayment: vi.fn(),
  fetchSupplierPayments: vi.fn(),
}));

const store = () => configureStore({
  reducer: { auth: authReducer, permissions: permissionsReducer, ui: uiReducer },
  preloadedState: { ui: { selectedOrganizationId: 'org-1', selectedOutletId: 'outlet-1', sidebarExpanded: true } },
});

const renderPage = (node: React.ReactNode) => render(<Provider store={store()}><MemoryRouter>{node}</MemoryRouter></Provider>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchSuppliers).mockResolvedValue([{ id: 'supplier-1', code: 'IOCL', name: 'Indian Oil', is_active: true, created_at: '' }]);
  vi.mocked(api.fetchPaymentAccountOptions).mockResolvedValue([
    { id: 'bank-1', organisation: 'org-1', code: 'BANK', name: 'SBI Current', account_type: 'bank', opening_balance: '0.00', current_balance: '5000.00', display_order: 0, is_active: true },
    { id: 'cash-1', organisation: 'org-1', code: 'CASH', name: 'Main Cash', account_type: 'cash', opening_balance: '0.00', current_balance: '1000.00', display_order: 0, is_active: true },
  ]);
  vi.mocked(api.fetchSupplierOpenBills).mockResolvedValue([
    { id: 'bill-1', bill_number: 'PB-001', supplier_invoice_number: 'INV-1', invoice_date: '2026-09-01', due_date: '2026-09-10', grand_total: '700.00', amount_paid: '0.00', outstanding_amount: '700.00', payment_status: 'unpaid' },
    { id: 'bill-2', bill_number: 'PB-002', supplier_invoice_number: 'INV-2', invoice_date: '2026-09-02', due_date: '2026-09-20', grand_total: '600.00', amount_paid: '0.00', outstanding_amount: '600.00', payment_status: 'unpaid' },
  ]);
});

describe('Supplier payments', () => {
  it('renders the working supplier payments list and summary', async () => {
    vi.mocked(api.fetchSupplierPayments).mockResolvedValue({ results: [], summary: { total_active_payments: '1000.00', total_allocated: '800.00', total_unallocated: '200.00' } });
    renderPage(<SupplierPaymentsPage />);
    expect(await screen.findByText('Supplier Payments')).toBeInTheDocument();
    expect(await screen.findByText('Supplier Advances')).toBeInTheDocument();
    expect(screen.getByText('₹200.00')).toBeInTheDocument();
  });

  it('auto allocates oldest bills without exceeding the payment amount', async () => {
    renderPage(<SupplierPaymentFormPage />);
    fireEvent.change(await screen.findByLabelText('Supplier'), { target: { value: 'supplier-1' } });
    await screen.findByText('PB-001');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: /Auto Allocate/i }));
    expect((screen.getByLabelText('Allocate PB-001') as HTMLInputElement).value).toBe('700.00');
    expect((screen.getByLabelText('Allocate PB-002') as HTMLInputElement).value).toBe('300.00');
    expect(screen.getByText('₹0.00')).toBeInTheDocument();
  });

  it('filters account choices by payment method', async () => {
    renderPage(<SupplierPaymentFormPage />);
    await waitFor(() => expect(api.fetchPaymentAccountOptions).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Payment Method'), { target: { value: 'cash' } });
    expect(screen.getByRole('option', { name: /Main Cash/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /SBI Current/ })).not.toBeInTheDocument();
  });
});
