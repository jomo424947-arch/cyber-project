import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency } from '../utils/format';
import type { Device, Session, Customer, PaymentMethod, SessionAuditLog } from '../types';

// Helper to format Date objects for datetime-local inputs
const toLocalISOString = (date: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// ─── Start Session modal ───────────────────────────────────────────────
export function StartSessionModal({
  device,
  onClose,
  onDone,
}: {
  device: Device;
  onClose: () => void;
  onDone: () => void;
}) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  
  // Quick-create state
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // Session options
  const [sessionType, setSessionType] = useState<'open' | 'fixed'>('open');
  const [startedAt, setStartedAt] = useState(toLocalISOString(new Date()));
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [hourlyRateOverride, setHourlyRateOverride] = useState(device.hourly_rate.toString());
  const [gracePeriod, setGracePeriod] = useState('0');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    dataService.listCustomers().then(setCustomers).catch(() => setCustomers([]));
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) => 
      c.username.toLowerCase().includes(q) || 
      c.name.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const computedScheduledEnd = useMemo(() => {
    if (sessionType !== 'fixed') return '';
    const startDate = new Date(startedAt);
    const mins = parseInt(durationMinutes, 10) || 0;
    const endDate = new Date(startDate.getTime() + mins * 60000);
    return toLocalISOString(endDate);
  }, [sessionType, startedAt, durationMinutes]);

  const usernameError = useMemo(() => {
    if (mode !== 'new' || !username) return '';
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return 'Only letters, numbers, and underscores allowed (no spaces)';
    }
    if (customers?.some((c) => c.username.toLowerCase() === username.toLowerCase())) {
      return 'Username is already taken';
    }
    return '';
  }, [mode, username, customers]);

  const submit = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const payload: any = {
        device_id: device.id,
        session_type: sessionType,
        grace_period_minutes: sessionType === 'fixed' ? (parseInt(gracePeriod, 10) || 0) : 0,
        hourly_rate_override: parseFloat(hourlyRateOverride) !== device.hourly_rate ? parseFloat(hourlyRateOverride) : null,
      };

      if (mode === 'existing') {
        if (!customerId) throw new Error('Please select a customer');
        payload.customer_id = customerId;
      } else {
        if (!username.trim()) throw new Error('Username is required');
        if (usernameError) throw new Error(usernameError);
        payload.customer_username = username.trim().toLowerCase();
        payload.customer_name = name.trim() || username.trim();
        payload.customer_phone = phone.trim() || undefined;
      }

      const now = new Date();
      const start = new Date(startedAt);
      if (start.getTime() > now.getTime() + 10000) {
        throw new Error('Start time cannot be in the future');
      }
      payload.started_at = start.toISOString();

      if (sessionType === 'fixed') {
        payload.scheduled_end = new Date(computedScheduledEnd).toISOString();
      }

      await dataService.startSession(payload);
      onDone();
    } catch (err: any) {
      setErrorMsg(err.message || apiErrorMessage(err, 'Could not start session'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      title={`Start Session · ${device.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={loading}
            disabled={
              mode === 'existing' 
                ? !customerId 
                : !username.trim() || !!usernameError || !name.trim()
            }
            onClick={submit}
          >
            Start Session
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
        
        {/* Toggle Mode: Existing vs New Customer */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={mode === 'new' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
            style={{ flex: 1, fontSize: '13px' }}
            onClick={() => setMode('new')}
          >
            New Customer
          </button>
          <button
            type="button"
            className={mode === 'existing' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
            style={{ flex: 1, fontSize: '13px' }}
            onClick={() => setMode('existing')}
          >
            Existing
          </button>
        </div>

        {mode === 'new' ? (
          <>
            <Input
              label="Username (unique identifier)*"
              placeholder="e.g. omar_99"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={usernameError}
              autoFocus
            />
            <Input
              label="Customer Display Name*"
              placeholder="e.g. Omar Khalid"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Phone (optional)"
              placeholder="+20 100 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </>
        ) : (
          <>
            <Input
              label="Search Customers"
              placeholder="Type username..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCustomerId('');
              }}
            />
            <Select
              label="Select Customer*"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={!customers || customers.length === 0}
            >
              <option value="">
                {customers === null ? 'Loading…' : filteredCustomers.length === 0 ? 'No matching customers' : 'Choose…'}
              </option>
              {filteredCustomers.map((c) => (
                <option key={c.id} value={c.id}>@{c.username} — {c.name}</option>
              ))}
            </Select>
          </>
        )}

        <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />

        {/* Toggle Session Type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span className="ccms-eyebrow">Session Type</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={sessionType === 'open' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
              style={{ flex: 1, fontSize: '13px' }}
              onClick={() => setSessionType('open')}
            >
              Open Time
            </button>
            <button
              type="button"
              className={sessionType === 'fixed' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
              style={{ flex: 1, fontSize: '13px' }}
              onClick={() => setSessionType('fixed')}
            >
              Fixed Time
            </button>
          </div>
        </div>

        {/* Start time */}
        <Input
          type="datetime-local"
          label="Start Time (Backdate)"
          value={startedAt}
          max={toLocalISOString(new Date())}
          onChange={(e) => setStartedAt(e.target.value)}
        />

        {sessionType === 'fixed' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Input
                type="number"
                label="Duration (minutes)*"
                min="1"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
              <Input
                type="number"
                label="Grace Period (minutes)"
                min="0"
                value={gracePeriod}
                onChange={(e) => setGracePeriod(e.target.value)}
              />
            </div>
            {durationMinutes && startedAt && (
              <div style={{ fontSize: '12px', color: 'var(--accent-cyan)' }}>
                Scheduled End: <strong>{new Date(computedScheduledEnd).toLocaleString()}</strong>
              </div>
            )}
          </>
        )}

        <Input
          type="number"
          label="Hourly Rate Override ($/hr)"
          min="0"
          step="0.01"
          value={hourlyRateOverride}
          onChange={(e) => setHourlyRateOverride(e.target.value)}
        />

        {errorMsg && (
          <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '8px', background: 'rgba(255, 68, 102, 0.1)', borderRadius: '6px', border: '1px solid rgba(255, 68, 102, 0.3)' }}>
            {errorMsg}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── End Session modal ─────────────────────────────────────────────────
export function EndSessionModal({
  session,
  onClose,
  onDone,
}: {
  session: Session;
  onClose: () => void;
  onDone: () => void;
}) {
  const [endedAt, setEndedAt] = useState(toLocalISOString(new Date()));
  const [markPaid, setMarkPaid] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const startedTime = new Date(session.started_at).getTime();
  const endingTime = new Date(endedAt).getTime();
  
  const rawMinutes = Math.max(0, Math.ceil((endingTime - startedTime) / 60000));
  const billedMinutes = Math.max(30, rawMinutes);
  
  const rate = Number(session.hourly_rate_override !== null ? session.hourly_rate_override : session.device?.hourly_rate ?? 0);
  const baseCost = (billedMinutes / 60) * rate;

  let overtimeMinutes = 0;
  let overtimeCost = 0;

  if (session.session_type === 'fixed' && session.scheduled_end) {
    const scheduledMinutes = Math.max(0, Math.ceil((new Date(session.scheduled_end).getTime() - startedTime) / 60000));
    const graceMinutes = Number(session.grace_period_minutes || 0);
    overtimeMinutes = Math.max(0, billedMinutes - scheduledMinutes - graceMinutes);
    if (overtimeMinutes > 0) {
      overtimeCost = (overtimeMinutes / 60) * rate * 1.0;
    }
  }

  const totalCost = baseCost + overtimeCost;

  const submit = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (endingTime < startedTime) {
        throw new Error('End time cannot be earlier than start time');
      }
      const now = new Date();
      if (endingTime > now.getTime() + 10000) {
        throw new Error('End time cannot be in the future');
      }

      await dataService.endSession(session.id, {
        ended_at: new Date(endedAt).toISOString(),
        mark_paid: markPaid,
        payment_method: paymentMethod,
      });

      onDone();
    } catch (err: any) {
      setErrorMsg(err.message || apiErrorMessage(err, 'Could not end session'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      title={`End Session · ${session.device?.name ?? 'Device'}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={loading} onClick={submit}>
            End & Generate Invoice
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Input
          type="datetime-local"
          label="End Time"
          value={endedAt}
          max={toLocalISOString(new Date())}
          onChange={(e) => setEndedAt(e.target.value)}
        />

        <div style={{ padding: '14px', background: 'var(--bg-input)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--border-default)' }}>
          <Row label="Customer" value={session.customer ? `@${session.customer.username} (${session.customer.name})` : 'Walk-in'} />
          <Row label="Hourly Rate" value={`${formatCurrency(rate)} / hr`} />
          <Row label="Started At" value={new Date(session.started_at).toLocaleString()} />
          <Row label="Billed Time" value={`${billedMinutes} minutes (raw: ${rawMinutes}m, min 30m)`} />
          
          <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
          
          <Row label="Base Cost" value={formatCurrency(baseCost)} />
          
          {session.session_type === 'fixed' && (
            <>
              <Row 
                label="Overtime Minutes" 
                value={`${overtimeMinutes} mins (${session.grace_period_minutes}m grace applied)`} 
                valueColor={overtimeMinutes > 0 ? 'var(--accent-red)' : 'var(--text-secondary)'}
              />
              <Row 
                label="Overtime Cost" 
                value={formatCurrency(overtimeCost)} 
                valueColor={overtimeCost > 0 ? 'var(--accent-red)' : 'var(--text-secondary)'}
              />
            </>
          )}

          <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
          
          <Row 
            label="Total Cost" 
            value={formatCurrency(totalCost)} 
            valueColor="var(--accent-green)" 
            isBold 
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            <input 
              type="checkbox" 
              checked={markPaid} 
              onChange={(e) => setMarkPaid(e.target.checked)} 
            />
            Mark as Paid Immediately
          </label>
          
          {markPaid && (
            <Select
              label="Payment Method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              <option value="cash">Cash</option>
              <option value="card">Credit/Debit Card</option>
              <option value="transfer">Bank Transfer</option>
              <option value="wallet">Digital Wallet</option>
            </Select>
          )}
        </div>

        {errorMsg && (
          <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '8px', background: 'rgba(255, 68, 102, 0.1)', borderRadius: '6px', border: '1px solid rgba(255, 68, 102, 0.3)' }}>
            {errorMsg}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Edit Session modal ─────────────────────────────────────────────────
export function EditSessionModal({
  session,
  onClose,
  onDone,
}: {
  session: Session;
  onClose: () => void;
  onDone: () => void;
}) {
  const [startedAt, setStartedAt] = useState(toLocalISOString(new Date(session.started_at)));
  const [scheduledEnd, setScheduledEnd] = useState(session.scheduled_end ? toLocalISOString(new Date(session.scheduled_end)) : '');
  const [hourlyRateOverride, setHourlyRateOverride] = useState(session.hourly_rate_override !== null ? session.hourly_rate_override.toString() : (session.device?.hourly_rate || 0).toString());
  const [gracePeriod, setGracePeriod] = useState(session.grace_period_minutes.toString());
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const start = new Date(startedAt);
      const now = new Date();
      if (start.getTime() > now.getTime() + 10000) {
        throw new Error('Start time cannot be in the future');
      }

      const patch: any = {
        started_at: start.toISOString(),
        hourly_rate_override: parseFloat(hourlyRateOverride) !== (session.device?.hourly_rate ?? 0) ? parseFloat(hourlyRateOverride) : null,
      };

      if (session.session_type === 'fixed') {
        if (!scheduledEnd) throw new Error('Scheduled end is required for fixed sessions');
        const end = new Date(scheduledEnd);
        if (end.getTime() <= start.getTime()) {
          throw new Error('Scheduled end must be after started_at');
        }
        patch.scheduled_end = end.toISOString();
        patch.grace_period_minutes = parseInt(gracePeriod, 10) || 0;
      }

      await dataService.updateSession(session.id, patch);
      onDone();
    } catch (err: any) {
      setErrorMsg(err.message || apiErrorMessage(err, 'Could not update session'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      title={`Edit Active Session · ${session.device?.name ?? 'Device'}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={submit}>
            Save Changes
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          Adjust active session parameters. Every change will be logged in the audit trail.
        </p>

        <Input
          type="datetime-local"
          label="Start Time"
          value={startedAt}
          max={toLocalISOString(new Date())}
          onChange={(e) => setStartedAt(e.target.value)}
        />

        {session.session_type === 'fixed' && (
          <>
            <Input
              type="datetime-local"
              label="Scheduled End Time"
              value={scheduledEnd}
              onChange={(e) => setScheduledEnd(e.target.value)}
            />
            <Input
              type="number"
              label="Grace Period (minutes)"
              min="0"
              value={gracePeriod}
              onChange={(e) => setGracePeriod(e.target.value)}
            />
          </>
        )}

        <Input
          type="number"
          label="Hourly Rate Override ($/hr)"
          min="0"
          step="0.01"
          value={hourlyRateOverride}
          onChange={(e) => setHourlyRateOverride(e.target.value)}
        />

        {errorMsg && (
          <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '8px', background: 'rgba(255, 68, 102, 0.1)', borderRadius: '6px', border: '1px solid rgba(255, 68, 102, 0.3)' }}>
            {errorMsg}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Local Sub-Modal to view Audit Logs ───────────────────────────────
export function AuditLogModal({ 
  session, 
  onClose 
}: { 
  session: Session; 
  onClose: () => void 
}) {
  const [logs, setLogs] = useState<SessionAuditLog[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dataService.getSessionAuditLogs(session.id)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [session.id]);

  return (
    <Modal
      open
      title={`Session Audit Trail · @${session.customer?.username ?? 'walkin'}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {loading ? (
        <LoadingSpinner label="Fetching audit logs…" />
      ) : !logs || logs.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '16px' }}>
          No audit records found.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '50vh', overflowY: 'auto', paddingRight: '4px' }}>
          {logs.map((log) => (
            <div 
              key={log.id} 
              style={{
                padding: '10px 12px',
                background: 'var(--bg-input)',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                fontSize: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-cyan)', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold' }}>Changed: {log.field_changed}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{new Date(log.edited_at).toLocaleString()}</span>
              </div>
              <div style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                <strong>Old:</strong> {log.old_value !== null ? log.old_value : '—'} <br />
                <strong>New:</strong> {log.new_value !== null ? log.new_value : '—'}
              </div>
              {log.editor?.full_name && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '6px', textAlign: 'right' }}>
                  Edited by: <strong>{log.editor.full_name}</strong>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Row({ 
  label, 
  value, 
  valueColor = 'var(--text-primary)', 
  isBold = false 
}: { 
  label: string; 
  value: string; 
  valueColor?: string; 
  isBold?: boolean 
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: valueColor, fontWeight: isBold ? 700 : 500 }}>{value}</span>
    </div>
  );
}
