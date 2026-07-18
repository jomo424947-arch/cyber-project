import { describe, it, expect } from 'vitest';
import { calculateSessionCost } from './billing';

describe('calculateSessionCost', () => {
  const defaultParams = {
    startedAt: '2026-07-18T10:00:00.000Z',
    endedAt: '2026-07-18T10:20:00.000Z', // 20 mins
    deviceHourlyRate: 6.0,
  };

  it('enforces minimum 30-minute billing', () => {
    const result = calculateSessionCost({
      ...defaultParams,
      endedAt: '2026-07-18T10:20:00.000Z',
    });
    expect(result.rawMinutes).toBe(20);
    expect(result.billedMinutes).toBe(30);
    expect(result.totalCost).toBe(3.0); // 30 mins * $6/hr
  });

  it('rounds up to the nearest whole minute', () => {
    const result = calculateSessionCost({
      ...defaultParams,
      endedAt: '2026-07-18T10:34:15.000Z',
    });
    expect(result.rawMinutes).toBe(35);
    expect(result.billedMinutes).toBe(35);
    expect(result.totalCost).toBe(3.5); // (35/60) * 6 = 3.50
  });

  it('uses hourly_rate_override if provided', () => {
    const result = calculateSessionCost({
      ...defaultParams,
      endedAt: '2026-07-18T11:00:00.000Z', // 60 mins
      hourlyRateOverride: 10.0,
    });
    expect(result.totalCost).toBe(10.0); // 60 mins * $10/hr
  });

  it('does not apply overtime for open-type sessions', () => {
    const result = calculateSessionCost({
      ...defaultParams,
      endedAt: '2026-07-18T12:00:00.000Z', // 120 mins
      sessionType: 'open',
      scheduledEnd: '2026-07-18T11:00:00.000Z',
    });
    expect(result.isOvertime).toBe(false);
    expect(result.overtimeMinutes).toBe(0);
    expect(result.totalCost).toBe(12.0); // 120 mins * $6/hr
  });

  it('calculates overtime correctly for fixed-type sessions when grace period is exceeded', () => {
    const result = calculateSessionCost({
      ...defaultParams,
      endedAt: '2026-07-18T11:15:00.000Z',
      sessionType: 'fixed',
      scheduledEnd: '2026-07-18T11:00:00.000Z',
      gracePeriodMinutes: 10,
      overtimeRateMultiplier: 1.5,
    });
    expect(result.isOvertime).toBe(true);
    expect(result.overtimeMinutes).toBe(5);
    // Base cost: 75/60 * $6/hr = $7.50
    // Overtime cost: 5/60 * $6/hr * 1.5 = $0.75
    // Total cost: 7.50 + 0.75 = $8.25
    expect(result.totalCost).toBe(8.25);
  });

  it('does not calculate overtime if within grace period', () => {
    const result = calculateSessionCost({
      ...defaultParams,
      endedAt: '2026-07-18T11:08:00.000Z',
      sessionType: 'fixed',
      scheduledEnd: '2026-07-18T11:00:00.000Z',
      gracePeriodMinutes: 10,
    });
    expect(result.isOvertime).toBe(false);
    expect(result.overtimeMinutes).toBe(0);
    expect(result.totalCost).toBe(6.8); // 68 mins * $6/hr = $6.80
  });

  it('errors out if end time is before start time', () => {
    expect(() => {
      calculateSessionCost({
        ...defaultParams,
        endedAt: '2026-07-18T09:50:00.000Z',
      });
    }).toThrow('Session end time cannot be before start time');
  });
});
