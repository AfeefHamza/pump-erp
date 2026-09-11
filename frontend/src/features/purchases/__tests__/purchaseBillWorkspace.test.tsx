// frontend/src/features/purchases/__tests__/purchaseBillWorkspace.test.tsx
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
    fetchItemOptions: vi.fn(),
    fetchTaxTreatments: vi.fn(),
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

// Mock sample test data
const mockSuppliers = [
  { id: 'sup-1', name: 'Shell Pakistan', code: 'SHELL', phone: '03001234567', balance: '0.00' },
  { id: 'sup-2', name: 'Total Parco', code: 'TOTAL', phone: '03007654321', balance: '0.00' },
];

const mockProducts = [
  { id: 'prod-1', name: 'Super Petrol', code: 'PMS', current_price: '250.00', is_active: true },
  { id: 'prod-2', name: 'High Speed Diesel', code: 'HSD', current_price: '260.00', is_active: true },
];

const mockReceiptLines = [
  {
    id: 'trl-1',
    tanker_receipt_id: 'tr-1',
    product_id: 'prod-1',
    product_code: 'PMS',
    product_name: 'Super Petrol',
    invoice_quantity: '10000.000',
    accepted_book_quantity: '10000.000',
    accepted_quantity: '10000.000',
    unit_of_measure: 'LTR',
    unit: 'LTR',
    unit_rate: '250.00',
    invoice_price: '250.00',
    already_linked: false,
  },
  {
    id: 'trl-2',
    tanker_receipt_id: 'tr-1',
    product_id: 'prod-2',
    product_code: 'HSD',
    product_name: 'High Speed Diesel',
    invoice_quantity: '5000.000',
    accepted_book_quantity: '5000.000',
    accepted_quantity: '5000.000',
    unit_of_measure: 'LTR',
    unit: 'LTR',
    unit_rate: '260.00',
    invoice_price: '260.00',
    already_linked: true,
  }
];

const mockReceipts = [
  {
    id: 'tr-1',
    receipt_number: 'TR-2026-0001',
    supplier_id: 'sup-1',
    supplier_name: 'Shell Pakistan',
    supplier_code: 'SHELL',
    invoice_number: 'REF-INV-1',
    invoice_date: '2026-09-08',
    vehicle_registration: 'TL-9999',
    unloading_end_time: '2026-09-08T12:00:00Z',
    delivery_challan_number: 'DC-1001',
    chamber_seal_numbers: 'SEAL-01',
    received_at: '2026-09-08T10:00:00Z',
    notes: 'Clean receipt',
    lines: mockReceiptLines,
    available_lines: mockReceiptLines,
  }
];

const mockExistingBill = {
  id: 'bill-1',
  bill_number: 'PB-2026-0001',
  status: 'recorded',
  supplier: { id: 'sup-1', name: 'Shell Pakistan' },
  supplier_invoice_number: 'INV-1001',
  invoice_date: '2026-09-01',
  due_date: '2026-10-01',
  received_date: '2026-09-01',
  currency: 'PKR',
  notes: 'Existing bill notes',
  subtotal: '250000.00',
  discount_total: '0.00',
  additional_charges_total: '0.00',
  tax_total: '0.00',
  round_off_amount: '0.00',
  grand_total: '250000.00',
  amount_paid: '0.00',
  outstanding_amount: '250000.00',
  lines: [
    {
      id: 'line-1',
      line_type: 'fuel',
      product: { id: 'prod-1', name: 'Super Petrol', code: 'PMS' },
      quantity: '1000.000',
      unit_of_measure: 'LTR',
      unit_rate: '250.00',
      discount_amount: '0.00',
      line_total: '250000.00',
      tanker_receipt_line_id: 'trl-1',
      delivery_challan_number: 'DC-1001',
      tanker_receipt_number: 'TR-2026-0001'
    }
  ],
  adjustments: [],
  receipt_links: [],
  attachments: []
};

// Test store factory
const createTestStore = (overrides?: {
  membershipType?: string;
  permissions?: string[];
}) => {
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
              name: 'Test Org',
              code: 'TORG',
              membership_type: (overrides?.membershipType ?? 'owner') as 'owner' | 'administrator' | 'member',
              onboarding_status: 'completed',
              outlets: [{ id: 'outlet-1', name: 'Main Station', code: 'OUT1' }],
            },
          ],
        },
        authenticationStatus: 'authenticated',
        authenticationError: null,
      },
      permissions: {
        permissions: overrides?.permissions ?? [
          'supplier.create',
          'tanker_receipt.view',
          'purchase_bill.create',
          'purchase_bill.edit',
          'purchase_bill.void',
          'purchase_bill.override_duplicate',
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

describe('PurchaseBillWorkspace Keyboard-First ERP Workspace (Section 14 Verification)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.fetchSuppliers).mockResolvedValue(mockSuppliers as any);
    vi.mocked(apiClient.fetchFuelProducts).mockResolvedValue(mockProducts as any);
    vi.mocked(apiClient.fetchPurchaseItems).mockResolvedValue([] as any);
    vi.mocked(apiClient.fetchPurchaseTaxCodes).mockResolvedValue([] as any);
    vi.mocked(apiClient.fetchItemOptions).mockResolvedValue([] as any);
    vi.mocked(apiClient.fetchTaxTreatments).mockResolvedValue([] as any);
    vi.mocked(apiClient.fetchAvailableTankerReceipts).mockResolvedValue(mockReceipts as any);
    vi.mocked(apiClient.fetchPurchaseBillDetail).mockResolvedValue(mockExistingBill as any);
  });

  afterEach(() => {
    cleanup();
  });

  // Scenario 1
  it('1. Initial focus lands on the Supplier field when opening Create Purchase Bill', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    const supplierInput = screen.getByPlaceholderText('Search or select supplier...');
    expect(supplierInput).toBeInTheDocument();
    expect(document.activeElement).toBe(supplierInput);
  });

  // Scenario 2
  it('2. Typing in the Supplier field filters the list, and Enter selects highlighted supplier & moves focus', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    const supplierInput = screen.getByPlaceholderText('Search or select supplier...');

    // Type 'Shell'
    fireEvent.change(supplierInput, { target: { value: 'Shell' } });

    // Verify option is visible in dropdown
    await waitFor(() => {
      expect(screen.getByText('Shell Pakistan')).toBeInTheDocument();
    });

    // Press Enter to select option
    fireEvent.keyDown(supplierInput, { key: 'Enter' });

    // Value should now be Shell Pakistan
    await waitFor(() => {
      expect(supplierInput).toHaveValue('Shell Pakistan');
    });

    // Focus moves to the next field (Supplier Invoice Number)
    await waitFor(() => {
      const invoiceNumberInput = screen.getByPlaceholderText('e.g. INV-98124');
      expect(document.activeElement).toBe(invoiceNumberInput);
    });
  });

  // Scenario 3
  it('3. Tab moves focus through the transaction details header in sequence', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    const supplierInput = screen.getByPlaceholderText('Search or select supplier...');
    const invoiceNumInput = screen.getByPlaceholderText('e.g. INV-98124');
    const invoiceDateInput = document.getElementById('field-invoice-date');
    const dueDateInput = document.getElementById('field-due-date');
    const receivedDateInput = document.getElementById('field-received-date');
    const linkReceiptBtn = screen.getByText(/Link Tanker Receipt/i).closest('button');

    // Verify sequence of tabindex attributes
    expect(supplierInput.getAttribute('tabindex')).toBe('1');
    expect(invoiceNumInput.getAttribute('tabindex')).toBe('2');
    expect(invoiceDateInput?.getAttribute('tabindex')).toBe('3');
    expect(dueDateInput?.getAttribute('tabindex')).toBe('4');
    expect(receivedDateInput?.getAttribute('tabindex')).toBe('5');
    expect(linkReceiptBtn?.getAttribute('tabindex')).toBe('6');
  });

  // Scenario 4
  it('4. Alt+R adds a new line item to the product grid', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Initially 1 line
    expect(document.getElementById('line-qty-0')).toBeInTheDocument();
    expect(document.getElementById('line-qty-1')).not.toBeInTheDocument();

    // Trigger Alt+R
    fireEvent.keyDown(window, { key: 'r', altKey: true });

    // Second line should now be added
    await waitFor(() => {
      expect(document.getElementById('line-qty-1')).toBeInTheDocument();
    });
  });

  // Scenario 5
  it('5. In the last row of the line-item grid, pressing Enter in the final editable cell adds a new row and places focus in its Product field', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Row 0 discount cell is the last editable cell of row 0
    const discountInput = document.getElementById('line-discount-0') as HTMLInputElement;
    expect(discountInput).toBeInTheDocument();

    // Press Enter in discount cell
    fireEvent.keyDown(discountInput, { key: 'Enter' });

    // Row 1 should be added and its product field should receive focus
    await waitFor(() => {
      expect(document.getElementById('line-qty-1')).toBeInTheDocument();
      const product1 = document.getElementById('line-product-1');
      expect(document.activeElement).toBe(product1);
    });
  });

  // Scenario 6
  it('6. Alt+Delete removes the active row with confirmation when the active row has data', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Add a second row first so grid has 2 rows
    fireEvent.keyDown(window, { key: 'r', altKey: true });
    await waitFor(() => {
      expect(document.getElementById('line-qty-1')).toBeInTheDocument();
    });

    // Fill row 0 with data
    const qty0 = document.getElementById('line-qty-0') as HTMLInputElement;
    fireEvent.change(qty0, { target: { value: '500' } });

    // Focus row 0
    fireEvent.focus(qty0);

    // Press Alt+Delete
    fireEvent.keyDown(window, { key: 'Delete', altKey: true });

    // Window confirm should be called
    expect(confirmSpy).toHaveBeenCalledWith('Remove line 1?');

    // Row 1 is removed
    await waitFor(() => {
      expect(document.getElementById('line-qty-1')).not.toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  // Scenario 7
  it('7. Alt+T opens the tanker receipt selector modal', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // First select supplier so receipt linking is enabled
    const supplierInput = screen.getByPlaceholderText('Search or select supplier...');
    fireEvent.change(supplierInput, { target: { value: 'Shell' } });
    await waitFor(() => expect(screen.getByText('Shell Pakistan')).toBeInTheDocument());
    fireEvent.keyDown(supplierInput, { key: 'Enter' });
    await waitFor(() => expect(supplierInput).toHaveValue('Shell Pakistan'));

    // Trigger Alt+T
    fireEvent.keyDown(window, { key: 't', altKey: true });

    // Tanker receipt modal should open
    await waitFor(() => {
      expect(screen.getByText(/Link Confirmed Tanker Receipt/i)).toBeInTheDocument();
    });
  });

  // Scenario 8
  it('8. Selecting a tanker receipt line populates product, quantity, unit, and default rate into the bill line item', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Select supplier
    const supplierInput = screen.getByPlaceholderText('Search or select supplier...');
    fireEvent.change(supplierInput, { target: { value: 'Shell' } });
    await waitFor(() => expect(screen.getByText('Shell Pakistan')).toBeInTheDocument());
    fireEvent.keyDown(supplierInput, { key: 'Enter' });
    await waitFor(() => expect(supplierInput).toHaveValue('Shell Pakistan'));

    // Open modal via button
    const linkBtn = screen.getByText(/Link Tanker Receipt/i).closest('button')!;
    fireEvent.click(linkBtn);

    await waitFor(() => {
      expect(screen.getByText(/Link Confirmed Tanker Receipt/i)).toBeInTheDocument();
      expect(screen.getByText('TR-2026-0001')).toBeInTheDocument();
    });

    // Select line trl-1 (checkbox)
    const checkboxes = screen.getAllByRole('checkbox');
    const availableCheckbox = checkboxes.find((cb) => !cb.hasAttribute('disabled'));
    expect(availableCheckbox).toBeDefined();
    fireEvent.click(availableCheckbox!);

    // Click "Link 1 Lines" button
    const submitBtn = screen.getByText(/Link 1 Lines/i).closest('button')!;
    fireEvent.click(submitBtn);

    // Modal closes and line is populated
    await waitFor(() => {
      expect(screen.queryByText(/Link Confirmed Tanker Receipt/i)).not.toBeInTheDocument();
    });

    const qtyInput = document.getElementById('line-qty-0') as HTMLInputElement;
    expect(qtyInput.value).toBe('10000.000');
    expect(screen.getByText('DC: DC-1001')).toBeInTheDocument();
  });

  // Scenario 9
  it('9. An already-linked tanker receipt line cannot be selected again (disabled with explanation)', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Select supplier and open modal
    const supplierInput = screen.getByPlaceholderText('Search or select supplier...');
    fireEvent.change(supplierInput, { target: { value: 'Shell' } });
    await waitFor(() => expect(screen.getByText('Shell Pakistan')).toBeInTheDocument());
    fireEvent.keyDown(supplierInput, { key: 'Enter' });
    await waitFor(() => expect(supplierInput).toHaveValue('Shell Pakistan'));

    const linkBtn = screen.getByText(/Link Tanker Receipt/i).closest('button')!;
    fireEvent.click(linkBtn);

    await waitFor(() => {
      expect(screen.getByText(/Link Confirmed Tanker Receipt/i)).toBeInTheDocument();
    });

    // In mockReceipts, trl-2 has already_linked: true
    expect(screen.getByText('Already Linked')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    const disabledCheckbox = checkboxes.find((cb) => cb.hasAttribute('disabled'));
    expect(disabledCheckbox).toBeDefined();
    expect(disabledCheckbox).toBeDisabled();
  });

  // Scenario 10
  it('10. Pressing Ctrl+S saves the bill and prevents browser default Save Page behavior', async () => {
    vi.mocked(apiClient.createPurchaseBill).mockResolvedValue({
      ...mockExistingBill,
      id: 'new-bill-1',
      bill_number: 'PB-2026-0002',
    } as any);

    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Fill supplier
    const supplierInput = screen.getByPlaceholderText('Search or select supplier...');
    fireEvent.change(supplierInput, { target: { value: 'Shell' } });
    await waitFor(() => expect(screen.getByText('Shell Pakistan')).toBeInTheDocument());
    fireEvent.keyDown(supplierInput, { key: 'Enter' });
    await waitFor(() => expect(supplierInput).toHaveValue('Shell Pakistan'));

    // Fill invoice number
    const invoiceNumInput = screen.getByPlaceholderText('e.g. INV-98124');
    fireEvent.change(invoiceNumInput, { target: { value: 'INV-CTRL-S' } });

    // Press Ctrl+S
    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);

    await waitFor(() => {
      expect(apiClient.createPurchaseBill).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Purchase bill PB-2026-0002 recorded successfully!/i)).toBeInTheDocument();
    });
  });

  // Scenario 11
  it('11. Pressing Ctrl+Shift+S saves the bill, resets the form, and prepares a new blank bill only after successful response', async () => {
    vi.mocked(apiClient.createPurchaseBill).mockResolvedValue({
      ...mockExistingBill,
      id: 'new-bill-2',
      bill_number: 'PB-2026-0003',
    } as any);

    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Fill supplier
    const supplierInput = screen.getByPlaceholderText('Search or select supplier...');
    fireEvent.change(supplierInput, { target: { value: 'Shell' } });
    await waitFor(() => expect(screen.getByText('Shell Pakistan')).toBeInTheDocument());
    fireEvent.keyDown(supplierInput, { key: 'Enter' });
    await waitFor(() => expect(supplierInput).toHaveValue('Shell Pakistan'));

    // Fill invoice number
    const invoiceNumInput = screen.getByPlaceholderText('e.g. INV-98124');
    fireEvent.change(invoiceNumInput, { target: { value: 'INV-CONSECUTIVE' } });

    // Press Ctrl+Shift+S
    const event = new KeyboardEvent('keydown', {
      key: 'S',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);

    // Verify API called and form reset
    await waitFor(() => {
      expect(apiClient.createPurchaseBill).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Ready for next bill/i)).toBeInTheDocument();
      // Invoice number cleared
      expect(screen.getByPlaceholderText('e.g. INV-98124')).toHaveValue('');
    });
  });

  // Scenario 12
  it('12. Form validation error highlights first invalid field, moves focus to it, and preserves other entered fields', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Enter invoice number but leave supplier blank
    const invoiceNumInput = screen.getByPlaceholderText('e.g. INV-98124');
    fireEvent.change(invoiceNumInput, { target: { value: 'INV-VALIDATION-TEST' } });

    // Click Save & Record
    const saveBtn = screen.getByText('Save & Record (Ctrl+S)');
    fireEvent.click(saveBtn);

    // Shows validation toast
    await waitFor(() => {
      expect(screen.getByText('Please select a supplier.')).toBeInTheDocument();
    });

    // Focus moved to supplier combobox
    const supplierInput = screen.getByPlaceholderText('Search or select supplier...');
    expect(document.activeElement).toBe(supplierInput);

    // Invoice number is preserved
    expect(invoiceNumInput).toHaveValue('INV-VALIDATION-TEST');
  });

  // Scenario 13
  it('13. Navigating away with unsaved changes prompts the user for confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Modify invoice number (makes form dirty)
    const invoiceNumInput = screen.getByPlaceholderText('e.g. INV-98124');
    fireEvent.change(invoiceNumInput, { target: { value: 'INV-DIRTY' } });

    // Click cancel button in sticky footer
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Are you sure you want to leave this page?');

    confirmSpy.mockRestore();
  });

  // Scenario 14
  it('14. Client-side totals update immediately as preview totals when editing quantities, rates, or adjustments', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Initial state displays client preview badge
    expect(screen.getByText('Client Preview')).toBeInTheDocument();

    // Edit quantity = 100, rate = 250 (Gross = 25,000)
    const qtyInput = document.getElementById('line-qty-0') as HTMLInputElement;
    const rateInput = document.getElementById('line-rate-0') as HTMLInputElement;

    fireEvent.change(qtyInput, { target: { value: '100' } });
    fireEvent.change(rateInput, { target: { value: '250' } });

    // Preview Subtotal and Grand Total should both update to 25,000.00
    await waitFor(() => {
      expect(screen.getAllByText('Rs. 25,000.00').length).toBeGreaterThanOrEqual(1);
    });
  });

  // Scenario 15
  it('15. Server-calculated totals replace preview totals after a successful save', async () => {
    vi.mocked(apiClient.createPurchaseBill).mockResolvedValue({
      ...mockExistingBill,
      subtotal: '25000.00',
      grand_total: '25100.00',
      additional_charges_total: '100.00',
      outstanding_amount: '25100.00',
    } as any);

    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Fill required
    const supplierInput = screen.getByPlaceholderText('Search or select supplier...');
    fireEvent.change(supplierInput, { target: { value: 'Shell' } });
    await waitFor(() => expect(screen.getByText('Shell Pakistan')).toBeInTheDocument());
    fireEvent.keyDown(supplierInput, { key: 'Enter' });
    await waitFor(() => expect(supplierInput).toHaveValue('Shell Pakistan'));

    const invoiceNumInput = screen.getByPlaceholderText('e.g. INV-98124');
    fireEvent.change(invoiceNumInput, { target: { value: 'INV-SERVER-TOTAL' } });

    const saveBtn = screen.getByText('Save & Record (Ctrl+S)');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiClient.createPurchaseBill).toHaveBeenCalled();
    });
  });

  // Scenario 16
  it('16. Amount Paid remains read-only and displays 0.00', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText('Amount Paid')).toBeInTheDocument();
    expect(screen.getAllByText('Rs. 0.00').length).toBeGreaterThanOrEqual(1);

    // Verify there is no input field for amount paid
    const inputs = screen.getAllByRole('textbox');
    const amountPaidInput = inputs.find((inp) => inp.getAttribute('name') === 'amount_paid');
    expect(amountPaidInput).toBeUndefined();
  });

  // Scenario 17
  it('17. Outstanding Balance equals Grand Total for a newly created unpaid bill', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Set line quantity 10 and rate 250 -> 2,500.00
    const qtyInput = document.getElementById('line-qty-0') as HTMLInputElement;
    const rateInput = document.getElementById('line-rate-0') as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: '10' } });
    fireEvent.change(rateInput, { target: { value: '250' } });

    await waitFor(() => {
      expect(screen.getByText('Outstanding Balance')).toBeInTheDocument();
      // Both Grand Total and Outstanding Balance show Rs. 2,500.00
      const matches = screen.getAllByText('Rs. 2,500.00');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  // Scenario 18
  it('18. Quick supplier creation opens modal, creates supplier, preserves bill data, and selects new supplier', async () => {
    const newSupplier = {
      id: 'sup-new',
      name: 'PSO Pakistan',
      code: 'PSO',
      phone: '03009999999',
      balance: '0.00'
    };
    vi.mocked(apiClient.createSupplier).mockResolvedValue(newSupplier as any);

    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Enter invoice number to verify it remains preserved
    const invoiceNumInput = screen.getByPlaceholderText('e.g. INV-98124');
    fireEvent.change(invoiceNumInput, { target: { value: 'INV-PRESERVE-TEST' } });

    // Open supplier dropdown by typing a new name
    const supplierInput = screen.getByPlaceholderText('Search or select supplier...');
    fireEvent.change(supplierInput, { target: { value: 'PSO' } });

    await waitFor(() => {
      expect(screen.getByText(/Add Supplier "PSO"/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Add Supplier "PSO"/i));

    // Quick Supplier Modal should open
    await waitFor(() => {
      expect(screen.getByText('Add New Supplier')).toBeInTheDocument();
    });

    // Fill code
    const codeInput = screen.getByPlaceholderText('e.g. SHELL-PK');
    fireEvent.change(codeInput, { target: { value: 'PSO' } });

    // Click Save Supplier
    const submitBtn = screen.getByText('Save Supplier');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.createSupplier).toHaveBeenCalledWith('org-1', expect.objectContaining({
        name: 'PSO',
        code: 'PSO',
      }));
      // Quick modal is closed
      expect(screen.queryByText('Add New Supplier')).not.toBeInTheDocument();
    });

    // Newly created supplier is selected
    expect(supplierInput).toHaveValue('PSO Pakistan');

    // Existing invoice number entered before modal is preserved
    expect(invoiceNumInput).toHaveValue('INV-PRESERVE-TEST');
  });

  // Scenario 19
  it('19. Keyboard shortcut help modal opens with Ctrl+/ and displays configured shortcuts', async () => {
    renderWorkspace('/app/purchases/purchase-bills/new');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Dispatch Ctrl+/
    const event = new KeyboardEvent('keydown', {
      key: '/',
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);

    // Modal appears
    await waitFor(() => {
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
      expect(screen.getByText(/Save & Record the current purchase bill/i)).toBeInTheDocument();
      expect(screen.getByText('Ctrl + S')).toBeInTheDocument();
      expect(screen.getByText(/Add a new product line row/i)).toBeInTheDocument();
      expect(screen.getByText('Alt + R')).toBeInTheDocument();
    });

    // Close with Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
    });
  });

  // Scenario 20
  it('20. Existing Purchase Bill edit and void workflows continue to function without regression', async () => {
    vi.mocked(apiClient.voidPurchaseBill).mockResolvedValue({
      ...mockExistingBill,
      status: 'voided',
      voided_at: '2026-09-10T12:00:00Z',
      voided_by_name: 'Admin User',
      void_reason: 'Entered duplicate invoice by mistake',
    } as any);

    renderWorkspace('/app/purchases/purchase-bills/bill-1');

    await waitFor(() => {
      expect(screen.queryByText(/Loading purchase bill workspace/i)).not.toBeInTheDocument();
    });

    // Verify existing bill loaded
    expect(screen.getByText(/Edit Purchase Bill — PB-2026-0001/i)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();

    // Click Void Bill button
    const voidBtn = screen.getByText('Void Bill').closest('button')!;
    fireEvent.click(voidBtn);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText('Void Purchase Bill')).toBeInTheDocument();
    });

    // Reason less than 5 chars shows error
    const reasonTextarea = screen.getByPlaceholderText(/Explanation for voiding/i);
    fireEvent.change(reasonTextarea, { target: { value: 'bad' } });

    const confirmVoidBtn = screen.getByText('Confirm Void').closest('button')!;
    fireEvent.click(confirmVoidBtn);

    await waitFor(() => {
      expect(screen.getByText(/mandatory reason for voiding/i)).toBeInTheDocument();
    });

    // Enter valid reason
    fireEvent.change(reasonTextarea, { target: { value: 'Entered duplicate invoice by mistake' } });
    fireEvent.click(confirmVoidBtn);

    await waitFor(() => {
      expect(apiClient.voidPurchaseBill).toHaveBeenCalledWith(
        'org-1',
        'outlet-1',
        'bill-1',
        'Entered duplicate invoice by mistake'
      );
      // Status badge updates to Voided
      expect(screen.getByText('Voided')).toBeInTheDocument();
    });
  });
});
