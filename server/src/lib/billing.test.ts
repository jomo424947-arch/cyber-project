import { describe, it, expect } from 'vitest';
import { calculateSessionCost } from './billing';

describe('calculateSessionCost - Open Sessions', () => {
  const baseParams = {
    startedAt: '2026-07-18T10:00:00.000Z',
    deviceHourlyRate: 6.0,
    sessionType: 'open' as const,
  };

  it('bills 15-minute session as 30 minutes (minimum floor)', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:15:00.000Z',
    });
    expect(result.rawMinutes).toBe(15);
    expect(result.billedMinutes).toBe(30);
    expect(result.baseCost).toBe(3.0);
    expect(result.totalCost).toBe(3.0);
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
    expect(result.billedMinutes).toBe(30);
    expect(result.overtimeMinutes).toBe(0);
    expect(result.isOvertime).toBe(false);
    expect(result.overtimeCost).toBe(0);
    expect(result.baseCost).toBe(3.0);
    expect(result.totalCost).toBe(3.0);
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
    // rawMinutes = 75, scheduled = 60, grace = 10 -> overtimeMinutes = 5
    // baseMinutes = 75 - 5 = 70 mins -> baseCost = 70/60 * 6.00 = 7.00
    // overtimeCost = 5/60 * 6.00 * 1.5 = 0.75
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
    expect(result.billedMinutes).toBe(30);
    expect(result.totalCost).toBe(3.0);
  });

  it('handles 1 minute duration boundary', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:01:00.000Z',
    });
    expect(result.rawMinutes).toBe(1);
    expect(result.billedMinutes).toBe(30);
    expect(result.totalCost).toBe(3.0);
  });

  it('handles 29 minutes duration boundary', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:29:00.000Z',
    });
    expect(result.rawMinutes).toBe(29);
    expect(result.billedMinutes).toBe(30);
    expect(result.totalCost).toBe(3.0);
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

  it('handles 31 minutes duration boundary', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:31:00.000Z',
    });
    expect(result.rawMinutes).toBe(31);
    expect(result.billedMinutes).toBe(31);
    expect(result.totalCost).toBe(3.1);
  });

  it('handles fractional second rounding up to full minute', () => {
    const result = calculateSessionCost({
      ...baseParams,
      endedAt: '2026-07-18T10:30:05.000Z', // 30 mins 5 secs
    });
    expect(result.rawMinutes).toBe(31);
    expect(result.billedMinutes).toBe(31);
    expect(result.totalCost).toBe(3.1);
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

  it('throws error when startedAt or endedAt is missing', () => {
    expect(() => calculateSessionCost({ ...valid, startedAt: '' })).toThrow('startedAt and endedAt dates are required');
    expect(() => calculateSessionCost({ ...valid, endedAt: '' })).toThrow('startedAt and endedAt dates are required');
  });

  it('throws error when invalid date string is passed', () => {
    expect(() => calculateSessionCost({ ...valid, startedAt: 'not-a-date' })).toThrow('Invalid date provided for session calculation');
  });

  it('throws error when endedAt is before startedAt', () => {
    expect(() => calculateSessionCost({ ...valid, endedAt: '2026-07-18T09:00:00.000Z' })).toThrow('Session end time cannot be before start time');
  });

  it('throws error when deviceHourlyRate is negative', () => {
    expect(() => calculateSessionCost({ ...valid, deviceHourlyRate: -5 })).toThrow('Device hourly rate must be a non-negative number');
  });

  it('throws error when hourlyRateOverride is negative', () => {
    expect(() => calculateSessionCost({ ...valid, hourlyRateOverride: -10 })).toThrow('Hourly rate override must be a non-negative number');
  });

  it('throws error when gracePeriodMinutes is negative', () => {
    expect(() => calculateSessionCost({ ...valid, gracePeriodMinutes: -5 })).toThrow('Grace period minutes cannot be negative');
  });

  it('throws error when overtimeRateMultiplier is negative', () => {
    expect(() => calculateSessionCost({ ...valid, overtimeRateMultiplier: -1.5 })).toThrow('Overtime rate multiplier must be a non-negative number');
  });

  it('throws error when fixed session lacks scheduledEnd', () => {
    expect(() => calculateSessionCost({ ...valid, sessionType: 'fixed' })).toThrow('Fixed-duration sessions require a valid scheduledEnd date');
  });

  it('throws error when fixed session has invalid scheduledEnd date', () => {
    expect(() => calculateSessionCost({ ...valid, sessionType: 'fixed', scheduledEnd: 'invalid-date' })).toThrow('Invalid scheduled end date provided for session calculation');
  });
});
