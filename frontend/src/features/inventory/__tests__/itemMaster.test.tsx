// frontend/src/features/inventory/__tests__/itemMaster.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ItemsMasterPage } from '../pages/ItemsMasterPage';
import { TaxTreatmentsPage } from '@/features/settings/pages/TaxTreatmentsPage';
import authReducer from '@/features/auth/authSlice';
import permissionsReducer from '@/features/auth/permissionsSlice';
import { uiReducer } from '@/app/store';
import * as apiClient from '@/api/client';

vi.mock('@/api/client', () => {
  return {
    fetchItems: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deactivateItem: vi.fn(),
    fetchUnits: vi.fn(),
    createUnit: vi.fn(),
    fetchUnitConversions: vi.fn(),
    createUnitConversion: vi.fn(),
    fetchTaxTreatments: vi.fn(),
    createTaxTreatment: vi.fn(),
    updateTaxTreatment: vi.fn(),
    createTaxTreatmentRate: vi.fn(),
    updateTaxTreatmentRate: vi.fn(),
    deleteTaxTreatmentRate: vi.fn(),
    createItemPurchaseTaxTreatment: vi.fn(),
  };
});

const mockItems: any[] = [
  {
    id: 'item-1',
    code: 'MS-REG',
    name: 'Petrol (Motor Spirit)',
    item_type: 'fuel',
    inventory_tracking_mode: 'tank',
    base_unit: 'unit-ltr',
    base_unit_code: 'LTR',
    base_unit_name: 'Litre',
    hsn_sac: '2710',
    description: 'Motor Spirit 87 Octane Regular',
    is_active: true,
    is_purchasable: true,
    is_sellable: true,
    current_purchase_tax_treatment: {
      tax_treatment_id: 'tt-oos',
      tax_treatment_name: 'Fuel Out of Scope',
      tax_regime: 'out_of_scope',
      default_itc_classification: 'not_applicable'
    }
  },
  {
    id: 'item-2',
    code: 'LUB-20W40',
    name: 'Engine Oil 20W40 1L',
    item_type: 'stock_item',
    inventory_tracking_mode: 'quantity',
    base_unit: 'unit-can',
    base_unit_code: 'CAN',
    base_unit_name: 'Can',
    hsn_sac: '27101980',
    description: 'Automotive 4T Engine Lubricant',
    is_active: true,
    is_purchasable: true,
    is_sellable: true,
    current_purchase_tax_treatment: {
      tax_treatment_id: 'tt-gst18',
      tax_treatment_name: 'GST 18%',
      tax_regime: 'gst',
      default_itc_classification: 'eligible_inputs'
    }
  },
  {
    id: 'item-3',
    code: 'SRV-OILCHG',
    name: 'Oil Change Service Labour',
    item_type: 'service',
    inventory_tracking_mode: 'none',
    base_unit: 'unit-svc',
    base_unit_code: 'SVC',
    base_unit_name: 'Service',
    hsn_sac: '9987',
    description: 'Vehicle lube oil drain and replacement labour',
    is_active: true,
    is_purchasable: false,
    is_sellable: true,
    current_purchase_tax_treatment: null
  }
];

const mockTaxTreatments: any[] = [
  {
    id: 'tt-gst18',
    code: 'GST-18',
    name: 'GST 18%',
    tax_regime: 'gst',
    description: 'Standard GST rate 18%',
    is_active: true,
    is_purchase_applicable: true,
    is_sales_applicable: true,
    rates: [
      {
        id: 'rate-1',
        effective_from: '2026-01-01',
        effective_to: null,
        gst_rate: '18.00',
        cess_rate: '0.00',
        cess_per_unit: '0.00',
        is_locked: false,
        components: []
      }
    ]
  },
  {
    id: 'tt-exempt',
    code: 'EXEMPT-0',
    name: 'Exempt Supplies',
    tax_regime: 'exempt',
    description: 'Exempt statutory supplies',
    is_active: true,
    is_purchase_applicable: true,
    is_sales_applicable: true,
    rates: [
      {
        id: 'rate-2',
        effective_from: '2026-01-01',
        effective_to: null,
        gst_rate: '0.00',
        cess_rate: '0.00',
        cess_per_unit: '0.00',
        is_locked: true,
        components: []
      }
    ]
  }
];

const renderComponent = (component: React.ReactNode) => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      permissions: permissionsReducer,
      ui: uiReducer,
    },
    preloadedState: {
      ui: {
        selectedOrganizationId: 'org-test-123',
        selectedOutletId: 'outlet-test-123',
        sidebarExpanded: true,
      }
    }
  });

  return render(
    <Provider store={store}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={component} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
};

describe('Item Master & Settings Tax Treatments Frontend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.fetchItems).mockResolvedValue(mockItems);
    vi.mocked(apiClient.fetchUnits).mockResolvedValue([
      { id: 'unit-ltr', code: 'LTR', name: 'Litre', unit_type: 'volume', is_active: true, created_at: '' },
      { id: 'unit-can', code: 'CAN', name: 'Can', unit_type: 'quantity', is_active: true, created_at: '' },
    ]);
    vi.mocked(apiClient.fetchUnitConversions).mockResolvedValue([]);
    vi.mocked(apiClient.fetchTaxTreatments).mockResolvedValue(mockTaxTreatments);
  });

  it('1. Renders Item Master page with catalog items and type badges', async () => {
    renderComponent(<ItemsMasterPage />);

    await waitFor(() => {
      expect(screen.getByText('Petrol (Motor Spirit)')).toBeInTheDocument();
      expect(screen.getByText('Engine Oil 20W40 1L')).toBeInTheDocument();
      expect(screen.getByText('Oil Change Service Labour')).toBeInTheDocument();
    });

    // Check code badges
    expect(screen.getByText('MS-REG')).toBeInTheDocument();
    expect(screen.getByText('LUB-20W40')).toBeInTheDocument();

    // Check tracking mode representations
    expect(screen.getByText('Tank Ledger')).toBeInTheDocument();
    expect(screen.getByText('Qty Ledger')).toBeInTheDocument();
    expect(screen.getByText('No Ledger')).toBeInTheDocument();
  });

  it('2. Filters items by item category tab', async () => {
    renderComponent(<ItemsMasterPage />);

    await waitFor(() => {
      expect(screen.getByText('Petrol (Motor Spirit)')).toBeInTheDocument();
    });

    // Click Fuel Products tab
    const fuelTab = screen.getByRole('button', { name: /Fuel Products/i });
    fireEvent.click(fuelTab);

    // Fuel product should remain, stock items and services should disappear
    expect(screen.getByText('Petrol (Motor Spirit)')).toBeInTheDocument();
    expect(screen.queryByText('Engine Oil 20W40 1L')).not.toBeInTheDocument();
    expect(screen.queryByText('Oil Change Service Labour')).not.toBeInTheDocument();
  });

  it('3. Searches items by text query', async () => {
    renderComponent(<ItemsMasterPage />);

    await waitFor(() => {
      expect(screen.getByText('Petrol (Motor Spirit)')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search items by code, name, HSN\/SAC/i);
    fireEvent.change(searchInput, { target: { value: 'Engine' } });

    expect(screen.queryByText('Petrol (Motor Spirit)')).not.toBeInTheDocument();
    expect(screen.getByText('Engine Oil 20W40 1L')).toBeInTheDocument();
  });

  it('4. Renders Tax Treatments page with statutory regimes and rate versions', async () => {
    renderComponent(<TaxTreatmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('GST 18%')).toBeInTheDocument();
      expect(screen.getByText('Exempt Supplies')).toBeInTheDocument();
    });

    // Check codes and regimes
    expect(screen.getByText('GST-18')).toBeInTheDocument();
    expect(screen.getByText('EXEMPT-0')).toBeInTheDocument();
    expect(screen.getAllByText('GST').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('EXEMPT').length).toBeGreaterThanOrEqual(1);

    // Check active rates
    expect(screen.getByText(/18.*% GST/i)).toBeInTheDocument();
    expect(screen.getByText(/0% \(Exempted\)/i)).toBeInTheDocument();
  });

  it('5. Filters Tax Treatments by regime', async () => {
    renderComponent(<TaxTreatmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('GST 18%')).toBeInTheDocument();
      expect(screen.getByText('EXEMPT-0')).toBeInTheDocument();
    });

    const gstFilter = screen.getByRole('button', { name: /^GST$/i });
    fireEvent.click(gstFilter);

    expect(screen.getByText('GST 18%')).toBeInTheDocument();
    expect(screen.queryByText('EXEMPT-0')).not.toBeInTheDocument();
  });
});
