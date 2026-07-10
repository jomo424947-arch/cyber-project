// Formatting helpers shared across the app.

const CURRENCY = 'USD';

export function formatCurrency(amount: number | null | undefined): string {
  const value = amount ?? 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}

/** "2h 14m" style duration from a minute count. */
export function formatDuration(minutes: number | null | undefined): string {
  const m = minutes ?? 0;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

/** Elapsed from an ISO timestamp → "1h 23m 04s". */
export function formatElapsed(startedAt: string, nowMs: number = Date.now()): string {
  const ms = Math.max(0, nowMs - new Date(startedAt).getTime());
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Short date/time: "Jun 29, 14:30". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Short date only: "Jun 29, 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Convert a Date to a value usable in <input type="datetime-local">. */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
