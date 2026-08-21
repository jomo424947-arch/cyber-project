// Shared DB / DTO types used across controllers & routes.

export type Role = 'admin' | 'staff';

export interface DbUser {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
  updated_at: string;
}

export type DeviceType = 'pc' | 'console' | 'vr' | 'table';
export type DeviceStatus = 'available' | 'in_use' | 'reserved' | 'offline';

export interface DbDevice {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  specs: Record<string, unknown> | null;
  hourly_rate: number;
  hourly_rate_multi: number;
  created_at: string;
  updated_at: string;
}

export interface DbCustomer {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export type SessionStatus = 'active' | 'ended';

export interface DbSession {
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
  is_paused: boolean;
  total_paused_minutes: number;
  // joined relations (optional)
  device?: Pick<DbDevice, 'id' | 'name' | 'type' | 'hourly_rate' | 'hourly_rate_multi'>;
  customer?: Pick<DbCustomer, 'id' | 'name' | 'phone' | 'username'>;
}

export interface DbSessionAuditLog {
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

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'wallet';

export interface DbInvoice {
  id: string;
  session_id: string;
  amount: number;
  subtotal?: number;
  discount_amount?: number;
  discount_type?: 'none' | 'percentage' | 'fixed';
  discount_value?: number;
  service_fee?: number;
  service_rate?: number;
  rounding_delta?: number;
  notes?: string | null;
  paid: boolean;
  payment_method: PaymentMethod;
  shift_id?: string | null;
  created_by?: string | null;
  issued_at: string;
  paid_at: string | null;
  // joined relations
  creator?: Pick<DbUser, 'id' | 'full_name' | 'email'>;
  session?: Pick<DbSession, 'id' | 'started_at' | 'ended_at' | 'duration_minutes' | 'device_id'> & {
    device?: Pick<DbDevice, 'id' | 'name' | 'type'>;
    customer?: Pick<DbCustomer, 'id' | 'name'>;
  };
}

export interface DbSessionTransfer {
  id: string;
  session_id: string;
  from_device_id: string;
  to_device_id: string;
  started_at: string;
  transferred_at: string;
  duration_minutes: number;
  hourly_rate: number;
  play_mode: 'single' | 'multiplayer';
  cost: number;
  transferred_by: string | null;
  tenant_id: string | null;
  created_at: string;
  from_device?: Pick<DbDevice, 'id' | 'name' | 'type'>;
  to_device?: Pick<DbDevice, 'id' | 'name' | 'type'>;
  transferrer?: Pick<DbUser, 'id' | 'full_name'>;
}

export type ReservationStatus = 'pending' | 'active' | 'cancelled' | 'completed';

export interface DbReservation {
  id: string;
  device_id: string;
  customer_id: string | null;
  reserved_from: string;
  reserved_until: string;
  status: ReservationStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  device?: Pick<DbDevice, 'id' | 'name' | 'type'>;
  customer?: Pick<DbCustomer, 'id' | 'name' | 'phone'>;
}

export interface DbSessionPause {
  id: string;
  session_id: string;
  tenant_id: string | null;
  paused_at: string;
  resumed_at: string | null;
  paused_by: string | null;
  resumed_by: string | null;
  reason: string | null;
}

export interface DbShift {
  id: string;
  user_id: string;
  tenant_id: string | null;
  started_at: string;
  ended_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  total_revenue: number;
  total_expenses: number;
  notes: string | null;
  status: 'active' | 'closed';
  created_at: string;
  user?: Pick<DbUser, 'id' | 'email' | 'full_name'>;
}

export interface DbShiftExpense {
  id: string;
  shift_id: string;
  tenant_id: string | null;
  amount: number;
  category: string;
  description: string;
  created_by: string | null;
  created_at: string;
  creator?: Pick<DbUser, 'id' | 'full_name' | 'email'>;
}

export interface DbRoom {
  id: string;
  name: string;
  icon: string;
  device_id: string | null;
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
  device?: Pick<DbDevice, 'id' | 'name' | 'type' | 'status' | 'hourly_rate' | 'hourly_rate_multi'> | null;
}

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
        tenant_id: string;
      };
    }
  }
}
