# CCMS — Time & Billing Engine Specification

## Overview

The Cyber Café & Gaming Lounge Management System (CCMS) Time & Billing Engine is a high-precision billing subsystem designed to compute session durations, hourly device charges, grace periods, and overtime fees deterministically.

---

## Key Features & Rules

### 1. Hourly Rate Selection
- **Single-player Rate**: Standard hourly rate configured per device (`hourly_rate`).
- **Multiplayer Rate**: Secondary hourly rate applied when multiplayer mode is activated (`hourly_rate_multi`).
- **Rate Override (`hourlyRateOverride`)**: Custom hourly rate specified by staff, taking precedence over device default rates.

### 2. Minute Ceiling Rounding Rule
- Partial minutes are always rounded up to the next full minute using ceiling rounding:
  $$\text{rawMinutes} = \max\left(0, \left\lceil \frac{\text{endedAt} - \text{startedAt}}{60000} \right\rceil\right)$$

### 3. Minimum 30-Minute Billing Floor
- All sessions are subject to a minimum billing duration of **30 minutes**:
  $$\text{billedMinutes} = \max(30, \text{rawMinutes})$$

### 4. Session Types

#### A. Open Sessions (Pay-As-You-Go)
- No predefined end time.
- Charges accumulate dynamically based on elapsed time.
- Overtime rules do **not** apply.

#### B. Fixed Sessions (Prepaid / Scheduled Duration)
- Pre-scheduled with a fixed end time (`scheduledEnd`).
- Configurable **Grace Period** (`gracePeriodMinutes`): Grace minutes allowed after `scheduledEnd` before overtime applies.
- **Overtime Calculation**: Evaluated against actual elapsed time (`rawMinutes`):
  $$\text{overtimeMinutes} = \max(0, \text{rawMinutes} - \text{scheduledMinutes} - \text{graceMinutes})$$
- **Overtime Multiplier (`overtimeRateMultiplier`)**: Configurable rate multiplier (e.g. 1.5x) applied to overtime minutes:
  $$\text{overtimeCost} = \left(\frac{\text{overtimeMinutes}}{60}\right) \times \text{effectiveRate} \times \text{multiplier}$$

### 5. Anti-Fraud Session Start-Time Editing Rules (Backdate Only)
- **Forward-Dating Blocked (`started_at > originalStartedAt`)**: Moving `started_at` to a *later* time (e.g., advancing start time from 2:00 PM to 3:00 PM) is **strictly rejected** on both the server API and frontend UI. This prevents staff members from shortening played duration to steal revenues.
- **Backdating Allowed (`started_at <= originalStartedAt`)**: Staff (admins) may adjust `started_at` to an *earlier* time if a session was opened late.
- **Max Input Cap**: The frontend datetime picker caps `max` at `session.started_at`.

### 6. Final Cost Breakdown Equations

$$\text{baseMinutes} = \text{billedMinutes} - \text{overtimeMinutes}$$
$$\text{baseCost} = \left(\frac{\text{baseMinutes}}{60}\right) \times \text{effectiveRate}$$
$$\text{totalDeviceCost} = \text{baseCost} + \text{overtimeCost}$$
$$\text{totalInvoiceCost} = \text{totalDeviceCost} + \text{caféOrdersCost}$$

---

## Practical Numerical Examples

### Example 1: Open Session (Short Duration under 30 Minutes)
- **Start**: `10:00 AM` | **End**: `10:15 AM`
- **Rate**: `$6.00 / hour`
- `rawMinutes` = 15 minutes
- `billedMinutes` = `max(30, 15)` = 30 minutes
- `totalCost` = `(30 / 60) * $6.00` = **$3.00**

### Example 2: Fixed Session (Ended Early Before Scheduled End)
- **Start**: `10:00 AM` | **Scheduled End**: `10:15 AM` (15 mins)
- **End**: `10:05 AM` (ended early after 5 mins)
- **Rate**: `$6.00 / hour` | **Grace Period**: `0 mins`
- `rawMinutes` = 5 minutes
- `billedMinutes` = `max(30, 5)` = 30 minutes
- `scheduledMinutes` = 15 minutes
- `overtimeMinutes` = `max(0, 5 - 15 - 0)` = **0 minutes** (No false overtime)
- `totalCost` = `(30 / 60) * $6.00` = **$3.00**

### Example 3: Fixed Session with Overtime & Multiplier
- **Start**: `10:00 AM` | **Scheduled End**: `11:00 AM` (60 mins)
- **End**: `11:15 AM` (75 mins total)
- **Rate**: `$6.00 / hour` | **Grace Period**: `10 mins` | **Multiplier**: `1.5x`
- `rawMinutes` = 75 minutes
- `scheduledMinutes` = 60 minutes
- `graceMinutes` = 10 minutes
- `overtimeMinutes` = `75 - 60 - 10` = **5 minutes**
- `baseMinutes` = `75 - 5` = 70 minutes
- `baseCost` = `(70 / 60) * $6.00` = **$7.00**
- `overtimeCost` = `(5 / 60) * $6.00 * 1.5` = **$0.75**
- `totalCost` = `$7.00 + $0.75` = **$7.75**

---

## TypeScript API Signature Reference

```typescript
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

export function calculateSessionCost(params: BillingParams): BillingResult;
```
