# CCMS — Comprehensive Audit Report
## Gaming Rooms (`/rooms`) & Device Fleet (`/devices`) Modules

**Target System:** Cyber Café & Gaming Lounge Management System (CCMS)  
**Target Pages:** `localhost:5173/#/rooms` ("صالات الألعاب") & `localhost:5173/#/devices` ("أسطول الأجهزة")  
**Scope:** Frontend UI/UX, Backend Controllers & Routes, REST APIs, Database Schemas & Integrity, Real-Time Billing Engine, Cash Drawer Reconciliation, and Security Architecture.

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Data Leakage & Privacy Audit](#2-data-leakage--privacy-audit)
3. [Critical Security & Business Logic Vulnerabilities](#3-critical-security--business-logic-vulnerabilities)
4. [Database Integrity & Schema Architecture Audit](#4-database-integrity--schema-architecture-audit)
5. [Financial, Time & Billing Calculations Audit](#5-financial-time--billing-calculations-audit)
6. [Functional & UI/UX Discrepancies Between Both Pages](#6-functional--uiux-discrepancies-between-both-pages)
7. [Comprehensive Severity Matrix](#7-comprehensive-severity-matrix)
8. [Concrete Remediation Code & Action Plan](#8-concrete-remediation-code--action-plan)

---

## 1. Executive Summary

A comprehensive architectural, cryptographic, database, business logic, and mathematical audit was performed on the **Gaming Rooms** (`RoomsPage.tsx`) and **Device Fleet** (`DevicesPage.tsx`) modules, including their shared components (`DeviceCard.tsx`, `SessionModals.tsx`, `AddCafeModal.tsx`, `TransferSessionModal.tsx`, `DeviceFormModal.tsx`), backend controllers (`rooms.controller.ts`, `devices.controller.ts`, `sessions.controller.ts`, `shifts.controller.ts`), database schemas (`schema.sql`, `database.ts`), and billing calculation engines (`billing.ts`).

### Key Findings Overview:
- **Catastrophic Data Destruction on Deletion (CRITICAL):** Deleting a room or a device permanently deletes all historical completed sessions and financial invoices associated with that station, destroying historical accounting records, tax records, and revenue audit trails.
- **Financial Calculation Flaw in Shift Reconciliation (HIGH):** The shift closing engine aggregates all revenue (Cash, Credit Card POS, Bank Transfer, Vodafone Cash Wallet) into the expected physical cash drawer balance. Electronic payments are treated as physical bills in the drawer, creating guaranteed false cash deficit warnings (*"عجز في الدرج"*) for cashiers.
- **Billing Floor Bypass via Session Transfer (MEDIUM):** The 30-minute minimum billing floor rule can be bypassed by transferring a session between devices. A customer who plays for 5 minutes on Station A and 5 minutes on Station B is billed for 10 minutes ($3.34) instead of the mandatory 30-minute minimum floor ($10.00).
- **Overtime Calculation Corruption in Fixed Session Transfers (MEDIUM):** When transferring a fixed-duration session, `started_at` is reset to `now` without adjusting `scheduled_end`, causing premature or 100% overtime multiplier billing on the receiving device.
- **UI Truthy Pricing Fallback Bug (`0 EGP` Free Tier Bug) (LOW):** Using JavaScript `||` instead of nullish coalescing `??` causes free/promotional rooms ($0/hr) to display as 20 EGP/hr.
- **No Multiplayer Mode Selection on Devices Page (LOW):** Staff cannot initiate multiplayer sessions from the Devices Fleet page because the modal launcher does not expose the play mode switch present on the Rooms page.

---

## 2. Data Leakage & Privacy Audit

### 2.1 Customer PII in Active Sessions Query
* **Location:** `sessions.controller.ts` (`listSessions`, Line 23)
* **Code:**
  ```typescript
  .select('*, device:devices(id,name,type,hourly_rate,hourly_rate_multi), customer:customers(id,name,phone,email,username)')
  ```
* **Analysis:** When any staff member views `/rooms` or `/devices`, the API returns full customer details (`phone`, `email`, `name`, `username`).
* **Risk Assessment:** While staff need customer usernames and names to identify who is playing on which console, returning raw customer phone numbers and emails to all staff roles without masking increases customer data scraping risks.
* **Verdict:** Low-Risk / Intended operational feature, but recommended to omit email from the public active session payload unless staff is performing customer profile management.

### 2.2 Password Hash & Credential Protection
* **Locations Checked:** `auth.controller.ts`, `employees.controller.ts`, `local-auth.ts`
* **Findings:**
  - Password hashes (`password_hash`, `pin`) are strictly filtered in user selects (`select('id, email, full_name, role')`).
  - `/api/auth/employees-public` (used for login dropdown) returns only `id`, `email`, `full_name`, and `role`, completely scoped to the local `tenant_id`. No password hashes or secrets are exposed.
  - JWT tokens are signed using HMAC-SHA256 with strong secrets and protected in `httpOnly`, `SameSite=lax` cookies.

### 2.3 Multi-Tenant Data Isolation
* **Locations Checked:** All endpoints in `rooms.controller.ts`, `devices.controller.ts`, `sessions.controller.ts`
* **Findings:** Every query explicitly enforces `.eq('tenant_id', req.user!.tenant_id)`. Cross-tenant data leakage is strictly blocked at the API layer and the PostgreSQL Row Level Security (RLS) layer.

---

## 3. Critical Security & Business Logic Vulnerabilities

### 3.1 [CRITICAL] Permanent Erasure of Financial History on Room/Device Deletion
* **File:** `server/src/controllers/rooms.controller.ts` (Lines 214–238) & `server/src/controllers/devices.controller.ts` (Lines 134–160)
* **Vulnerability Description:**
  When an admin deletes a room or device, the backend actively deletes all historical sessions and all generated financial invoices linked to that device:
  ```typescript
  // rooms.controller.ts:
  if (room.device_id) {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('device_id', room.device_id)
      .eq('tenant_id', req.user!.tenant_id);

    if (sessions && sessions.length > 0) {
      for (const s of sessions) {
        await supabase.from('invoices').delete().eq('session_id', s.id).eq('tenant_id', req.user!.tenant_id);
      }
      await supabase.from('sessions').delete().eq('device_id', room.device_id).eq('tenant_id', req.user!.tenant_id);
    }
    await supabase.from('devices').delete().eq('id', room.device_id)...
  }
  ```
* **Impact:**
  1. If an admin removes a gaming room that operated for 6 months, **all 1,000+ customer invoices, financial payments, and session records are deleted forever**.
  2. Total revenue reports, profit/loss calculations, shift summaries, and tax records become corrupted and unverifiable.
  3. Deleting a device also silently deletes the associated room (`supabase.from('rooms').delete().eq('device_id', id)`), destroying the room layout instead of unlinking it.
* **Remediation:**
  - Rooms must set `device_id = null` on delete (unlinking), never deleting the underlying device or its session history.
  - Devices should use soft deletion (`archived = true`), or deletion must be **blocked** if `has_session_history === true`. Invoices and sessions must be immutable financial records.

---

### 3.2 [HIGH] Shift Cash Drawer Calculation Corrupted by Electronic Payments
* **File:** `server/src/controllers/shifts.controller.ts` (Lines 121–150)
* **Vulnerability Description:**
  When a shift is closed, the expected closing cash in the drawer is calculated as:
  $$\text{expectedClosing} = \text{opening\_cash} + \text{calculatedRevenue} - \text{calculatedExpenses}$$
  Where `calculatedRevenue` sums **ALL** paid invoices, regardless of payment method:
  ```typescript
  const invoicesRevenue = (invoices || []).reduce((acc: number, inv: any) => acc + Number(inv.amount || 0), 0);
  ```
* **Impact:**
  - If a shift collects 1,000 EGP Cash and 2,000 EGP via Visa/POS or Vodafone Cash Wallet:
    - Physical cash in drawer = 1,000 EGP (+ opening cash).
    - System calculates `expectedClosing` = 3,000 EGP (+ opening cash).
    - When staff enters actual cash (1,000 EGP), the system flags a **2,000 EGP Cash Deficit (عجز)** and blocks closing until a discrepancy note is written.
* **Remediation:**
  The cash drawer formula must calculate cash revenue separately:
  $$\text{expectedCashInDrawer} = \text{opening\_cash} + \text{cashInvoicesRevenue} + \text{cashCaféRevenue} - \text{cashExpenses}$$
  $$\text{totalShiftRevenue} = \text{cashRevenue} + \text{electronicRevenue}$$

---

### 3.3 [MEDIUM] Start-Time & End-Time Skew Tolerances
* **File:** `sessions.controller.ts` (Line 185, 288, 675)
* **Finding:** The backend allows up to 10 seconds of future clock skew (`now.getTime() + 10000`) to account for network latency between client and server.
* **Anti-Theft Rule Compliance:** Moving `started_at` to a later time is strictly blocked on both client and server (`newStart.getTime() > oldStart.getTime() + 1000`), successfully preventing rogue staff from trimming session duration to pocket cash. Backdating is restricted to admins only and audit-logged in `session_audit_log`.

---

## 4. Database Integrity & Schema Architecture Audit

### 4.1 Constraint & Indexing Verification

| Table | Constraint / Index | Status | Impact / Observations |
| :--- | :--- | :--- | :--- |
| `rooms` | `UNIQUE INDEX idx_rooms_device ON rooms(device_id)` | **PASS** | Prevents assigning one device to multiple rooms concurrently. |
| `rooms` | `device_id REFERENCES devices(id) ON DELETE SET NULL` | **PASS** | Schema is properly configured for unlinking; backend controller override needs fixing. |
| `sessions` | `UNIQUE INDEX idx_sessions_one_active_per_device` | **PASS** | Guarantees that at most 1 active session can run on a single device at any time. |
| `session_pauses` | `UNIQUE INDEX idx_session_pauses_one_open_per_session` | **PASS** | Prevents race condition where multiple pauses could be opened simultaneously. |
| `session_transfers` | Foreign Keys to `sessions`, `from_device_id`, `to_device_id` | **PASS** | Correctly references both devices and session lifecycle. |
| `invoices` | `UNIQUE INDEX idx_invoices_session_unique` | **PASS** | Enforces 1 invoice per session, avoiding duplicate billing. |
| `product_stock_logs` | `balance_after INTEGER CHECK (balance_after >= 0)` | **PASS** | Enforces that stock balance never drops below zero. |

### 4.2 SQLite Local DB vs PostgreSQL Supabase Parity
- All tables, indexes, and unique partial indexes (`WHERE resumed_at IS NULL`, `WHERE status = 'active'`) are identically implemented in SQLite (`database.ts`) and PostgreSQL (`schema.sql`).
- The offline sync engine (`sync-engine.ts`) properly handles `rooms`, `devices`, `sessions`, `invoices`, `session_pauses`, and `session_transfers`.

---

## 5. Financial, Time & Billing Calculations Audit

### 5.1 Billing Engine Formula Breakdown

The core billing calculations in `server/src/lib/billing.ts` were audited against edge cases:

$$\text{rawMinutes} = \max\left(0, \left\lceil \frac{\text{endedAt} - \text{startedAt}}{60000} \right\rceil\right)$$
$$\text{effectiveMinutes} = \max(0, \text{rawMinutes} - \text{pausedMinutes})$$
$$\text{billedMinutes} = \max(\text{minBillingMinutes}, \text{effectiveMinutes})$$

#### Mathematical Verification:
1. **Ceiling Minute Rounding:** Playing 1 second into a new minute (e.g. 15 min 1 sec) rounds to 16 minutes ($\lceil 15.016 \rceil = 16$). **PASS.**
2. **Paused Time Exclusion:** Paused time is subtracted from raw duration before computing the 30-minute floor. If a player pauses for 10 minutes during a 40-minute session, effective duration is 30 minutes. **PASS.**
3. **Monetary Rounding:** All monetary arithmetic uses `roundCurrency(x) = Math.round((x + Number.EPSILON) * 100) / 100` to prevent IEEE-754 floating point penny discrepancies. **PASS.**

---

### 5.2 [CRITICAL LOGIC FLAW] Transfer Segment Billing Floor Bypass

#### The Bug Mechanism:
In `sessions.controller.ts`:
1. When transferring a session from Station A to Station B after 5 minutes:
   $$\text{Segment 1 Cost} = \frac{5}{60} \times 20 = 1.67\text{ EGP} \quad (\text{transfersMinutes} = 5)$$
2. When ending the session on Station B after 5 minutes:
   Line 726 sets `minBillingMinutes = previousTransfersMinutes > 0 ? 0 : 30`.
   Since `previousTransfersMinutes = 5 > 0`, Station B duration is billed as 5 minutes with **zero minimum floor**:
   $$\text{Segment 2 Cost} = \frac{5}{60} \times 20 = 1.67\text{ EGP}$$
   $$\text{Total Invoice} = 1.67 + 1.67 = \mathbf{3.34\text{ EGP}}$$

#### Business Impact:
- The lounge policy enforces a mandatory **30-minute minimum billing floor (10.00 EGP)**.
- A customer who switches devices pays only **3.34 EGP**, successfully bypassing the 30-minute floor rule.

#### Mathematical Fix:
The 30-minute floor must apply to the **total cumulative session duration** ($\text{effectiveMinutes}_{\text{seg2}} + \text{transfersMinutes}$):
$$\text{totalEffectiveSessionMinutes} = \text{transfersMinutes} + \text{effectiveMinutes}_{\text{current}}$$
$$\text{deficitMinutes} = \max(0, 30 - \text{totalEffectiveSessionMinutes})$$
$$\text{billedMinutes}_{\text{current}} = \text{effectiveMinutes}_{\text{current}} + \text{deficitMinutes}$$

---

### 5.3 [LOGIC FLAW] Fixed Session Overtime Calculation on Transferred Sessions

#### The Bug Mechanism:
In `sessions.controller.ts:transferSession`:
- `started_at` is updated to `now.toISOString()`.
- `scheduled_end` is **left unchanged**.
- If a 60-minute prepaid session starts at 2:00 PM (`scheduled_end: 3:00 PM`) and transfers at 2:45 PM:
  - On the new device: `started_at = 2:45 PM`, `scheduled_end = 3:00 PM` (15 minutes remaining).
  - In `calculateSessionCost`:
    $$\text{scheduledMinutes} = \lceil (3:00\text{ PM} - 2:45\text{ PM}) / 60000 \rceil = 15\text{ minutes}$$
- **What happens if transferred during overtime (e.g. at 3:05 PM)?**
  `scheduled_end` (3:00 PM) is in the past relative to `started_at` (3:05 PM).
  `scheduledMinutes` becomes $\max(0, \text{negative}) = 0$.
  Every subsequent minute on the new device is charged as 100% overtime with a 1.5x multiplier, instead of accounting for the base duration already consumed.

#### Fix:
When transferring a fixed session, either adjust `scheduled_end` by the remaining scheduled minutes or convert the remaining segment cleanly into an open session.

---

## 6. Functional & UI/UX Discrepancies Between Both Pages

| Feature / UI Element | Gaming Rooms Page (`/rooms`) | Device Fleet Page (`/devices`) | Evaluation & Impact |
| :--- | :--- | :--- | :--- |
| **Play Mode Selector** | Has interactive Single / Multi toggle button on room card | No toggle on device card; starts as Single by default | **Discrepancy:** Staff cannot launch multiplayer sessions directly from Fleet page. |
| **Overtime Live Display** | Stops at `00:00:00` for fixed sessions in overtime | Shows pulsing `OVERTIME +05:12` with exceeded limit badge | **Discrepancy:** Rooms page does not visually alert staff of live overtime duration. |
| **Quick Café Action** | Direct `+ Café` button on active card | No button; must navigate away or edit | **Discrepancy:** Less convenient ordering workflow on Fleet page. |
| **Audit Logs Viewer** | No audit button on card | Has quick "Logs" modal for active session history | **Discrepancy:** Staff cannot inspect audit trail directly from Rooms card. |
| **Zero Rate Display** | Displays `20 ج/ساعة` when rate is `0` due to `rate \|\| 20` | Displays correctly from device model | **Bug:** Faulty fallback prevents free/promotional rates from displaying. |
| **Orphaned Status Reset** | Has built-in auto-recovery prompt if status is `in_use` without session | Does not respond if status is orphaned | **Minor Discrepancy:** Better recovery handling on Rooms page. |

---

## 7. Comprehensive Severity Matrix

| ID | Issue Description | Severity | Component | Risk Impact |
| :---: | :--- | :---: | :---: | :--- |
| **SEC-01** | Cascading deletion of historical sessions & invoices on room/device deletion | **CRITICAL** | `rooms.controller.ts`, `devices.controller.ts` | Permanent loss of financial records, accounting & tax history |
| **FIN-01** | Shift cash drawer calculation adds electronic/card revenue to physical cash balance | **HIGH** | `shifts.controller.ts` | False cash deficit warnings, erroneous cashier accountability |
| **FIN-02** | 30-Minute minimum billing floor bypassed when transferring sessions | **MEDIUM** | `sessions.controller.ts`, `billing.ts` | Financial revenue leakage on multi-device sessions |
| **FIN-03** | Fixed-duration session overtime calculation distortion upon device transfer | **MEDIUM** | `sessions.controller.ts` | Overcharging customers on transferred prepaid sessions |
| **UI-01** | Zero-price (`0 EGP`) display bug using truthy `\|\|` fallback | **LOW** | `RoomsPage.tsx` | Misleading pricing for free/promo stations |
| **UX-01** | Missing multiplayer toggle selector on Device Fleet cards | **LOW** | `DevicesPage.tsx`, `DeviceCard.tsx` | Staff inconvenience when starting multiplayer matches |
| **UX-02** | Live overtime counter stops at `00:00:00` on Rooms cards | **LOW** | `RoomsPage.tsx` | Staff unaware of active overtime accumulation in rooms |

---

## 8. Concrete Remediation Code & Action Plan

### 8.1 Fix SEC-01: Protect Financial Records During Room & Device Deletion

#### In `server/src/controllers/rooms.controller.ts`:
```typescript
// REPLACE lines 205-238 with non-destructive room deletion:
export async function deleteRoom(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can delete gaming rooms');
  }

  const { id } = req.params;

  const { data: room, error: fetchErr } = await supabase
    .from('rooms')
    .select('*, device:devices(id,name,status)')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!room) throw notFound('Gaming room not found');

  // Check if device has an active session
  if (room.device_id) {
    const { data: activeSession } = await supabase
      .from('sessions')
      .select('id')
      .eq('device_id', room.device_id)
      .eq('status', 'active')
      .eq('tenant_id', req.user!.tenant_id)
      .maybeSingle();

    if (activeSession) {
      throw badRequest('لا يمكن حذف الغرفة أثناء وجود جلسة لعب نشطة. يرجى إنهاء الجلسة أولاً.');
    }
  }

  // Delete ONLY the room record. NEVER touch historical sessions, invoices, or devices!
  const { error: delErr } = await supabase
    .from('rooms')
    .delete()
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id);

  if (delErr) throw delErr;

  res.json({ message: 'Room deleted successfully', id });
}
```

---

### 8.2 Fix FIN-01: Accurate Cash Drawer Reconciliation in Shifts

#### In `server/src/controllers/shifts.controller.ts`:
```typescript
// IN closeShift and getShiftSummary:
// Separate Cash from Electronic payments (card, transfer, wallet)
const cashInvoicesRevenue = (invoices || [])
  .filter((inv: any) => inv.payment_method === 'cash')
  .reduce((acc: number, inv: any) => acc + Number(inv.amount || 0), 0);

const electronicInvoicesRevenue = (invoices || [])
  .filter((inv: any) => inv.payment_method !== 'cash')
  .reduce((acc: number, inv: any) => acc + Number(inv.amount || 0), 0);

const cashStandaloneRevenue = (standaloneOrders || [])
  .filter((ord: any) => ord.payment_method === 'cash')
  .reduce((acc: number, ord: any) => acc + Number(ord.total_price || 0), 0);

const electronicStandaloneRevenue = (standaloneOrders || [])
  .filter((ord: any) => ord.payment_method !== 'cash')
  .reduce((acc: number, ord: any) => acc + Number(ord.total_price || 0), 0);

const totalCashRevenue = cashInvoicesRevenue + cashStandaloneRevenue;
const totalElectronicRevenue = electronicInvoicesRevenue + electronicStandaloneRevenue;
const calculatedTotalRevenue = totalCashRevenue + totalElectronicRevenue;

// Physical Cash Drawer expected balance:
const expectedClosingCash = Number(shift.opening_cash || 0) + totalCashRevenue - calculatedExpenses;
const numericClosingCash = Number(closing_cash);
const cashDifference = numericClosingCash - expectedClosingCash;
```

---

### 8.3 Fix FIN-02: Cumulative Session Billing Floor on Transfers

#### In `server/src/controllers/sessions.controller.ts`:
```typescript
// IN endSession (around line 726):
const cumulativeEffectiveMinutes = previousTransfersMinutes + effectiveMinutes;
const cumulativeFloorDeficit = Math.max(0, 30 - cumulativeEffectiveMinutes);
const adjustedCurrentSegmentBilledMinutes = effectiveMinutes + cumulativeFloorDeficit;

const {
  rawMinutes,
  pausedMinutes,
  effectiveMinutes: segEffectiveMinutes,
  billedMinutes,
  baseCost,
  overtimeMinutes,
  isOvertime,
  overtimeCost,
  totalCost: currentSegmentCost,
} = calculateSessionCost({
  startedAt: session.started_at,
  endedAt: sessionEnd,
  deviceHourlyRate,
  hourlyRateOverride: session.hourly_rate_override,
  sessionType: session.session_type,
  scheduledEnd: session.scheduled_end,
  gracePeriodMinutes: session.grace_period_minutes,
  overtimeRateMultiplier: Number(process.env.OVERTIME_RATE_MULTIPLIER || 1.0),
  pausedMinutes: Number(session.total_paused_minutes || 0),
  minBillingMinutes: adjustedCurrentSegmentBilledMinutes,
});
```

---

### 8.4 Fix UI-01 & UX-01: Rooms & Devices UI Enhancements

#### In `client/src/pages/RoomsPage.tsx`:
```typescript
// Replace lines 278-280 with Nullish Coalescing (??):
const hourlyRate = playMode === 'multiplayer'
  ? (device?.hourly_rate_multi ?? 30)
  : (device?.hourly_rate ?? 20);
```

#### In `client/src/components/DeviceCard.tsx`:
Add a quick `+ Café` button and play mode indicator to unify feature parity across both pages.

---

## 9. Conclusion

The CCMS system possesses a strong architectural foundation, strict multi-tenant isolation, anti-theft backdating guards, atomic stock adjustments, and an offline-first sync engine. 

Addressing the **financial invoice retention on room deletion (SEC-01)**, **cash drawer payment method segregation (FIN-01)**, and **cumulative transfer minimum floor billing (FIN-02)** will bring the system to an institutional enterprise standard of accounting integrity and security.
