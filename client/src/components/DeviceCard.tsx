import { useState, useEffect } from 'react';
import { StatusBadge } from './StatusBadge';
import { formatElapsed, formatCurrency } from '../utils/format';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { dataService } from '../services';
import type { Device, Session, SessionAuditLog } from '../types';

interface DeviceCardProps {
  device: Device;
  activeSession?: Session; // present when status is in_use
  now: number; // current ms, for the live timer
  onAction?: (device: Device) => void;
  onEditSession?: (session: Session) => void;
  onExtendSession?: (session: Session) => void;
  index?: number;
}

function getDeviceMaterialIcon(type: string): string {
  switch (type) {
    case 'pc':
      return 'desktop_windows';
    case 'console':
      return 'sports_esports';
    case 'vr':
      return 'smart_display';
    default:
      return 'devices';
  }
}

export function DeviceCard({ 
  device, 
  activeSession, 
  now, 
  onAction, 
  onEditSession,
  onExtendSession,
  index = 0 
}: DeviceCardProps) {
  const isActive = device.status === 'in_use';
  const typeIcon = getDeviceMaterialIcon(device.type);
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  let actionLabel: string | null = null;
  let actionVariant: 'primary' | 'danger' | 'ghost' = 'primary';
  if (device.status === 'available') {
    actionLabel = 'Start Session';
    actionVariant = 'primary';
  } else if (device.status === 'in_use') {
    actionLabel = 'End Session';
    actionVariant = 'danger';
  } else if (device.status === 'reserved') {
    actionLabel = 'View Reservation';
    actionVariant = 'ghost';
  }

  // Timer Calculations for Fixed vs Open Sessions
  const timerRender = () => {
    if (!activeSession) return null;

    if (activeSession.session_type === 'fixed' && activeSession.scheduled_end) {
      const endTime = new Date(activeSession.scheduled_end).getTime();
      const graceMins = activeSession.grace_period_minutes || 0;
      const graceTime = endTime + graceMins * 60000;

      const isGrace = now >= endTime && now < graceTime;
      const isOvertime = now >= graceTime;

      if (isGrace) {
        const remainingGrace = Math.max(0, Math.floor((graceTime - now) / 1000));
        const mins = Math.floor(remainingGrace / 60);
        const secs = remainingGrace % 60;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="ccms-eyebrow" style={{ color: 'var(--accent-yellow)' }}>Grace Period</span>
              <span
                className="pulse-warning"
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '14px',
                  color: 'var(--accent-yellow)',
                  fontWeight: 'bold'
                }}
              >
                {mins}:{secs.toString().padStart(2, '0')}
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'right' }}>
              Overtime begins shortly
            </span>
          </div>
        );
      }

      if (isOvertime) {
        const overtimeElapsed = Math.floor((now - endTime) / 1000);
        const hrs = Math.floor(overtimeElapsed / 3600);
        const mins = Math.floor((overtimeElapsed % 3600) / 60);
        const secs = overtimeElapsed % 60;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ccms-eyebrow" style={{ color: 'var(--accent-red)' }}>OVERTIME</span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '14px',
                  color: 'var(--accent-red)',
                  fontWeight: 'bold',
                  textShadow: '0 0 8px rgba(255, 68, 102, 0.4)'
                }}
              >
                +{hrs > 0 ? hrs + ':' : ''}{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
              <span style={{ fontSize: '11px', color: 'var(--accent-red)' }}>Exceeded Limit</span>
              <span style={{ padding: '2px 6px', background: 'var(--accent-red)', color: '#fff', fontSize: '10px', fontWeight: 'bold', borderRadius: '4px', textTransform: 'uppercase' }}>Overtime</span>
            </div>
          </div>
        );
      }

      // Normal Countdown
      const remainingSeconds = Math.max(0, Math.floor((endTime - now) / 1000));
      const hrs = Math.floor(remainingSeconds / 3600);
      const mins = Math.floor((remainingSeconds % 3600) / 60);
      const secs = remainingSeconds % 60;
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="ccms-eyebrow">Remaining</span>
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '14px',
              color: 'var(--accent-cyan)',
              fontWeight: 600,
            }}
          >
            {hrs > 0 ? hrs + ':' : ''}{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
          </span>
        </div>
      );
    }

    // Open (Pay-As-You-Go) Timer
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="ccms-eyebrow">Elapsed</span>
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '14px',
            color: 'var(--accent-green)',
            fontWeight: 600,
          }}
        >
          {formatElapsed(activeSession.started_at, now)}
        </span>
      </div>
    );
  };

  return (
    <div
      className="ccms-card ccms-card-hover ccms-stagger"
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        borderLeft: isActive ? '3px solid var(--accent-red)' : undefined,
        boxShadow: isActive
          ? '0 4px 24px rgba(0,0,0,0.4), -2px 0 12px rgba(255,68,102,0.2)'
          : undefined,
        animationDelay: `${index * 60}ms`,
      }}
    >
      {/* Header: type icon + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '22px', color: 'var(--accent-cyan)' }}>
          {typeIcon}
        </span>
        <span
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            flex: 1,
          }}
        >
          {device.name}
        </span>
        {isActive && activeSession && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {activeSession.edited_start_at && (
              <button
                type="button"
                title="View edit logs"
                onClick={() => setShowAuditLogs(true)}
                style={{
                  background: 'rgba(255, 170, 0, 0.1)',
                  border: '1px solid var(--accent-yellow)',
                  color: 'var(--accent-yellow)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontFamily: 'JetBrains Mono, monospace',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Logs
              </button>
            )}
            {onEditSession && (
              <button
                type="button"
                title="Edit active session"
                onClick={() => onEditSession(activeSession)}
                style={{
                  background: 'rgba(0, 194, 255, 0.1)',
                  border: '1px solid rgba(0, 194, 255, 0.2)',
                  color: 'var(--accent-cyan)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontFamily: 'JetBrains Mono, monospace',
                  cursor: 'pointer',
                }}
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Status */}
      <div>
        <StatusBadge status={device.status} />
      </div>

      {/* Active session info */}
      {isActive && activeSession && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '12px 14px',
            background: 'var(--bg-elevated)',
            borderRadius: '8px',
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="ccms-eyebrow">Customer</span>
            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
              {activeSession.customer ? `@${activeSession.customer.username}` : 'Walk-in'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="ccms-eyebrow">Rate</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {activeSession.hourly_rate_override !== null ? (
                <>
                  <span style={{ textDecoration: 'line-through', marginRight: '4px' }}>
                    {formatCurrency(device.hourly_rate)}
                  </span>
                  <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>
                    {formatCurrency(activeSession.hourly_rate_override)}
                  </span>
                </>
              ) : (
                formatCurrency(device.hourly_rate)
              )}
              /hr
            </span>
          </div>

          {timerRender()}

          {activeSession.session_type === 'fixed' && onExtendSession && (
            <button
              type="button"
              className="ccms-btn ccms-btn-ghost"
              style={{
                width: '100%',
                padding: '6px 12px',
                fontSize: '11px',
                marginTop: '4px',
                border: '1px dashed var(--border-default)',
                minHeight: 'auto',
              }}
              onClick={() => onExtendSession(activeSession)}
            >
              ➕ Extend 30 Min
            </button>
          )}
        </div>
      )}

      {/* Specs (compact) */}
      {device.specs && (
        <SpecList specs={device.specs} />
      )}

      {/* Footer: rate + action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 'auto',
          paddingTop: '8px',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="ccms-eyebrow">Device Rate</span>
          <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
            {formatCurrency(device.hourly_rate)}/hr
          </span>
        </div>
        {actionLabel && onAction && (
          <button
            className={`ccms-btn ${actionVariant === 'danger' ? 'ccms-btn-danger' : actionVariant === 'ghost' ? 'ccms-btn-ghost' : 'ccms-btn-primary'}`}
            style={{ 
              padding: '8px 16px', 
              fontSize: '11px',
              minHeight: '36px',
            }}
            onClick={() => onAction(device)}
          >
            {actionLabel}
          </button>
        )}
      </div>

      {showAuditLogs && activeSession && (
        <AuditLogModal 
          session={activeSession} 
          onClose={() => setShowAuditLogs(false)} 
        />
      )}
    </div>
  );
}

function SpecList({ specs }: { specs: Record<string, string> }) {
  const entries = Object.entries(specs).slice(0, 3);
  if (entries.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {entries.map(([k, v]) => (
        <span
          key={k}
          style={{
            fontSize: '10px',
            fontFamily: 'JetBrains Mono, monospace',
            padding: '2px 8px',
            borderRadius: '4px',
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
          }}
        >
          {k}: <span style={{ color: 'var(--text-primary)' }}>{v}</span>
        </span>
      ))}
    </div>
  );
}

function AuditLogModal({ 
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
