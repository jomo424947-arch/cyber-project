import { http } from '../http';
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
    await http.post('/api/auth/logout');
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
  async extendSession(id, additional_minutes) {
    const { data } = await http.post<OneWrap<Session>>(`/api/sessions/${id}/extend`, { additional_minutes });
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
};
