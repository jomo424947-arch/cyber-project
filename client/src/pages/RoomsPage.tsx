import { useMemo, useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { StatusBadge } from '../components/StatusBadge';
import { AddCafeModal } from '../components/AddCafeModal';
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
import { useLanguage } from '../context/LanguageContext';
import type { Device, Session } from '../types';

export interface GamingRoom {
  id: string;
  name: string;
  icon: string;
  deviceId: string;
}

const AVAILABLE_ROOM_ICONS = [
  { id: 'sports_esports', label: 'PlayStation / Console' },
  { id: 'videogame_asset', label: 'Gamepad' },
  { id: 'stadia_controller', label: 'Pro Controller' },
  { id: 'desktop_windows', label: 'PC Station' },
  { id: 'tv', label: 'TV Screen' },
  { id: 'vrpano', label: 'VR Zone' },
  { id: 'meeting_room', label: 'VIP Lounge' },
];

type PlayMode = 'single' | 'multiplayer';

export default function RoomsPage() {
  const now = useNow(1000);
  const { toast } = useToast();
  const { t, language, isRtl } = useLanguage();

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

  // Load custom rooms from localStorage — Default is 0 rooms (empty array)
  const [rooms, setRooms] = useState<GamingRoom[]>(() => {
    try {
      const saved = localStorage.getItem('ccms_gaming_rooms');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persist rooms to localStorage
  useEffect(() => {
    localStorage.setItem('ccms_gaming_rooms', JSON.stringify(rooms));
  }, [rooms]);

  // Play mode per room ID
  const [playModes, setPlayModes] = useState<Record<string, PlayMode>>({});

  // Modals state
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<GamingRoom | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<GamingRoom | null>(null);

  // Session targets
  const [startTarget, setStartTarget] = useState<Device | null>(null);
  const [startPlayMode, setStartPlayMode] = useState<PlayMode>('single');
  const [endTarget, setEndTarget] = useState<Session | null>(null);
  const [editTarget, setEditTarget] = useState<Session | null>(null);
  const [cafeTarget, setCafeTarget] = useState<Session | null>(null);

  const handleCreateOrUpdateRoom = (roomData: Omit<GamingRoom, 'id'> & { id?: string }) => {
    if (roomData.id) {
      // Edit existing room
      setRooms((prev) =>
        prev.map((r) => (r.id === roomData.id ? { ...(roomData as GamingRoom) } : r))
      );
      toast(language === 'ar' ? 'تم تحديث بيانات الغرفة' : 'Room updated', 'success');
    } else {
      // Add new room
      const newRoom: GamingRoom = {
        id: 'room_' + Date.now(),
        name: roomData.name,
        icon: roomData.icon || 'sports_esports',
        deviceId: roomData.deviceId || '',
      };
      setRooms((prev) => [...prev, newRoom]);
      toast(language === 'ar' ? 'تم إضافة الغرفة الجديدة بنجاح' : 'New room added', 'success');
    }
    setShowRoomModal(false);
    setEditingRoom(null);
  };

  const handleDeleteRoom = (roomId: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    toast(language === 'ar' ? 'تم حذف الغرفة' : 'Room deleted', 'success');
    setDeletingRoom(null);
  };

  const handleDeviceChange = (roomId: string, deviceId: string) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, deviceId } : r))
    );
    toast(language === 'ar' ? 'تم تغيير جهاز الغرفة' : 'Room device updated', 'success');
  };

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

  if (loading || !data) {
    return (
      <Layout title={t('rooms')} subtitle={t('loading')}>
        <LoadingSpinner label={t('loading')} />
      </Layout>
    );
  }

  const availableDevicesCount = (data.devices ?? []).filter((d) => d.status === 'available').length;

  return (
    <Layout
      title={t('rooms')}
      subtitle={
        language === 'ar'
          ? `${rooms.length} غرف مسجلة · ${availableDevicesCount} أجهزة متاحة`
          : `${rooms.length} rooms · ${availableDevicesCount} available devices`
      }
      actions={
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button
            onClick={() => {
              setEditingRoom(null);
              setShowRoomModal(true);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
            {language === 'ar' ? 'إضافة غرفة جديدة' : 'Add New Room'}
          </Button>

          <button
            className="ccms-btn ccms-btn-ghost"
            onClick={refetch}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>sync</span>
            {language === 'ar' ? 'تحديث' : 'Refresh'}
          </button>
        </div>
      }
    >
      {rooms.length === 0 ? (
        <div className="ccms-card" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <EmptyState
            icon="meeting_room"
            title={language === 'ar' ? 'لا توجد غرف أو صالات ألعاب مضافة' : 'No Gaming Rooms Added'}
            description={
              language === 'ar'
                ? 'قم بإنشاء صالاتك وغرفك الخاصة لتسهيل إدارة أجهزة البلايستيشن والكمبيوتر والجلسات.'
                : 'Create your custom gaming rooms to easily manage consoles, PCs, and gaming sessions.'
            }
            action={
              <Button
                onClick={() => {
                  setEditingRoom(null);
                  setShowRoomModal(true);
                }}
                style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: isRtl ? 0 : '8px', marginLeft: isRtl ? '8px' : 0 }}>add</span>
                {language === 'ar' ? 'إضافة غرفة جديدة' : 'Add New Room'}
              </Button>
            }
          />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '24px',
          }}
        >
          {rooms.map((room, i) => {
            const device = data.devices.find((d) => d.id === room.deviceId) || null;
            const session = device ? activeByDevice.get(device.id) : undefined;
            const isActive = device?.status === 'in_use';
            const playMode = playModes[room.id] ?? 'single';

            return (
              <div
                key={room.id}
                className="ccms-card ccms-card-hover ccms-stagger"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  borderRadius: '16px',
                  border: isActive ? '1px solid rgba(0, 194, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                  animationDelay: `${i * 60}ms`,
                  boxShadow: isActive
                    ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 194, 255, 0.15)'
                    : '0 4px 20px rgba(0, 0, 0, 0.3)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                }}
              >
                {/* Accent top line */}
                <div
                  style={{
                    height: '3px',
                    width: '100%',
                    background: isActive
                      ? 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))'
                      : device?.status === 'available'
                      ? 'var(--accent-green)'
                      : 'rgba(255, 255, 255, 0.1)',
                  }}
                />

                {/* Room header */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(0, 194, 255, 0.08) 0%, rgba(54, 38, 206, 0.04) 100%)',
                    padding: '20px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: 'rgba(0, 194, 255, 0.12)',
                        border: '1px solid rgba(0, 194, 255, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 12px rgba(0, 194, 255, 0.15)',
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '26px', color: 'var(--accent-cyan)' }}
                      >
                        {room.icon || 'sports_esports'}
                      </span>
                    </div>
                    <div>
                      <h3
                        style={{
                          fontFamily: 'Space Grotesk, sans-serif',
                          fontSize: '20px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          margin: 0,
                          lineHeight: 1.2,
                        }}
                      >
                        {room.name}
                      </h3>
                      <div
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                          marginTop: '4px',
                          fontWeight: 600,
                        }}
                      >
                        {device ? device.name : (language === 'ar' ? 'غير معين' : 'UNASSIGNED')}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {device && <StatusBadge status={device.status} />}
                    
                    {/* Room actions menu */}
                    <button
                      onClick={() => {
                        setEditingRoom(room);
                        setShowRoomModal(true);
                      }}
                      title={language === 'ar' ? 'تعديل الغرفة' : 'Edit Room'}
                      style={{
                        padding: '6px',
                        color: 'var(--text-muted)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-cyan)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                    </button>

                    <button
                      onClick={() => setDeletingRoom(room)}
                      title={language === 'ar' ? 'حذف الغرفة' : 'Delete Room'}
                      style={{
                        padding: '6px',
                        color: 'var(--text-muted)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-red)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                    </button>
                  </div>
                </div>

                {/* Room body */}
                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Device Selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="ccms-eyebrow">{language === 'ar' ? 'جهاز الغرفة' : 'Room Device'}</label>
                    <select
                      value={room.deviceId}
                      onChange={(e) => handleDeviceChange(room.id, e.target.value)}
                      disabled={isActive}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        fontSize: '13px',
                        fontWeight: 600,
                        fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace',
                        background: 'var(--bg-input)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        cursor: isActive ? 'not-allowed' : 'pointer',
                        outline: 'none',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <option value="">{language === 'ar' ? '-- تعيين جهاز للغرفة --' : '-- Assign a device --'}</option>
                      {(data?.devices ?? []).map((dev) => {
                        const assignedToOtherRoom = rooms.find(
                          (other) => other.deviceId === dev.id && other.id !== room.id
                        );
                        const suffix = assignedToOtherRoom
                          ? (language === 'ar' ? ` (معين في ${assignedToOtherRoom.name})` : ` (Assigned to ${assignedToOtherRoom.name})`)
                          : '';
                        return (
                          <option key={dev.id} value={dev.id}>
                            {dev.name} ({dev.type.toUpperCase()}){suffix}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {!device ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '24px 16px',
                        color: 'var(--text-secondary)',
                        fontSize: '13px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: '10px',
                        border: '1px dashed rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '32px', display: 'block', marginBottom: '8px', opacity: 0.4, color: 'var(--accent-cyan)' }}
                      >
                        devices
                      </span>
                      {language === 'ar' ? 'قم بتعيين جهاز من القائمة أعلاه لبدء تشغيل الغرفة.' : 'Assign a device above to configure this room.'}
                    </div>
                  ) : (
                    <>
                      {/* Pricing Row */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 14px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.04)',
                        }}
                      >
                        <span className="ccms-eyebrow">{language === 'ar' ? 'سعر الساعة' : 'Hourly Rate'}</span>
                        <span
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '14px',
                            color: 'var(--accent-cyan)',
                            fontWeight: 700,
                          }}
                        >
                          {formatCurrency(playMode === 'multiplayer' ? device.hourly_rate_multi : device.hourly_rate)}/{language === 'ar' ? 'ساعة' : 'hr'}
                        </span>
                      </div>

                      {/* Play Mode Toggle */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span className="ccms-eyebrow">{language === 'ar' ? 'طريقة اللعب' : 'Play Mode'}</span>
                        <div
                          style={{
                            display: 'flex',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            border: '1px solid var(--border-default)',
                            background: 'var(--bg-input)',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setPlayModes((p) => ({ ...p, [room.id]: 'single' }))}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              background: playMode === 'single' ? 'var(--accent-cyan-dim)' : 'transparent',
                              color: playMode === 'single' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: isRtl ? 0 : '6px', marginLeft: isRtl ? '6px' : 0 }}>
                              person
                            </span>
                            {language === 'ar' ? 'فردي' : 'Single'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlayModes((p) => ({ ...p, [room.id]: 'multiplayer' }))}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              background: playMode === 'multiplayer' ? 'rgba(54, 38, 206, 0.25)' : 'transparent',
                              color: playMode === 'multiplayer' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: isRtl ? 0 : '6px', marginLeft: isRtl ? '6px' : 0 }}>
                              group
                            </span>
                            {language === 'ar' ? 'جماعي' : 'Multi'}
                          </button>
                        </div>
                      </div>

                      {/* Active Session Info Panel */}
                      {isActive && session && (
                        <div
                          style={{
                            padding: '14px 16px',
                            background: 'var(--bg-elevated)',
                            borderRadius: '10px',
                            border: '1px solid rgba(0, 194, 255, 0.2)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="ccms-eyebrow">{language === 'ar' ? 'العميل' : 'Customer'}</span>
                            <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 700 }}>
                              {session.customer?.name && session.customer.name !== 'Walk-in'
                                ? session.customer.name
                                : session.customer?.username && !session.customer.username.startsWith('walkin_')
                                ? `@${session.customer.username}`
                                : (language === 'ar' ? 'عميل بدون حساب' : 'Walk-in')}
                            </span>
                          </div>

                          {/* Timer */}
                          {session.session_type === 'fixed' && session.scheduled_end ? (
                            (() => {
                              const endTime = new Date(session.scheduled_end!).getTime();
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
                                    <span className="ccms-eyebrow" style={{ color: 'var(--accent-red)' }}>{language === 'ar' ? 'وقت إضافي' : 'OVERTIME'}</span>
                                    <span style={{
                                      fontFamily: 'JetBrains Mono, monospace', fontSize: '16px',
                                      color: 'var(--accent-red)', fontWeight: 'bold',
                                      textShadow: '0 0 10px rgba(239, 68, 68, 0.4)',
                                    }}>
                                      +{eHrs > 0 ? eHrs + ':' : ''}{eMins.toString().padStart(2, '0')}:{eSecs.toString().padStart(2, '0')}
                                    </span>
                                  </div>
                                );
                              }

                              return (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                  <span className="ccms-eyebrow">{language === 'ar' ? 'المتبقي' : 'Remaining'}</span>
                                  <span style={{
                                    fontFamily: 'JetBrains Mono, monospace', fontSize: '16px',
                                    color: 'var(--accent-cyan)', fontWeight: 700,
                                  }}>
                                    {hrs > 0 ? hrs + ':' : ''}{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
                                  </span>
                                </div>
                              );
                            })()
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span className="ccms-eyebrow">{language === 'ar' ? 'المنقضي' : 'Elapsed'}</span>
                              <span style={{
                                fontFamily: 'JetBrains Mono, monospace', fontSize: '16px',
                                color: 'var(--accent-green)', fontWeight: 700,
                              }}>
                                {formatElapsed(session.started_at, now)}
                              </span>
                            </div>
                          )}

                          {/* Quick Cafe Order button */}
                          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              className="ccms-btn ccms-btn-ghost"
                              style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                minHeight: '28px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                borderColor: 'var(--accent-cyan)',
                                color: 'var(--accent-cyan)',
                                fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                              }}
                              onClick={() => setCafeTarget(session)}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>local_cafe</span>
                              {language === 'ar' ? 'مشروب +' : '+ Café'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Action Button */}
                      <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                        {device.status === 'available' && (
                          <button
                            className="ccms-btn ccms-btn-primary"
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              fontSize: '13px',
                              fontWeight: 700,
                              border: 'none',
                              fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                            }}
                            onClick={() => {
                              setStartPlayMode(playMode);
                              handleAction(device);
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: isRtl ? 0 : '8px', marginLeft: isRtl ? '8px' : 0 }}>
                              play_arrow
                            </span>
                            {language === 'ar' ? 'بدء اللعب' : 'Start Session'}
                          </button>
                        )}

                        {device.status === 'in_use' && (
                          <button
                            className="ccms-btn ccms-btn-danger"
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              fontSize: '13px',
                              fontWeight: 700,
                              fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                            }}
                            onClick={() => handleAction(device)}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: isRtl ? 0 : '8px', marginLeft: isRtl ? '8px' : 0 }}>
                              stop_circle
                            </span>
                            {language === 'ar' ? 'إنهاء الجلسة' : 'End Session'}
                          </button>
                        )}

                        {device.status !== 'available' && device.status !== 'in_use' && (
                          <div
                            style={{
                              textAlign: 'center',
                              padding: '10px',
                              fontSize: '12px',
                              color: 'var(--text-secondary)',
                              fontStyle: 'italic',
                            }}
                          >
                            {device.status === 'reserved'
                              ? (language === 'ar' ? 'محجوز' : 'Reserved')
                              : (language === 'ar' ? 'غير متصل' : 'Offline')}
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

      {/* Add / Edit Room Modal */}
      {showRoomModal && (
        <RoomFormModal
          initial={editingRoom}
          devices={data.devices}
          rooms={rooms}
          onClose={() => {
            setShowRoomModal(false);
            setEditingRoom(null);
          }}
          onSave={handleCreateOrUpdateRoom}
        />
      )}

      {/* Delete Room Confirmation Modal */}
      {deletingRoom && (
        <Modal
          open
          title={language === 'ar' ? 'تأكيد حذف الغرفة' : 'Confirm Delete Room'}
          onClose={() => setDeletingRoom(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeletingRoom(null)} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
                {t('cancel')}
              </Button>
              <Button variant="danger" onClick={() => handleDeleteRoom(deletingRoom.id)} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
                {t('delete')}
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-primary)', fontSize: '14px', margin: 0 }}>
            {language === 'ar'
              ? `هل أنت أيد أنك تريد حذف "${deletingRoom.name}"؟ لن يؤثر هذا على الجهاز نفسه.`
              : `Are you sure you want to delete "${deletingRoom.name}"? This will not remove the assigned device.`}
          </p>
        </Modal>
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

      {/* Quick Cafe Order Modal */}
      {cafeTarget && (
        <AddCafeModal
          session={cafeTarget}
          onClose={() => setCafeTarget(null)}
          onDone={() => {
            toast(language === 'ar' ? 'تم إضافة الطلب إلى الفاتورة' : 'Café item added to session', 'success');
            refetch();
          }}
        />
      )}
    </Layout>
  );
}

function RoomFormModal({
  initial,
  devices,
  rooms,
  onClose,
  onSave,
}: {
  initial: GamingRoom | null;
  devices: Device[];
  rooms: GamingRoom[];
  onClose: () => void;
  onSave: (data: Omit<GamingRoom, 'id'> & { id?: string }) => void;
}) {
  const { t, language, isRtl } = useLanguage();
  const [name, setName] = useState(initial?.name ?? `غرفة ${rooms.length + 1}`);
  const [icon, setIcon] = useState(initial?.icon ?? 'sports_esports');
  const [deviceId, setDeviceId] = useState(initial?.deviceId ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: initial?.id,
      name: name.trim(),
      icon,
      deviceId,
    });
  };

  return (
    <Modal
      open
      title={
        initial
          ? language === 'ar' ? `تعديل ${initial.name}` : `Edit ${initial.name}`
          : language === 'ar' ? 'إضافة غرفة ألعاب جديدة' : 'Add New Gaming Room'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
            {initial ? t('save') : (language === 'ar' ? 'إضافة الغرفة' : 'Add Room')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <Input
          label={language === 'ar' ? 'اسم الغرفة / الصالة' : 'Room Name'}
          placeholder="مثال: غرفة 1، صالة VIP، بلايستيشن 1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label className="ccms-eyebrow">{language === 'ar' ? 'أيقونة الغرفة' : 'Room Symbol'}</label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {AVAILABLE_ROOM_ICONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIcon(item.id)}
                title={item.label}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  border: icon === item.id ? '2px solid var(--accent-cyan)' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: icon === item.id ? 'rgba(0, 194, 255, 0.15)' : 'var(--bg-input)',
                  color: icon === item.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  boxShadow: icon === item.id ? '0 0 10px rgba(0, 194, 255, 0.3)' : 'none',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>{item.id}</span>
              </button>
            ))}
          </div>
        </div>

        <Select
          label={language === 'ar' ? 'تخصيص جهاز للغرفة' : 'Assign Device'}
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
        >
          <option value="">{language === 'ar' ? '-- بدون جهاز (غير معين) --' : '-- No Device (Unassigned) --'}</option>
          {devices.map((dev) => {
            const assignedOther = rooms.find((r) => r.deviceId === dev.id && r.id !== initial?.id);
            return (
              <option key={dev.id} value={dev.id}>
                {dev.name} ({dev.type.toUpperCase()}){assignedOther ? ` (${language === 'ar' ? 'معين في ' + assignedOther.name : 'Assigned to ' + assignedOther.name})` : ''}
              </option>
            );
          })}
        </Select>
      </form>
    </Modal>
  );
}
