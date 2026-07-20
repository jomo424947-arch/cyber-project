// ============================================================================
// Shared application types — mirror the database schema + API DTOs.
// ============================================================================

export type Role = 'admin' | 'staff';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
}

export type DeviceType = 'pc' | 'console' | 'vr';
export type DeviceStatus = 'available' | 'in_use' | 'reserved' | 'offline';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  specs: Record<string, string> | null;
  hourly_rate: number;
  hourly_rate_multi: number;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export type SessionStatus = 'active' | 'ended';

export interface Session {
  id: string;
  device_id: string;
  customer_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  total_cost: number | null;
  status: SessionStatus;
  created_by: string | null;
  created_at: string;
  session_type: 'open' | 'fixed';
  play_mode: 'single' | 'multiplayer';
  scheduled_end: string | null;
  hourly_rate_override: number | null;
  grace_period_minutes: number;
  is_overtime: boolean;
  overtime_minutes: number | null;
  edited_start_at: boolean;
  device?: Pick<Device, 'id' | 'name' | 'type' | 'hourly_rate' | 'hourly_rate_multi'>;
  customer?: Pick<Customer, 'id' | 'name' | 'phone' | 'username'>;
}

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'wallet';

export interface Invoice {
  id: string;
  session_id: string;
  amount: number;
  paid: boolean;
  payment_method: PaymentMethod;
  issued_at: string;
  paid_at: string | null;
  session?: {
    id: string;
    started_at: string;
    ended_at: string | null;
    duration_minutes: number | null;
    device_id: string;
    device?: Pick<Device, 'id' | 'name' | 'type'>;
    customer?: Pick<Customer, 'id' | 'name'>;
  };
}

export type ReservationStatus = 'pending' | 'active' | 'cancelled' | 'completed';

export interface Reservation {
  id: string;
  device_id: string;
  customer_id: string | null;
  reserved_from: string;
  reserved_until: string;
  status: ReservationStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  device?: Pick<Device, 'id' | 'name' | 'type'>;
  customer?: Pick<Customer, 'id' | 'name' | 'phone'>;
}

// ----- Reports -----
export interface RevenueReport {
  totals: { today: number; week: number; month: number };
  daily: { date: string; total: number }[];
}

export interface UsageReport {
  devices: {
    device_id: string;
    name: string;
    type: DeviceType;
    minutes_used: number;
    utilization: number;
  }[];
  peak_hours: { hour: number; count: number }[];
}

// ----- API call payloads -----
export interface StartSessionPayload {
  device_id: string;
  customer_id?: string | null;
  customer_username?: string | null;
  customer_name?: string;
  customer_phone?: string;
  session_type?: 'open' | 'fixed';
  started_at?: string;
  scheduled_end?: string;
  hourly_rate_override?: number | null;
  grace_period_minutes?: number;
}

export interface CreateReservationPayload {
  device_id: string;
  customer_id?: string | null;
  customer_name?: string;
  reserved_from: string;
  reserved_until: string;
  notes?: string;
}

export interface CreateDevicePayload {
  name: string;
  type: DeviceType;
  hourly_rate: number;
  specs?: Record<string, string>;
}

// ----- Audit logs & Leaderboard -----
export interface SessionAuditLog {
  id: string;
  session_id: string;
  edited_by: string | null;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  edited_at: string;
  editor?: {
    full_name: string | null;
  };
}

export interface LeaderboardEntry {
  customer_id: string;
  username: string;
  name: string;
  session_count: number;
  total_hours: number;
  total_spend: number;
}

export interface CustomerProfileData {
  customer: Customer;
  stats: {
    total_spend: number;
    total_sessions: number;
    total_hours: number;
    favorite_device_type: string;
  };
  sessions: Session[];
}

export interface Product {
  id: string;
  name: string;
  price: number;
  created_at: string;
}

export interface SessionOrder {
  id: string;
  session_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  product?: Product;
}

export interface PricingTier {
  type: DeviceType;
  hourly_rate: number;
  hourly_rate_multi: number;
  device_count: number;
  devices: Array<{ id: string; name: string; hourly_rate: number; hourly_rate_multi: number }>;
  all_same: boolean;
  all_same_multi: boolean;
}

