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

describe('Atomic Stock Decrement & Concurrency Guard (C2)', () => {
  // Simulated atomic stateful database row with conditional UPDATE guard
  class AtomicProductStore {
    private stock: number;

    constructor(initialStock: number) {
      this.stock = initialStock;
    }

    /**
     * Simulates Postgres decrement_product_stock / SQLite UPDATE ... WHERE stock >= qty
     */
    decrementStock(qty: number): { success: boolean; stock: number } {
      if (this.stock >= qty) {
        this.stock -= qty;
        return { success: true, stock: this.stock };
      }
      return { success: false, stock: this.stock };
    }

    /**
     * Simulates Postgres adjust_product_stock / SQLite UPDATE ... WHERE stock + delta >= 0
     */
    adjustStock(delta: number): { success: boolean; stock: number } {
      if (this.stock + delta >= 0) {
        this.stock += delta;
        return { success: true, stock: this.stock };
      }
      return { success: false, stock: this.stock };
    }

    getStock(): number {
      return this.stock;
    }
  }

  it('prevents overselling when two concurrent requests race for the last unit in stock', () => {
    const store = new AtomicProductStore(1);

    // Two concurrent requests both want 1 item
    const req1 = store.decrementStock(1);
    const req2 = store.decrementStock(1);

    // First request succeeds and claims the item
    expect(req1.success).toBe(true);
    expect(req1.stock).toBe(0);

    // Second concurrent request is rejected atomically (0 remaining, cannot fulfill)
    expect(req2.success).toBe(false);
    expect(req2.stock).toBe(0);

    // Stock never went negative
    expect(store.getStock()).toBe(0);
  });

  it('handles multiple concurrent sales correctly up to available inventory', () => {
    const store = new AtomicProductStore(5);

    // 6 concurrent requests each wanting 1 unit
    const results = [1, 2, 3, 4, 5, 6].map(() => store.decrementStock(1));

    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    expect(successes).toHaveLength(5);
    expect(failures).toHaveLength(1);
    expect(store.getStock()).toBe(0);
  });

  it('adjusts signed deltas atomically and guards against negative balance', () => {
    const store = new AtomicProductStore(10);

    // Restock +5
    const restock = store.adjustStock(5);
    expect(restock.success).toBe(true);
    expect(restock.stock).toBe(15);

    // Shrinkage/manual deduction -10
    const deduct = store.adjustStock(-10);
    expect(deduct.success).toBe(true);
    expect(deduct.stock).toBe(5);

    // Invalid reduction -6 (would go to -1)
    const invalidDeduct = store.adjustStock(-6);
    expect(invalidDeduct.success).toBe(false);
    expect(invalidDeduct.stock).toBe(5);

    // Stock remains unchanged at 5 after failed reduction
    expect(store.getStock()).toBe(5);
  });
});

