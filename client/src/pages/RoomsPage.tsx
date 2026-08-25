import { useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { AddCafeModal } from '../components/AddCafeModal';
import { useAsync } from '../hooks/useAsync';
import { usePolling } from '../hooks/usePolling';
import { useIsMobile } from '../hooks/useIsMobile';
import { useNow } from '../hooks/useNow';
import { useToast } from '../context/ToastContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatElapsed } from '../utils/format';
import {
  StartSessionModal,
  EndSessionModal,
  EditSessionModal,
  TransferSessionModal,
} from '../components/SessionModals';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import type { Device, DeviceType, GamingRoom, Session } from '../types';

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
  const isMobile = useIsMobile();
  const now = useNow(1000);
  const { toast } = useToast();
  const { t, language, isRtl } = useLanguage();
  const { isAdmin } = useAuth();

  const { data, loading, refetch } = useAsync(async () => {
    const [rooms, devices, sessions] = await Promise.all([
      dataService.listRooms(),
      dataService.listDevices(),
      dataService.listSessions('active'),
    ]);
    return { rooms, devices, sessions } as {
      rooms: GamingRoom[];
      devices: Device[];
      sessions: Session[];
    };
  }, []);

  // Auto-poll every 15 seconds for cross-instance sync (Desktop ↔ Web ↔ Mobile)
  usePolling(refetch, 15000);

  const activeByDevice = useMemo(() => {
    const map = new Map<string, Session>();
    (data?.sessions ?? []).forEach((s) => map.set(s.device_id, s));
    return map;
  }, [data?.sessions]);

  // Play mode per room ID (for pricing calculation when starting)
  const [playModes, setPlayModes] = useState<Record<string, PlayMode>>({});

  // Modals state
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<GamingRoom | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<GamingRoom | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  // Session targets
  const [startTarget, setStartTarget] = useState<Device | null>(null);
  const [startPlayMode, setStartPlayMode] = useState<PlayMode>('single');
  const [endTarget, setEndTarget] = useState<Session | null>(null);
  const [editTarget, setEditTarget] = useState<Session | null>(null);
  const [transferTarget, setTransferTarget] = useState<Session | null>(null);
  const [cafeTarget, setCafeTarget] = useState<Session | null>(null);

  const handleCreateOrUpdateRoom = async (roomData: {
    id?: string;
    name: string;
    icon: string;
    deviceId: string | null;
    deviceType?: DeviceType;
    hourlyRate: number;
    hourlyRateMulti: number;
  }) => {
    try {
      if (roomData.id) {
        // Edit existing room
        await dataService.updateRoom(roomData.id, {
          name: roomData.name,
          icon: roomData.icon,
          device_id: roomData.deviceId || null,
          hourly_rate: roomData.hourlyRate,
          hourly_rate_multi: roomData.hourlyRateMulti,
        });
        toast(language === 'ar' ? 'تم تحديث بيانات وسعر الغرفة بنجاح' : 'Room & prices updated', 'success');
      } else {
        // Add new room (with dedicated auto-created device or linked device)
        await dataService.createRoom({
          name: roomData.name,
          icon: roomData.icon || 'sports_esports',
          device_id: roomData.deviceId || null,
          type: roomData.deviceType || 'console',
          hourly_rate: roomData.hourlyRate,
          hourly_rate_multi: roomData.hourlyRateMulti,
        });
        toast(language === 'ar' ? 'تم إضافة الغرفة وتحديد سعرها بنجاح' : 'New room & prices added', 'success');
      }
      refetch();
      setShowRoomModal(false);
      setEditingRoom(null);
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not save room'), 'error');
    }
  };

  const handleDeleteRoom = async () => {
    if (!deletingRoom) return;
    setDeletingLoading(true);
    try {
      await dataService.deleteRoom(deletingRoom.id);
      toast(language === 'ar' ? 'تم حذف الغرفة بنجاح' : 'Room deleted successfully', 'success');
      setDeletingRoom(null);
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not delete room'), 'error');
    } finally {
      setDeletingLoading(false);
    }
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

  const handlePauseSession = async (session: Session) => {
    try {
      await dataService.pauseSession(session.id);
      toast(language === 'ar' ? 'تم تعليق الجلسة' : 'Session paused', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not pause session'), 'error');
    }
  };

  const handleResumeSession = async (session: Session) => {
    try {
      await dataService.resumeSession(session.id);
      toast(language === 'ar' ? 'تم استئناف الجلسة' : 'Session resumed', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not resume session'), 'error');
    }
  };

  if (loading || !data) {
    return (
      <Layout title={t('rooms')} subtitle={t('loading')}>
        <LoadingSpinner label={t('loading')} />
      </Layout>
    );
  }

  const roomsList = data.rooms ?? [];
  const availableDevicesCount = roomsList.filter((r) => {
    const dev = r.device_id ? data.devices.find((d) => d.id === r.device_id) : null;
    return dev ? dev.status === 'available' : false;
  }).length;

  return (
    <Layout
      title={t('rooms')}
      subtitle={
        language === 'ar'
          ? `${roomsList.length} غرف مسجلة · ${availableDevicesCount} أجهزة متاحة`
          : `${roomsList.length} rooms · ${availableDevicesCount} available devices`
      }
      actions={
        <div style={{ display: 'flex', gap: isMobile ? '8px' : '10px', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
          {isAdmin && (
            <Button
              onClick={() => {
                setEditingRoom(null);
                setShowRoomModal(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
                minHeight: '38px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
              <span>{language === 'ar' ? 'إضافة غرفة' : 'Add Room'}</span>
            </Button>
          )}

          <button
            className="ccms-btn ccms-btn-ghost"
            onClick={refetch}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
              flex: isMobile ? (isAdmin ? '1 1 calc(50% - 4px)' : '1 1 100%') : 'none',
              minHeight: '38px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>sync</span>
            <span>{language === 'ar' ? 'تحديث' : 'Refresh'}</span>
          </button>
        </div>
      }
    >
      {roomsList.length === 0 ? (
        <div className="ccms-card" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <EmptyState
            icon="meeting_room"
            title={language === 'ar' ? 'لا توجد غرف أو صالات ألعاب مضافة' : 'No Gaming Rooms Added'}
            description={
              language === 'ar'
                ? 'قم بإنشاء صالاتك وغرفك الخاصة لتسهيل إدارة أجهزة البلايستيشن والكمبيوتر والجلسات بدقة واستقرار.'
                : 'Create your custom gaming rooms to easily manage consoles, PCs, and gaming sessions.'
            }
            action={
              isAdmin ? (
                <Button
                  onClick={() => {
                    setEditingRoom(null);
                    setShowRoomModal(true);
                  }}
                  style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', marginRight: isRtl ? 0 : '8px', marginLeft: isRtl ? '8px' : 0 }}>add</span>
                  {language === 'ar' ? 'إضافة غرفة جديدة' : 'Add New Room'}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))',
            gap: '24px',
          }}
        >
          {roomsList.map((room, i) => {
            const device = (room.device_id ? data.devices.find((d) => d.id === room.device_id) : null) || (room.device as Device | null) || null;
            const session = device ? activeByDevice.get(device.id) : undefined;
            const isActive = device?.status === 'in_use';
            const playMode = playModes[room.id] ?? 'single';
            const roomNum = (() => {
              const match = room.name.match(/\d+/);
              return match ? match[0].padStart(2, '0') : String(i + 1).padStart(2, '0');
            })();

            const deviceType = device?.type || 'console';
            const isConsole = deviceType === 'console';
            const bgImage = deviceType === 'table'
              ? './assets/billiards_card_bg.jpg'
              : isConsole
                ? (i % 2 === 0 ? './assets/ps4_card_bg.jpg' : './assets/ps5_card_bg.jpg')
                : './assets/pc_card_bg.jpg';

            const hourlyRate = playMode === 'multiplayer'
              ? (device?.hourly_rate_multi || 30)
              : (device?.hourly_rate || 20);

            return (
              <div
                key={room.id}
                className="ccms-stagger"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  borderRadius: '16px',
                  background: '#090d16',
                  border: isActive
                    ? '1.5px solid rgba(245, 158, 11, 0.7)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: isActive
                    ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 25px rgba(245, 158, 11, 0.25)'
                    : '0 8px 24px rgba(0, 0, 0, 0.4)',
                  animationDelay: `${i * 60}ms`,
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Header Row: Action Buttons & Status (Left) | Room Name & Big Number (Right) */}
                <div
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                  }}
                >
                  {/* Left: Action buttons (Delete, Edit) + Status Pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isAdmin && (
                      <>
                        {/* Delete Room Button */}
                        <button
                          type="button"
                          onClick={() => setDeletingRoom(room)}
                          title={language === 'ar' ? 'حذف الغرفة' : 'Delete Room'}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#ef4444',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                            e.currentTarget.style.borderColor = '#ef4444';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                        </button>

                        {/* Edit Room Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRoom(room);
                            setShowRoomModal(true);
                          }}
                          title={language === 'ar' ? 'تعديل بيانات وسعر الغرفة' : 'Edit Room'}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 194, 255, 0.15)';
                            e.currentTarget.style.color = 'var(--accent-cyan)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                        </button>
                      </>
                    )}

                    {/* Status Pill Badge */}
                    <div
                      style={{
                        padding: '5px 10px',
                        borderRadius: '20px',
                        background: isActive ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        border: `1px solid ${isActive ? 'rgba(245, 158, 11, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: isActive ? '#f59e0b' : '#22c55e',
                          boxShadow: isActive ? '0 0 6px #f59e0b' : '0 0 6px #22c55e',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: isActive ? '#f59e0b' : '#22c55e',
                        }}
                      >
                        {isActive ? (language === 'ar' ? 'مشغولة' : 'In Use') : (language === 'ar' ? 'متاحة' : 'Available')}
                      </span>
                    </div>
                  </div>

                  {/* Right: Room Title + Big Number + Category */}
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {room.name.startsWith('غرفة') || room.name.startsWith('Room') ? '' : room.name}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {language === 'ar' ? 'غرفة' : 'Room'}
                      </span>
                      <span
                        style={{
                          fontFamily: 'Space Grotesk, sans-serif',
                          fontSize: '32px',
                          fontWeight: 900,
                          color: '#FFFFFF',
                          lineHeight: 1,
                        }}
                      >
                        {roomNum}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {deviceType === 'pc' ? 'PC' : deviceType === 'console' ? 'Console' : deviceType === 'table' ? 'Billiards' : 'VR'}
                      </span>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--accent-cyan)' }}>
                        {deviceType === 'pc' ? 'desktop_windows' : deviceType === 'console' ? 'sports_esports' : deviceType === 'table' ? 'sports_tennis' : 'vrpano'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Middle Banner: Setup Image */}
                <div
                  style={{
                    position: 'relative',
                    height: '140px',
                    margin: '0 16px',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    backgroundImage: `url(${bgImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(180deg, rgba(9, 13, 22, 0.2) 0%, rgba(9, 13, 22, 0.75) 100%)',
                    }}
                  />
                  {device && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: isRtl ? '10px' : 'auto',
                        left: isRtl ? 'auto' : '10px',
                        background: 'rgba(9, 13, 22, 0.85)',
                        backdropFilter: 'blur(6px)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        fontSize: '11px',
                        fontFamily: 'JetBrains Mono, monospace',
                        color: 'var(--accent-cyan)',
                        fontWeight: 600,
                      }}
                    >
                      {device.name}
                    </div>
                  )}
                </div>

                {/* Info Stats Row: Rate Block & Play Mode Block */}
                <div
                  style={{
                    padding: '14px 16px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                  }}
                >
                  {/* Rate Block */}
                  <div
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-cyan)' }}>
                      schedule
                    </span>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'JetBrains Mono, monospace' }}>
                        {hourlyRate}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginRight: '4px' }}>
                        {language === 'ar' ? 'ج/ساعة' : '/hr'}
                      </span>
                    </div>
                  </div>

                  {/* Play Mode Block (Clickable to switch mode) */}
                  <div
                    onClick={() => {
                      if (!isActive) {
                        setPlayModes((p) => ({
                          ...p,
                          [room.id]: playMode === 'single' ? 'multiplayer' : 'single',
                        }));
                      }
                    }}
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: isActive ? 'default' : 'pointer',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: playMode === 'single' ? 'var(--accent-cyan)' : 'var(--accent-purple)' }}>
                      {playMode === 'single' ? 'person' : 'group'}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {playMode === 'single' ? (language === 'ar' ? 'فردي' : 'Single') : (language === 'ar' ? 'جماعي' : 'Multi')}
                    </span>
                  </div>
                </div>

                {/* Bottom Section: Action button / Timer & End Session */}
                <div style={{ padding: '0 16px 16px 16px', marginTop: 'auto' }}>
                  {!device ? (
                    <div
                      onClick={() => {
                        setEditingRoom(room);
                        setShowRoomModal(true);
                      }}
                      style={{
                        padding: '10px',
                        textAlign: 'center',
                        fontSize: '12px',
                        color: 'var(--accent-cyan)',
                        border: '1px dashed rgba(0, 194, 255, 0.3)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: 'rgba(0, 194, 255, 0.05)',
                      }}
                    >
                      {language === 'ar' ? '+ تعيين جهاز للغرفة' : '+ Assign Device'}
                    </div>
                  ) : isActive && session ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                        {/* End Session Button */}
                        <button
                          disabled={session.is_paused}
                          onClick={() => setEndTarget(session)}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            background: 'rgba(239, 68, 68, 0.12)',
                            color: '#ef4444',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: session.is_paused ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>stop_circle</span>
                          <span>{language === 'ar' ? 'إنهاء الجلسة' : 'End Session'}</span>
                        </button>

                        {/* Timer Display */}
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            {session.session_type === 'fixed' ? (language === 'ar' ? 'متبقي' : 'Remaining') : (language === 'ar' ? 'منقضي' : 'Elapsed')}
                          </span>
                          <span
                            style={{
                              fontFamily: 'JetBrains Mono, monospace',
                              fontSize: '13px',
                              fontWeight: 800,
                              color: '#FFFFFF',
                            }}
                          >
                            {session.is_paused ? (
                              <span style={{ color: 'var(--accent-yellow)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>pause</span>
                                <span>{language === 'ar' ? 'معلّقة' : 'Paused'}</span>
                              </span>
                            ) : session.session_type === 'fixed' && session.scheduled_end ? (
                              (() => {
                                const endTime = new Date(session.scheduled_end).getTime();
                                const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
                                const hrs = Math.floor(remaining / 3600);
                                const mins = Math.floor((remaining % 3600) / 60);
                                const secs = remaining % 60;
                                return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                              })()
                            ) : (
                              formatElapsed(session.started_at, now, session.total_paused_minutes)
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Secondary Actions: Pause/Resume + Café */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', paddingTop: '4px' }}>
                        {!session.is_paused ? (
                          <button
                            onClick={() => handlePauseSession(session)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid rgba(245, 158, 11, 0.4)',
                              background: 'rgba(245, 158, 11, 0.1)',
                              color: 'var(--accent-yellow)',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>pause</span>
                            <span>{language === 'ar' ? 'تعليق' : 'Pause'}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleResumeSession(session)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid rgba(34, 197, 94, 0.4)',
                              background: 'rgba(34, 197, 94, 0.1)',
                              color: 'var(--accent-green)',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>play_arrow</span>
                            <span>{language === 'ar' ? 'استئناف' : 'Resume'}</span>
                          </button>
                        )}

                        <button
                          onClick={() => setTransferTarget(session)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid rgba(168, 85, 247, 0.4)',
                            background: 'rgba(168, 85, 247, 0.1)',
                            color: 'var(--accent-purple)',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>swap_horiz</span>
                          {language === 'ar' ? 'تحويل' : 'Transfer'}
                        </button>

                        <button
                          onClick={() => setCafeTarget(session)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid rgba(0, 194, 255, 0.4)',
                            background: 'rgba(0, 194, 255, 0.1)',
                            color: 'var(--accent-cyan)',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>local_cafe</span>
                          {language === 'ar' ? 'مشروب +' : '+ Café'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Start Session Button */
                    <button
                      onClick={() => {
                        setStartPlayMode(playMode);
                        handleAction(device);
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid rgba(0, 102, 255, 0.4)',
                        background: 'rgba(0, 102, 255, 0.15)',
                        color: '#38bdf8',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(0, 102, 255, 0.2)',
                        transition: 'background 0.2s, box-shadow 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 102, 255, 0.3)';
                        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 102, 255, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 102, 255, 0.15)';
                        e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 102, 255, 0.2)';
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                        play_arrow
                      </span>
                      <span>{language === 'ar' ? 'بدء اللعب' : 'Start Session'}</span>
                    </button>
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
          rooms={roomsList}
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
              <Button variant="ghost" onClick={() => setDeletingRoom(null)} disabled={deletingLoading} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
                {t('cancel')}
              </Button>
              <Button variant="danger" onClick={handleDeleteRoom} disabled={deletingLoading} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
                {deletingLoading ? (language === 'ar' ? 'جاري الحذف...' : 'Deleting...') : t('delete')}
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-primary)', fontSize: '14px', margin: 0 }}>
            {language === 'ar'
              ? `هل أنت متأكد من رغبتك في حذف "${deletingRoom.name}" نهائياً من النظام؟`
              : `Are you sure you want to permanently delete "${deletingRoom.name}"?`}
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
            toast(language === 'ar' ? 'تم إنهاء الجلسة وحساب الفاتورة' : 'Session ended — invoice generated', 'success');
            refetch();
          }}
        />
      )}

      {/* Transfer session modal */}
      {transferTarget && (
        <TransferSessionModal
          session={transferTarget}
          onClose={() => setTransferTarget(null)}
          onDone={() => {
            setTransferTarget(null);
            toast(language === 'ar' ? 'تم تحويل الجلسة بنجاح' : 'Session transferred successfully', 'success');
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
            toast(language === 'ar' ? 'تم تحديث بيانات الجلسة' : 'Session details updated', 'success');
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
  onSave: (data: {
    id?: string;
    name: string;
    icon: string;
    deviceId: string | null;
    deviceType?: DeviceType;
    hourlyRate: number;
    hourlyRateMulti: number;
  }) => void;
}) {
  const { t, language, isRtl } = useLanguage();
  const [name, setName] = useState(initial?.name ?? `غرفة ${rooms.length + 1}`);
  const [icon, setIcon] = useState(initial?.icon ?? 'sports_esports');
  const [deviceId, setDeviceId] = useState(initial?.device_id ?? '');
  const [deviceType, setDeviceType] = useState<DeviceType>('console');

  // Pre-populate rates from the assigned device (if editing an existing room)
  const existingDevice = initial?.device_id ? devices.find((d) => d.id === initial.device_id) : null;
  const [hourlyRate, setHourlyRate] = useState<number>(existingDevice?.hourly_rate ?? 20);
  const [hourlyRateMulti, setHourlyRateMulti] = useState<number>(existingDevice?.hourly_rate_multi ?? 30);

  // When device selection changes, update rate fields to match the selected device
  const handleDeviceChange = (newDeviceId: string) => {
    setDeviceId(newDeviceId);
    if (newDeviceId) {
      const dev = devices.find((d) => d.id === newDeviceId);
      if (dev) {
        setHourlyRate(dev.hourly_rate);
        setHourlyRateMulti(dev.hourly_rate_multi);
        setDeviceType(dev.type);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: initial?.id,
      name: name.trim(),
      icon,
      deviceId: deviceId || null,
      deviceType,
      hourlyRate,
      hourlyRateMulti,
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
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{item.id}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Pricing Section ─────────────────────────────────── */}
        <div
          style={{
            background: 'rgba(0, 194, 255, 0.04)',
            border: '1px solid rgba(0, 194, 255, 0.15)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-cyan)' }}>
              payments
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                fontFamily: isRtl ? 'Cairo, sans-serif' : 'Space Grotesk, sans-serif',
              }}
            >
              {language === 'ar' ? 'تسعير الغرفة (بالساعة)' : 'Room Pricing (per hour)'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            {/* Single player rate */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                className="ccms-eyebrow"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>person</span>
                {language === 'ar' ? 'سعر الفردي' : 'Single Rate'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    paddingLeft: isRtl ? '14px' : '38px',
                    paddingRight: isRtl ? '38px' : '14px',
                    fontSize: '15px',
                    fontWeight: 700,
                    fontFamily: 'JetBrains Mono, monospace',
                    background: 'var(--bg-input)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    color: 'var(--accent-green)',
                    outline: 'none',
                    transition: 'border-color 0.2s ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)')}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    ...(isRtl ? { right: '12px' } : { left: '12px' }),
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    pointerEvents: 'none',
                  }}
                >
                  {language === 'ar' ? 'ج' : '$'}
                </span>
              </div>
            </div>

            {/* Multiplayer rate */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                className="ccms-eyebrow"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>group</span>
                {language === 'ar' ? 'سعر الجماعي' : 'Multi Rate'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={hourlyRateMulti}
                  onChange={(e) => setHourlyRateMulti(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    paddingLeft: isRtl ? '14px' : '38px',
                    paddingRight: isRtl ? '38px' : '14px',
                    fontSize: '15px',
                    fontWeight: 700,
                    fontFamily: 'JetBrains Mono, monospace',
                    background: 'var(--bg-input)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    color: 'var(--accent-purple)',
                    outline: 'none',
                    transition: 'border-color 0.2s ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-purple)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)')}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    ...(isRtl ? { right: '12px' } : { left: '12px' }),
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    pointerEvents: 'none',
                  }}
                >
                  {language === 'ar' ? 'ج' : '$'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Device selection / auto-creation */}
        <Select
          label={language === 'ar' ? 'تخصيص جهاز للغرفة' : 'Assign Device'}
          value={deviceId}
          onChange={(e) => handleDeviceChange(e.target.value)}
        >
          <option value="">{language === 'ar' ? '-- إنشاء جهاز مخصص لهذه الغرفة تلقائياً --' : '-- Auto-create dedicated station --'}</option>
          {devices.map((dev) => {
            const assignedOther = rooms.find((r) => r.device_id === dev.id && r.id !== initial?.id);
            return (
              <option key={dev.id} value={dev.id} disabled={!!assignedOther}>
                {dev.name} ({dev.type.toUpperCase()}){assignedOther ? ` (${language === 'ar' ? 'معين في ' + assignedOther.name + ' - غير متاح' : 'Assigned to ' + assignedOther.name + ' - Unavailable'})` : ''}
              </option>
            );
          })}
        </Select>

        {!deviceId && (
          <Select
            label={language === 'ar' ? 'نوع الجهاز المخصص للغرفة' : 'Station Type'}
            value={deviceType}
            onChange={(e) => setDeviceType(e.target.value as DeviceType)}
          >
            <option value="console">{language === 'ar' ? 'PlayStation / بلايستيشن (كونسول)' : 'Console / PlayStation'}</option>
            <option value="pc">{language === 'ar' ? 'PC Gaming / كمبيوتر ألعاب' : 'PC Gaming'}</option>
            <option value="table">{language === 'ar' ? 'Billiards / طاولة بلياردو' : 'Billiards / Table'}</option>
            <option value="vr">{language === 'ar' ? 'VR Zone / نظارة واقع افتراضي' : 'VR Zone'}</option>
          </Select>
        )}
      </form>
    </Modal>
  );
}
