# CCMS API Documentation
## Cyber Café & Gaming Lounge Management System — Backend API Reference

**Base URL:** `http://148.66.152.6`
**Content-Type:** `application/json`

---

## Authentication

All protected endpoints require a valid JWT token. Authentication is cookie-based using HttpOnly cookies.

### Login to get auth cookies:

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "HAMO@gmail.com",
  "password": "123456"
}
```

**Response:** Sets `access_token` and `refresh_token` as HttpOnly cookies. Also returns a `csrf_token` cookie.

**All subsequent requests must include:**
- The cookies returned from login (automatic in browser/agent)
- Header: `X-CSRF-Token: <value from csrf_token cookie>`

### Test Account Credentials
- **Email:** `HAMO@gmail.com`
- **Password:** `123456`
- **Role:** Super Admin (full access to all endpoints)

---

## Health Check

### GET /health
No authentication required.

**Response 200:**
```json
{
  "status": "ok",
  "service": "ccms-api"
}
```

---

## 1. Auth Endpoints

Base path: `/api/auth`

### POST /api/auth/login
Login with email and password. Rate limited: 30 attempts per 15 minutes.

**Request Body:**
```json
{
  "email": "HAMO@gmail.com",
  "password": "123456",
  "rememberMe": false
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `email` | string (email) | ✅ | User email address |
| `password` | string | ✅ | User password |
| `rememberMe` | boolean | ❌ | Extend token expiry (default: false) |

**Response 200:** User object + sets auth cookies.

**Response 401:** Invalid credentials.

---

### POST /api/auth/signup
Register a new account. Rate limited.

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "securepassword123",
  "fullName": "John Doe"
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `email` | string (email) | ✅ | New user email |
| `password` | string (min 8 chars) | ✅ | Password (minimum 8 characters) |
| `fullName` | string (2-120 chars) | ❌ | Full name |

**Response 201:** Created user object.

---

### POST /api/auth/refresh
Refresh the access token using the refresh token cookie.

**Request Body:** None (uses cookies).

**Response 200:** New access token set in cookie.

---

### GET /api/auth/me
Get the currently authenticated user's profile. **Requires auth.**

**Response 200:**
```json
{
  "id": "uuid",
  "email": "HAMO@gmail.com",
  "full_name": "Hamo",
  "role": "admin",
  "tenant_id": "uuid"
}
```

---

### POST /api/auth/logout
Logout and clear auth cookies. **Requires auth.**

**Response 200:** `{ "message": "Logged out" }`

---

### GET /api/auth/status
Get the system activation status. No auth required.

**Response 200:** Activation status object.

---

### GET /api/auth/employees-public
List employees without authentication (for login screen employee selection).

**Response 200:** Array of public employee records.

---

### POST /api/auth/activate
Activate a tenant. Rate limited.

**Response 200:** Activation result.

---

### POST /api/auth/forgot-password
Request a password reset email. Rate limited.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

---

### POST /api/auth/reset-password
Reset password with a token.

**Request Body:**
```json
{
  "token": "reset-token-string",
  "newPassword": "newsecurepassword"
}
```

---

### POST /api/auth/verify-email
Verify email with a token.

**Request Body:**
```json
{
  "token": "verification-token"
}
```

---

### POST /api/auth/sync
Trigger a manual cloud sync. **Requires auth.**

**Response 200:** Sync result.

---

### POST /api/auth/register-tenant
Register a new tenant (Super Admin only, requires SUPER_ADMIN_KEY).

---

### GET /api/auth/tenants
List all tenants (Super Admin only).

---

### PATCH /api/auth/tenants/:id/status
Update a tenant's status (Super Admin only).

---

## 2. Devices Endpoints

Base path: `/api/devices`
**All endpoints require authentication.**

### GET /api/devices
List all devices for the current tenant.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "name": "PC-01",
    "type": "pc",
    "status": "available",
    "hourly_rate": 5.00,
    "hourly_rate_multi": 4.00,
    "archived": false,
    "specs": { "cpu": "i5-12400F", "gpu": "RTX 3060", "ram": "16GB" },
    "tenant_id": "uuid",
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  }
]
```

---

### POST /api/devices
Create a new device. **Requires admin role.**

**Request Body:**
```json
{
  "name": "PC-05",
  "type": "pc",
  "hourly_rate": 6.00,
  "hourly_rate_multi": 5.00,
  "specs": { "cpu": "i7-13700K", "gpu": "RTX 4070", "ram": "32GB" }
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `name` | string (1-60 chars) | ✅ | Device display name |
| `type` | enum: `pc`, `console`, `vr`, `table` | ❌ | Device category (default: `pc`) |
| `hourly_rate` | number (≥ 0) | ❌ | Single player hourly rate (default: 0) |
| `hourly_rate_multi` | number (≥ 0) | ❌ | Multiplayer hourly rate |
| `specs` | object | ❌ | Hardware specifications (free-form JSON) |

**Response 201:** Created device object.

---

### PATCH /api/devices/:id
Update a device.

**Request Body (partial):**
```json
{
  "name": "PC-05 VIP",
  "status": "offline",
  "hourly_rate": 8.00
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `name` | string (1-60 chars) | ❌ | Device name |
| `type` | enum: `pc`, `console`, `vr`, `table` | ❌ | Device type |
| `status` | enum: `available`, `in_use`, `reserved`, `offline` | ❌ | Device status |
| `hourly_rate` | number (≥ 0) | ❌ | Single player rate |
| `hourly_rate_multi` | number (≥ 0) | ❌ | Multiplayer rate |
| `specs` | object | ❌ | Hardware specs |

**Response 200:** Updated device object.

---

### DELETE /api/devices/:id
Delete (archive) a device.

**Response 200:** Deletion confirmation.

---

## 3. Sessions Endpoints

Base path: `/api/sessions`
**All endpoints require authentication.**

### GET /api/sessions
List all sessions. Supports query parameters for filtering.

**Response 200:** Array of session objects.

---

### POST /api/sessions
Start a new session on a device.

**Request Body:**
```json
{
  "device_id": "uuid-of-device",
  "customer_username": "player1",
  "customer_name": "Ahmed",
  "session_type": "open",
  "play_mode": "single",
  "hourly_rate_override": null,
  "grace_period_minutes": 5
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `device_id` | string (UUID) | ✅ | Target device ID |
| `customer_id` | string (UUID) | ❌ | Existing customer ID |
| `customer_username` | string (alphanumeric) | ❌ | New/existing customer username |
| `customer_name` | string (max 120) | ❌ | Customer display name |
| `customer_phone` | string (max 40) | ❌ | Customer phone |
| `session_type` | enum: `open`, `fixed` | ❌ | Session type (default: `open`) |
| `play_mode` | enum: `single`, `multiplayer` | ❌ | Play mode (default: `single`) |
| `started_at` | string (ISO 8601) | ❌ | Custom start time (backdate) |
| `scheduled_end` | string (ISO 8601) | ❌ | Scheduled end time (required for `fixed` sessions) |
| `hourly_rate_override` | number (≥ 0) | ❌ | Custom hourly rate override |
| `grace_period_minutes` | integer (≥ 0) | ❌ | Grace period in minutes (default: 0) |

**Response 201:** Created session object.

**Response 409:** Device already has an active session.

---

### POST /api/sessions/start
Alias for `POST /api/sessions` (backward compatibility). Same request body.

---

### PATCH /api/sessions/:id
Edit a session (e.g., adjust start time, rate override).

**Request Body (partial):**
```json
{
  "started_at": "2026-08-24T10:00:00.000Z",
  "hourly_rate_override": 8.00,
  "grace_period_minutes": 10
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `started_at` | string (ISO 8601) | ❌ | Adjusted start time (**backdate only — forward-dating is blocked**) |
| `scheduled_end` | string (ISO 8601) | ❌ | Adjusted scheduled end time |
| `hourly_rate_override` | number (≥ 0) | ❌ | Updated rate override |
| `grace_period_minutes` | integer (≥ 0) | ❌ | Updated grace period |

**Response 200:** Updated session object.

**Response 400:** Forward-dating the start time is rejected.

---

### POST /api/sessions/:id/end
End a session and generate an invoice.

**Request Body:**
```json
{
  "payment_method": "cash",
  "mark_paid": true,
  "discount_type": "none",
  "discount_value": 0,
  "service_fee": 0,
  "notes": "Regular checkout"
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `payment_method` | enum: `cash`, `card`, `transfer`, `wallet` | ❌ | Payment method |
| `mark_paid` | boolean | ❌ | Mark invoice as paid immediately |
| `ended_at` | string (ISO 8601) | ❌ | Custom end time |
| `discount_type` | enum: `none`, `percentage`, `fixed` | ❌ | Discount type (default: `none`) |
| `discount_value` | number (≥ 0) | ❌ | Discount amount/percentage |
| `service_fee` | number (≥ 0) | ❌ | Service fee amount |
| `service_rate` | number (≥ 0) | ❌ | Service fee rate |
| `rounding_delta` | number | ❌ | Rounding adjustment |
| `notes` | string (max 500) | ❌ | Invoice notes |

**Response 200:** Session + invoice + billing breakdown.

---

### POST /api/sessions/:id/pause
Pause an active session.

**Request Body:**
```json
{
  "reason": "Prayer break"
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `reason` | string (max 200) | ❌ | Reason for pause |

**Response 200:** Pause record created.

**Response 409:** Session already paused (DB constraint prevents double-pause).

---

### POST /api/sessions/:id/resume
Resume a paused session.

**Request Body:** None.

**Response 200:** Session resumed, paused minutes calculated.

---

### GET /api/sessions/:id/pauses
List all pause records for a session.

**Response 200:** Array of pause objects.

---

### POST /api/sessions/:id/extend
Extend a fixed session by additional minutes.

**Request Body:**
```json
{
  "additional_minutes": 30
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `additional_minutes` | integer (≥ 1) | ✅ | Minutes to add |

**Response 200:** Updated session with new scheduled end.

---

### POST /api/sessions/:id/transfer
Transfer an active session to a different device.

**Request Body:**
```json
{
  "target_device_id": "uuid-of-new-device",
  "play_mode": "single",
  "hourly_rate_override": null
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `target_device_id` | string (UUID) | ✅ | Target device ID |
| `play_mode` | enum: `single`, `multiplayer` | ❌ | Play mode on new device |
| `hourly_rate_override` | number (≥ 0) | ❌ | Rate override for new device |

**Response 200:** Transfer record + updated session.

---

### GET /api/sessions/:id/transfers
List all transfer records for a session.

**Response 200:** Array of transfer objects.

---

### GET /api/sessions/:id/audit-logs
Get the audit log of all edits made to a session.

**Response 200:** Array of audit log entries.

---

### POST /api/sessions/:id/orders
Add a café order to an active session.

**Request Body:**
```json
{
  "product_id": "uuid-of-product",
  "quantity": 2
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `product_id` | string (UUID) | ✅ | Product ID |
| `quantity` | integer (≥ 1) | ✅ | Order quantity |

**Response 201:** Created order + updated stock.

**Response 400:** Insufficient stock.

---

### GET /api/sessions/:id/orders
List all café orders for a session.

**Response 200:** Array of order objects.

---

### DELETE /api/sessions/:id/orders/:orderId
Void (cancel) a café order. Restores inventory automatically.

**Response 200:** Order voided + stock restored.

---

## 4. Invoices (Billing) Endpoints

Base path: `/api/invoices`
**All endpoints require authentication.**

### GET /api/invoices
List all invoices for the current tenant.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "session_id": "uuid",
    "amount": 15.00,
    "subtotal": 12.00,
    "discount_amount": 0,
    "discount_type": "none",
    "discount_value": 0,
    "service_fee": 3.00,
    "service_rate": 0,
    "rounding_delta": 0,
    "notes": null,
    "paid": true,
    "payment_method": "cash",
    "shift_id": "uuid",
    "issued_at": "2026-08-24T12:00:00.000Z",
    "paid_at": "2026-08-24T12:00:00.000Z"
  }
]
```

---

### PATCH /api/invoices/:id/pay
Mark an invoice as paid.

**Request Body:**
```json
{
  "payment_method": "cash"
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `payment_method` | enum: `cash`, `card`, `transfer`, `wallet` | ❌ | Payment method |

**Response 200:** Updated invoice (paid = true).

---

## 5. Reservations Endpoints

Base path: `/api/reservations`
**All endpoints require authentication.**

### GET /api/reservations
List all reservations.

**Response 200:** Array of reservation objects.

---

### POST /api/reservations
Create a new reservation.

**Request Body:**
```json
{
  "device_id": "uuid-of-device",
  "customer_name": "Ahmed",
  "reserved_from": "2026-08-25T14:00:00.000Z",
  "reserved_until": "2026-08-25T16:00:00.000Z",
  "notes": "VIP booking"
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `device_id` | string (UUID) | ✅ | Device to reserve |
| `customer_id` | string (UUID) | ❌ | Existing customer ID |
| `customer_name` | string (1-120 chars) | ❌ | Customer name |
| `reserved_from` | string (ISO 8601) | ✅ | Start time |
| `reserved_until` | string (ISO 8601) | ✅ | End time |
| `notes` | string (max 500) | ❌ | Reservation notes |

**Response 201:** Created reservation.

**Response 409:** Time slot conflicts with existing reservation.

---

### PATCH /api/reservations/:id
Update a reservation (status, times, notes).

**Request Body (partial):**
```json
{
  "status": "cancelled",
  "notes": "Customer cancelled"
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `status` | enum: `pending`, `active`, `cancelled`, `completed` | ❌ | Reservation status |
| `notes` | string (max 500) | ❌ | Notes |
| `reserved_from` | string (ISO 8601) | ❌ | Updated start time |
| `reserved_until` | string (ISO 8601) | ❌ | Updated end time |

**Response 200:** Updated reservation.

---

## 6. Customers Endpoints

Base path: `/api/customers`
**All endpoints require authentication.**

### GET /api/customers
List all customers.

**Response 200:** Array of customer objects.

---

### GET /api/customers/leaderboard
Get customer leaderboard (top customers by usage).

**Response 200:** Ranked array of customers.

---

### GET /api/customers/:id/profile
Get a detailed customer profile with session and invoice history.

**Response 200:** Customer profile with history.

---

## 7. Products (Café POS) Endpoints

Base path: `/api/products`
**All endpoints require authentication.**

### GET /api/products
List all products.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "name": "Pepsi Can",
    "price": 2.50,
    "cost_price": 1.00,
    "stock": 48,
    "tenant_id": "uuid",
    "created_at": "2026-01-01T00:00:00.000Z"
  }
]
```

---

### POST /api/products
Create a new product. **Requires admin role.**

**Request Body:**
```json
{
  "name": "Red Bull",
  "price": 5.00,
  "cost_price": 3.50,
  "stock": 24
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `name` | string (1-100 chars) | ✅ | Product name (unique per tenant) |
| `price` | number (≥ 0) | ✅ | Selling price |
| `cost_price` | number (≥ 0) | ❌ | Purchase/cost price |
| `stock` | integer (≥ 0) | ❌ | Initial stock count (default: 0) |

**Response 201:** Created product.

---

### PATCH /api/products/:id
Update a product. **Requires admin role.**

**Request Body (partial):**
```json
{
  "price": 5.50,
  "stock": 30
}
```

**Response 200:** Updated product.

---

### DELETE /api/products/:id
Delete a product. **Requires admin role.**

**Response 200:** Deletion confirmation.

---

### POST /api/products/:id/adjust-stock
Adjust product stock (restock, shrinkage, or manual adjustment).

**Request Body:**
```json
{
  "delta": 50,
  "reason": "Weekly restock delivery",
  "category": "restock"
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `delta` | integer | ✅ | Stock change (+positive for add, -negative for remove) |
| `reason` | string (max 200) | ❌ | Reason for adjustment |
| `category` | enum: `restock`, `manual_adjustment`, `shrinkage` | ❌ | Adjustment type (default: `restock`) |

**Response 200:** Updated product + stock log entry.

---

### GET /api/products/:id/stock-logs
Get stock movement history for a product.

**Response 200:** Array of stock log entries.

---

### GET /api/products/sales-report
Get product sales report.

**Response 200:** Sales data aggregated by product.

---

### POST /api/products/standalone-sale
Create a direct counter sale (not linked to a gaming session).

**Request Body:**
```json
{
  "product_id": "uuid-of-product",
  "quantity": 3,
  "payment_method": "cash"
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `product_id` | string (UUID) | ✅ | Product to sell |
| `quantity` | integer (≥ 1) | ✅ | Sale quantity |
| `payment_method` | enum: `cash`, `card`, `transfer`, `wallet` | ❌ | Payment method (default: `cash`) |

**Response 201:** Sale record + updated stock.

---

## 8. Pricing Endpoints

Base path: `/api/pricing`
**All endpoints require authentication.**

### GET /api/pricing
Get current pricing configuration for all devices.

**Response 200:** Array of device pricing objects.

---

### PATCH /api/pricing/bulk
Update pricing for multiple devices at once. **Requires admin role.**

**Response 200:** Updated pricing.

---

### PATCH /api/pricing/device/:id
Update pricing for a single device. **Requires admin role.**

**Response 200:** Updated device pricing.

---

## 9. Employees Endpoints

Base path: `/api/employees`
**All endpoints require authentication and admin role.**

### GET /api/employees
List all employees for the current tenant.

**Response 200:** Array of employee objects.

---

### POST /api/employees
Create a new employee account.

**Request Body:**
```json
{
  "email": "staff@example.com",
  "password": "password123",
  "fullName": "Staff Member",
  "role": "staff"
}
```

**Response 201:** Created employee.

---

### PATCH /api/employees/:id
Update an employee's details.

**Response 200:** Updated employee.

---

### DELETE /api/employees/:id
Delete an employee account.

**Response 200:** Deletion confirmation.

---

## 10. Rooms Endpoints

Base path: `/api/rooms`
**All endpoints require authentication.**

### GET /api/rooms
List all rooms for the current tenant.

**Response 200:** Array of room objects.

---

### POST /api/rooms
Create a new room.

**Request Body:**
```json
{
  "name": "VIP Room 1",
  "icon": "sports_esports",
  "device_id": null,
  "type": "console",
  "hourly_rate": 20.00,
  "hourly_rate_multi": 30.00
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `name` | string (1-100 chars) | ✅ | Room name |
| `icon` | string (max 60) | ❌ | Icon identifier (default: `sports_esports`) |
| `device_id` | string (UUID) | ❌ | Linked device ID |
| `type` | enum: `pc`, `console`, `vr`, `table` | ❌ | Room type (default: `console`) |
| `hourly_rate` | number (≥ 0) | ❌ | Single player rate (default: 20) |
| `hourly_rate_multi` | number (≥ 0) | ❌ | Multiplayer rate (default: 30) |

**Response 201:** Created room.

---

### PATCH /api/rooms/:id
Update a room.

**Request Body (partial):**
```json
{
  "name": "VIP Room 1 - Deluxe",
  "hourly_rate": 25.00
}
```

**Response 200:** Updated room.

---

### DELETE /api/rooms/:id
Delete a room.

**Response 200:** Deletion confirmation.

---

## 11. Shifts Endpoints

Base path: `/api/shifts`
**All endpoints require authentication.**

### GET /api/shifts
List all shifts.

**Response 200:** Array of shift objects.

---

### GET /api/shifts/active
Get the currently active shift for the logged-in user.

**Response 200:** Active shift object or null.

---

### POST /api/shifts/start
Start a new shift.

**Request Body:**
```json
{
  "opening_cash": 500.00,
  "notes": "Morning shift"
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `opening_cash` | number (≥ 0) | ❌ | Starting cash in drawer (default: 0) |
| `notes` | string (max 500) | ❌ | Shift notes |

**Response 201:** Created shift.

**Response 409:** User already has an active shift.

---

### POST /api/shifts/:id/close
Close a shift.

**Request Body:**
```json
{
  "closing_cash": 1250.00,
  "notes": "All good, no issues"
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `closing_cash` | number (≥ 0) | ❌ | Actual cash counted at shift end |
| `notes` | string (max 500) | ❌ | Closing notes |

**Response 200:** Closed shift with summary (total_revenue, total_expenses, cash variance).

---

### GET /api/shifts/:id/summary
Get a detailed summary for a specific shift.

**Response 200:** Shift summary with revenue breakdown.

---

### GET /api/shifts/expenses
List all expenses across all shifts.

**Response 200:** Array of expense objects.

---

### POST /api/shifts/expenses
Create a quick expense (attached to the active shift automatically).

**Request Body:**
```json
{
  "amount": 50.00,
  "category": "supplies",
  "description": "Bought cleaning supplies"
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `amount` | number (> 0) | ✅ | Expense amount |
| `category` | string (max 100) | ❌ | Expense category |
| `description` | string (1-300 chars) | ✅ | Expense description |

**Response 201:** Created expense.

---

### GET /api/shifts/:id/expenses
List expenses for a specific shift.

**Response 200:** Array of expense objects for the shift.

---

### POST /api/shifts/:id/expenses
Create an expense for a specific shift.

**Request Body:** Same as `POST /api/shifts/expenses`.

**Response 201:** Created expense.

---

### DELETE /api/shifts/:id/expenses/:expenseId
Delete an expense from a shift.

**Response 200:** Deletion confirmation.

---

## 12. Reports Endpoints

Base path: `/api/reports`
**All endpoints require authentication.**

### GET /api/reports/revenue
Get revenue report (today, this week, this month, 14-day trend).

**Response 200:** Revenue data with breakdowns.

---

### GET /api/reports/usage
Get device usage report (utilization rates, peak hours).

**Response 200:** Usage data with hourly distribution.

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE"
  }
}
```

### Common Error Codes

| Status Code | Error Code | Description |
|:---:|:---|:---|
| 400 | `VALIDATION_ERROR` | Invalid request body (failed Zod validation) |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication |
| 403 | `FORBIDDEN` | Insufficient permissions (wrong role) |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Resource conflict (e.g., double-booking, active session exists) |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded (2000 req/15min API, 30 req/15min auth) |
| 500 | `INTERNAL_ERROR` | Server error |

---

## Rate Limits

| Scope | Limit | Window |
|:---|:---|:---|
| General API | 2,000 requests | 15 minutes per IP |
| Auth endpoints (`/api/auth/login`) | 30 requests | 15 minutes per IP |

---

## Summary of All Endpoints

| # | Method | Path | Auth | Role | Description |
|:---:|:---|:---|:---:|:---:|:---|
| 1 | GET | `/health` | ❌ | — | Health check |
| 2 | POST | `/api/auth/login` | ❌ | — | Login |
| 3 | POST | `/api/auth/signup` | ❌ | — | Register |
| 4 | POST | `/api/auth/refresh` | ❌ | — | Refresh token |
| 5 | GET | `/api/auth/me` | ✅ | any | Get current user |
| 6 | POST | `/api/auth/logout` | ✅ | any | Logout |
| 7 | GET | `/api/auth/status` | ❌ | — | Activation status |
| 8 | GET | `/api/auth/employees-public` | ❌ | — | Public employee list |
| 9 | POST | `/api/auth/activate` | ❌ | — | Activate tenant |
| 10 | POST | `/api/auth/forgot-password` | ❌ | — | Forgot password |
| 11 | POST | `/api/auth/reset-password` | ❌ | — | Reset password |
| 12 | POST | `/api/auth/verify-email` | ❌ | — | Verify email |
| 13 | POST | `/api/auth/sync` | ✅ | any | Trigger sync |
| 14 | POST | `/api/auth/register-tenant` | 🔑 | super | Register tenant |
| 15 | GET | `/api/auth/tenants` | 🔑 | super | List tenants |
| 16 | PATCH | `/api/auth/tenants/:id/status` | 🔑 | super | Update tenant status |
| 17 | GET | `/api/devices` | ✅ | any | List devices |
| 18 | POST | `/api/devices` | ✅ | admin | Create device |
| 19 | PATCH | `/api/devices/:id` | ✅ | any | Update device |
| 20 | DELETE | `/api/devices/:id` | ✅ | any | Delete device |
| 21 | GET | `/api/sessions` | ✅ | any | List sessions |
| 22 | POST | `/api/sessions` | ✅ | any | Start session |
| 23 | POST | `/api/sessions/start` | ✅ | any | Start session (alias) |
| 24 | PATCH | `/api/sessions/:id` | ✅ | any | Edit session |
| 25 | POST | `/api/sessions/:id/end` | ✅ | any | End session |
| 26 | POST | `/api/sessions/:id/pause` | ✅ | any | Pause session |
| 27 | POST | `/api/sessions/:id/resume` | ✅ | any | Resume session |
| 28 | GET | `/api/sessions/:id/pauses` | ✅ | any | List pauses |
| 29 | POST | `/api/sessions/:id/extend` | ✅ | any | Extend session |
| 30 | POST | `/api/sessions/:id/transfer` | ✅ | any | Transfer session |
| 31 | GET | `/api/sessions/:id/transfers` | ✅ | any | List transfers |
| 32 | GET | `/api/sessions/:id/audit-logs` | ✅ | any | Get audit logs |
| 33 | POST | `/api/sessions/:id/orders` | ✅ | any | Add café order |
| 34 | GET | `/api/sessions/:id/orders` | ✅ | any | List session orders |
| 35 | DELETE | `/api/sessions/:id/orders/:orderId` | ✅ | any | Void an order |
| 36 | GET | `/api/invoices` | ✅ | any | List invoices |
| 37 | PATCH | `/api/invoices/:id/pay` | ✅ | any | Pay invoice |
| 38 | GET | `/api/reservations` | ✅ | any | List reservations |
| 39 | POST | `/api/reservations` | ✅ | any | Create reservation |
| 40 | PATCH | `/api/reservations/:id` | ✅ | any | Update reservation |
| 41 | GET | `/api/customers` | ✅ | any | List customers |
| 42 | GET | `/api/customers/leaderboard` | ✅ | any | Customer leaderboard |
| 43 | GET | `/api/customers/:id/profile` | ✅ | any | Customer profile |
| 44 | GET | `/api/products` | ✅ | any | List products |
| 45 | POST | `/api/products` | ✅ | admin | Create product |
| 46 | PATCH | `/api/products/:id` | ✅ | admin | Update product |
| 47 | DELETE | `/api/products/:id` | ✅ | admin | Delete product |
| 48 | POST | `/api/products/:id/adjust-stock` | ✅ | any | Adjust stock |
| 49 | GET | `/api/products/:id/stock-logs` | ✅ | any | Stock movement logs |
| 50 | GET | `/api/products/sales-report` | ✅ | any | Sales report |
| 51 | POST | `/api/products/standalone-sale` | ✅ | any | Direct counter sale |
| 52 | GET | `/api/pricing` | ✅ | any | Get pricing |
| 53 | PATCH | `/api/pricing/bulk` | ✅ | admin | Bulk update pricing |
| 54 | PATCH | `/api/pricing/device/:id` | ✅ | admin | Update device pricing |
| 55 | GET | `/api/employees` | ✅ | admin | List employees |
| 56 | POST | `/api/employees` | ✅ | admin | Create employee |
| 57 | PATCH | `/api/employees/:id` | ✅ | admin | Update employee |
| 58 | DELETE | `/api/employees/:id` | ✅ | admin | Delete employee |
| 59 | GET | `/api/rooms` | ✅ | any | List rooms |
| 60 | POST | `/api/rooms` | ✅ | any | Create room |
| 61 | PATCH | `/api/rooms/:id` | ✅ | any | Update room |
| 62 | DELETE | `/api/rooms/:id` | ✅ | any | Delete room |
| 63 | GET | `/api/shifts` | ✅ | any | List shifts |
| 64 | GET | `/api/shifts/active` | ✅ | any | Get active shift |
| 65 | POST | `/api/shifts/start` | ✅ | any | Start shift |
| 66 | POST | `/api/shifts/:id/close` | ✅ | any | Close shift |
| 67 | GET | `/api/shifts/:id/summary` | ✅ | any | Shift summary |
| 68 | GET | `/api/shifts/expenses` | ✅ | any | List all expenses |
| 69 | POST | `/api/shifts/expenses` | ✅ | any | Create quick expense |
| 70 | GET | `/api/shifts/:id/expenses` | ✅ | any | List shift expenses |
| 71 | POST | `/api/shifts/:id/expenses` | ✅ | any | Create shift expense |
| 72 | DELETE | `/api/shifts/:id/expenses/:expenseId` | ✅ | any | Delete expense |
| 73 | GET | `/api/reports/revenue` | ✅ | any | Revenue report |
| 74 | GET | `/api/reports/usage` | ✅ | any | Usage report |
