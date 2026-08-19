# 🎮 CCMS — Cyber Café & Gaming Lounge Management System
## Complete System Architecture & Feature Overview

---

## 1. 📌 Executive Overview

**CCMS (Cyber Café Management System)** is an enterprise-grade, hybrid desktop and cloud management platform tailored specifically for gaming lounges, cyber cafés, esports arenas, VR arcades, and billiard/entertainment centers. 

It is architected with an **Offline-First** philosophy, guaranteeing 100% operational uptime during internet disruptions while automatically synchronizing financial and operational data to the cloud when connectivity is available.

```
+-----------------------------------------------------------------------------+
|                                CCMS ECOSYSTEM                               |
+-----------------------------------------------------------------------------+
|  [ Electron Desktop App ] <--------+---------> [ Web Admin Dashboard ]      |
|           |                        |                       |                |
|  [ Local SQLite Engine ]           |             [ Supabase PostgreSQL ]    |
|   (sql.js In-Memory + Disk)        |             (Cloud Database & Auth)    |
|           |                        |                       |                |
|           +---------------- [ Sync Engine ] ---------------+                |
+-----------------------------------------------------------------------------+
```

---

## 2. 🏗️ Architecture & Operational Foundation

### 2.1. Hybrid Offline-First Architecture
* **Local In-Memory Database (`sql.js`):** The entire application can run completely standalone on a local Windows PC. Database reads and writes are processed locally in milliseconds without network latency.
* **Auto-Persistence:** In-memory state is automatically saved to the local disk (`%APPDATA%/ccms/ccms.db`).
* **Resilient Query Adapter (`local-db.ts`):** An internal query builder that mirrors the PostgREST/Supabase API syntax, allowing the backend controllers to operate identically whether running locally or against Supabase Cloud.

### 2.2. Background Cloud Synchronization Engine
* **Transaction Sync Queue (`sync_queue`):** Every mutation (`INSERT`, `UPDATE`, `DELETE`) is captured into a local queue.
* **Dependency-Ordered Ingestion:** Syncs parent tables before child tables (`tenants` ➔ `users` ➔ `devices` ➔ `customers` ➔ `sessions` ➔ `invoices`).
* **Data Sanitization (`cleanForCloud`):** Strips local-only tracking columns and transforms SQLite-compatible numeric booleans into standard PostgreSQL booleans.

### 2.3. Multi-Tenancy & Branch Isolation
* **Tenant Isolation (`tenant_id`):** Strict data segregation across all entities (devices, customers, sessions, invoices, café orders, products, and employees).
* **JWT-Bound Tenant Scoping:** Every authenticated request extracts the tenant context directly from the verified token, preventing cross-branch data leakage.

### 2.4. License Activation & Subscription Control
* **Status Enforcement:** Verifies subscription state (`active`, `trial`, `suspended`, `unactivated`) via the `licenseCheck` middleware.
* **Anti-Bypass Lock:** Automatically restricts sensitive business operations when licenses expire or are suspended.

---

## 3. 🖥️ Device, Station & Room Management

### 3.1. Versatile Hardware Categories
* **Desktop PCs:** Standard and VIP gaming workstations.
* **Consoles:** PlayStation 5, Xbox Series X/S, Nintendo Switch.
* **Virtual Reality (VR):** Meta Quest 3, HTC Vive, PS VR2 stations.
* **Billiard & Lounge Tables:** Billiards, Pool, Ping Pong, and Foosball tables.

### 3.2. Real-Time Status Lifecycle
* `available`: Ready for new walk-in or reserved customers.
* `in_use`: Currently active with a running gaming session.
* `reserved`: Locked for an upcoming booking.
* `offline` / `maintenance`: Under repair or powered down.

### 3.3. Dual Pricing System
* **Single-Player Rate (`hourly_rate`):** Base rate per hour for individual usage.
* **Multiplayer Rate (`hourly_rate_multi`):** Higher rate tier for multi-user console or table sessions.
* **Admin Rate Override:** Allows authorized supervisors to set customized hourly rates on the fly.

### 3.4. Dedicated Gaming Rooms & VIP Lounges
* Grouping devices into custom private rooms/lounges with custom icons and room-specific billing tiers.

---

## 4. ⏱️ Session & Time Tracking System

### 4.1. Flexible Session Types
* **Open-Ended Sessions (`open`):** Continuous play billed dynamically based on exact elapsed duration.
* **Fixed-Duration Sessions (`fixed`):** Pre-booked blocks of time with scheduled end times, visual countdowns, and automated overtime calculations.

### 4.2. Precision Pause & Resume
* **Pause Periods (`session_pauses`):** Staff can pause active sessions (e.g., prayer breaks, technical pauses, dining).
* **Billing Exclusion:** Paused minutes are strictly recorded and subtracted from the total billed time to guarantee customer fairness without manual calculation.
* **Double-Pause Prevention:** Database-level uniqueness constraints prevent race conditions on open pauses.

### 4.3. Overtime & Grace Period Engine
* **Grace Period (`grace_period_minutes`):** Configurable buffer time before overtime billing begins.
* **Configurable Overtime Multiplier:** Configurable multiplier (e.g., 1.5x) applied exclusively to time played beyond the scheduled window.

### 4.4. Anti-Fraud & Audit Logging
* **Theft Prevention on Start Times:** Prohibits shifting start times forward (which would delete played time and steal revenue).
* **Admin-Gated Backdating:** Only managers can adjust past start or end times (up to 30 days max).
* **Comprehensive Audit Trail (`session_audit_log`):** Logs every session modification, capturing the editor's ID, changed field, timestamp, old value, and new value.

---

## 5. 💳 Financial Engine & Invoice Management

### 5.1. Deterministic Billing Engine (`billing.ts`)
* **30-Minute Minimum Floor:** Enforces a minimum charge threshold on short sessions to protect store revenue.
* **Ceiling Minute Rounding:** Rounds fractional minutes up to the nearest whole minute.
* **Floating-Point Precision Guard:** Guarantees currency calculations are rounded to two decimal places (`EGP / USD / EUR`) using exact epsilon rounding.

### 5.2. Consolidated Guest Folios
* **Automated Bill Aggregation:** Automatically merges the station gameplay cost with all café orders consumed during the session into a single invoice.
* **One-Click Checkout:** Automatically ends the session, calculates the grand total, generates the invoice, and frees the device station.

### 5.3. Multi-Channel Payment Support
* Tracks payment status (`paid`, `unpaid`, `partial`).
* Supports standard payment methods: `cash`, `card`, `transfer`, and `wallet` (Vodafone Cash, InstaPay, etc.).

---

## 6. ☕ Café, Inventory & POS Management

### 6.1. Product Catalog & Cost Control
* Product listing with sales price (`price`), inventory cost (`cost_price`), and current stock count.
* Calculates gross margin and real profit per product.

### 6.2. Dual Sales Channels
1. **Session-Linked Orders (`session_orders`):** Drinks and snacks ordered by players at their stations, added to their open gaming bill.
2. **Standalone POS Sales (`standalone_orders`):** Direct counter sales for walk-in café customers not using gaming stations.

### 6.3. Inventory Control & Audit History
* **Live Stock Decrement:** Stock is automatically deducted on sale and blocked if insufficient.
* **Order Voiding (`voidSessionOrder`):** Cancelling an order automatically restores inventory levels and logs an audit record.
* **Stock Movement Logs (`product_stock_logs`):** Full traceability for stock operations (`restock`, `sale`, `standalone_sale`, `void_order`, `manual_adjustment`, `shrinkage`).

---

## 7. 👥 Customer Relations & Reservation System

### 7.1. Customer Profiles
* Supports permanent registered members and automated walk-in guest profiles (`walkin_XXXXXX`).
* Contact details (phone, email) for billing receipts and loyalty management.

### 7.2. Reservation Scheduling
* **Conflict Detection Engine:** Real-time overlap verification preventing double bookings on the same device station for conflicting time windows.
* **Automated Station Prep:** Automatically transitions device station status to `reserved` 15 minutes prior to the scheduled start time.
* **Cancellation Recovery:** Cancelling a reservation immediately reverts the device to `available`.

---

## 8. 🛡️ Role-Based Access Control & Security

### 8.1. User Roles & Separation of Duties
* **Administrator (`admin`):** Full system governance, financial and profit reports, employee management, rate overrides, backdating, and device configuration.
* **Staff (`staff`):** Operational duties only (starting/stopping sessions, logging café orders, taking payments). Financial margins and device pricing configurations are locked.

### 8.2. Defense-in-Depth Security
* **Authentication:** Password hashing via `bcrypt` with salt rounds.
* **Token Security:** `HttpOnly`, `SameSite` cookies with silent refresh rotation.
* **CSRF Mitigation:** Double-submit cookie verification (`X-CSRF-Token`).
* **Brute-Force Protection:** Granular rate limiting on authentication routes (10 attempts / 15 minutes).
* **HTTP Security Headers:** `Helmet` Content Security Policy (CSP) and CORS origin whitelisting.

---

## 9. 📈 Analytics & Executive Reporting

### 9.1. Revenue & Financial Reports
* Real-time metrics for **Today**, **This Week**, and **This Month**.
* Split revenue tracking: **Device Station Income** vs. **Café Food & Beverage Income**.
* 14-day rolling revenue trend chart adjusted for the café's local timezone.

### 9.2. Device Utilization & Peak Hours
* **Utilization Percentages:** Tracks total runtime per station against period capacity.
* **24-Hour Peak Load Distribution:** Identifies the busiest hours of the day (0:00 to 23:00) to optimize staffing and promotional pricing.

---

## 10. 🌐 UI / UX & Internationalization

* **Bilingual Support (i18n):** Seamless toggle between **Arabic** (Full RTL layout support) and **English** (LTR).
* **Theme System:** Dark Gaming Lounge theme and Modern Light theme.
* **Interactive Live Dashboard:** Color-coded device grid displaying active player names, elapsed/remaining time, paused indicators, and one-click quick actions.
