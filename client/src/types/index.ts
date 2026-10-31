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

export type DeviceType = 'pc' | 'console' | 'vr' | 'table';
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
  is_paused: boolean;
  total_paused_minutes: number;
  device?: Pick<Device, 'id' | 'name' | 'type' | 'hourly_rate' | 'hourly_rate_multi'>;
  customer?: Pick<Customer, 'id' | 'name' | 'phone' | 'username'>;
}

export interface SessionPause {
  id: string;
  session_id: string;
  paused_at: string;
  resumed_at: string | null;
  paused_by: string | null;
  resumed_by: string | null;
  reason: string | null;
}

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'wallet';

export interface Invoice {
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
  creator?: Pick<User, 'id' | 'full_name' | 'email'>;
  session?: {
    id: string;
    started_at: string;
    ended_at: string | null;
    duration_minutes: number | null;
    device_id: string;
    is_paused?: boolean;
    total_paused_minutes?: number;
    device?: Pick<Device, 'id' | 'name' | 'type'>;
    customer?: Pick<Customer, 'id' | 'name'>;
  };
}

export interface SessionTransfer {
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
  created_at: string;
  from_device?: Pick<Device, 'id' | 'name' | 'type'>;
  to_device?: Pick<Device, 'id' | 'name' | 'type'>;
  transferrer?: Pick<User, 'id' | 'full_name'>;
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
  totals: { today: number; today_device?: number; today_cafe?: number; week: number; month: number };
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
  play_mode?: 'single' | 'multiplayer';
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
  hourly_rate_multi?: number;
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
  cost_price?: number | null;
  stock: number;
  created_at: string;
}

export type StockChangeCategory = 'restock' | 'sale' | 'standalone_sale' | 'void_order' | 'manual_adjustment' | 'shrinkage';

export interface StockLog {
  id: string;
  product_id: string;
  tenant_id?: string;
  actor_id?: string | null;
  change_type: StockChangeCategory;
  delta: number;
  balance_after: number;
  reason?: string | null;
  created_at: string;
  actor?: {
    full_name: string | null;
  };
}

export interface StandaloneOrder {
  id: string;
  tenant_id?: string | null;
  product_id: string;
  quantity: number;
  unit_price: number;
  cost_price?: number | null;
  total_price: number;
  payment_method: PaymentMethod;
  shift_id?: string | null;
  created_by?: string | null;
  created_at: string;
  product?: Product;
}

export interface ProductSalesSummary {
  total_revenue: number;
  total_cost?: number | null;
  total_profit?: number | null;
  total_items_sold: number;
  top_selling_product: string | null;
  out_of_stock_count: number;
  low_stock_count: number;
}

export interface ProductSalesItem {
  id: string;
  name: string;
  price: number;
  cost_price?: number | null;
  stock: number;
  sold_quantity: number;
  total_revenue: number;
  total_cost?: number | null;
  profit?: number | null;
  margin_pct?: number | null;
}

export interface ProductSalesReport {
  summary: ProductSalesSummary;
  items: ProductSalesItem[];
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

export interface GamingRoom {
  id: string;
  name: string;
  icon: string;
  device_id: string | null;
  created_at?: string;
  updated_at?: string;
  device?: Pick<Device, 'id' | 'name' | 'type' | 'status' | 'hourly_rate' | 'hourly_rate_multi'> | null;
}

export interface CreateRoomPayload {
  name: string;
  icon?: string;
  device_id?: string | null;
  type?: DeviceType;
  hourly_rate?: number;
  hourly_rate_multi?: number;
}

export interface CafeTable {
  id: string;
  table_number: string;
  name: string;
  capacity: number;
  device_id: string | null;
  created_at?: string;
  updated_at?: string;
  device?: Pick<Device, 'id' | 'name' | 'type' | 'status' | 'hourly_rate' | 'hourly_rate_multi'> | null;
  active_session?: (Session & { orders?: SessionOrder[]; current_orders_total?: number }) | null;
}

export interface CreateCafeTablePayload {
  table_number: string;
  name: string;
  capacity?: number;
  device_id?: string | null;
}

export interface UpdateCafeTablePayload {
  table_number?: string;
  name?: string;
  capacity?: number;
}

// ----- Shifts & Expenses -----
export type ShiftStatus = 'active' | 'closed';

export interface Shift {
  id: string;
  user_id: string;
  tenant_id?: string | null;
  started_at: string;
  ended_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  total_revenue: number;
  total_expenses: number;
  notes: string | null;
  status: ShiftStatus;
  created_at: string;
  user?: Pick<User, 'id' | 'email' | 'full_name'>;
}

export interface ShiftExpense {
  id: string;
  shift_id: string;
  tenant_id?: string | null;
  amount: number;
  category: string;
  description: string;
  created_by: string | null;
  created_at: string;
  creator?: Pick<User, 'id' | 'full_name' | 'email'>;
  shift?: Pick<Shift, 'id' | 'started_at' | 'ended_at' | 'status' | 'user_id'>;
}


export interface ShiftSummary {
  shift: Shift;
  total_revenue: number;
  invoices_revenue?: number;
  standalone_revenue?: number;
  total_expenses: number;
  net_cash: number;
  opening_cash: number;
  expected_closing: number;
  closing_cash: number | null;
  cash_difference: number | null;
  invoice_count: number;
  paid_invoice_count: number;
  standalone_orders_count?: number;
  session_orders_count?: number;
  expense_count: number;
  invoices: Invoice[];
  standalone_orders?: StandaloneOrder[];
  session_orders?: any[];
  session_transfers?: SessionTransfer[];
  expenses: ShiftExpense[];
}

export interface StartShiftPayload {
  opening_cash?: number;
  notes?: string;
}

export interface CloseShiftPayload {
  closing_cash?: number;
  notes?: string;
}

export interface CreateExpensePayload {
  amount: number;
  category?: string;
  description: string;
}

export interface TransferSessionPayload {
  target_device_id: string;
  play_mode?: 'single' | 'multiplayer';
  hourly_rate_override?: number | null;
  session_type?: 'open' | 'fixed';
  scheduled_end?: string | null;
  duration_minutes?: number | null;
}

export interface EndSessionPayload {
  payment_method?: PaymentMethod;
  mark_paid?: boolean;
  ended_at?: string;
  discount_type?: 'none' | 'percentage' | 'fixed';
  discount_value?: number;
  service_fee?: number;
  service_rate?: number;
  rounding_delta?: number;
  notes?: string | null;
}





// ----- Monthly Closings & Financial Periods -----
export interface MonthlyClosingItem {
  year: number;
  month: number;
  period_key: string;
  is_current: boolean;
  status: 'open' | 'closed';
  total_revenue: number | null;
  total_expenses: number | null;
  net_profit: number | null;
  closed_at: string | null;
  closer_name: string | null;
}

export interface MonthlyClosingRecord {
  id?: string;
  status: 'open' | 'closed';
  closed_at: string | null;
  closed_by: string | null;
  closing_notes: string | null;
  closing_balance: number;
  closer?: Pick<User, 'id' | 'full_name' | 'email'>;
}

export interface ExpenseByCategory {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

export interface DailyLedgerRow {
  day: number;
  date: string;
  device_revenue: number;
  cafe_revenue: number;
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
  shifts_count: number;
}

export interface MonthOverMonthComparison {
  prev_year: number;
  prev_month: number;
  prev_revenue: number;
  prev_expenses: number;
  prev_profit: number;
  revenue_growth_pct: number;
  profit_growth_pct: number;
}

export interface MonthlyFinancialDetails {
  period: {
    year: number;
    month: number;
    days_in_month: number;
    start_date: string;
    end_date: string;
  };
  closing: MonthlyClosingRecord;
  totals: {
    total_revenue: number;
    device_revenue: number;
    cafe_revenue: number;
    total_expenses: number;
    net_profit: number;
    profit_margin_pct: number;
    shifts_count: number;
    cash_discrepancy: number;
    invoices_count: number;
    expenses_count: number;
  };
  expenses_by_category: ExpenseByCategory[];
  expenses_list: ShiftExpense[];
  shifts_list?: Shift[];
  comparison_previous_month: MonthOverMonthComparison;
  daily_ledger: DailyLedgerRow[];
}

export interface CloseMonthPayload {
  closing_notes?: string;
  closing_balance?: number;
}
