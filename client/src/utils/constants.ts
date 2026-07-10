import type { DeviceStatus, DeviceType, PaymentMethod, ReservationStatus } from '../types';

// Status metadata used by badges and filters throughout the UI.

export const DEVICE_STATUS_META: Record<
  DeviceStatus,
  { label: string; color: string; bg: string; pulse?: boolean }
> = {
  available: { label: 'Available', color: 'var(--accent-green)', bg: 'rgba(0,255,136,0.10)' },
  in_use: { label: 'In Use', color: 'var(--accent-red)', bg: 'rgba(255,68,102,0.10)', pulse: true },
  reserved: { label: 'Reserved', color: 'var(--accent-yellow)', bg: 'rgba(255,170,0,0.10)' },
  offline: { label: 'Offline', color: 'var(--text-muted)', bg: 'rgba(55,65,81,0.30)' },
};

export const RESERVATION_STATUS_META: Record<
  ReservationStatus,
  { label: string; color: string; bg: string }
> = {
  pending: { label: 'Pending', color: 'var(--accent-yellow)', bg: 'rgba(255,170,0,0.10)' },
  active: { label: 'Active', color: 'var(--accent-cyan)', bg: 'rgba(0,212,255,0.10)' },
  completed: { label: 'Completed', color: 'var(--accent-green)', bg: 'rgba(0,255,136,0.10)' },
  cancelled: { label: 'Cancelled', color: 'var(--text-secondary)', bg: 'rgba(100,116,139,0.10)' },
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
