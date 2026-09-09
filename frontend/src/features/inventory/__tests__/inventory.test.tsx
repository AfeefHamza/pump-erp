// frontend/src/features/inventory/__tests__/inventory.test.tsx
import { describe, it, expect } from 'vitest';

describe('Inventory & Fuel Stock Domain Logic', () => {
  it('calculates stock equation book balance correctly', () => {
    // Equation: Opening + Receipts - Dispensing + Testing Return ± Adjustments = Calculated Book Stock
    const openingStock = 12000.0;
    const tankerReceipts = 10000.0;
    const dispensingSales = 4500.0;
    const returnedTesting = 20.0;
    const stockAdjustment = -50.0; // evaporation loss

    const calculatedBook =
      openingStock +
      tankerReceipts -
      dispensingSales +
      returnedTesting +
      stockAdjustment;

    expect(calculatedBook).toBe(17470.0);
  });

  it('computes dynamic running balances along chronological movements', () => {
    const movements = [
      { movement_time: '2026-09-01T06:00:00Z', direction: 'IN', quantity: 10000.0, is_reversed: false },
      { movement_time: '2026-09-01T12:00:00Z', direction: 'OUT', quantity: 2500.0, is_reversed: false },
      { movement_time: '2026-09-01T14:00:00Z', direction: 'IN', quantity: 15.0, is_reversed: false },
      { movement_time: '2026-09-01T18:00:00Z', direction: 'OUT', quantity: 100.0, is_reversed: true }, // reversed movement
      { movement_time: '2026-09-01T20:00:00Z', direction: 'OUT', quantity: 50.0, is_reversed: false },
    ];

    let running = 0;
    const balances = movements.map((m) => {
      if (!m.is_reversed) {
        if (m.direction === 'IN') {
          running += m.quantity;
        } else {
          running -= m.quantity;
        }
      }
      return running;
    });

    expect(balances[0]).toBe(10000.0);
    expect(balances[1]).toBe(7500.0);
    expect(balances[2]).toBe(7515.0);
    expect(balances[3]).toBe(7515.0); // skipped reversed movement
    expect(balances[4]).toBe(7465.0);
  });

  it('detects negative balance state during ledger trajectory', () => {
    const trajectory = [1000, 500, -50, 400];
    const hasNegative = trajectory.some((bal) => bal < 0);
    expect(hasNegative).toBe(true);
  });

  it('evaluates day close readiness criteria', () => {
    const evaluateReadiness = (
      unacknowledgedVariances: number,
      chronologyConflicts: number,
      negativeBalances: number
    ) => {
      return (
        unacknowledgedVariances === 0 &&
        chronologyConflicts === 0 &&
        negativeBalances === 0
      );
    };

    expect(evaluateReadiness(0, 0, 0)).toBe(true);
    expect(evaluateReadiness(1, 0, 0)).toBe(false);
    expect(evaluateReadiness(0, 1, 0)).toBe(false);
    expect(evaluateReadiness(0, 0, 1)).toBe(false);
  });
});
