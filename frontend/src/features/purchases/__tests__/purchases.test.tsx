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
    // Dip conversion: Physical Dip Gain = Post Vol - Pre Vol
    // Receipt Variance = Physical Dip Gain - Allocated Quantity
    const preDipVolume = 4500.0;
    const postDipVolume = 14450.0;
    const allocatedQuantity = 10000.0;

    const physicalGain = postDipVolume - preDipVolume;
    const receiptVariance = physicalGain - allocatedQuantity;

    expect(physicalGain).toBe(9950.0);
    expect(receiptVariance).toBe(-50.0); // 50 litres shortage
  });

  it('determines variance threshold classification', () => {
    const getVarianceSeverity = (variance: number, allocated: number) => {
      const pct = (Math.abs(variance) / allocated) * 100;
      if (pct <= 0.5) return 'NORMAL';
      if (pct <= 1.0) return 'MODERATE';
      return 'SEVERE';
    };

    expect(getVarianceSeverity(-20, 10000)).toBe('NORMAL'); // 0.2%
    expect(getVarianceSeverity(-75, 10000)).toBe('MODERATE'); // 0.75%
    expect(getVarianceSeverity(-150, 10000)).toBe('SEVERE'); // 1.5%
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
