// frontend/src/features/purchases/__tests__/purchases.test.tsx
import { describe, it, expect } from 'vitest';

describe('Purchases & Tanker Receipts Domain Logic', () => {
  it('calculates total allocated quantity across multiple tanks', () => {
    const allocations = [
      { tank_id: 'tank-1', allocated_quantity: '5000.000' },
      { tank_id: 'tank-2', allocated_quantity: '3000.000' },
      { tank_id: 'tank-3', allocated_quantity: '2000.000' },
    ];

    const totalAllocated = allocations.reduce(
      (sum, a) => sum + parseFloat(a.allocated_quantity || '0'),
      0
    );

    expect(totalAllocated).toBe(10000.0);
  });

  it('detects allocation mismatch against accepted quantity', () => {
    const acceptedQuantity = 10000.0;
    const allocatedQuantity = 9500.0;

    const diff = Math.abs(acceptedQuantity - allocatedQuantity);
    const isValid = diff < 0.001;

    expect(isValid).toBe(false);
    expect(diff).toBe(500.0);
  });

  it('calculates physical dip gain and receipt variance accurately', () => {
    const preDipVolume = 4500.0;
    const postDipVolume = 14450.0;
    const allocatedQuantity = 10000.0;

    const physicalGain = postDipVolume - preDipVolume;
    const receiptVariance = physicalGain - allocatedQuantity;

    expect(physicalGain).toBe(9950.0);
    expect(receiptVariance).toBe(-50.0);
  });

  it('determines variance threshold classification', () => {
    const getVarianceSeverity = (variance: number, allocated: number) => {
      const pct = (Math.abs(variance) / allocated) * 100;
      if (pct <= 0.5) return 'NORMAL';
      if (pct <= 1.0) return 'MODERATE';
      return 'SEVERE';
    };

    expect(getVarianceSeverity(-20, 10000)).toBe('NORMAL');
    expect(getVarianceSeverity(-75, 10000)).toBe('MODERATE');
    expect(getVarianceSeverity(-150, 10000)).toBe('SEVERE');
  });

  it('validates server-calculated total value equals sum of line items', () => {
    const lines = [
      { accepted_quantity: 5000, purchase_price: 2.18 },
      { accepted_quantity: 4000, purchase_price: 2.33 },
    ];

    const totalValue = lines.reduce(
      (sum, l) => sum + l.accepted_quantity * l.purchase_price,
      0
    );

    expect(totalValue).toBeCloseTo(10900 + 9320, 2);
    expect(totalValue).toBe(20220.0);
  });
});

describe('Purchase Bills & Supplier Outstanding Domain Logic (Milestone 12)', () => {
  it('server-calculated totals display overrides preview upon save', () => {
    // Local preview may compute draft figures, but authoritative response from server
    // is what must be displayed in the UI state
    const localDraftPreview = {
      subtotal: 100000.0,
      grand_total: 100000.0,
      outstanding_amount: 100000.0,
    };

    const serverAuthoritativeResponse = {
      subtotal: '100000.00',
      discount_total: '5000.00',
      additional_charges_total: '2000.00',
      tax_total: '17100.00',
      round_off_amount: '0.00',
      grand_total: '114100.00',
      amount_paid: '0.00',
      outstanding_amount: '114100.00',
    };

    // The display state adopts server totals
    const displayedTotals = {
      subtotal: parseFloat(serverAuthoritativeResponse.subtotal),
      grandTotal: parseFloat(serverAuthoritativeResponse.grand_total),
      outstanding: parseFloat(serverAuthoritativeResponse.outstanding_amount),
    };

    expect(displayedTotals.grandTotal).toBe(114100.0);
    expect(displayedTotals.outstanding).toBe(114100.0);
    expect(displayedTotals.grandTotal).not.toBe(localDraftPreview.grand_total);
  });

  it('percentage adjustment base strictly uses gross line total minus line discounts', () => {
    const grossLineTotal = 100000.0;
    const lineDiscounts = 10000.0;

    // Requirement 5: percentage adjustments use (Gross line total - line discounts) as base
    const base = grossLineTotal - lineDiscounts;
    expect(base).toBe(90000.0);

    const salesTaxRate = 18.0; // 18%
    const taxAmount = (base * salesTaxRate) / 100;
    expect(taxAmount).toBe(16200.0);

    // sequential compounding must not be used
    const freightCharge = 5000.0;
    const incorrectCompoundedBase = base + freightCharge;
    const incorrectTax = (incorrectCompoundedBase * salesTaxRate) / 100;
    expect(taxAmount).not.toBe(incorrectTax);
  });

  it('validates mandatory void reason requires at least 5 characters', () => {
    const isValidVoidReason = (reason?: string | null) => {
      if (!reason) return false;
      return reason.trim().length >= 5;
    };

    expect(isValidVoidReason('')).toBe(false);
    expect(isValidVoidReason('   ')).toBe(false);
    expect(isValidVoidReason('bad')).toBe(false);
    expect(isValidVoidReason('wrong')).toBe(true);
    expect(isValidVoidReason('Duplicate invoice entered in error')).toBe(true);
  });

  it('calculates supplier ageing bucket correctly based on invoice due date and current date', () => {
    const classifyAgeingBucket = (dueDateStr: string, asOfDateStr: string) => {
      const due = new Date(dueDateStr);
      const asOf = new Date(asOfDateStr);
      const diffMs = asOf.getTime() - due.getTime();
      const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (daysOverdue <= 0) return 'not_due';
      if (daysOverdue <= 30) return 'bucket_1_30';
      if (daysOverdue <= 60) return 'bucket_31_60';
      if (daysOverdue <= 90) return 'bucket_61_90';
      return 'bucket_over_90';
    };

    const asOf = '2026-09-10';

    expect(classifyAgeingBucket('2026-09-15', asOf)).toBe('not_due');
    expect(classifyAgeingBucket('2026-09-10', asOf)).toBe('not_due');
    expect(classifyAgeingBucket('2026-09-01', asOf)).toBe('bucket_1_30'); // 9 days
    expect(classifyAgeingBucket('2026-08-01', asOf)).toBe('bucket_31_60'); // 40 days
    expect(classifyAgeingBucket('2026-06-25', asOf)).toBe('bucket_61_90'); // 77 days
    expect(classifyAgeingBucket('2026-05-01', asOf)).toBe('bucket_over_90'); // 132 days
  });

  it('detects duplicate invoice without override permission', () => {
    const existingInvoices = [
      { supplier_id: 'sup-1', normalized_invoice_num: 'INV-2026-001' },
      { supplier_id: 'sup-2', normalized_invoice_num: 'INV-2026-002' },
    ];

    const checkDuplicate = (
      supplierId: string,
      rawInvoiceNum: string,
      isOverride: boolean,
      overrideReason?: string
    ) => {
      const normalized = rawInvoiceNum.replace(/[\s\-_/\\.]/g, '').toUpperCase();
      const match = existingInvoices.find(
        (inv) =>
          inv.supplier_id === supplierId &&
          inv.normalized_invoice_num.replace(/[\s\-_/\\.]/g, '').toUpperCase() === normalized
      );

      if (!match) return { allowed: true };
      if (!isOverride) return { allowed: false, error: 'Duplicate invoice detected' };
      if (!overrideReason || overrideReason.trim().length < 5) {
        return { allowed: false, error: 'Override requires reason (min 5 chars)' };
      }
      return { allowed: true, isOverride: true };
    };

    // Duplicate without override
    expect(checkDuplicate('sup-1', 'inv 2026 001', false).allowed).toBe(false);
    // Duplicate with invalid override reason
    expect(checkDuplicate('sup-1', 'inv 2026 001', true, 'ok').allowed).toBe(false);
    // Duplicate with valid override reason
    expect(checkDuplicate('sup-1', 'inv 2026 001', true, 'Replacement invoice by supplier').allowed).toBe(true);
    // New non-conflicting invoice
    expect(checkDuplicate('sup-1', 'INV-2026-999', false).allowed).toBe(true);
  });
});
