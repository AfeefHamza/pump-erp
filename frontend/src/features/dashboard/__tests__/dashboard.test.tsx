import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uiReducer } from '@/app/store';
import authReducer from '@/features/auth/authSlice';
import permissionsReducer from '@/features/auth/permissionsSlice';
import * as api from '@/api/client';
import { Dashboard } from '../Dashboard';

vi.mock('@/api/client', () => ({ fetchManagementDashboard: vi.fn() }));

const testStore = () => configureStore({
  reducer: { auth: authReducer, permissions: permissionsReducer, ui: uiReducer },
  preloadedState: {
    auth: {
      currentUser: {
        id: 'user-1', email: 'owner@example.com', display_name: 'Owner', phone_number: null,
        organisations: [{
          id: 'org-1', name: 'Pump Org', code: 'PUMP', membership_type: 'owner' as const,
          onboarding_status: 'completed' as const,
          outlets: [{ id: 'outlet-1', name: 'Central Outlet', code: 'CENTRAL' }],
        }],
      },
      authenticationStatus: 'authenticated' as const,
      authenticationError: null,
    },
    permissions: { permissions: [], loading: false, error: null },
    ui: { selectedOrganizationId: 'org-1', selectedOutletId: 'outlet-1', sidebarExpanded: true },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchManagementDashboard).mockResolvedValue({
    business_date: '2026-09-17', outlet: { id: 'outlet-1', code: 'CENTRAL', name: 'Central Outlet' },
    basis: 'Recorded totals include financially locked shifts only. Open and pending shifts are shown separately.',
    recorded: {
      recorded_shift_count: 2, fuel_sales: '100000.00', product_sales: '5000.00', service_sales: '0.00',
      non_fuel_sales: '5000.00', sales_total: '105000.00', sales_tax: '0.00', cash_collections: '45000.00',
      cash_invoice_sales: '5000.00', card_collections: '25000.00', upi_collections: '20000.00',
      fleet_card_collections: '5000.00', digital_collections: '50000.00', credit_sales: '5000.00',
      shift_expenses: '0.00', general_expenses: '1000.00', purchase_total: '0.00', shortage: '0.00', excess: '0.00',
    },
    fuel_products: [{ product_id: 'fuel-1', product_code: 'MS', product_name: 'Petrol', unit: 'litre', quantity: '1000.000', amount: '100000.00' }],
    operations: { recorded_shift_count: 2, open_shift_count: 1, awaiting_recording_count: 0, open_shifts: [{ shift_id: 'shift-1', business_date: '2026-09-17', shift_name: 'Night Shift', is_stale: false }] },
    stock: { total_tanks: 1, total_book_stock: '8500.000', low_stock_count: 1, conflict_count: 0, tanks: [{ tank_id: 'tank-1', tank_code: 'TK-1', tank_name: 'Petrol Tank', product_name: 'Petrol', capacity: '20000.000', book_stock: '8500.000', utilization_pct: '42.5', level: 'normal', status: 'no_dip' }] },
    receivables: { customer_outstanding: '25000.00', unbilled_credit: '5000.00' },
    payables: { supplier_outstanding: '200000.00', supplier_overdue: '50000.00' },
    settlements: { pending_count: 3, pending_amount: '50000.00' },
    alerts: [{ type: 'supplier_overdue', severity: 'warning', title: 'Supplier bills are overdue', detail: 'Overdue supplier balance is 50000.00.', path: '/app/purchases/supplier-outstanding' }],
  });
});

describe('Management Dashboard', () => {
  it('renders authoritative outlet totals, operations, stock and alerts', async () => {
    render(<Provider store={testStore()}><MemoryRouter><Dashboard /></MemoryRouter></Provider>);
    expect(await screen.findByText('Petrol')).toBeInTheDocument();
    expect(screen.getByText('Management Dashboard')).toBeInTheDocument();
    expect(screen.getByText('₹1,05,000')).toBeInTheDocument();
    expect(screen.getByText('1,000.000 litre')).toBeInTheDocument();
    expect(screen.getByText('Night Shift', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Supplier bills are overdue')).toBeInTheDocument();
    expect(screen.queryByText('Demonstration Mode')).not.toBeInTheDocument();
    await waitFor(() => expect(api.fetchManagementDashboard).toHaveBeenCalledWith('org-1', 'outlet-1'));
  });
});
