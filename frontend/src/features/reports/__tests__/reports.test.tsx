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

vi.mock('@/api/client', () => ({
  fetchDailyBusinessSummary: vi.fn(),
  fetchEmployeeAccountabilityReport: vi.fn(),
  fetchEmployees: vi.fn(),
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
});
