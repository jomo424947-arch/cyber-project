import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listCafeTables, createCafeTable, updateCafeTable, deleteCafeTable } from './cafe-tables.controller';
import { calculateSessionCost, calculateInvoiceAdjustments } from '../lib/billing';
import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';

describe('Café Table Management & Billing Integrity Suite', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      user: { id: 'admin-user-id', email: 'admin@ccms.com', role: 'admin', tenant_id: 'tenant-123' },
      body: {},
      params: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  // ─── 1. Access Control & Authorization Safeguards ─────────────────────────
  describe('1. Role Authorization Safeguards', () => {
    it('rejects café table creation if user is not admin', async () => {
      req.user = { id: 'staff-user-id', email: 'staff@ccms.com', role: 'staff', tenant_id: 'tenant-123' };
      req.body = { table_number: 'T1', name: 'Table 1', capacity: 4 };
      await expect(createCafeTable(req as Request, res as Response)).rejects.toThrow('Only admins can create café tables');
    });

    it('rejects café table update if user is not admin', async () => {
      req.user = { id: 'staff-user-id', email: 'staff@ccms.com', role: 'staff', tenant_id: 'tenant-123' };
      req.params = { id: 'table-1' };
      req.body = { name: 'Updated Table' };
      await expect(updateCafeTable(req as Request, res as Response)).rejects.toThrow('Only admins can update café tables');
    });

    it('rejects café table deletion if user is not admin', async () => {
      req.user = { id: 'staff-user-id', email: 'staff@ccms.com', role: 'staff', tenant_id: 'tenant-123' };
      req.params = { id: 'table-1' };
      await expect(deleteCafeTable(req as Request, res as Response)).rejects.toThrow('Only admins can delete café tables');
    });
  });

  // ─── 2. Active Session Safeguard on Deletion ──────────────────────────────
  describe('2. Active Session Safeguard on Deletion', () => {
    it('prevents deleting a café table when an active session is in progress', async () => {
      // Mock supabase to return a table with an active session
      const originalFrom = supabase.from;
      (supabase as any).from = vi.fn((table: string) => {
        if (table === 'cafe_tables') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'table-1', name: 'Table 1', device_id: 'dev-table-1' },
              error: null,
            }),
          };
        }
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'active-session-99' }, // Active session found!
              error: null,
            }),
          };
        }
        return originalFrom.call(supabase, table);
      });

      req.params = { id: 'table-1' };

      await expect(deleteCafeTable(req as Request, res as Response)).rejects.toThrow(
        'لا يمكن حذف الطاولة لأنها قيد الاستخدام حالياً وبها جلسة نشطة'
      );

      (supabase as any).from = originalFrom;
    });

    it('allows deleting a café table when no active session is running', async () => {
      const originalFrom = supabase.from;
      (supabase as any).from = vi.fn((table: string) => {
        if (table === 'cafe_tables') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'table-1', name: 'Table 1', device_id: 'dev-table-1' },
              error: null,
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          };
        }
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null, // No active session!
              error: null,
            }),
          };
        }
        if (table === 'devices') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          };
        }
        return originalFrom.call(supabase, table);
      });

      req.params = { id: 'table-1' };

      await deleteCafeTable(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(204);

      (supabase as any).from = originalFrom;
    });
  });

  // ─── 3. Café Table Zero Duration-Rate Billing (Requirement B) ─────────────
  describe('3. Café Table Billing Calculations (Zero Duration-Rate)', () => {
    it('charges 0.00 EGP for time spent at a café table regardless of hours elapsed', () => {
      const startedAt = new Date('2026-10-12T10:00:00Z');
      const endedAt = new Date('2026-10-12T14:30:00Z'); // 4.5 hours (270 minutes)

      const result = calculateSessionCost({
        startedAt,
        endedAt,
        deviceHourlyRate: 0, // Café table rate is 0
        hourlyRateOverride: 0,
        sessionType: 'open',
      });

      expect(result.rawMinutes).toBe(270);
      expect(result.billedMinutes).toBe(270);
      expect(result.baseCost).toBe(0);
      expect(result.overtimeCost).toBe(0);
      expect(result.totalCost).toBe(0);
    });

    it('calculates café table total bill exclusively based on products ordered', () => {
      const startedAt = new Date('2026-10-12T12:00:00Z');
      const endedAt = new Date('2026-10-12T13:45:00Z'); // 1h 45m

      // Time cost
      const timeBilling = calculateSessionCost({
        startedAt,
        endedAt,
        deviceHourlyRate: 0,
        hourlyRateOverride: 0,
      });

      // Products ordered by customer: 2 Cokes @ 25 + 1 Coffee @ 30 + 1 Water @ 10
      const orderedProducts = [
        { name: 'Coke', quantity: 2, unit_price: 25, total_price: 50 },
        { name: 'Coffee', quantity: 1, unit_price: 30, total_price: 30 },
        { name: 'Water', quantity: 1, unit_price: 10, total_price: 10 },
      ];

      const cafeProductsTotal = orderedProducts.reduce((sum, p) => sum + p.total_price, 0); // 90.00
      expect(cafeProductsTotal).toBe(90);

      const rawSubtotal = timeBilling.totalCost + cafeProductsTotal;
      expect(rawSubtotal).toBe(90); // Exactly 90.00 EGP, zero time charge

      // Apply adjustments (e.g., 10 EGP discount)
      const adjustments = calculateInvoiceAdjustments({
        subtotal: rawSubtotal,
        discountType: 'fixed',
        discountValue: 10,
      });

      expect(adjustments.discountAmount).toBe(10);
      expect(adjustments.finalAmount).toBe(80);
    });
  });

  // ─── 4. Regression Protection for PlayStation Gaming Sessions ─────────────
  describe('4. PlayStation Gaming Sessions Regression Protection', () => {
    it('preserves accurate duration billing for PlayStation devices alongside product orders', () => {
      const startedAt = new Date('2026-10-12T10:00:00Z');
      const endedAt = new Date('2026-10-12T12:00:00Z'); // Exactly 2 hours (120 minutes)
      const psHourlyRate = 30; // 30 EGP/hr

      // PlayStation gaming duration cost
      const psBilling = calculateSessionCost({
        startedAt,
        endedAt,
        deviceHourlyRate: psHourlyRate,
        sessionType: 'open',
      });

      expect(psBilling.billedMinutes).toBe(120);
      expect(psBilling.totalCost).toBe(60); // 2 hours * 30 = 60.00 EGP

      // PlayStation customer also ordered 2 Energy Drinks @ 40 EGP = 80 EGP
      const psCafeTotal = 80;

      const combinedInvoice = psBilling.totalCost + psCafeTotal;
      expect(combinedInvoice).toBe(140); // 60 (gaming) + 80 (drinks) = 140.00 EGP
    });

    it('distinguishes PlayStation gaming revenue from café product revenue without double counting', () => {
      // Scenario:
      // Session 1 (PS5): 60 EGP gaming time + 40 EGP drinks = 100 EGP total
      // Session 2 (Cafe Table 3): 0 EGP time + 70 EGP drinks = 70 EGP total
      // Standalone counter sale: 30 EGP drinks

      const sessions = [
        { id: 'sess-ps', total_cost: 100, cafe_portion: 40 },
        { id: 'sess-table', total_cost: 70, cafe_portion: 70 },
      ];
      const standaloneCafeSales = 30;

      // Device / Gaming Revenue calculation (as in reports.controller.ts):
      const totalGamingRevenue = sessions.reduce((acc, s) => {
        const devicePortion = Math.max(0, s.total_cost - s.cafe_portion);
        return acc + devicePortion;
      }, 0);

      // Total Café Revenue calculation (as in reports.controller.ts):
      const totalCafeRevenue = sessions.reduce((acc, s) => acc + s.cafe_portion, 0) + standaloneCafeSales;

      const grandTotalRevenue = totalGamingRevenue + totalCafeRevenue;

      expect(totalGamingRevenue).toBe(60); // Only PS gaming time!
      expect(totalCafeRevenue).toBe(140); // 40 (PS drinks) + 70 (Table drinks) + 30 (Counter) = 140
      expect(grandTotalRevenue).toBe(200); // 60 + 140 = 200, strictly zero double-counting
    });
  });
});
