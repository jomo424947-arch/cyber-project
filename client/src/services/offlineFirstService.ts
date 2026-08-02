import type { DataService } from './api';
import { realService } from './real/realService';
import { localDb } from './localDb';
import type { Device, Session, Invoice } from '../types';

export const offlineFirstService: DataService = {
  ...realService,

  async listDevices() {
    try {
      const devices = await realService.listDevices();
      for (const device of devices) {
        await localDb.setItem('devices', device);
      }
      return devices;
    } catch {
      // Fall back to browser local DB if local Express backend fails
      return localDb.getAll<Device>('devices');
    }
  },

  async listSessions(filter) {
    try {
      const sessions = await realService.listSessions(filter);
      for (const session of sessions) {
        await localDb.setItem('sessions', session);
      }
      return sessions;
    } catch {
      // Fall back to browser local DB if local Express backend fails
    }
    const all = await localDb.getAll<Session>('sessions');
    if (!filter) return all;
    return all.filter((s) => s.status === filter);
  },

  async startSession(payload) {
    try {
      const session = await realService.startSession(payload);
      await localDb.setItem('sessions', session);
      return session;
    } catch (err: any) {
      // If it's a validation error or HTTP error from backend, rethrow it
      if (err?.response) throw err;
      // Fall through to browser offline handling only if backend is unreachable
    }

    // Offline creation logic
    const localSession: Session = {
      id: crypto.randomUUID(),
      device_id: payload.device_id,
      customer_id: payload.customer_id || null,
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_minutes: null,
      total_cost: null,
      status: 'active',
      created_by: null,
      created_at: new Date().toISOString(),
      session_type: payload.session_type || 'open',
      play_mode: payload.play_mode || 'single',
      scheduled_end: payload.scheduled_end || null,
      hourly_rate_override: payload.hourly_rate_override || null,
      grace_period_minutes: 0,
      is_overtime: false,
      overtime_minutes: null,
      edited_start_at: false,
    };

    await localDb.setItem('sessions', localSession);
    await localDb.enqueueSync({
      action: 'create_session',
      entity: 'sessions',
      payload: payload as unknown as Record<string, unknown>,
    });

    return localSession;
  },

  async endSession(id, payload) {
    try {
      const res = await realService.endSession(id, payload);
      await localDb.setItem('sessions', res.session);
      await localDb.setItem('invoices', res.invoice);
      return res;
    } catch (err: any) {
      if (err?.response) throw err;
      // Fall through to browser offline end session
    }

    const session = await localDb.getItem<Session>('sessions', id);
    const endedAt = payload?.ended_at || new Date().toISOString();

    const endedSession: Session = session
      ? { ...session, status: 'ended', ended_at: endedAt }
      : {
          id,
          device_id: '',
          customer_id: null,
          started_at: new Date().toISOString(),
          ended_at: endedAt,
          duration_minutes: 60,
          total_cost: 5.0,
          status: 'ended',
          created_by: null,
          created_at: new Date().toISOString(),
          session_type: 'open',
          play_mode: 'single',
          scheduled_end: null,
          hourly_rate_override: null,
          grace_period_minutes: 0,
          is_overtime: false,
          overtime_minutes: null,
          edited_start_at: false,
        };

    const invoice: Invoice = {
      id: crypto.randomUUID(),
      session_id: id,
      amount: endedSession.total_cost || 5.0,
      paid: payload?.mark_paid ?? false,
      payment_method: payload?.payment_method || 'cash',
      issued_at: endedAt,
      paid_at: payload?.mark_paid ? endedAt : null,
    };

    await localDb.setItem('sessions', endedSession);
    await localDb.setItem('invoices', invoice);
    await localDb.enqueueSync({
      action: 'end_session',
      entity: 'sessions',
      payload: { id, ...(payload || {}) },
    });

    return { session: endedSession, invoice };
  },
};
