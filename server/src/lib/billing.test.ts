import { describe, it, expect } from 'vitest';
import { calculateSessionCost } from './billing';

describe('calculateSessionCost - Open Sessions', () => {
  const baseParams = {
    startedAt: '2026-07-18T10:00:00.000Z',
    deviceHourlyRate: 6.0,
    sessionType: 'open' as const,
  };

  it('bills 8-minute session as 8 minutes (actual minute billing)', () => {
    const result = calculateSessionCost({
      ...baseParams,
      deviceHourlyRate: 30.0,
      endedAt: '2026-07-18T10:08:00.000Z',
    });
    expect(result.rawMinutes).toBe(8);
    expect(result.billedMinutes).toBe(8);
    expect(result.baseCost).toBe(4.0);
    expect(result.totalCost).toBe(4.0);
  });

  it('bills 15-minute session as 15 minutes ($1.50 at $6/hr)', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:15:00.000Z',
    });
    expect(result.rawMinutes).toBe(15);
    expect(result.billedMinutes).toBe(15);
    expect(result.baseCost).toBe(1.5);
    expect(result.totalCost).toBe(1.5);
  });

  it('bills 30-minute session as 30 minutes', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:30:00.000Z',
    });
    expect(result.rawMinutes).toBe(30);
    expect(result.billedMinutes).toBe(30);
    expect(result.baseCost).toBe(3.0);
    expect(result.totalCost).toBe(3.0);
  });

  it('bills 45-minute session as 45 minutes', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:45:00.000Z',
    });
    expect(result.rawMinutes).toBe(45);
    expect(result.billedMinutes).toBe(45);
    expect(result.baseCost).toBe(4.5);
    expect(result.totalCost).toBe(4.5);
  });

  it('supports custom minBillingMinutes override when explicitly passed', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:10:00.000Z',
      minBillingMinutes: 30,
    });
    expect(result.rawMinutes).toBe(10);
    expect(result.billedMinutes).toBe(30);
    expect(result.baseCost).toBe(3.0);
  });
});

describe('calculateSessionCost - Fixed Sessions & Overtime', () => {
  const start = '2026-07-18T10:00:00.000Z';
  const scheduledEnd = '2026-07-18T11:00:00.000Z'; // 60 minutes

  it('calculates 0 overtime for fixed session ending early (Actual = 5 mins, Scheduled = 60 mins)', () => {
    const result = calculateSessionCost({
      startedAt: start,
      endedAt: '2026-07-18T10:05:00.000Z',
      scheduledEnd,
      deviceHourlyRate: 6.0,
      sessionType: 'fixed',
    });
    expect(result.rawMinutes).toBe(5);
    expect(result.billedMinutes).toBe(5);
    expect(result.overtimeMinutes).toBe(0);
    expect(result.isOvertime).toBe(false);
    expect(result.overtimeCost).toBe(0);
    expect(result.baseCost).toBe(0.5);
    expect(result.totalCost).toBe(0.5);
  });

  it('calculates 0 overtime when actual time matches scheduled time exactly plus grace period (Actual = 70, Scheduled = 60, Grace = 10)', () => {
    const result = calculateSessionCost({
      startedAt: start,
      endedAt: '2026-07-18T11:10:00.000Z', // 70 mins
      scheduledEnd,
      gracePeriodMinutes: 10,
      deviceHourlyRate: 6.0,
      sessionType: 'fixed',
    });
    expect(result.rawMinutes).toBe(70);
    expect(result.overtimeMinutes).toBe(0);
    expect(result.isOvertime).toBe(false);
    expect(result.overtimeCost).toBe(0);
    expect(result.baseCost).toBe(7.0);
    expect(result.totalCost).toBe(7.0);
  });

  it('calculates exactly 1 minute overtime when grace period is exceeded by 1 minute (Actual = 71, Scheduled = 60, Grace = 10)', () => {
    const result = calculateSessionCost({
      startedAt: start,
      endedAt: '2026-07-18T11:11:00.000Z', // 71 mins
      scheduledEnd,
      gracePeriodMinutes: 10,
      deviceHourlyRate: 6.0,
      sessionType: 'fixed',
    });
    expect(result.rawMinutes).toBe(71);
    expect(result.overtimeMinutes).toBe(1);
    expect(result.isOvertime).toBe(true);
    // Base minutes: 71 - 1 = 70 mins -> (70/60) * 6 = $7.00
    // Overtime minutes: 1 min -> (1/60) * 6 = $0.10
    expect(result.baseCost).toBe(7.0);
    expect(result.overtimeCost).toBe(0.1);
    expect(result.totalCost).toBe(7.1);
  });

  it('applies overtimeRateMultiplier exclusively to overtime cost', () => {
    const result = calculateSessionCost({
      startedAt: start,
      endedAt: '2026-07-18T11:15:00.000Z', // 75 mins
      scheduledEnd,
      gracePeriodMinutes: 10,
      overtimeRateMultiplier: 1.5,
      deviceHourlyRate: 6.0,
      sessionType: 'fixed',
    });
    expect(result.overtimeMinutes).toBe(5);
    expect(result.baseCost).toBe(7.0);
    expect(result.overtimeCost).toBe(0.75);
    expect(result.totalCost).toBe(7.75);
  });
});

describe('calculateSessionCost - Rate Override', () => {
  it('gives hourlyRateOverride precedence over deviceHourlyRate exactly once', () => {
    const result = calculateSessionCost({
      startedAt: '2026-07-18T10:00:00.000Z',
      endedAt: '2026-07-18T11:00:00.000Z', // 60 mins
      deviceHourlyRate: 6.0,
      hourlyRateOverride: 12.0,
    });
    expect(result.baseCost).toBe(12.0);
    expect(result.totalCost).toBe(12.0);
  });
});

describe('calculateSessionCost - Boundary Edge Cases', () => {
  const baseParams = {
    startedAt: '2026-07-18T10:00:00.000Z',
    deviceHourlyRate: 6.0,
  };

  it('handles 0 minutes duration boundary', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:00:00.000Z',
    });
    expect(result.rawMinutes).toBe(0);
    expect(result.billedMinutes).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it('handles 1 minute duration boundary', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:01:00.000Z',
    });
    expect(result.rawMinutes).toBe(1);
    expect(result.billedMinutes).toBe(1);
    expect(result.totalCost).toBe(0.1);
  });

  it('handles 29 minutes duration boundary', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:29:00.000Z',
    });
    expect(result.rawMinutes).toBe(29);
    expect(result.billedMinutes).toBe(29);
    expect(result.totalCost).toBe(2.9);
  });

  it('handles 30 minutes duration boundary', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:30:00.000Z',
    });
    expect(result.rawMinutes).toBe(30);
    expect(result.billedMinutes).toBe(30);
    expect(result.totalCost).toBe(3.0);
  });

  it('handles fractional second rounding with nearest-minute rounding', () => {
    const resultUnder = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:30:05.000Z', // 30 mins 5 secs
    });
    expect(resultUnder.rawMinutes).toBe(30);
    expect(resultUnder.billedMinutes).toBe(30);
    expect(resultUnder.totalCost).toBe(3.0);

    const resultOver = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:30:35.000Z', // 30 mins 35 secs
    });
    expect(resultOver.rawMinutes).toBe(31);
    expect(resultOver.billedMinutes).toBe(31);
    expect(resultOver.totalCost).toBe(3.1);
  });
});

describe('calculateSessionCost - Money Precision', () => {
  it('rounds monetary values consistently to 2 decimal places', () => {
    const result = calculateSessionCost({
      startedAt: '2026-07-18T10:00:00.000Z',
      endedAt: '2026-07-18T10:37:00.000Z', // 37 mins
      deviceHourlyRate: 7.75,
    });
    // 37/60 * 7.75 = 4.779166666666667 -> 4.78
    expect(result.baseCost).toBe(4.78);
    expect(result.totalCost).toBe(4.78);
  });
});

describe('calculateSessionCost - Input Validation', () => {
  const valid = {
    startedAt: '2026-07-18T10:00:00.000Z',
    endedAt: '2026-07-18T10:30:00.000Z',
    deviceHourlyRate: 6.0,
  };

  it('rejects missing or invalid dates', () => {
    expect(() => calculateSessionCost({ ...valid, startedAt: '' })).toThrow('startedAt and endedAt dates are required');
    expect(() => calculateSessionCost({ ...valid, endedAt: '' })).toThrow('startedAt and endedAt dates are required');
  });

  it('rejects unparseable dates', () => {
    expect(() => calculateSessionCost({ ...valid, startedAt: 'not-a-date' })).toThrow('Invalid date provided for session calculation');
  });

  it('rejects end time before start time', () => {
    expect(() => calculateSessionCost({ ...valid, endedAt: '2026-07-18T09:00:00.000Z' })).toThrow('Session end time cannot be before start time');
  });

  it('rejects negative deviceHourlyRate', () => {
    expect(() => calculateSessionCost({ ...valid, deviceHourlyRate: -5 })).toThrow('Device hourly rate must be a non-negative number');
  });

  it('rejects negative hourlyRateOverride', () => {
    expect(() => calculateSessionCost({ ...valid, hourlyRateOverride: -10 })).toThrow('Hourly rate override must be a non-negative number');
  });

  it('rejects negative gracePeriodMinutes', () => {
    expect(() => calculateSessionCost({ ...valid, gracePeriodMinutes: -5 })).toThrow('Grace period minutes cannot be negative');
  });

  it('rejects negative overtimeRateMultiplier', () => {
    expect(() => calculateSessionCost({ ...valid, overtimeRateMultiplier: -1.5 })).toThrow('Overtime rate multiplier must be a non-negative number');
  });

  it('rejects missing scheduledEnd for fixed session', () => {
    expect(() => calculateSessionCost({ ...valid, sessionType: 'fixed' })).toThrow('Fixed-duration sessions require a valid scheduledEnd date');
  });

  it('rejects invalid scheduledEnd for fixed session', () => {
    expect(() => calculateSessionCost({ ...valid, sessionType: 'fixed', scheduledEnd: 'invalid-date' })).toThrow('Invalid scheduled end date provided for session calculation');
  });
});

describe('calculateSessionCost - Paused Time', () => {
  const rate = 6.0; // EGP/hr

  it('open session 60min with 15min paused → effective=45 → billed=45 → cost=(45/60)*6=4.50', () => {
    const result = calculateSessionCost({
      startedAt: '2026-07-18T10:00:00.000Z',
      endedAt:   '2026-07-18T11:00:00.000Z', // 60 min raw
      deviceHourlyRate: rate,
      sessionType: 'open',
      pausedMinutes: 15,
    });
    expect(result.rawMinutes).toBe(60);
    expect(result.pausedMinutes).toBe(15);
    expect(result.effectiveMinutes).toBe(45);
    expect(result.billedMinutes).toBe(45);
    expect(result.baseCost).toBe(4.5);
    expect(result.totalCost).toBe(4.5);
  });

  it('open session short: rawMinutes=40, paused=20 → effective=20 → billedMinutes=20 → cost=2.00', () => {
    const result = calculateSessionCost({
      startedAt: '2026-07-18T10:00:00.000Z',
      endedAt:   '2026-07-18T10:40:00.000Z', // 40 min raw
      deviceHourlyRate: rate,
      sessionType: 'open',
      pausedMinutes: 20,
    });
    expect(result.rawMinutes).toBe(40);
    expect(result.pausedMinutes).toBe(20);
    expect(result.effectiveMinutes).toBe(20);
    expect(result.billedMinutes).toBe(20);
    expect(result.baseCost).toBe(2.0);
    expect(result.totalCost).toBe(2.0);
  });

  it('fixed session: scheduled=60, rawMinutes=90, paused=20, grace=0 → effective=70 → overtimeMinutes=max(0,70-60-0)=10', () => {
    const result = calculateSessionCost({
      startedAt:   '2026-07-18T10:00:00.000Z',
      endedAt:     '2026-07-18T11:30:00.000Z', // 90 min raw
      scheduledEnd:'2026-07-18T11:00:00.000Z', // 60 min scheduled
      deviceHourlyRate: rate,
      sessionType: 'fixed',
      gracePeriodMinutes: 0,
      pausedMinutes: 20,
    });
    expect(result.rawMinutes).toBe(90);
    expect(result.pausedMinutes).toBe(20);
    expect(result.effectiveMinutes).toBe(70);
    expect(result.overtimeMinutes).toBe(10);
    expect(result.isOvertime).toBe(true);
    // billedMinutes = 70
    // baseMinutes = 70 - 10 = 60 → baseCost = (60/60)*6 = 6.00
    // overtimeCost = (10/60)*6*1.0 = 1.00
    expect(result.baseCost).toBe(6.0);
    expect(result.overtimeCost).toBe(1.0);
    expect(result.totalCost).toBe(7.0);
  });

  it('boundary: paused > raw (data error) → effectiveMinutes = 0, billedMinutes = 0', () => {
    const result = calculateSessionCost({
      startedAt: '2026-07-18T10:00:00.000Z',
      endedAt:   '2026-07-18T10:20:00.000Z', // 20 min raw
      deviceHourlyRate: rate,
      sessionType: 'open',
      pausedMinutes: 50, // more than raw — should not produce negative
    });
    expect(result.rawMinutes).toBe(20);
    expect(result.pausedMinutes).toBe(50);
    expect(result.effectiveMinutes).toBe(0); // clamped to 0
    expect(result.billedMinutes).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it('zero paused minutes behaves identically to pre-feature (backward compat)', () => {
    const withZeroPause = calculateSessionCost({
      startedAt: '2026-07-18T10:00:00.000Z',
      endedAt:   '2026-07-18T10:45:00.000Z',
      deviceHourlyRate: rate,
      pausedMinutes: 0,
    });
    const withoutParam = calculateSessionCost({
      startedAt: '2026-07-18T10:00:00.000Z',
      endedAt:   '2026-07-18T10:45:00.000Z',
      deviceHourlyRate: rate,
    });
    expect(withZeroPause.billedMinutes).toBe(withoutParam.billedMinutes);
    expect(withZeroPause.totalCost).toBe(withoutParam.totalCost);
  });
});
