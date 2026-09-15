import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '@/features/auth/authSlice';
import permissionsReducer from '@/features/auth/permissionsSlice';
import { uiReducer } from '@/app/store';
import * as api from '@/api/client';
import { SalesInvoiceFormPage } from '../pages/SalesInvoiceFormPage';
import { SalesInvoiceListPage } from '../pages/SalesInvoiceListPage';
import { CustomerReceiptFormPage } from '../pages/CustomerReceiptFormPage';

vi.mock('@/api/client', () => ({
  fetchCustomers: vi.fn(), fetchPaymentAccountOptions: vi.fn(), fetchSalesPreparation: vi.fn(),
  fetchUnbilledCreditSlips: vi.fn(), createSalesInvoice: vi.fn(), fetchSalesInvoices: vi.fn(),
  fetchCustomerOpenSalesInvoices: vi.fn(), createCustomerReceipt: vi.fn(),
}));

const makeStore = () => configureStore({
  reducer: { auth: authReducer, permissions: permissionsReducer, ui: uiReducer },
  preloadedState: { ui: { selectedOrganizationId: 'org-1', selectedOutletId: 'outlet-1', sidebarExpanded: true } },
});
const renderPage = (node: React.ReactNode) => render(<Provider store={makeStore()}><MemoryRouter>{node}</MemoryRouter></Provider>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchCustomers).mockResolvedValue([{ id: 'customer-1', organisation: 'org-1', customer_code: 'C001', display_name: 'ABC Travels', customer_type: 'business', status: 'active' }]);
  vi.mocked(api.fetchPaymentAccountOptions).mockResolvedValue([{ id: 'cash-1', organisation: 'org-1', code: 'CASH', name: 'Main Cash', account_type: 'cash', opening_balance: '0', current_balance: '0', display_order: 0, is_active: true }]);
  vi.mocked(api.fetchSalesPreparation).mockResolvedValue({ items: [{ id: 'oil-1', code: 'OIL', name: 'Engine Oil', item_type: 'stock_item', unit: 'PCS', hsn_sac: '2710', available_quantity: '10.0000', tax_treatment_id: 'gst18', tax_treatment_name: 'GST 18%' }], tax_treatments: [{ id: 'gst18', name: 'GST 18%', tax_regime: 'gst' }] });
  vi.mocked(api.fetchUnbilledCreditSlips).mockResolvedValue([{ id: 'slip-1', slip_number: 'CS-001', occurred_at: '2026-09-15T10:00:00Z', product_name: 'Petrol', quantity: '5.000', unit_price: '100.00', amount: '500.00', vehicle_number: 'KL-01-AA-1' }]);
  vi.mocked(api.fetchCustomerOpenSalesInvoices).mockResolvedValue([{ id: 'invoice-1', invoice_number: 'SI-001', invoice_date: '2026-09-01', due_date: '2026-09-15', grand_total: '700.00', outstanding_amount: '700.00' }, { id: 'invoice-2', invoice_number: 'SI-002', invoice_date: '2026-09-02', due_date: '2026-09-16', grand_total: '600.00', outstanding_amount: '600.00' }]);
});

describe('Sales milestone', () => {
  it('shows the working invoice list and create action', async () => {
    vi.mocked(api.fetchSalesInvoices).mockResolvedValue([]);
    renderPage(<SalesInvoiceListPage />);
    expect(await screen.findByText('Sales Invoices')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New Sales Invoice/i })).toBeInTheDocument();
  });

  it('uses a full-page item invoice workspace with canonical items', async () => {
    renderPage(<SalesInvoiceFormPage />);
    expect(await screen.findByText('New Sales Invoice')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Engine Oil (OIL)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Petrol/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Fuel is billed from Credit Slips/)).toBeInTheDocument();
  });

  it('adds an existing meter Credit Slip without manual fuel entry', async () => {
    renderPage(<SalesInvoiceFormPage />);
    fireEvent.change(await screen.findByLabelText(/Customer/), { target: { value: 'customer-1' } });
    await screen.findByText('CS-001');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Non-GST Petroleum')).toBeInTheDocument();
    expect(screen.getByText('Meter sale')).toBeInTheDocument();
  });

  it('auto allocates a customer receipt oldest invoice first', async () => {
    renderPage(<CustomerReceiptFormPage />);
    fireEvent.change(await screen.findByLabelText('Customer'), { target: { value: 'customer-1' } });
    await screen.findByText('SI-001');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: /Auto Allocate/i }));
    expect((screen.getByLabelText('Allocate SI-001') as HTMLInputElement).value).toBe('700.00');
    expect((screen.getByLabelText('Allocate SI-002') as HTMLInputElement).value).toBe('300.00');
  });
});
