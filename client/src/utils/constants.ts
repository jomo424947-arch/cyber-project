import type { DeviceStatus, DeviceType, PaymentMethod, ReservationStatus } from '../types';

// Status metadata used by badges and filters throughout the UI.

export const DEVICE_STATUS_META: Record<
  DeviceStatus,
  { label: string; color: string; bg: string; pulse?: boolean }
> = {
  available: { label: 'Available', color: 'var(--accent-green)', bg: 'rgba(34, 197, 94, 0.10)' },
  in_use: { label: 'In Use', color: 'var(--accent-red)', bg: 'rgba(239, 68, 68, 0.10)', pulse: true },
  reserved: { label: 'Reserved', color: 'var(--accent-yellow)', bg: 'rgba(245, 158, 11, 0.10)' },
  offline: { label: 'Offline', color: 'var(--text-muted)', bg: 'rgba(113, 113, 122, 0.10)' },
};

export const RESERVATION_STATUS_META: Record<
  ReservationStatus,
  { label: string; color: string; bg: string }
> = {
  pending: { label: 'Pending', color: 'var(--accent-yellow)', bg: 'rgba(245, 158, 11, 0.10)' },
  active: { label: 'Active', color: 'var(--accent-cyan)', bg: 'rgba(0, 194, 255, 0.10)' },
  completed: { label: 'Completed', color: 'var(--accent-green)', bg: 'rgba(34, 197, 94, 0.10)' },
  cancelled: { label: 'Cancelled', color: 'var(--text-secondary)', bg: 'rgba(161, 161, 170, 0.10)' },
};

export const DEVICE_TYPE_META: Record<DeviceType, { label: string; icon: string }> = {
  pc: { label: 'PC', icon: '🖥️' },
  console: { label: 'Console', icon: '🎮' },
  vr: { label: 'VR', icon: '🥽' },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  transfer: 'Transfer',
  wallet: 'Wallet',
};
