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

export type DeviceType = 'pc' | 'console' | 'vr';
export type DeviceStatus = 'available' | 'in_use' | 'reserved' | 'offline';

export interface DbDevice {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  specs: Record<string, unknown> | null;
  hourly_rate: number;
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
  scheduled_end: string | null;
  hourly_rate_override: number | null;
  grace_period_minutes: number;
  is_overtime: boolean;
  overtime_minutes: number | null;
  edited_start_at: boolean;
  // joined relations (optional)
  device?: Pick<DbDevice, 'id' | 'name' | 'type' | 'hourly_rate'>;
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
  paid: boolean;
  payment_method: PaymentMethod;
  issued_at: string;
  paid_at: string | null;
  // joined relations
  session?: Pick<DbSession, 'id' | 'started_at' | 'ended_at' | 'duration_minutes' | 'device_id'> & {
    device?: Pick<DbDevice, 'id' | 'name' | 'type'>;
    customer?: Pick<DbCustomer, 'id' | 'name'>;
  };
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

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
      };
    }
  }
}
