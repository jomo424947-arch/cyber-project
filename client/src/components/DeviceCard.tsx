import { useState, useEffect } from 'react';
import { useNow } from '../hooks/useNow';
import { formatElapsed } from '../utils/format';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { dataService } from '../services';
import type { Device, Session, SessionAuditLog } from '../types';

interface DeviceCardProps {
  device: Device;
  activeSession?: Session; // present when status is in_use
  now?: number; // optional live timer override, defaults to internal useNow hook
  onAction?: (device: Device) => void;
  onEditSession?: (session: Session) => void;
  onTransferSession?: (session: Session) => void;
  onExtendSession?: (session: Session) => void;
  onPauseSession?: (session: Session) => void;
  onResumeSession?: (session: Session) => void;
  onDeleteDevice?: (device: Device) => void;
  index?: number;
}

function getDeviceBgImage(type: string, name?: string, specs?: Record<string, any> | null): string {
  const lowerName = (name || '').toLowerCase();
  const modelId = (specs?.model_id || '').toLowerCase();
  if (type === 'table' || lowerName.includes('billiards') || lowerName.includes('بلياردو')) {
    return './assets/billiards_card_bg.jpg';
  }
  if (modelId === 'ps4' || lowerName.includes('ps4') || (lowerName.includes('4') && !lowerName.includes('40'))) {
    return './assets/ps4_card_bg.jpg';
  }
  if (type === 'pc' || lowerName.includes('pc')) {
    return './assets/pc_card_bg.jpg';
  }
  return './assets/ps5_card_bg.jpg';
}

function getDeviceBrandBadge(type: string, name?: string, specs?: Record<string, any> | null) {
  const lowerName = (name || '').toLowerCase();
  const model = String(specs?.model || specs?.model_id || '');
  const isBilliards = type === 'table' || lowerName.includes('billiards') || lowerName.includes('بلياردو');
  
  if (isBilliards) {
    return (
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        border: '2px solid rgba(34, 197, 94, 0.8)',
        background: 'rgba(10, 15, 25, 0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#22c55e',
        fontWeight: 900,
        fontSize: '15px',
        boxShadow: '0 0 12px rgba(34, 197, 94, 0.4)',
        fontFamily: 'Space Grotesk, sans-serif'
      }}>
        8
      </div>
    );
  }

  // Xbox
  if (model.toLowerCase().includes('xbox') || lowerName.includes('xbox')) {
    return (
      <div style={{
        minWidth: '36px',
        height: '36px',
        padding: '0 8px',
        borderRadius: '18px',
        border: '2px solid rgba(16, 185, 129, 0.8)',
        background: 'rgba(10, 25, 15, 0.9)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#10b981',
        fontWeight: 800,
        fontSize: '12px',
        boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)',
        fontFamily: 'Space Grotesk, sans-serif'
      }}>
        XBOX
      </div>
    );
  }

  // PS5
  if (model === 'PS5' || lowerName.includes('ps5') || (!model && !lowerName.includes('ps4') && !lowerName.includes('ps3') && type === 'console')) {
    return (
      <div style={{
        minWidth: '36px',
        height: '36px',
        padding: '0 8px',
        borderRadius: '18px',
        border: '2px solid rgba(0, 140, 255, 0.8)',
        background: 'rgba(10, 15, 25, 0.9)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#0099FF',
        fontWeight: 800,
        fontSize: '12px',
        boxShadow: '0 0 12px rgba(0, 150, 255, 0.4)',
        fontFamily: 'Space Grotesk, sans-serif'
      }}>
        PS5
      </div>
    );
  }

  // PS4
  if (model === 'PS4' || lowerName.includes('ps4')) {
    return (
      <div style={{
        minWidth: '36px',
        height: '36px',
        padding: '0 8px',
        borderRadius: '18px',
        border: '2px solid rgba(59, 130, 246, 0.8)',
        background: 'rgba(10, 15, 25, 0.9)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#3b82f6',
        fontWeight: 800,
        fontSize: '12px',
        boxShadow: '0 0 12px rgba(59, 130, 246, 0.4)',
        fontFamily: 'Space Grotesk, sans-serif'
      }}>
        PS4
      </div>
    );
  }

  // PS3
  if (model === 'PS3' || lowerName.includes('ps3')) {
    return (
      <div style={{
        minWidth: '36px',
        height: '36px',
        padding: '0 8px',
        borderRadius: '18px',
        border: '2px solid rgba(239, 68, 68, 0.8)',
        background: 'rgba(25, 10, 10, 0.9)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ef4444',
        fontWeight: 800,
        fontSize: '12px',
        boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)',
        fontFamily: 'Space Grotesk, sans-serif'
      }}>
        PS3
      </div>
    );
  }

  // Nintendo Switch
  if (model === 'SWITCH' || lowerName.includes('switch')) {
    return (
      <div style={{
        minWidth: '36px',
        height: '36px',
        padding: '0 8px',
        borderRadius: '18px',
        border: '2px solid rgba(239, 68, 68, 0.8)',
        background: 'rgba(30, 10, 15, 0.9)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ff4b4b',
        fontWeight: 800,
        fontSize: '11px',
        boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)',
        fontFamily: 'Space Grotesk, sans-serif'
      }}>
        SWITCH
      </div>
    );
  }

  return (
    <div style={{
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      border: '2px solid rgba(0, 140, 255, 0.8)',
      background: 'rgba(10, 15, 25, 0.85)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#0099FF',
      boxShadow: '0 0 12px rgba(0, 150, 255, 0.4)'
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>sports_esports</span>
    </div>
  );
}

export function DeviceCard({ 
  device, 
  activeSession, 
  now, 
  onAction, 
  onEditSession,
  onTransferSession,
  onPauseSession,
  onResumeSession,
  onDeleteDevice,
  index = 0 
}: DeviceCardProps) {
  const liveNow = useNow(1000);
  const currentNow = now ?? liveNow;
  const isActive = device.status === 'in_use';
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const isBilliards = device.type === 'table' || device.name.toLowerCase().includes('billiards') || device.name.toLowerCase().includes('بلياردو');
  const bgImg = getDeviceBgImage(device.type, device.name, device.specs);

  let actionLabel = 'START SESSION';
  if (device.status === 'available') {
    actionLabel = 'START SESSION';
  } else if (device.status === 'in_use') {
    actionLabel = 'END SESSION';
  } else if (device.status === 'reserved') {
    actionLabel = 'RESERVED';
  }

  // Timer Calculations for Fixed vs Open Sessions
  const timerRender = () => {
    if (!activeSession) return null;

    if (activeSession.is_paused) {
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="ccms-eyebrow" style={{ color: 'var(--accent-yellow)' }}>Paused</span>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '13px',
            color: 'var(--accent-yellow)',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>pause</span>
            <span>Session on hold</span>
          </span>
        </div>
      );
    }

    if (activeSession.session_type === 'fixed' && activeSession.scheduled_end) {
      const endTime = new Date(activeSession.scheduled_end).getTime();
      const graceMins = activeSession.grace_period_minutes || 0;
      const graceTime = endTime + graceMins * 60000;

      const isGrace = currentNow >= endTime && currentNow < graceTime;
      const isOvertime = currentNow >= graceTime;

      if (isGrace) {
        const remainingGrace = Math.max(0, Math.floor((graceTime - currentNow) / 1000));
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
        const overtimeElapsed = Math.floor((currentNow - endTime) / 1000);
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
      const remainingSeconds = Math.max(0, Math.floor((endTime - currentNow) / 1000));
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
          {formatElapsed(activeSession.started_at, currentNow, activeSession.total_paused_minutes)}
        </span>
      </div>
    );
  };

  const isAvailable = device.status === 'available';

  return (
    <div
      className="ccms-stagger"
      style={{
        borderRadius: '16px',
        overflow: 'hidden',
        background: '#0a0e1a',
        border: isActive
          ? '1.5px solid rgba(245, 158, 11, 0.6)'
          : '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: isActive
          ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(245, 158, 11, 0.25)'
          : '0 8px 24px rgba(0, 0, 0, 0.4)',
        animationDelay: `${index * 60}ms`,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      {/* Top Image Preview Banner */}
      <div
        style={{
          position: 'relative',
          height: '165px',
          width: '100%',
          backgroundImage: `url(${bgImg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '12px 14px',
        }}
      >
        {/* Dark gradient overlay for visual clarity */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(10, 14, 26, 0.4) 0%, rgba(10, 14, 26, 0.95) 100%)',
          }}
        />

        {/* Top bar inside image: Brand Badge + Action buttons */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {getDeviceBrandBadge(device.type, device.name, device.specs)}

          {/* Quick Management Buttons */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {isActive && activeSession && !activeSession.is_paused && onPauseSession && (
              <button
                type="button"
                title="Pause session"
                onClick={() => onPauseSession(activeSession)}
                style={{
                  background: 'rgba(10, 15, 25, 0.75)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid var(--accent-yellow)',
                  color: 'var(--accent-yellow)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>pause</span>
              </button>
            )}
            {isActive && activeSession && activeSession.is_paused && onResumeSession && (
              <button
                type="button"
                title="Resume session"
                onClick={() => onResumeSession(activeSession)}
                style={{
                  background: 'rgba(10, 15, 25, 0.75)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid var(--accent-green)',
                  color: 'var(--accent-green)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>play_arrow</span>
              </button>
            )}
            {isActive && activeSession && onTransferSession && (
              <button
                type="button"
                title="تحويل الجلسة لغرفة أو جهاز آخر (Transfer Session)"
                onClick={() => onTransferSession(activeSession)}
                style={{
                  background: 'rgba(10, 15, 25, 0.75)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(168, 85, 247, 0.5)',
                  color: 'var(--accent-purple)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>swap_horiz</span>
              </button>
            )}
            {isActive && activeSession && onEditSession && (
              <button
                type="button"
                title="Edit active session"
                onClick={() => onEditSession(activeSession)}
                style={{
                  background: 'rgba(10, 15, 25, 0.75)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(0, 194, 255, 0.4)',
                  color: 'var(--accent-cyan)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span>
              </button>
            )}
            {onDeleteDevice && (
              <button
                type="button"
                title="Delete device"
                onClick={() => onDeleteDevice(device)}
                style={{
                  background: 'rgba(10, 15, 25, 0.75)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: 'var(--accent-red)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
              </button>
            )}
          </div>
        </div>

        {/* Device Title & Status Indicator overlay at bottom of image */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <h4
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: '20px',
              fontWeight: 800,
              color: '#FFFFFF',
              margin: 0,
              letterSpacing: '0.5px',
            }}
          >
            {device.name}
          </h4>

          {/* Glowing Status Dot + Text */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isAvailable ? '#22c55e' : isActive ? '#f59e0b' : '#9ca3af',
                boxShadow: isAvailable
                  ? '0 0 10px #22c55e'
                  : isActive
                  ? '0 0 10px #f59e0b'
                  : 'none',
              }}
            />
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: isAvailable ? '#22c55e' : isActive ? '#f59e0b' : '#9ca3af',
              }}
            >
              {isAvailable ? 'متاح' : isActive ? 'مشغول' : device.status}
            </span>
          </div>
        </div>
      </div>

      {/* Card Content & Active Session details */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        {isActive && activeSession && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '10px 12px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ccms-eyebrow">العميل</span>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                {activeSession.customer ? `@${activeSession.customer.username}` : 'Walk-in'}
              </span>
            </div>
            {timerRender()}
          </div>
        )}

        {/* Action Button: START SESSION > (Blue for PS/PC, Green for Billiards, Red for End) */}
        <div style={{ marginTop: 'auto', paddingTop: '4px' }}>
          {onAction && (
            <button
              onClick={() => onAction(device)}
              disabled={activeSession?.is_paused}
              style={{
                width: '100%',
                padding: '12px 18px',
                borderRadius: '50px',
                border: 'none',
                background: isActive
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                  : isBilliards
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #0066FF 0%, #0044CC 100%)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 800,
                letterSpacing: '0.8px',
                cursor: activeSession?.is_paused ? 'not-allowed' : 'pointer',
                opacity: activeSession?.is_paused ? 0.5 : 1,
                boxShadow: isActive
                  ? '0 4px 16px rgba(239, 68, 68, 0.4)'
                  : isBilliards
                  ? '0 4px 16px rgba(16, 185, 129, 0.4)'
                  : '0 4px 16px rgba(0, 102, 255, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'transform 0.15s ease, boxShadow 0.15s ease',
              }}
            >
              <span>{actionLabel}</span>
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>›</span>
            </button>
          )}
        </div>
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
    let isMounted = true;
    dataService.getSessionAuditLogs(session.id)
      .then((data) => {
        if (isMounted) setLogs(data);
      })
      .catch(() => {
        if (isMounted) setLogs([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
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
