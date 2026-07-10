# CCMS — Cyber Café & Gaming Lounge Management System

A full-stack web application for managing cyber café and gaming lounge operations — built with React, TypeScript, Express, and Supabase.

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | React 18 + TypeScript + Vite        |
| Backend   | Node.js + Express + TypeScript      |
| Database  | Supabase (PostgreSQL)               |
| Auth      | Supabase Auth (JWT)                 |
| Styling   | Tailwind CSS + custom CSS variables |
| Routing   | React Router v6                      |
| State     | React Context + custom hooks        |
| HTTP      | Axios                               |

## Features

- **Device Management** — Real-time status grid (available / in use / reserved / offline)
- **Session Tracking** — Start/end sessions with live elapsed timers
- **Automated Billing** — Cost = duration × hourly rate (min 30 min billing), auto-generated invoices
- **Reservation System** — Book devices with conflict detection (409 on overlap)
- **Reports & Analytics** — Revenue summaries, device utilization, peak-hours heat map
- **Role-Based Access** — Admin (full) / Staff (sessions, billing, reservations)
- **Demo Mode** — Preview the full UI with mock data, no backend required

## Quick Start (Demo Mode)

```bash
# 1. Install dependencies (from project root)
npm install

# 2. Start the frontend only (demo mode is on by default)
cd client && npm run dev
```

Open `http://localhost:5173` — the app loads with seeded mock data.
- Login with `admin@ccms.demo` (any password) → admin role
- Or any other email → staff role

## Full Setup (with Supabase)

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) → New Project. Note your **Project URL** and **anon key**.

### 2. Initialize the database

Open the Supabase **SQL Editor** and paste the contents of `schema.sql`, then click **Run**.
This creates all tables, RLS policies, seed devices, and helper functions.

### 3. Create an admin user

In the Supabase **Authentication** → Users section, click **Add User** → **Create New User**.
Set the email and password, then in the **SQL Editor**:

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'your-email@example.com';
```

### 4. Configure environment variables

```bash
# server/.env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
PORT=5000
JWT_SECRET=a-random-string
CLIENT_ORIGIN=http://localhost:5173

# client/.env
VITE_API_URL=http://localhost:5000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_DEMO_MODE=false
```

### 5. Run both servers

```bash
# From project root:
npm run dev
```

Frontend → `http://localhost:5173`
Backend  → `http://localhost:5000`

## Project Structure

```
ccms/
├── client/                     # React + TypeScript frontend
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── ui/             # Button, Input, Select, Modal, Table, Card, Badge…
│   │   │   ├── charts/         # BarChart, UsageBars, HeatStrip (hand-built SVG/CSS)
│   │   │   ├── DeviceCard.tsx
│   │   │   ├── Layout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── StatCard.tsx
│   │   │   └── StatusBadge.tsx
│   │   ├── pages/              # 8 route-level pages
│   │   ├── context/            # AuthContext, ToastContext
│   │   ├── hooks/              # useAsync, useNow
│   │   ├── services/           # DataService interface + real + mock + selector
│   │   ├── types/              # TypeScript interfaces
│   │   └── utils/              # format, constants
│   └── index.html
├── server/                     # Express backend
│   ├── src/
│   │   ├── controllers/        # Business logic
│   │   ├── middleware/         # JWT auth, error handler, validation
│   │   ├── routes/             # API route definitions
│   │   ├── lib/                # Supabase client, types, errors
│   │   └── index.ts            # Server entry point
├── schema.sql                  # Full database schema + RLS
├── .env.example
└── README.md
```

## Business Logic

| Rule | Detail |
|------|--------|
| Session cost | `(ceil(minutes) / 60) × hourly_rate`, minimum 30 minutes |
| Reservation conflict | Overlapping window on same device → 409 Conflict |
| Device status flow | start session → in_use → end → available; reservation within 15 min → reserved |
| Roles | Admin: full access; Staff: sessions, billing, reservations only |

## Author

**Jo** — Computer Science student @ Sphinx University, Egypt

> Built with ❤️ and lots of ☕
