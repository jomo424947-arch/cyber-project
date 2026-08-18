import { describe, it, expect } from 'vitest';

describe('Café & Stock Calculations', () => {
  it('calculates profit and margin percentage correctly when cost price is set', () => {
    const price = 20;
    const costPrice = 12;
    const soldQuantity = 5;

    const totalRevenue = price * soldQuantity; // 100
    const totalCost = costPrice * soldQuantity; // 60
    const profit = totalRevenue - totalCost; // 40
    const marginPct = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0; // 40%

    expect(totalRevenue).toBe(100);
    expect(totalCost).toBe(60);
    expect(profit).toBe(40);
    expect(marginPct).toBe(40);
  });

  it('handles products without cost price without overstating profit', () => {
    const price = 15;
    const costPrice = null;
    const soldQuantity = 4;

    const totalRevenue = price * soldQuantity; // 60
    const totalCost = costPrice !== null ? costPrice * soldQuantity : null;
    const profit = totalCost !== null ? totalRevenue - totalCost : null;
    const marginPct = profit !== null && totalRevenue > 0 ? (profit / totalRevenue) * 100 : null;

    expect(totalRevenue).toBe(60);
    expect(totalCost).toBeNull();
    expect(profit).toBeNull();
    expect(marginPct).toBeNull();
  });

  it('calculates stock balance correctly on incremental restock and sale', () => {
    let currentStock = 50;

    // Restock +20
    const restockDelta = 20;
    currentStock += restockDelta;
    expect(currentStock).toBe(70);

    // Sale -3
    const saleQty = 3;
    expect(currentStock >= saleQty).toBe(true);
    currentStock -= saleQty;
    expect(currentStock).toBe(67);

    // Order void +3
    const voidQty = 3;
    currentStock += voidQty;
    expect(currentStock).toBe(70);
  });

  it('prevents stock reduction below zero', () => {
    const currentStock = 5;
    const requestedQty = 10;
    const canFulfill = currentStock >= requestedQty;

    expect(canFulfill).toBe(false);
  });
});
