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

/**
 * standalone, pure billing logic function that computes CCMS session costs
 * according to rules:
 *  - minimum billed duration is 30 minutes
 *  - ceiling-to-minute rounding
 *  - hourly_rate_override takes precedence
 *  - overtime/grace-period calculation for fixed-duration sessions
 */
export function calculateSessionCost(params: BillingParams): BillingResult {
  const startMs = new Date(params.startedAt).getTime();
  const endMs = new Date(params.endedAt).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    throw new Error('Invalid date provided for session calculation');
  }

  if (endMs < startMs) {
    throw new Error('Session end time cannot be before start time');
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
    if (isNaN(scheduledMs)) {
      throw new Error('Invalid scheduled end date provided for session calculation');
    }
    const scheduledMinutes = Math.max(
      0,
      Math.ceil((scheduledMs - startMs) / 60000)
    );
    const graceMinutes = Number(params.gracePeriodMinutes || 0);

    overtimeMinutes = Math.max(0, billedMinutes - scheduledMinutes - graceMinutes);
    if (overtimeMinutes > 0) {
      isOvertime = true;
      const multiplier = Number(params.overtimeRateMultiplier || 1.0);
      overtimeCost = (overtimeMinutes / 60) * effectiveRate * multiplier;
    }
  }

  const baseMinutes = billedMinutes - overtimeMinutes;
  const baseCost = (baseMinutes / 60) * effectiveRate;
  const totalCost = Number((baseCost + overtimeCost).toFixed(2));

  return {
    rawMinutes,
    billedMinutes,
    baseCost: Number(baseCost.toFixed(2)),
    overtimeMinutes,
    isOvertime,
    overtimeCost: Number(overtimeCost.toFixed(2)),
    totalCost,
  };
}
