import { useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { useNow } from '../hooks/useNow';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { dataService } from '../services';
import { formatElapsed, formatCurrency } from '../utils/format';
import {
  StartSessionModal,
  EndSessionModal,
  EditSessionModal,
} from '../components/SessionModals';
import type { Device, Session } from '../types';

const ROOM_COUNT = 5;

// Unified Cyan Theme elements for CCMS aesthetics
const ROOM_ACCENT_COLOR = 'var(--accent-cyan)';
const ROOM_GRADIENT = 'linear-gradient(135deg, rgba(0, 194, 255, 0.15), rgba(0, 112, 255, 0.05))';

const ROOM_ICONS = [
  'sports_esports',
  'videogame_asset',
  'stadia_controller',
  'gamepad',
  'joystick',
];

type PlayMode = 'single' | 'multiplayer';

export default function RoomsPage() {
  const now = useNow(1000);
  const { toast } = useToast();

  const { data, loading, refetch } = useAsync(async () => {
    const [devices, sessions] = await Promise.all([
      dataService.listDevices(),
      dataService.listSessions('active'),
    ]);
    return { devices, sessions } as { devices: Device[]; sessions: Session[] };
  }, []);

  const activeByDevice = useMemo(() => {
    const map = new Map<string, Session>();
    (data?.sessions ?? []).forEach((s) => map.set(s.device_id, s));
    return map;
  }, [data]);

  // Load custom room device assignments from localStorage
  const [roomDeviceIds, setRoomDeviceIds] = useState<Record<number, string>>(() => {
    try {
      const saved = localStorage.getItem('ccms_room_device_ids');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Play mode per room (frontend-only state)
  const [playModes, setPlayModes] = useState<Record<number, PlayMode>>({});

  const [startTarget, setStartTarget] = useState<Device | null>(null);
  const [startPlayMode, setStartPlayMode] = useState<PlayMode>('single');
  const [endTarget, setEndTarget] = useState<Session | null>(null);
  const [editTarget, setEditTarget] = useState<Session | null>(null);

  // Initialize defaults if room assignment is empty
  useMemo(() => {
    if (!data?.devices) return;
    let updated = false;
    const nextIds = { ...roomDeviceIds };
    for (let r = 1; r <= ROOM_COUNT; r++) {
      if (!nextIds[r]) {
        const dev = data.devices[r - 1];
        if (dev) {
          nextIds[r] = dev.id;
          updated = true;
        }
      }
    }
    if (updated) {
      setRoomDeviceIds(nextIds);
      localStorage.setItem('ccms_room_device_ids', JSON.stringify(nextIds));
    }
  }, [data?.devices]);

  const handleAction = async (device: Device) => {
    if (device.status === 'in_use') {
      const session = activeByDevice.get(device.id);
      if (session) {
        setEndTarget(session);
      } else {
        if (confirm(`Device ${device.name} is marked "In Use" but has no active session. Reset status to "Available"?`)) {
          try {
            await dataService.updateDevice(device.id, { status: 'available' });
            toast(`Reset ${device.name} to available`, 'success');
            refetch();
          } catch (err) {
            toast('Failed to reset device status', 'error');
          }
        }
      }
    } else if (device.status === 'available') {
      setStartTarget(device);
    } else {
      toast(`${device.name} is ${device.status} — manage it from Settings.`, 'info');
    }
  };

  const handleDeviceChange = (roomNumber: number, deviceId: string) => {
    // Check if this device is already selected in another room
    const currentAssignments = { ...roomDeviceIds };
    
    // Update mapping
    currentAssignments[roomNumber] = deviceId;
    setRoomDeviceIds(currentAssignments);
    localStorage.setItem('ccms_room_device_ids', JSON.stringify(currentAssignments));
    
    toast(`Room ${roomNumber} device updated`, 'success');
  };

  const rooms = useMemo(() => {
    const devices = data?.devices ?? [];
    return Array.from({ length: ROOM_COUNT }, (_, i) => {
      const roomNumber = i + 1;
      const assignedDeviceId = roomDeviceIds[roomNumber];
      const device = devices.find((d) => d.id === assignedDeviceId) || null;
      return {
        number: roomNumber,
        device,
        session: device ? activeByDevice.get(device.id) : undefined,
      };
    });
  }, [data, activeByDevice, roomDeviceIds]);

  if (loading || !data) {
    return (
      <Layout title="Gaming Rooms" subtitle="Loading rooms…">
        <LoadingSpinner label="Loading rooms…" />
      </Layout>
    );
  }

  return (
    <Layout
      title="Gaming Rooms"
      subtitle={`${ROOM_COUNT} rooms · ${rooms.filter((r) => r.device?.status === 'available').length} available`}
      actions={
        <button
          className="ccms-btn ccms-btn-ghost"
          onClick={refetch}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>sync</span>
          Refresh
        </button>
      }
    >
      {data.devices.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon="🚪"
            title="No devices available"
            description="Add devices from the Settings page to assign rooms."
          />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '24px',
          }}
        >
          {rooms.map((room, i) => {
            const isActive = room.device?.status === 'in_use';
            const playMode = playModes[i] ?? 'single';

            return (
              <div
                key={i}
                className="ccms-card ccms-card-hover ccms-stagger"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  borderLeft: `3px solid ${ROOM_ACCENT_COLOR}`,
                  animationDelay: `${i * 80}ms`,
                  boxShadow: isActive
                    ? `0 4px 24px rgba(0,0,0,0.4), -2px 0 16px rgba(0, 194, 255, 0.15)`
                    : undefined,
                }}
              >
                {/* Room header */}
                <div
                  style={{
                    background: ROOM_GRADIENT,
                    padding: '20px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--border-default)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: 'rgba(0, 194, 255, 0.1)',
                        border: '1px solid rgba(0, 194, 255, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '24px', color: ROOM_ACCENT_COLOR }}
                      >
                        {ROOM_ICONS[i]}
                      </span>
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: 'Space Grotesk, sans-serif',
                          fontSize: '22px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                        }}
                      >
                        Room {room.number}
                      </div>
                      <div
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                          letterSpacing: '0.05em',
                          marginTop: '2px',
                        }}
                      >
                        {room.device ? room.device.name : 'UNASSIGNED'}
                      </div>
                    </div>
                  </div>
                  {room.device && <StatusBadge status={room.device.status} />}
                </div>

                {/* Room body */}
                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Device Assignment Selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="ccms-eyebrow">Room Device</span>
                    <select
                      value={room.device?.id ?? ''}
                      onChange={(e) => handleDeviceChange(room.number, e.target.value)}
                      disabled={isActive}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: '13px',
                        fontWeight: 600,
                        fontFamily: 'JetBrains Mono, monospace',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        cursor: isActive ? 'not-allowed' : 'pointer',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                    >
                      <option value="">-- Assign Device --</option>
                      {(data?.devices ?? []).map((dev) => {
                        const assignedToRoom = Object.entries(roomDeviceIds).find(
                          ([roomNumKey, dId]) => dId === dev.id && Number(roomNumKey) !== room.number
                        );
                        const assignedSuffix = assignedToRoom
                          ? ` (Assigned to Room ${assignedToRoom[0]})`
                          : '';
                        return (
                          <option key={dev.id} value={dev.id}>
                            {dev.name} ({dev.type.toUpperCase()}){assignedSuffix}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {!room.device ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '20px 16px',
                        color: 'var(--text-secondary)',
                        fontSize: '13px',
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '32px', display: 'block', marginBottom: '8px', opacity: 0.3 }}
                      >
                        devices
                      </span>
                      Assign a device above to configure the room.
                    </div>
                  ) : (
                    <>
                      {/* Pricing Row */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 0',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        <span className="ccms-eyebrow">Hourly Rate</span>
                        <span
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '13px',
                            color: ROOM_ACCENT_COLOR,
                            fontWeight: 600,
                          }}
                        >
                          {formatCurrency(playMode === 'multiplayer' ? room.device.hourly_rate_multi : room.device.hourly_rate)}/hr
                        </span>
                      </div>

                      {/* Play Mode Toggle */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span className="ccms-eyebrow">Play Mode</span>
                        <div
                          style={{
                            display: 'flex',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            border: '1px solid var(--border-default)',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setPlayModes((p) => ({ ...p, [i]: 'single' }))}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              fontFamily: 'JetBrains Mono, monospace',
                              letterSpacing: '0.03em',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              background: playMode === 'single' ? 'rgba(0, 194, 255, 0.15)' : 'transparent',
                              color: playMode === 'single' ? ROOM_ACCENT_COLOR : 'var(--text-secondary)',
                              borderRight: '1px solid var(--border-default)',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '6px' }}>
                              person
                            </span>
                            Single
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlayModes((p) => ({ ...p, [i]: 'multiplayer' }))}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              fontFamily: 'JetBrains Mono, monospace',
                              letterSpacing: '0.03em',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              background: playMode === 'multiplayer' ? 'rgba(0, 194, 255, 0.15)' : 'transparent',
                              color: playMode === 'multiplayer' ? ROOM_ACCENT_COLOR : 'var(--text-secondary)',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '6px' }}>
                              group
                            </span>
                            Multi
                          </button>
                        </div>
                      </div>

                      {/* Active Session Info */}
                      {isActive && room.session && (
                        <div
                          style={{
                            padding: '14px',
                            background: 'var(--bg-elevated)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-default)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span className="ccms-eyebrow">Customer</span>
                            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                              {room.session.customer ? `@${room.session.customer.username}` : 'Walk-in'}
                            </span>
                          </div>

                          {/* Timer */}
                          {room.session.session_type === 'fixed' && room.session.scheduled_end ? (
                            (() => {
                              const endTime = new Date(room.session.scheduled_end!).getTime();
                              const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
                              const isOvertime = now >= endTime;
                              const hrs = Math.floor(remaining / 3600);
                              const mins = Math.floor((remaining % 3600) / 60);
                              const secs = remaining % 60;

                              if (isOvertime) {
                                const elapsed = Math.floor((now - endTime) / 1000);
                                const eHrs = Math.floor(elapsed / 3600);
                                const eMins = Math.floor((elapsed % 3600) / 60);
                                const eSecs = elapsed % 60;
                                return (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span className="ccms-eyebrow" style={{ color: 'var(--accent-red)' }}>OVERTIME</span>
                                    <span style={{
                                      fontFamily: 'JetBrains Mono, monospace', fontSize: '14px',
                                      color: 'var(--accent-red)', fontWeight: 'bold',
                                      textShadow: '0 0 8px rgba(255,68,102,0.4)',
                                    }}>
                                      +{eHrs > 0 ? eHrs + ':' : ''}{eMins.toString().padStart(2, '0')}:{eSecs.toString().padStart(2, '0')}
                                    </span>
                                  </div>
                                );
                              }

                              return (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                  <span className="ccms-eyebrow">Remaining</span>
                                  <span style={{
                                    fontFamily: 'JetBrains Mono, monospace', fontSize: '14px',
                                    color: ROOM_ACCENT_COLOR, fontWeight: 600,
                                  }}>
                                    {hrs > 0 ? hrs + ':' : ''}{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
                                  </span>
                                </div>
                              );
                            })()
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span className="ccms-eyebrow">Elapsed</span>
                              <span style={{
                                fontFamily: 'JetBrains Mono, monospace', fontSize: '14px',
                                color: 'var(--accent-green)', fontWeight: 600,
                              }}>
                                {formatElapsed(room.session.started_at, now)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Button */}
                      <div style={{ marginTop: 'auto' }}>
                        {room.device.status === 'available' && (
                          <button
                            className="ccms-btn ccms-btn-primary"
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              fontSize: '12px',
                              fontWeight: 700,
                              letterSpacing: '0.05em',
                              background: `linear-gradient(135deg, ${ROOM_ACCENT_COLOR}, rgba(0, 194, 255, 0.75))`,
                              border: 'none',
                            }}
                            onClick={() => {
                              setStartPlayMode(playMode);
                              handleAction(room.device!);
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '8px' }}>
                              play_arrow
                            </span>
                            Start Session
                          </button>
                        )}
                        {room.device.status === 'in_use' && (
                          <button
                            className="ccms-btn ccms-btn-danger"
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              fontSize: '12px',
                              fontWeight: 700,
                              letterSpacing: '0.05em',
                            }}
                            onClick={() => handleAction(room.device!)}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '8px' }}>
                              stop
                            </span>
                            End Session
                          </button>
                        )}
                        {room.device.status !== 'available' && room.device.status !== 'in_use' && (
                          <div
                            style={{
                              textAlign: 'center',
                              padding: '10px',
                              fontSize: '12px',
                              color: 'var(--text-secondary)',
                              fontStyle: 'italic',
                            }}
                          >
                            {room.device.status === 'reserved' ? 'Reserved' : 'Offline'}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Start session modal */}
      {startTarget && (
        <StartSessionModal
          device={startTarget}
          playMode={startPlayMode}
          onClose={() => setStartTarget(null)}
          onDone={() => {
            setStartTarget(null);
            toast('Session started', 'success');
            refetch();
          }}
        />
      )}

      {/* End session modal */}
      {endTarget && (
        <EndSessionModal
          session={endTarget}
          onClose={() => setEndTarget(null)}
          onDone={() => {
            setEndTarget(null);
            toast('Session ended — invoice generated', 'success');
            refetch();
          }}
        />
      )}

      {/* Edit session modal */}
      {editTarget && (
        <EditSessionModal
          session={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => {
            setEditTarget(null);
            toast('Session details updated', 'success');
            refetch();
          }}
        />
      )}
    </Layout>
  );
}
