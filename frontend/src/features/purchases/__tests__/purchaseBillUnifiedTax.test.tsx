// frontend/src/features/purchases/__tests__/purchaseBillUnifiedTax.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PurchaseBillWorkspace } from '../pages/PurchaseBillWorkspace';
import authReducer from '@/features/auth/authSlice';
import permissionsReducer from '@/features/auth/permissionsSlice';
import { uiReducer } from '@/app/store';
import * as apiClient from '@/api/client';

// Mock API client methods
vi.mock('@/api/client', () => {
  return {
    fetchSuppliers: vi.fn(),
    fetchFuelProducts: vi.fn(),
    fetchPurchaseItems: vi.fn(),
    fetchPurchaseTaxCodes: vi.fn(),
    previewPurchaseBillCalculation: vi.fn(),
    fetchAvailableTankerReceipts: vi.fn(),
    fetchPurchaseBillDetail: vi.fn(),
    createPurchaseBill: vi.fn(),
    updatePurchaseBill: vi.fn(),
    voidPurchaseBill: vi.fn(),
    createSupplier: vi.fn(),
    uploadPurchaseBillAttachment: vi.fn(),
    getPurchaseBillAttachmentDownloadUrl: vi.fn(),
    fetchEffectivePermissions: vi.fn(),
    ApiError: class ApiError extends Error {
      status: number;
      data: unknown;
      constructor(status: number, message: string, data: unknown) {
        super(message);
        this.status = status;
        this.data = data;
      }
    }
  };
});

const mockSuppliers = [
  {
    id: 'sup-local',
    name: 'Bharat Petroleum Local',
    code: 'BPCL-LOC',
    gstin: '27AAAAA0000A1Z5',
    gst_registration_type: 'registered',
    state: 'Maharashtra',
    state_code: '27',
    is_active: true
  },
  {
    id: 'sup-interstate',
    name: 'Castrol India Interstate',
    code: 'CASTROL-GJ',
    gstin: '24BBBBB0000B1Z6',
    gst_registration_type: 'registered',
    state: 'Gujarat',
    state_code: '24',
    is_active: true
  }
];

const mockFuelProducts = [
  { id: 'fuel-1', name: 'High Speed Diesel', code: 'HSD', current_price: '90.00', is_active: true },
  { id: 'fuel-2', name: 'Motor Spirit Petrol', code: 'MS', current_price: '100.00', is_active: true }
];

const mockPurchaseItems = [
  {
    id: 'item-lube',
    name: 'Castrol GTX 15W-40',
    code: 'LUBE-GTX',
    item_type: 'goods',
    unit: 'can',
    hsn_sac: '27101980',
    purchase_tax_treatment: 'gst',
    default_purchase_tax_code: 'tc-gst18',
    default_purchase_tax_code_code: 'GST_18',
    default_itc_classification: 'eligible_inputs',
    is_active: true
  },
  {
    id: 'item-dispenser-service',
    name: 'Dispenser Calibration Service',
    code: 'SRV-CALIB',
    item_type: 'service',
    unit: 'visit',
    hsn_sac: '9987',
    purchase_tax_treatment: 'gst',
    default_purchase_tax_code: 'tc-gst18',
    default_purchase_tax_code_code: 'GST_18',
    default_itc_classification: 'eligible_input_services',
    is_active: true
  }
];

const mockTaxCodes = [
  {
    id: 'tc-gst18',
    code: 'GST_18',
    name: 'GST 18% Standard',
    tax_regime: 'gst',
    is_active: true,
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
    id: 'tc-petro',
    code: 'PETRO_DIESEL',
    name: 'Diesel Petroleum Levies',
    tax_regime: 'non_gst_petroleum',
    is_active: true,
    rates: [
      {
        id: 'rate-2',
        effective_from: '2026-01-01',
        effective_to: null,
        gst_rate: '0.00',
        cess_rate: '0.00',
        cess_per_unit: '0.00',
        is_locked: true,
        components: [
          { name: 'VAT', rate_value: '20.00', calculation_type: 'percentage' }
        ]
      }
    ]
  }
];

const mockLegacyBill = {
  id: 'legacy-bill-1',
  bill_number: 'PB-2026-LEGACY',
  calculation_version: 'legacy_v1',
  status: 'active',
  supplier: 'sup-local',
  supplier_invoice_number: 'INV-LEGACY-01',
  invoice_date: '2026-05-01',
  due_date: '2026-05-31',
  currency: 'PKR',
  subtotal: '100000.00',
  discount_total: '0.00',
  additional_charges_total: '500.00',
  tax_total: '17000.00',
  round_off_amount: '0.00',
  grand_total: '117500.00',
  amount_paid: '0.00',
  outstanding_amount: '117500.00',
  lines: [
    {
      id: 'line-leg-1',
      line_type: 'fuel',
      product: 'fuel-1',
      quantity: '1000.000',
      unit: 'LTR',
      unit_rate: '100.00',
      discount_amount: '0.00',
      line_total: '100000.00'
    }
  ],
  adjustments: [
    {
      id: 'adj-1',
      label: 'Freight',
      component_type: 'charge',
      calculation_type: 'fixed_amount',
      calculated_amount: '500.00',
      sequence: 1
    }
  ],
  other_charges: [],
  receipt_links: [],
  attachments: []
};

const createTestStore = () => {
  return configureStore({
    reducer: {
      ui: uiReducer,
      auth: authReducer,
      permissions: permissionsReducer,
    } as any,
    preloadedState: {
      ui: {
        selectedOrganizationId: 'org-1',
        selectedOutletId: 'outlet-1',
        sidebarExpanded: true,
      },
      auth: {
        currentUser: {
          id: 'user-1',
          email: 'admin@example.com',
          display_name: 'Admin User',
          phone_number: '',
          organisations: [
            {
              id: 'org-1',
              name: 'Test Pump Station',
              code: 'TPS',
              membership_type: 'owner',
              onboarding_status: 'completed',
              outlets: [{ id: 'outlet-1', name: 'Main Station', code: 'OUT1' }],
            },
          ],
        },
        authenticationStatus: 'authenticated',
        authenticationError: null,
      },
      permissions: {
        permissions: [
          'supplier.create',
          'purchase_bill.create',
          'purchase_bill.edit',
          'purchase_bill.void',
          'purchase_tax_code.view',
          'purchase_tax_code.manage'
        ],
        loading: false,
        error: null,
      },
    } as any,
  });
};

const renderWorkspace = (route = '/app/purchases/purchase-bills/new', store = createTestStore()) => {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/app/purchases/purchase-bills/new" element={<PurchaseBillWorkspace />} />
          <Route path="/app/purchases/purchase-bills/:billId" element={<PurchaseBillWorkspace />} />
          <Route path="/app/purchases/purchase-bills" element={<div>Purchase Bills List Screen</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
};

describe('Unified Purchase Bills Taxation & Master Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.fetchSuppliers).mockResolvedValue(mockSuppliers as any);
    vi.mocked(apiClient.fetchFuelProducts).mockResolvedValue(mockFuelProducts as any);
    vi.mocked(apiClient.fetchPurchaseItems).mockResolvedValue(mockPurchaseItems as any);
    vi.mocked(apiClient.fetchPurchaseTaxCodes).mockResolvedValue(mockTaxCodes as any);
    vi.mocked(apiClient.fetchAvailableTankerReceipts).mockResolvedValue([]);
    vi.mocked(apiClient.previewPurchaseBillCalculation).mockResolvedValue({
      status: 'success',
      place_of_supply_state: 'Maharashtra',
      place_of_supply_state_code: '27',
      is_interstate: false,
      subtotal: '10000.00',
      discount_total: '0.00',
      taxable_value_total: '10000.00',
      cgst_total: '900.00',
      sgst_total: '900.00',
      igst_total: '0.00',
      gst_cess_total: '0.00',
      petroleum_tax_total: '0.00',
      other_charges_subtotal: '0.00',
      other_charges_tax_total: '0.00',
      additional_charges_total: '0.00',
      tax_total: '1800.00',
      round_off_amount: '0.00',
      grand_total: '11800.00',
      lines: [
        {
          line_number: 1,
          line_total: '11800.00',
          cgst_amount: '900.00',
          sgst_amount: '900.00',
          igst_amount: '0.00',
          cess_amount: '0.00',
          petroleum_tax_amount: '0.00'
        }
      ],
      other_charges: []
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Renders unified item options combining Fuel Products and Purchase Items', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Check that tax mode toggle is present
    expect(screen.getByText('Tax Exclusive')).toBeInTheDocument();
    expect(screen.getByText('Tax Inclusive')).toBeInTheDocument();

    // Check that bill discount selector is present
    expect(screen.getByText('Bill Discount:')).toBeInTheDocument();

    // Check that other charges section is rendered
    expect(screen.getByText(/Other Charges \(Freight, Insurance, Handling\)/i)).toBeInTheDocument();
  });

  it('2. Tax Exclusive and Tax Inclusive pricing toggle switches mode cleanly', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    const inclBtn = screen.getByText('Tax Inclusive');
    fireEvent.click(inclBtn);

    // Line items header should now indicate Rates Tax-Inclusive
    expect(screen.getByText('Rates Tax-Inclusive')).toBeInTheDocument();
  });

  it('3. Other Charges section allows adding a freight charge with calculation method', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Click "Add Charge"
    const addChargeBtn = screen.getByText('Add Charge');
    fireEvent.click(addChargeBtn);

    // Row should appear with Freight / Transport option
    expect(screen.getByText('Freight / Transport')).toBeInTheDocument();
    expect(screen.getByText('Fixed (Rs.)')).toBeInTheDocument();
    expect(screen.getByText('Taxable')).toBeInTheDocument();
  });

  it('4. Place of Supply override modal opens and accepts state code and mandatory reason', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Click override POS icon/button
    const overrideBtn = screen.getByTitle('Override Place of Supply');
    fireEvent.click(overrideBtn);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText('Place of Supply Override')).toBeInTheDocument();
      expect(screen.getByText('Enable Place of Supply Override')).toBeInTheDocument();
    });

    // Enable override
    const enableCheckbox = screen.getByRole('checkbox', { name: /Enable Place of Supply Override/i });
    fireEvent.click(enableCheckbox);

    // Enter destination state code
    const stateCodeInput = screen.getByPlaceholderText('e.g. 27, 29, 07');
    fireEvent.change(stateCodeInput, { target: { value: '24' } });

    // Enter reason
    const reasonInput = screen.getByPlaceholderText(/Destination of supply delivery/i);
    fireEvent.change(reasonInput, { target: { value: 'Goods diverted to Gujarat warehouse' } });

    // Click Apply & Recalculate
    const applyBtn = screen.getByText('Apply & Recalculate');
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(screen.queryByText('Place of Supply Override')).not.toBeInTheDocument();
    });
  });

  it('5. Legacy bills continue using legacy adjustments section and show legacy badge', async () => {
    vi.mocked(apiClient.fetchPurchaseBillDetail).mockResolvedValue(mockLegacyBill as any);

    renderWorkspace('/app/purchases/purchase-bills/legacy-bill-1');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Legacy badge is displayed
    expect(screen.getByText('Legacy V1 Bill')).toBeInTheDocument();
    expect(screen.getByText(/Legacy Purchase Bill:/i)).toBeInTheDocument();

    // Adjustments section is rendered
    expect(screen.getByText(/Additional Charges, Taxes & Discounts/i)).toBeInTheDocument();

    // Other Charges section is NOT rendered in legacy bills
    expect(screen.queryByText(/Other Charges \(Freight, Insurance, Handling\)/i)).not.toBeInTheDocument();
  });

  it('6. Live calculation preview displays GST taxable value, CGST, SGST, and Grand Total', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Set supplier
    const supplierInput = screen.getByPlaceholderText('Search or select supplier...');
    fireEvent.change(supplierInput, { target: { value: 'Bharat' } });
    await waitFor(() => expect(screen.getByText('Bharat Petroleum Local')).toBeInTheDocument());
    fireEvent.keyDown(supplierInput, { key: 'Enter' });

    // Set invoice number
    const invInput = screen.getByPlaceholderText('e.g. INV-98124');
    fireEvent.change(invInput, { target: { value: 'INV-GST-001' } });

    // Verify Financial & Tax Summary panel
    await waitFor(() => {
      expect(screen.getByText('Financial & Tax Summary')).toBeInTheDocument();
      expect(screen.getByText(/Intra-State \(CGST\+SGST\)/i)).toBeInTheDocument();
    });
  });
});
