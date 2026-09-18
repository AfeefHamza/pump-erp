import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '@/features/auth/authSlice';
import permissionsReducer from '@/features/auth/permissionsSlice';
import { uiReducer } from '@/app/store';
import * as api from '@/api/client';
import { ReportsHubPage } from '../pages/ReportsHubPage';
import { DailyBusinessSummaryPage } from '../pages/DailyBusinessSummaryPage';
import { EmployeeAccountabilityPage } from '../pages/EmployeeAccountabilityPage';
import { CoreRegistersPage } from '../pages/CoreRegistersPage';
import { OperationalRegistersPage } from '../pages/OperationalRegistersPage';

vi.mock('@/api/client', () => ({
  fetchDailyBusinessSummary: vi.fn(),
  fetchEmployeeAccountabilityReport: vi.fn(),
  fetchEmployees: vi.fn(),
  fetchCoreReportPack: vi.fn(),
  fetchOperationalReportPack: vi.fn(),
}));

const store = () => configureStore({
  reducer: { auth: authReducer, permissions: permissionsReducer, ui: uiReducer },
  preloadedState: { ui: { selectedOrganizationId: 'org-1', selectedOutletId: 'outlet-1', sidebarExpanded: true } },
});
const renderPage = (node: React.ReactNode) => render(<Provider store={store()}><MemoryRouter>{node}</MemoryRouter></Provider>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchEmployees).mockResolvedValue([{ id: 'emp-1', employee_code: 'EMP-1', display_name: 'Asha' }] as any);
  vi.mocked(api.fetchDailyBusinessSummary).mockResolvedValue({
    filters: { from_date: '2026-09-16', to_date: '2026-09-16' }, basis: 'Recorded and financially locked shifts only',
    summary: {
      recorded_shift_count: 1, fuel_sales: '10000.00', product_sales: '500.00', service_sales: '0.00',
      non_fuel_sales: '500.00', sales_total: '10500.00', sales_tax: '0.00', cash_collections: '4000.00',
      cash_invoice_sales: '500.00', card_collections: '2500.00', upi_collections: '2000.00',
      fleet_card_collections: '1500.00', digital_collections: '6000.00', credit_sales: '0.00',
      shift_expenses: '0.00', general_expenses: '200.00', purchase_total: '0.00', shortage: '0.00', excess: '0.00',
    },
    fuel_products: [{ product_id: 'fuel-1', product_code: 'MS', product_name: 'Petrol', unit: 'litre', quantity: '100.000', amount: '10000.00' }],
    shifts: [{
      shift_id: 'shift-1', posting_id: 'posting-1', posting_version: 1, business_date: '2026-09-16',
      shift_name: 'Day Shift', shift_code: 'DAY', cash_account_name: 'Main Cash', fuel_sales: '10000.00',
      cash: '4000.00', card: '2500.00', upi: '2000.00', fleet_card: '1500.00', digital: '6000.00',
      credit: '0.00', shift_expenses: '0.00', decreasing_adjustments: '0.00', shortage: '0.00', excess: '0.00',
    }],
  });
  vi.mocked(api.fetchEmployeeAccountabilityReport).mockResolvedValue({
    filters: { from_date: '2026-09-16', to_date: '2026-09-16', employee_id: null },
    basis: 'Reconciled employee settlements from financially locked shifts',
    summary: { employee_count: 1, shift_settlement_count: 1, shortage: '0.00', excess: '0.00' },
    employees: [{ employee_id: 'emp-1', employee_code: 'EMP-1', employee_name: 'Asha', shift_count: 1, expected_sales: '10000.00', cash: '4000.00', card: '2500.00', upi: '2000.00', fleet_card: '1500.00', digital: '6000.00', credit: '0.00', approved_increases: '0.00', approved_decreases: '0.00', accounted: '10000.00', shortage: '0.00', excess: '0.00' }],
    details: [{ settlement_id: 'settlement-1', shift_id: 'shift-1', shift_card_id: 'card-1', employee_id: 'emp-1', employee_code: 'EMP-1', employee_name: 'Asha', business_date: '2026-09-16', shift_name: 'Day Shift', expected_sales: '10000.00', cash: '4000.00', card: '2500.00', upi: '2000.00', fleet_card: '1500.00', credit: '0.00', approved_increases: '0.00', approved_decreases: '0.00', accounted: '10000.00', shortage: '0.00', excess: '0.00', result: 'balanced' }],
  });
  vi.mocked(api.fetchCoreReportPack).mockResolvedValue({
    filters: { from_date: '2026-09-16', to_date: '2026-09-16' },
    basis: { sales: 'Active invoice documents.', purchases: 'Active purchase bills.', stock: 'Append-only stock ledger.', payments: 'Locked shift postings.' },
    sales: { count: 1, truncated: false, totals: { subtotal: '1000.00', tax: '180.00', total: '1180.00', paid: '0.00', outstanding: '1180.00' }, rows: [{ invoice_id: 'invoice-1', invoice_number: 'SI-001', invoice_date: '2026-09-16', due_date: '2026-09-16', invoice_type: 'credit', customer_name: 'ABC Customer', payment_method: null, subtotal: '1000.00', tax_total: '180.00', grand_total: '1180.00', amount_paid: '0.00', outstanding: '1180.00', contains_credit_slips: true }] },
    purchases: { count: 0, truncated: false, totals: { taxable: '0.00', tax: '0.00', total: '0.00', paid: '0.00', outstanding: '0.00' }, rows: [] },
    stock: { count: 1, truncated: false, totals: { inward: '0.000', outward: '10.000', net: '-10.000' }, rows: [{ movement_id: 'movement-1', tank_id: 'tank-1', business_date: '2026-09-16', effective_at: '2026-09-16T12:00:00Z', tank_code: 'TK-1', product_name: 'Petrol', movement_type: 'nozzle_dispensing', movement_label: 'Nozzle Gross Dispensing', direction: 'OUT', quantity: '10.000', source_type: 'shift_card_meter', source_id: 'shift-1', reason: '' }] },
    payments: { count: 1, truncated: false, totals: { cash: '400.00', card: '300.00', upi: '200.00', fleet_card: '100.00', credit: '0.00', digital: '600.00', total: '1000.00' }, rows: [{ posting_id: 'posting-1', shift_id: 'shift-1', business_date: '2026-09-16', shift_name: 'Day Shift', cash: '400.00', card: '300.00', upi: '200.00', fleet_card: '100.00', credit: '0.00', total: '1000.00' }] },
  });
  vi.mocked(api.fetchOperationalReportPack).mockResolvedValue({
    filters: { from_date: '2026-09-16', to_date: '2026-09-16' },
    basis: 'Recorded operational source documents.',
    shifts: { count: 1, truncated: false, rows: [{ card_id: 'card-1', shift_id: 'shift-1', business_date: '2026-09-16', shift_name: 'Day Shift', employee_name: 'Asha', employee_code: 'EMP-1', mpd_slip_number: 'MPD-1', is_locked: true, expected_sales: '10000.00', accounted: '10000.00', difference: '0.00', result: 'balanced' }] },
    meters: { count: 0, truncated: false, rows: [] },
    dips: { count: 0, truncated: false, rows: [] },
    receipts: { count: 0, truncated: false, rows: [] },
    credit_slips: { count: 0, total: '0.00', truncated: false, rows: [] },
    expenses: { count: 0, total: '0.00', truncated: false, rows: [] },
  });
});

describe('Reports', () => {
  it('shows only implemented reports in the reports hub', () => {
    renderPage(<ReportsHubPage />);
    expect(screen.getByText('Daily Business Summary')).toBeInTheDocument();
    expect(screen.getByText('Employee Accountability')).toBeInTheDocument();
    expect(screen.queryByText('Profit & Loss')).not.toBeInTheDocument();
  });

  it('renders recorded shift totals and fuel product quantities', async () => {
    renderPage(<DailyBusinessSummaryPage />);
    expect(await screen.findByText('Petrol')).toBeInTheDocument();
    expect(screen.getByText('100.000')).toBeInTheDocument();
    expect(screen.getByText('Day Shift', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('1 recorded shifts')).toBeInTheDocument();
  });

  it('filters and displays employee digital accountability including fleet cards', async () => {
    renderPage(<EmployeeAccountabilityPage />);
    await screen.findAllByText('Asha');
    await waitFor(() => expect(api.fetchEmployees).toHaveBeenCalledWith('org-1', { outlet: 'outlet-1', status: 'active' }));
    fireEvent.change(screen.getByLabelText('Employee'), { target: { value: 'emp-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(api.fetchEmployeeAccountabilityReport).toHaveBeenLastCalledWith(
      'org-1', 'outlet-1', expect.objectContaining({ employee_id: 'emp-1' }),
    ));
    expect(screen.getAllByText('₹6,000.00').length).toBeGreaterThan(0);
    expect(screen.getByText('₹2,500.00 / ₹2,000.00 / ₹1,500.00')).toBeInTheDocument();
  });

  it('shows invoice-register totals and identifies credit-slip billing', async () => {
    render(<Provider store={store()}><MemoryRouter initialEntries={['/app/reports/core-registers?section=sales']}><CoreRegistersPage /></MemoryRouter></Provider>);
    expect(await screen.findByText('SI-001')).toBeInTheDocument();
    expect(screen.getByText('ABC Customer')).toBeInTheDocument();
    expect(screen.getByText('Credit-slip billing')).toBeInTheDocument();
    expect(screen.getAllByText('₹1,180.00').length).toBeGreaterThan(0);
    await waitFor(() => expect(api.fetchCoreReportPack).toHaveBeenCalledWith('org-1', 'outlet-1', expect.any(Object)));
  });

  it('shows the consolidated Shift Card operational register', async () => {
    render(<Provider store={store()}><MemoryRouter initialEntries={['/app/reports/operational-registers?section=shifts']}><OperationalRegistersPage /></MemoryRouter></Provider>);
    expect(await screen.findByText('MPD-1')).toBeInTheDocument();
    expect(screen.getByText('Asha')).toBeInTheDocument();
    expect(screen.getByText('Recorded')).toBeInTheDocument();
    await waitFor(() => expect(api.fetchOperationalReportPack).toHaveBeenCalledWith('org-1', 'outlet-1', expect.any(Object)));
  });
});
