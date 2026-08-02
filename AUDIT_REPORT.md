# CCMS Audit Report — August 2, 2026

## Executive Summary

A comprehensive end-to-end audit was conducted on the Cyber Café Management System (CCMS), spanning the React/Vite client frontend, Express Node.js backend server, Supabase PostgreSQL cloud database schema, and local SQLite offline database engine.

Key findings ranked by severity:

1. ❌ **Critical Double-Billing Bug in Fixed-Duration Overtime**: `calculateSessionCost()` in `server/src/lib/billing.ts` calculates `baseCost` on the **total** session duration (`billedMinutes`) and then adds `overtimeCost` on top. As a result, overtime minutes are billed twice (at base rate + overtime rate multiplier).
2. ❌ **Cross-Tenant Access Flaw in Session Management**: Multiple endpoints in `server/src/controllers/sessions.controller.ts` (`editSession`, `extendSession`, `endSession`, `addSessionOrder`, `listSessionOrders`, `getSessionAuditLogs`) query session rows strictly by `id` without filtering by `tenant_id`.
3. ❌ **Hardcoded Fallback Super Admin Key**: `server/src/controllers/auth.controller.ts` falls back to `'CCMS_SECRET_DEV_KEY_2026'` when `SUPER_ADMIN_KEY` is not defined in the environment, allowing unauthorized administrative access.
4. ❌ **CSRF Protection Bypass via User-Agent Header**: `server/src/middleware/csrf.ts` exempts any HTTP request containing `'Electron'` in its `User-Agent` header, allowing web-based attackers to bypass CSRF checks by spoofing the header.
5. ❌ **Duplicate Invoice Generation Race Condition**: `endSession()` performs a non-atomic read-then-update check. Concurrent or repeated calls generate duplicate rows in the `invoices` table for a single session.

---

## 1. Session Time & Billing Calculation (Priority Review)

### 1.1 Minimum Billing (30 min) & Ceiling Rounding
* **Status**: ⚠️ Needs attention
* **File & Lines**: [billing.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/lib/billing.ts#L40-L41) (`server/src/lib/billing.ts:L40-41`)
* **Finding**: 
  - The minute calculation `rawMinutes = Math.max(0, Math.ceil((endMs - startMs) / 60000))` and minimum enforcement `billedMinutes = Math.max(30, rawMinutes)` properly implement ceiling-to-minute rounding.
  - Boundary behavior: `(endMs - startMs)` equal to 60,000 ms evaluates to 1 minute; 60,001 ms evaluates to 2 minutes.
  - **Risk**: `calculateSessionCost` does not validate whether `startedAt` or `endedAt` are valid date strings. Invalid strings evaluate to `NaN` in `new Date()`, resulting in `rawMinutes = NaN`, `baseCost = NaN`, and throwing a runtime `TypeError` during execution.

### 1.2 Backdated Start Times
* **Status**: ⚠️ Needs attention
* **File & Lines**: [sessions.controller.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/controllers/sessions.controller.ts#L162-L166) (`server/src/controllers/sessions.controller.ts:L162-166, L252-256`)
* **Finding**:
  - `startSession` and `editSession` block future start times exceeding a 10-second skew window (`sessionStart.getTime() > now.getTime() + 10000`).
  - When a session is backdated by more than 60 seconds, `isBackdated` triggers an entry into `session_audit_log`.
  - **Risk**: There is **no upper bound** on how far in the past `started_at` can be set. A non-admin user can backdate a session by years, causing astronomical billing calculations. Furthermore, non-admin staff can backdate session creation without requiring admin approval.

### 1.3 Fixed-Duration Sessions, Grace Period & Overtime Math
* **Status**: ❌ Bug (Critical Double-Billing Bug)
* **File & Lines**: [billing.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/lib/billing.ts#L49) (`server/src/lib/billing.ts:L49, L62-66, L70`), [billing.test.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/lib/billing.test.ts#L52-L67) (`server/src/lib/billing.test.ts:L52-67`)
* **Finding**:
  - Line 49 computes base cost over the **entire** session duration: `const baseCost = (billedMinutes / 60) * effectiveRate`.
  - Line 62 computes overtime minutes: `overtimeMinutes = Math.max(0, billedMinutes - scheduledMinutes - graceMinutes)`.
  - Line 66 computes overtime cost: `overtimeCost = (overtimeMinutes / 60) * effectiveRate * multiplier`.
  - Line 70 adds them together: `const totalCost = Number((baseCost + overtimeCost).toFixed(2))`.
  - **Explanation**: Overtime minutes are included inside `billedMinutes` (charged at `1.0x` base rate) **AND** billed again inside `overtimeCost` (charged at `1.0x * multiplier`). With a 1.5x multiplier, overtime minutes are billed at a 2.5x effective rate. Even with a 1.0x multiplier, overtime minutes are charged twice (2.0x rate). Existing test cases in `billing.test.ts` assert this flawed behavior as expected behavior.

### 1.4 Hourly Rate Override Authorization
* **Status**: ⚠️ Needs attention
* **File & Lines**: [sessions.controller.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/controllers/sessions.controller.ts#L142-L148) (`server/src/controllers/sessions.controller.ts:L142-148, L292-302`)
* **Finding**:
  - `startSession` and `editSession` compare `hourly_rate_override` against the current device base rate (`deviceBaseRate`). If they differ, non-admin users are rejected with `forbidden`.
  - **Risk**: If a non-admin passes an override equal to the device rate at creation time, the check passes. If the device rate in settings is subsequently updated, the session retains the frozen override value. Additionally, in `editSession`, non-admins cannot clear an existing rate override if the device rate differs from the override value.

### 1.5 Play Mode Rate Selection
* **Status**: ✅ Correct
* **File & Lines**: [sessions.controller.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/controllers/sessions.controller.ts#L139) (`server/src/controllers/sessions.controller.ts:L139, L293, L438`), [SessionModals.tsx](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/client/src/components/SessionModals.tsx#L300) (`client/src/components/SessionModals.tsx:L300`)
* **Finding**: Rate selection between `hourly_rate` (single) and `hourly_rate_multi` (multiplayer) is consistently enforced across `startSession`, `editSession`, `endSession`, and `EndSessionModal`. `play_mode` cannot be modified mid-session.

### 1.6 Café Orders Total & Invoice Integration
* **Status**: ⚠️ Needs attention
* **File & Lines**: [sessions.controller.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/controllers/sessions.controller.ts#L461-L477) (`server/src/controllers/sessions.controller.ts:L461-477, L564-566`), [SessionModals.tsx](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/client/src/components/SessionModals.tsx#L312-L317) (`client/src/components/SessionModals.tsx:L312-317`)
* **Finding**:
  - `addSessionOrder` prevents adding items to ended sessions (`if (session.status === 'ended')`).
  - `endSession` aggregates `session_orders.total_price` into `finalTotalCost`.
  - **Risk**: A race condition exists if `addSessionOrder` executes while `endSession` is reading order totals. Orders inserted after order summation but before status update to `'ended'` remain unbilled on the final invoice.
  - The client preview in `EndSessionModal` hardcodes `overtimeRateMultiplier = 1.0`, resulting in a mismatch between preview cost and server billing when `OVERTIME_RATE_MULTIPLIER` is set above 1.0.

### 1.7 Timezone Handling
* **Status**: ✅ Correct
* **File & Lines**: [billing.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/lib/billing.ts#L33-L34) (`server/src/lib/billing.ts:L33-34`)
* **Finding**: Session duration calculations use raw UTC epoch milliseconds (`new Date().getTime()`). Duration in milliseconds is timezone-agnostic and unaffected by Daylight Saving Time transitions.

### 1.8 Fixed-Duration Session Extension (`extendSession`)
* **Status**: ✅ Correct
* **File & Lines**: [sessions.controller.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/controllers/sessions.controller.ts#L364-L410) (`server/src/controllers/sessions.controller.ts:L364-410`)
* **Finding**: `extendSession` validates that the session is active, has type `'fixed'`, and contains a non-null `scheduled_end`. Audit log entries record previous and updated ISO timestamps.

### 1.9 Client-Side Live Timer Synchronization
* **Status**: ❌ Bug (Drift Risk)
* **File & Lines**: [RoomsPage.tsx](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/client/src/pages/RoomsPage.tsx#L572) (`client/src/pages/RoomsPage.tsx:L572`), [DeviceCard.tsx](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/client/src/components/DeviceCard.tsx#L67-L120) (`client/src/components/DeviceCard.tsx:L67-120`), [SessionsPage.tsx](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/client/src/pages/SessionsPage.tsx#L143-L171) (`client/src/pages/SessionsPage.tsx:L143-171`)
* **Finding**: Timer rendering logic is duplicated across three components. `RoomsPage.tsx` omits `grace_period_minutes` and flags sessions as `"OVERTIME"` immediately at `scheduled_end`, while `DeviceCard.tsx` and `SessionsPage.tsx` render `"Grace Period"`.

### 1.10 Double Invoice Generation Race Condition
* **Status**: ❌ Bug (Race Condition)
* **File & Lines**: [sessions.controller.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/controllers/sessions.controller.ts#L425-L495) (`server/src/controllers/sessions.controller.ts:L425-495`)
* **Finding**: `endSession` performs a non-atomic read-then-update sequence. Concurrent requests pass `if (session.status === 'ended')` simultaneously, leading to multiple updates and duplicate row insertions in `invoices`.

### 1.11 Currency & Floating-Point Precision
* **Status**: ⚠️ Needs attention
* **File & Lines**: [sessions.controller.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/controllers/sessions.controller.ts#L475) (`server/src/controllers/sessions.controller.ts:L475, L579`)
* **Finding**: Floating-point numbers are accumulated before calling `.toFixed(2)`. Accumulating multiple IEEE 754 float values can introduce rounding precision errors prior to final conversion.

### 1.12 Database Consistency (Local SQLite vs Cloud Supabase)
* **Status**: ✅ Correct
* **File & Lines**: [local-db.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/lib/local-db.ts) (`server/src/lib/local-db.ts`), [database.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/lib/database.ts) (`server/src/lib/database.ts`)
* **Finding**: Offline SQLite mode and Cloud Supabase mode use identical schema definitions and route requests through the same `calculateSessionCost` function.

---

## 2. Security

### 2.1 Hardcoded Super Admin Secret
* **Status**: ❌ Bug (High Severity)
* **File & Lines**: [auth.controller.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/controllers/auth.controller.ts#L675) (`server/src/controllers/auth.controller.ts:L675, L746, L773`)
* **Finding**: Super admin endpoints fall back to `'CCMS_SECRET_DEV_KEY_2026'` when `process.env.SUPER_ADMIN_KEY` is undefined. Unauthenticated callers can use this key to register or modify tenants.

### 2.2 CSRF Protection Bypass via User-Agent
* **Status**: ❌ Bug (High Severity)
* **File & Lines**: [csrf.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/middleware/csrf.ts#L47) (`server/src/middleware/csrf.ts:L47`)
* **Finding**: `csrfProtection` skips token verification if `userAgent.includes('Electron')`. Any web client can spoof the `User-Agent` header to bypass CSRF checks.

### 2.3 Auth Middleware & JWT Token Handling
* **Status**: ✅ Correct
* **File & Lines**: [auth.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/middleware/auth.ts) (`server/src/middleware/auth.ts`), [local-auth.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/lib/local-auth.ts) (`server/src/lib/local-auth.ts`)
* **Finding**: JWT verification correctly decodes payload tokens, verifies signatures, and attaches `req.user` (`id`, `email`, `role`, `tenant_id`).

### 2.4 Rate Limiting Scope
* **Status**: ⚠️ Needs attention
* **File & Lines**: [index.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/index.ts#L43-L55) (`server/src/index.ts:L43-55`)
* **Finding**: Global rate limiting is disabled outside of production (`process.env.NODE_ENV !== 'production'`). Sensitive authentication endpoints (`/api/auth/login`) lack dedicated rate limiters.

### 2.5 Password Hash Exclusions in Cloud Sync
* **Status**: ✅ Correct
* **File & Lines**: [sync-engine.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/lib/sync-engine.ts#L190) (`server/src/lib/sync-engine.ts:L190`)
* **Finding**: `cleanForCloud` explicitly strips `password_hash` (`delete result.password_hash`) prior to pushing SQLite data to Supabase Cloud.

---

## 3. Data Integrity

### 3.1 Reservation Conflict Detection
* **Status**: ⚠️ Needs attention
* **File & Lines**: [reservations.controller.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/controllers/reservations.controller.ts#L45-L61) (`server/src/controllers/reservations.controller.ts:L45-61`), [004_reservation_overlap_constraint.sql](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/migrations/004_reservation_overlap_constraint.sql#L18-L41) (`server/migrations/004_reservation_overlap_constraint.sql:L18-41`)
* **Finding**: App-level queries and Postgres triggers both enforce range overlap logic (`reserved_from < new.reserved_until AND reserved_until > new.reserved_from`). However, SQLite offline mode does not execute PostgreSQL triggers, relying entirely on application-level checks.

### 3.2 Single Active Session Per Device Constraint
* **Status**: ⚠️ Needs attention
* **File & Lines**: [003_active_session_index.sql](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/migrations/003_active_session_index.sql#L11-L12) (`server/migrations/003_active_session_index.sql:L11-12`), [database.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/lib/database.ts#L116-L118) (`server/src/lib/database.ts:L116-118`)
* **Finding**: PostgreSQL enforces a partial unique index (`idx_sessions_one_active_per_device`). This index is omitted from the SQLite schema in `database.ts`, allowing concurrent offline requests to create multiple active sessions for the same device.

### 3.3 Device Status State Transitions
* **Status**: ⚠️ Needs attention
* **File & Lines**: [devices.controller.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/controllers/devices.controller.ts#L86-L93) (`server/src/controllers/devices.controller.ts:L86-93`)
* **Finding**: `updateDevice` allows updating `status` without validating state transitions against active sessions or existing reservations.

---

## 4. Offline-First / Sync Architecture

### 4.1 Dual Offline Architectures
* **Status**: ❓ Uncertain / Architecture Question
* **File & Lines**: [offlineFirstService.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/client/src/services/offlineFirstService.ts) (`client/src/services/offlineFirstService.ts`), [syncService.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/client/src/services/syncService.ts) (`client/src/services/syncService.ts`), [sync-engine.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/lib/sync-engine.ts) (`server/src/lib/sync-engine.ts`)
* **Finding**: The application contains two distinct offline mechanisms:
  1. Server-side SQLite queue (`sync_queue`) processed by `sync-engine.ts` to sync with Supabase Cloud.
  2. Client-side IndexedDB queue processed by `syncService.ts`.
* **Issue**: `syncService.ts` line 39 contains an unhandled stub (`// Attempt sync logic here with Supabase / API backend`). If the Express server is unreachable, records written to IndexedDB remain un-synced.

---

## 5. Multi-Tenancy

### 5.1 Unscoped Queries in Sessions Controller
* **Status**: ❌ Bug (Security Risk)
* **File & Lines**: [sessions.controller.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/controllers/sessions.controller.ts) (`server/src/controllers/sessions.controller.ts:L242, L371, L422, L559, L605, L619`)
* **Finding**: The following controller functions look up records by primary key `id` without scoping to `tenant_id`:
  - `editSession` (L242)
  - `extendSession` (L371)
  - `endSession` (L422)
  - `addSessionOrder` (L559, L570)
  - `listSessionOrders` (L605)
  - `getSessionAuditLogs` (L619)

### 5.2 Multi-Tenancy Scope Summary

| Controller | Query Target | `tenant_id` Enforced? | Reference |
| :--- | :--- | :---: | :--- |
| `sessions.controller.ts` | `listSessions` | Yes | L23 |
| `sessions.controller.ts` | `startSession` (Device & Customer) | Yes | L75, L130, L156 |
| `sessions.controller.ts` | `editSession` | ❌ No | L242 |
| `sessions.controller.ts` | `extendSession` | ❌ No | L371 |
| `sessions.controller.ts` | `endSession` | ❌ No | L422 |
| `sessions.controller.ts` | `addSessionOrder` | ❌ No | L559, L570 |
| `sessions.controller.ts` | `listSessionOrders` | ❌ No | L605 |
| `sessions.controller.ts` | `getSessionAuditLogs` | ❌ No | L619 |
| `devices.controller.ts` | `listDevices` | Yes | L13 |
| `devices.controller.ts` | `listDevices` (History lookup) | ❌ No | L27-L29 |
| `devices.controller.ts` | `updateDevice` / `deleteDevice` | Yes | L98, L117, L124, L135, L144 |
| `reservations.controller.ts` | All endpoints | Yes | L10, L50, L80, L120 |
| `customers.controller.ts` | All endpoints | Yes | L15, L45, L85 |
| `products.controller.ts` | All endpoints | Yes | L10, L30, L52 |

---

## 6. Code Quality & Maintainability

### 6.1 Duplicated UI Icon Mapping
* **Status**: ⚠️ Needs attention
* **File & Lines**: `SettingsPage.tsx:L81`, `ReservationsPage.tsx:L125`, `CustomerProfilePage.tsx:L171, L218`, `DeviceCard.tsx:L21-L32`, `ReportsPage.tsx:L49-L51`
* **Finding**: Device type icon rendering logic (`d.type === 'pc' ? ... : d.type === 'console' ? ... : ...`) is duplicated across 5 UI components rather than consuming `DEVICE_TYPE_META` from `constants.ts`.

### 6.2 Type Safety Gaps
* **Status**: ⚠️ Needs attention
* **File & Lines**: [local-db.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/lib/local-db.ts#L15) (`server/src/lib/local-db.ts:L15, L75`), [sessions.controller.ts](file:///c:/Users/jomo4/OneDrive/Desktop/Cyber_MCS/server/src/controllers/sessions.controller.ts#L34) (`server/src/controllers/sessions.controller.ts:L34, L47, L95, L202`)
* **Finding**: Usage of `any` types bypasses TypeScript static analysis when handling database responses and error objects.

---

## Appendix: Full File List Reviewed

- `server/src/lib/billing.ts`
- `server/src/lib/billing.test.ts`
- `server/src/lib/database.ts`
- `server/src/lib/local-db.ts`
- `server/src/lib/sync-engine.ts`
- `server/src/lib/local-auth.ts`
- `server/src/controllers/sessions.controller.ts`
- `server/src/controllers/devices.controller.ts`
- `server/src/controllers/auth.controller.ts`
- `server/src/controllers/reservations.controller.ts`
- `server/src/controllers/reports.controller.ts`
- `server/src/controllers/pricing.controller.ts`
- `server/src/controllers/products.controller.ts`
- `server/src/controllers/customers.controller.ts`
- `server/src/middleware/auth.ts`
- `server/src/middleware/csrf.ts`
- `server/src/index.ts`
- `server/migrations/003_active_session_index.sql`
- `server/migrations/004_reservation_overlap_constraint.sql`
- `client/src/hooks/useNow.ts`
- `client/src/utils/format.ts`
- `client/src/components/SessionModals.tsx`
- `client/src/components/DeviceCard.tsx`
- `client/src/pages/RoomsPage.tsx`
- `client/src/pages/SessionsPage.tsx`
- `client/src/pages/SettingsPage.tsx`
- `client/src/pages/ReservationsPage.tsx`
- `client/src/pages/CustomerProfilePage.tsx`
- `client/src/pages/ReportsPage.tsx`
- `client/src/services/syncService.ts`
- `client/src/services/offlineFirstService.ts`
