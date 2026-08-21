export interface BillingParams {
  startedAt: string | Date;
  endedAt: string | Date;
  deviceHourlyRate: number;
  hourlyRateOverride?: number | null;
  sessionType?: 'open' | 'fixed';
  scheduledEnd?: string | Date | null;
  gracePeriodMinutes?: number;
  overtimeRateMultiplier?: number;
  pausedMinutes?: number; // NEW — total minutes the session was paused
  minBillingMinutes?: number; // Optional override for minimum billing duration (default 30)
}

export interface BillingResult {
  rawMinutes: number;          // wall-clock minutes from start to end (unchanged meaning)
  pausedMinutes: number;       // NEW — echoed back for the invoice breakdown
  effectiveMinutes: number;    // NEW — rawMinutes - pausedMinutes (floor 0)
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
 *  - Minimum billed duration is 30 minutes (applied to effectiveMinutes), unless minBillingMinutes is overridden.
 *  - Ceiling-to-minute rounding for partial minutes.
 *  - hourlyRateOverride takes precedence over deviceHourlyRate.
 *  - Overtime applies to fixed-type sessions using effectiveMinutes (not raw).
 *  - Monetary amounts are rounded consistently to 2 decimal places.
 *  - pausedMinutes defaults to 0; all existing behaviour is backward compatible.
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

  // Paused time is excluded from billing
  const pausedMinutes = Math.max(0, Math.round(params.pausedMinutes || 0));
  const effectiveMinutes = Math.max(0, rawMinutes - pausedMinutes);

  const minBilling = params.minBillingMinutes !== undefined ? Math.max(0, params.minBillingMinutes) : MIN_BILLING_MINUTES;
  const billedMinutes = Math.max(minBilling, effectiveMinutes);

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

    // Use effectiveMinutes: paused time doesn't count as overtime
    overtimeMinutes = Math.max(0, effectiveMinutes - scheduledMinutes - graceMinutes);
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
    pausedMinutes,
    effectiveMinutes,
    billedMinutes,
    baseCost,
    overtimeMinutes,
    isOvertime,
    overtimeCost,
    totalCost,
  };
}

export interface InvoiceAdjustmentParams {
  subtotal: number;
  discountType?: 'none' | 'percentage' | 'fixed';
  discountValue?: number;
  serviceFee?: number;
  serviceRate?: number;
  roundingDelta?: number;
}

export interface InvoiceAdjustmentResult {
  subtotal: number;
  discountAmount: number;
  afterDiscount: number;
  serviceFee: number;
  beforeRounding: number;
  roundingDelta: number;
  finalAmount: number;
}

/**
 * Calculates final invoice amounts taking into account discount, service fee, and cash rounding.
 */
export function calculateInvoiceAdjustments(params: InvoiceAdjustmentParams): InvoiceAdjustmentResult {
  const subtotal = Math.max(0, roundCurrency(params.subtotal || 0));
  let discountAmount = 0;

  if (params.discountType === 'percentage' && params.discountValue && params.discountValue > 0) {
    const pct = Math.min(100, Math.max(0, params.discountValue));
    discountAmount = roundCurrency(subtotal * (pct / 100));
  } else if (params.discountType === 'fixed' && params.discountValue && params.discountValue > 0) {
    discountAmount = Math.min(subtotal, roundCurrency(params.discountValue));
  }

  const afterDiscount = Math.max(0, roundCurrency(subtotal - discountAmount));

  let serviceFee = 0;
  if (params.serviceRate && params.serviceRate > 0) {
    serviceFee = roundCurrency(afterDiscount * (params.serviceRate / 100));
  } else if (params.serviceFee && params.serviceFee > 0) {
    serviceFee = roundCurrency(params.serviceFee);
  }

  const beforeRounding = roundCurrency(afterDiscount + serviceFee);
  const roundingDelta = params.roundingDelta ? roundCurrency(params.roundingDelta) : 0;
  const finalAmount = Math.max(0, roundCurrency(beforeRounding + roundingDelta));

  return {
    subtotal,
    discountAmount,
    afterDiscount,
    serviceFee,
    beforeRounding,
    roundingDelta,
    finalAmount,
  };
}



