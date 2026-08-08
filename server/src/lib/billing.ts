export interface BillingParams {
  startedAt: string | Date;
  endedAt: string | Date;
  deviceHourlyRate: number;
  hourlyRateOverride?: number | null;
  sessionType?: 'open' | 'fixed';
  scheduledEnd?: string | Date | null;
  gracePeriodMinutes?: number;
  overtimeRateMultiplier?: number;
}

export interface BillingResult {
  rawMinutes: number;
  billedMinutes: number;
  baseCost: number;
  overtimeMinutes: number;
  isOvertime: boolean;
  overtimeCost: number;
  totalCost: number;
}

const MIN_BILLING_MINUTES = 30;

/** Utility for consistent monetary rounding to 2 decimal places */
function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Standalone, pure billing logic function that computes CCMS session costs.
 * 
 * Rules:
 *  - Minimum billed duration is 30 minutes.
 *  - Ceiling-to-minute rounding for partial minutes.
 *  - hourlyRateOverride takes precedence over deviceHourlyRate.
 *  - Overtime applies to fixed-type sessions and evaluates real elapsed time (rawMinutes).
 *  - Monetary amounts are rounded consistently to 2 decimal places.
 */
export function calculateSessionCost(params: BillingParams): BillingResult {
  if (!params || !params.startedAt || !params.endedAt) {
    throw new Error('startedAt and endedAt dates are required');
  }

  const startMs = new Date(params.startedAt).getTime();
  const endMs = new Date(params.endedAt).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    throw new Error('Invalid date provided for session calculation');
  }

  if (endMs < startMs) {
    throw new Error('Session end time cannot be before start time');
  }

  if (typeof params.deviceHourlyRate !== 'number' || isNaN(params.deviceHourlyRate) || params.deviceHourlyRate < 0) {
    throw new Error('Device hourly rate must be a non-negative number');
  }

  if (params.hourlyRateOverride !== undefined && params.hourlyRateOverride !== null) {
    if (typeof params.hourlyRateOverride !== 'number' || isNaN(params.hourlyRateOverride) || params.hourlyRateOverride < 0) {
      throw new Error('Hourly rate override must be a non-negative number');
    }
  }

  if (params.gracePeriodMinutes !== undefined && params.gracePeriodMinutes !== null) {
    if (typeof params.gracePeriodMinutes !== 'number' || isNaN(params.gracePeriodMinutes) || params.gracePeriodMinutes < 0) {
      throw new Error('Grace period minutes cannot be negative');
    }
  }

  if (params.overtimeRateMultiplier !== undefined && params.overtimeRateMultiplier !== null) {
    if (typeof params.overtimeRateMultiplier !== 'number' || isNaN(params.overtimeRateMultiplier) || params.overtimeRateMultiplier < 0) {
      throw new Error('Overtime rate multiplier must be a non-negative number');
    }
  }

  if (params.sessionType === 'fixed') {
    if (!params.scheduledEnd) {
      throw new Error('Fixed-duration sessions require a valid scheduledEnd date');
    }
    const scheduledMs = new Date(params.scheduledEnd).getTime();
    if (isNaN(scheduledMs)) {
      throw new Error('Invalid scheduled end date provided for session calculation');
    }
  }

  const rawMinutes = Math.max(0, Math.ceil((endMs - startMs) / 60000));
  const billedMinutes = Math.max(MIN_BILLING_MINUTES, rawMinutes);

  const effectiveRate = Number(
    params.hourlyRateOverride !== undefined && params.hourlyRateOverride !== null
      ? params.hourlyRateOverride
      : params.deviceHourlyRate
  );

  let overtimeMinutes = 0;
  let isOvertime = false;
  let overtimeCost = 0;

  if (params.sessionType === 'fixed' && params.scheduledEnd) {
    const scheduledMs = new Date(params.scheduledEnd).getTime();
    const scheduledMinutes = Math.max(
      0,
      Math.ceil((scheduledMs - startMs) / 60000)
    );
    const graceMinutes = Number(params.gracePeriodMinutes || 0);

    overtimeMinutes = Math.max(0, rawMinutes - scheduledMinutes - graceMinutes);
    if (overtimeMinutes > 0) {
      isOvertime = true;
      const multiplier = Number(
        params.overtimeRateMultiplier !== undefined && params.overtimeRateMultiplier !== null
          ? params.overtimeRateMultiplier
          : 1.0
      );
      overtimeCost = roundCurrency((overtimeMinutes / 60) * effectiveRate * multiplier);
    }
  }

  const baseMinutes = billedMinutes - overtimeMinutes;
  const baseCost = roundCurrency((baseMinutes / 60) * effectiveRate);
  const totalCost = roundCurrency(baseCost + overtimeCost);

  return {
    rawMinutes,
    billedMinutes,
    baseCost,
    overtimeMinutes,
    isOvertime,
    overtimeCost,
    totalCost,
  };
}
