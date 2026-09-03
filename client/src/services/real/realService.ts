import { http, clearStoredTokens } from '../http';
import type { DataService } from '../api';
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
  SessionAuditLog,
  LeaderboardEntry,
  CustomerProfileData,
  Customer,
  Product,
  ProductSalesReport,
  SessionOrder,
  PricingTier,
  SessionPause,
  StockLog,
  StandaloneOrder,
  GamingRoom,
  Shift,
  ShiftExpense,
  ShiftSummary,
} from '../../types';

// The backend wraps every list response in { data: [...] }.
interface ListWrap<T> {
  data: T[];
}
interface OneWrap<T> {
  data: T;
}

export const realService: DataService = {
  // ─── Auth ───────────────────────────────────────────────────────────────

  async login(email, password, rememberMe = false) {
    const { data } = await http.post<{ user: User }>('/api/auth/login', {
      email,
      password,
      rememberMe,
    });
    return data;
  },

  async signup(email, password, fullName) {
    const { data } = await http.post<{
      user: User | null;
      requiresEmailVerification?: boolean;
      message: string;
    }>('/api/auth/signup', { email, password, fullName });
    return data;
  },

  async logout() {
    try {
      await http.post('/api/auth/logout');
    } finally {
      clearStoredTokens();
    }
  },

  async getMe() {
    const { data } = await http.get<{ user: User }>('/api/auth/me');
    return data.user;
  },

  async refresh() {
    const { data } = await http.post<{ user: User }>('/api/auth/refresh');
    return data;
  },

  async forgotPassword(email) {
    const { data } = await http.post<{ message: string }>('/api/auth/forgot-password', { email });
    return data;
  },

  async resetPassword(token, newPassword) {
    const { data } = await http.post<{ message: string }>('/api/auth/reset-password', {
      token,
      newPassword,
    });
    return data;
  },

  async verifyEmail(token) {
    const { data } = await http.post<{ user: User; message: string }>('/api/auth/verify-email', {
      token,
    });
    return data;
  },

  async getGoogleOAuthUrl() {
    const { data } = await http.get<{ url: string }>('/api/auth/oauth/google');
    return data;
  },

  async getActivationStatus() {
    const { data } = await http.get<{ status: string; tenant: { tenant_id: string; name: string; owner_email: string } | null }>('/api/auth/status');
    return data;
  },

  async syncCloud() {
    const { data } = await http.post<{ success: boolean; message: string }>('/api/auth/sync');
    return data;
  },

  async activateTenant(email, password) {
    const { data } = await http.post<{ success: boolean; tenant: { id: string; name: string; status: string } }>('/api/auth/activate', { email, password });
    return data;
  },

  async registerTenant(payload) {
    const { data } = await http.post<{ success: boolean; tenant: { id: string; name: string; owner_email: string; plan?: string; expires_at?: string; status?: string } }>('/api/auth/register-tenant', payload);
    return data;
  },

  async getTenants(secretKey: string) {
    const { data } = await http.get<{ success: boolean; tenants: any[] }>('/api/auth/tenants', {
      headers: { 'x-super-admin-key': secretKey },
    });
    return data;
  },

  async updateTenantStatus(id: string, updates: { status?: string; plan?: string; expires_at?: string } | string, secretKey: string) {
    const body = typeof updates === 'string' ? { status: updates } : updates;
    const { data } = await http.patch<{ success: boolean; tenant?: any }>(`/api/auth/tenants/${id}/status`, body, {
      headers: { 'x-super-admin-key': secretKey },
    });
    return data;
  },

  async listPublicEmployees() {
    const { data } = await http.get<{ users: User[] }>('/api/auth/employees-public');
    return data.users;
  },

  async listEmployees() {
    const { data } = await http.get<User[]>('/api/employees');
    return data;
  },

  async createEmployee(payload) {
    const { data } = await http.post<User>('/api/employees', payload);
    return data;
  },

  async updateEmployee(id, payload) {
    const { data } = await http.patch<User>(`/api/employees/${id}`, payload);
    return data;
  },

  async deleteEmployee(id) {
    await http.delete(`/api/employees/${id}`);
  },

  // ─── Devices ─────────────────────────────────────────────────────────────

  async listDevices() {
    const { data } = await http.get<ListWrap<Device>>('/api/devices');
    return data.data;
  },
  async createDevice(payload: CreateDevicePayload) {
    const { data } = await http.post<OneWrap<Device>>('/api/devices', payload);
    return data.data;
  },
  async updateDevice(id, patch) {
    const { data } = await http.patch<OneWrap<Device>>(`/api/devices/${id}`, patch);
    return data.data;
  },
  async deleteDevice(id) {
    await http.delete(`/api/devices/${id}`);
  },

  // ─── Sessions ─────────────────────────────────────────────────────────────

  async listSessions(filter) {
    const url = filter ? `/api/sessions?status=${filter}` : '/api/sessions';
    const { data } = await http.get<ListWrap<Session>>(url);
    return data.data;
  },
  async startSession(payload: StartSessionPayload) {
    const { data } = await http.post<OneWrap<Session>>('/api/sessions', payload);
    return data.data;
  },
  async endSession(id, payload) {
    const { data } = await http.post<{
      data: Session;
      invoice: Invoice;
    }>(`/api/sessions/${id}/end`, payload);
    return { session: data.data, invoice: data.invoice };
  },
  async updateSession(id, patch) {
    const { data } = await http.patch<OneWrap<Session>>(`/api/sessions/${id}`, patch);
    return data.data;
  },
  async transferSession(id, payload) {
    const { data } = await http.post<{ data: Session; transfer: any }>(`/api/sessions/${id}/transfer`, payload);
    return { session: data.data, transfer: data.transfer };
  },
  async listSessionTransfers(id) {
    const { data } = await http.get<ListWrap<any>>(`/api/sessions/${id}/transfers`);
    return data.data;
  },
  async extendSession(id, additional_minutes) {
    const { data } = await http.post<OneWrap<Session>>(`/api/sessions/${id}/extend`, { additional_minutes });
    return data.data;
  },
  async pauseSession(id, reason) {
    const { data } = await http.post<OneWrap<Session>>(`/api/sessions/${id}/pause`, { reason });
    return data.data;
  },
  async resumeSession(id) {
    const { data } = await http.post<OneWrap<Session>>(`/api/sessions/${id}/resume`, {});
    return data.data;
  },
  async listSessionPauses(id) {
    const { data } = await http.get<ListWrap<SessionPause>>(`/api/sessions/${id}/pauses`);
    return data.data;
  },
  async getSessionAuditLogs(id) {
    const { data } = await http.get<ListWrap<SessionAuditLog>>(`/api/sessions/${id}/audit-logs`);
    return data.data;
  },

  // ─── Billing ─────────────────────────────────────────────────────────────

  async listInvoices(filter) {
    const paidParam =
      filter === 'paid' ? '?paid=true' : filter === 'unpaid' ? '?paid=false' : '';
    const { data } = await http.get<ListWrap<Invoice>>(`/api/invoices${paidParam}`);
    return data.data;
  },
  async payInvoice(id) {
    const { data } = await http.patch<OneWrap<Invoice>>(`/api/invoices/${id}/pay`, {});
    return data.data;
  },

  // ─── Reservations ─────────────────────────────────────────────────────────

  async listReservations() {
    const { data } = await http.get<ListWrap<Reservation>>('/api/reservations');
    return data.data;
  },
  async createReservation(payload: CreateReservationPayload) {
    const { data } = await http.post<OneWrap<Reservation>>('/api/reservations', payload);
    return data.data;
  },
  async updateReservation(id, patch) {
    const { data } = await http.patch<OneWrap<Reservation>>(
      `/api/reservations/${id}`,
      patch
    );
    return data.data;
  },

  // ─── Reports ─────────────────────────────────────────────────────────────

  async revenueReport() {
    const { data } = await http.get<{ data: RevenueReport }>('/api/reports/revenue');
    return data.data;
  },
  async usageReport() {
    const { data } = await http.get<{ data: UsageReport }>('/api/reports/usage');
    return data.data;
  },

  // ─── Customers ───────────────────────────────────────────────────────────

  async listCustomers() {
    const { data } = await http.get<ListWrap<Customer>>('/api/customers');
    return data.data;
  },
  async getLeaderboard(month) {
    const monthParam = month ? `?month=${month}` : '';
    const { data } = await http.get<ListWrap<LeaderboardEntry>>(`/api/customers/leaderboard${monthParam}`);
    return data.data;
  },
  async getCustomerProfile(id) {
    const { data } = await http.get<OneWrap<CustomerProfileData>>(`/api/customers/${id}/profile`);
    return data.data;
  },
  async listProducts() {
    const { data } = await http.get<ListWrap<Product>>('/api/products');
    return data.data;
  },
  async createProduct(payload: { name: string; price: number; cost_price?: number | null; stock?: number }) {
    const { data } = await http.post<OneWrap<Product>>('/api/products', payload);
    return data.data;
  },
  async updateProduct(id: string, patch: { name?: string; price?: number; cost_price?: number | null; stock?: number }) {
    const { data } = await http.patch<OneWrap<Product>>(`/api/products/${id}`, patch);
    return data.data;
  },
  async deleteProduct(id: string) {
    await http.delete(`/api/products/${id}`);
  },
  async adjustStock(id: string, delta: number, reason?: string, category?: string) {
    const { data } = await http.post<{ data: Product; log: StockLog }>(`/api/products/${id}/adjust-stock`, {
      delta,
      reason,
      category,
    });
    return { product: data.data, log: data.log };
  },
  async listStockLogs(id: string) {
    const { data } = await http.get<ListWrap<StockLog>>(`/api/products/${id}/stock-logs`);
    return data.data;
  },
  async createStandaloneSale(productId: string, quantity: number, paymentMethod = 'cash') {
    const { data } = await http.post<OneWrap<StandaloneOrder>>('/api/products/standalone-sale', {
      product_id: productId,
      quantity,
      payment_method: paymentMethod,
    });
    return data.data;
  },
  async getProductSalesReport() {
    const { data } = await http.get<OneWrap<ProductSalesReport>>('/api/products/sales-report');
    return data.data;
  },
  async addSessionOrder(sessionId, productId, quantity) {
    const { data } = await http.post<OneWrap<SessionOrder>>(`/api/sessions/${sessionId}/orders`, {
      product_id: productId,
      quantity,
    });
    return data.data;
  },
  async voidSessionOrder(sessionId, orderId) {
    await http.delete(`/api/sessions/${sessionId}/orders/${orderId}`);
  },
  async listSessionOrders(sessionId) {
    const { data } = await http.get<ListWrap<SessionOrder>>(`/api/sessions/${sessionId}/orders`);
    return data.data;
  },

  // ─── Pricing ─────────────────────────────────────────────────────────────

  async getPricing() {
    const { data } = await http.get<ListWrap<PricingTier>>('/api/pricing');
    return data.data;
  },
  async updateBulkPricing(type: string, rates: { hourly_rate?: number; hourly_rate_multi?: number }) {
    await http.patch('/api/pricing/bulk', { type, ...rates });
  },
  async updateDevicePricing(id: string, rates: { hourly_rate?: number; hourly_rate_multi?: number }) {
    await http.patch(`/api/pricing/device/${id}`, rates);
  },

  // ─── Rooms ───────────────────────────────────────────────────────────────

  async listRooms() {
    const { data } = await http.get<ListWrap<GamingRoom>>('/api/rooms');
    return data.data;
  },
  async createRoom(payload) {
    const { data } = await http.post<OneWrap<GamingRoom>>('/api/rooms', payload);
    return data.data;
  },
  async updateRoom(id, patch) {
    const { data } = await http.patch<OneWrap<GamingRoom>>(`/api/rooms/${id}`, patch);
    return data.data;
  },
  async deleteRoom(id) {
    await http.delete(`/api/rooms/${id}`);
  },

  // ─── Shifts ──────────────────────────────────────────────────────────────

  async listShifts(filter, userId) {
    const params = new URLSearchParams();
    if (filter) params.append('status', filter);
    if (userId) params.append('user_id', userId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const { data } = await http.get<ListWrap<Shift>>(`/api/shifts${qs}`);
    return data.data;
  },

  async getActiveShift() {
    const { data } = await http.get<OneWrap<Shift | null>>('/api/shifts/active');
    return data.data;
  },

  async startShift(payload) {
    const { data } = await http.post<OneWrap<Shift>>('/api/shifts/start', payload || {});
    return data.data;
  },

  async closeShift(id, payload) {
    const { data } = await http.post<OneWrap<Shift>>(`/api/shifts/${id}/close`, payload || {});
    return data.data;
  },

  async getShiftSummary(id) {
    const { data } = await http.get<OneWrap<ShiftSummary>>(`/api/shifts/${id}/summary`);
    return data.data;
  },

  // ─── Expenses ────────────────────────────────────────────────────────────

  async listAllExpenses(shiftId, category) {
    const params = new URLSearchParams();
    if (shiftId) params.append('shift_id', shiftId);
    if (category) params.append('category', category);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const { data } = await http.get<ListWrap<ShiftExpense>>(`/api/shifts/expenses${qs}`);
    return data.data;
  },

  async listShiftExpenses(shiftId) {
    const { data } = await http.get<ListWrap<ShiftExpense>>(`/api/shifts/${shiftId}/expenses`);
    return data.data;
  },

  async createShiftExpense(shiftId, payload) {
    const { data } = await http.post<OneWrap<ShiftExpense>>(`/api/shifts/${shiftId}/expenses`, payload);
    return data.data;
  },

  async createQuickExpense(payload) {
    const { data } = await http.post<OneWrap<ShiftExpense>>('/api/shifts/expenses', payload);
    return data.data;
  },

  async deleteShiftExpense(shiftId, expenseId) {
    await http.delete(`/api/shifts/${shiftId}/expenses/${expenseId}`);
  },
};
