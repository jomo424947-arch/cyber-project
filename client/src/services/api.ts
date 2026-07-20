import type {
  User,
  Device,
  Session,
  Invoice,
  Reservation,
  RevenueReport,
  UsageReport,
  StartSessionPayload,
  CreateReservationPayload,
  CreateDevicePayload,
  PaymentMethod,
  SessionAuditLog,
  LeaderboardEntry,
  CustomerProfileData,
  Customer,
  Product,
  SessionOrder,
  PricingTier,
} from '../types';

/**
 * DataService — the single contract every page calls.
 * The real implementation in `real/realService.ts` talks to the Express API.
 */
export interface DataService {
  // auth
  login(email: string, password: string, rememberMe?: boolean): Promise<{ user: User }>;
  signup(email: string, password: string, fullName?: string): Promise<{ user: User | null; requiresEmailVerification?: boolean; message: string }>;
  logout(): Promise<void>;
  getMe(): Promise<User>;
  refresh(): Promise<{ user: User }>;
  forgotPassword(email: string): Promise<{ message: string }>;
  resetPassword(token: string, newPassword: string): Promise<{ message: string }>;
  verifyEmail(token: string): Promise<{ user: User; message: string }>;
  getGoogleOAuthUrl(): Promise<{ url: string }>;


  // devices
  listDevices(): Promise<Device[]>;
  createDevice(payload: CreateDevicePayload): Promise<Device>;
  updateDevice(id: string, patch: Partial<Device>): Promise<Device>;
  deleteDevice(id: string): Promise<void>;

  // sessions
  listSessions(filter?: 'active' | 'ended'): Promise<Session[]>;
  startSession(payload: StartSessionPayload): Promise<Session>;
  endSession(id: string, payload?: { payment_method?: PaymentMethod; mark_paid?: boolean; ended_at?: string }): Promise<{ session: Session; invoice: Invoice }>;
  updateSession(id: string, patch: { started_at?: string; scheduled_end?: string | null; hourly_rate_override?: number | null; grace_period_minutes?: number }): Promise<Session>;
  extendSession(id: string, additional_minutes: number): Promise<Session>;
  getSessionAuditLogs(id: string): Promise<SessionAuditLog[]>;

  // billing
  listInvoices(filter?: 'paid' | 'unpaid'): Promise<Invoice[]>;
  payInvoice(id: string): Promise<Invoice>;

  // reservations
  listReservations(): Promise<Reservation[]>;
  createReservation(payload: CreateReservationPayload): Promise<Reservation>;
  updateReservation(id: string, patch: Partial<Reservation>): Promise<Reservation>;

  // reports
  revenueReport(): Promise<RevenueReport>;
  usageReport(): Promise<UsageReport>;

  // customers (for the start-session / reservation modals)
  listCustomers(): Promise<Customer[]>;
  getLeaderboard(month?: string): Promise<LeaderboardEntry[]>;
  getCustomerProfile(id: string): Promise<CustomerProfileData>;

  // cafe / products
  listProducts(): Promise<Product[]>;
  createProduct(payload: { name: string; price: number }): Promise<Product>;
  updateProduct(id: string, patch: { name?: string; price?: number }): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  addSessionOrder(sessionId: string, productId: string, quantity: number): Promise<SessionOrder>;
  listSessionOrders(sessionId: string): Promise<SessionOrder[]>;

  // pricing
  getPricing(): Promise<PricingTier[]>;
  updateBulkPricing(type: string, rates: { hourly_rate?: number; hourly_rate_multi?: number }): Promise<void>;
  updateDevicePricing(id: string, rates: { hourly_rate?: number; hourly_rate_multi?: number }): Promise<void>;
}
