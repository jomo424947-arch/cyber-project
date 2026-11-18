# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Gaming lounge, PlayStation café, and internet café owners and shift staff in Egypt and Arabic-speaking markets. Owners monitor revenue, expenses, and shift accountability remotely on mobile/web; cashiers operate sessions, café orders, and shift handovers locally at the counter.

## Product Purpose

CCMS (Cyber Café Management System) is a hybrid desktop-and-cloud management system for PlayStation lounges, gaming rooms, PC cafés, and café tables. It tracks timed sessions, café inventory and orders, shift cash drawers, expenses, reservations, and monthly closings — working offline on the local Windows desktop terminal and syncing automatically to the web dashboard.

## Positioning

Local-first reliability paired with live cloud visibility: cashiers run sessions without internet interruption on a local SQLite-backed Windows desktop app while owners inspect live active rooms, per-session time-vs-café breakdowns, and shift ledgers from any mobile browser.

## Operating Context

- Counter staff run the Windows Desktop Electron app (`CCMS.exe`) connected to a local Express + SQLite server (`localhost:5000`), which syncs to Supabase cloud.
- Owners and remote managers access the web application (`/` landing, `/login`, `/dashboard`, `/sessions`, `/shifts`, `/reports`) from mobile phones and browsers.
- Bilingual Arabic (RTL, primary market) and English (LTR).

## Capabilities and Constraints

- Device & room session management: Open and fixed-time sessions, single/multiplayer pricing, pause/resume, device transfers with per-segment billing, and per-session itemized receipts (time cost separate from café orders).
- Café POS & inventory: Add drinks/snacks directly to active sessions or standalone café tables, with automatic stock decrement and low-stock tracking.
- Shifts, expenses, and audit trails: Shift opening/closing revenue tracking, expense logging, monthly closings, and edit/void audit logs.
- Reservations & customer accounts: Device reservation scheduling and customer profiles/leaderboards.
- Desktop installer distributed via GitHub Releases (`/download`).
- Official support & sales WhatsApp numbers in app: `01032778056` and `01098213323`.
- Demo video URL for `#demo-video`: `https://www.youtube.com/watch?v=Vp4OlAywfZM`.

## Brand Commitments

- Name: **CCMS** (Cyber Café Management System).
- Visual identity already established in the application: dark obsidian surfaces (`#0A0A0A` / `#111111` / `#181818`), electric cyan primary (`#00C2FF`), emerald green status (`#22C55E`), violet (`#8B5CF6`), and amber (`#F59E0B`), with `Alexandria` / `Cairo` for Arabic and `Space Grotesk` / `Inter` / `JetBrains Mono` for English and tabular data.
- Public landing page follows the section rhythm and structure of `akm5.com` (navbar, split hero with live app mockup, value highlights strip, 6-card features grid, `#demo-video` laptop frame section, 3-day free trial / download promo banner, direct contact channels, footer) expressed fully in CCMS's own identity.

## Evidence on Hand

- Live application codebase: `client/` (React + Vite + Electron + Capacitor) and `server/` (Express + SQLite/Supabase).
- Public assets: `client/public/logo.png`, `client/public/favicon.svg`, `client/public/assets/*_card_bg.jpg`.
- Real support contacts: `client/src/components/SupportModal.tsx` (`01032778056`, `01098213323`).
- Real desktop release feed: `client/src/services/githubReleaseService.ts` and `client/src/pages/DownloadPage.tsx`.
- Do not fabricate customer counts, testimonials, or unconfirmed pricing tiers.

## Product Principles

- Keep counter operations instant and resilient offline while keeping cloud state consistent.
- Separate time revenue, café sales, discounts, and expenses clearly so owners can audit every shift.
- Match mobile ergonomics for owners checking live rooms and invoices on phones.
