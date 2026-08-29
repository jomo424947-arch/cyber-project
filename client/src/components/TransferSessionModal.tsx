import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency } from '../utils/format';
import { getDeviceTypeIcon } from '../utils/constants';
import type { Device, GamingRoom, Session } from '../types';

interface TransferSessionModalProps {
  session: Session;
  onClose: () => void;
  onDone: () => void;
}

export function TransferSessionModal({
  session,
  onClose,
  onDone,
}: TransferSessionModalProps) {
  const { language, isRtl } = useLanguage();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [rooms, setRooms] = useState<GamingRoom[] | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [playMode, setPlayMode] = useState<'single' | 'multiplayer'>(session.play_mode || 'single');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Session Type State for Transfer
  const isInitialFixed = session.session_type === 'fixed';
  const initialRemaining = (isInitialFixed && session.scheduled_end)
    ? Math.max(1, Math.round((new Date(session.scheduled_end).getTime() - Date.now()) / 60000))
    : 60;
  const [sessionType, setSessionType] = useState<'open' | 'fixed'>(session.session_type || 'open');
  const [durationMinutes, setDurationMinutes] = useState<string>(String(initialRemaining));

  // Fetch available devices and rooms
  useEffect(() => {
    setLoading(true);
    Promise.all([dataService.listDevices(), dataService.listRooms()])
      .then(([devs, rms]) => {
        setDevices(devs);
        setRooms(rms);
      })
      .catch((err) => {
        console.error('Failed to fetch devices/rooms for transfer:', err);
        setErrorMsg(apiErrorMessage(err, 'Failed to load available stations'));
      })
      .finally(() => setLoading(false));
  }, []);

  // Filter available devices (excluding current session's device, must be available)
  const availableDevices = useMemo(() => {
    if (!devices) return [];
    return devices.filter((d) => {
      if (d.id === session.device_id) return false;
      if (d.status !== 'available') return false;
      if (filterType !== 'all' && d.type !== filterType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchedName = d.name.toLowerCase().includes(q);
        const matchedRoom = rooms?.some((r) => r.device_id === d.id && r.name.toLowerCase().includes(q));
        if (!matchedName && !matchedRoom) return false;
      }
      return true;
    });
  }, [devices, rooms, session.device_id, filterType, searchQuery]);

  const selectedDevice = useMemo(() => {
    if (!devices || !selectedDeviceId) return null;
    return devices.find((d) => d.id === selectedDeviceId) || null;
  }, [devices, selectedDeviceId]);

  // Current segment calculation
  const currentElapsedMs = Date.now() - new Date(session.started_at).getTime();
  const currentElapsedSec = Math.max(0, Math.floor(currentElapsedMs / 1000));
  const currentElapsedMins = currentElapsedSec > 0 ? Math.max(1, Math.round(currentElapsedSec / 60)) : 0;
  const currentRate = session.play_mode === 'multiplayer'
    ? Number(session.device?.hourly_rate_multi ?? 0)
    : Number(session.device?.hourly_rate ?? 0);
  const effectiveCurrentRate = session.hourly_rate_override !== null && session.hourly_rate_override !== undefined
    ? Number(session.hourly_rate_override)
    : currentRate;
  const currentSegmentCost = Math.round((currentElapsedMins / 60) * effectiveCurrentRate * 100) / 100;

  // Session Type (Open vs Fixed) and Remaining Duration calculation
  const isFixedTime = session.session_type === 'fixed';
  let remainingMins: number | null = null;
  let scheduledEndTimeFormatted = '';
  if (isFixedTime && session.scheduled_end) {
    const endMs = new Date(session.scheduled_end).getTime();
    const nowMs = Date.now();
    const diffSec = Math.floor((endMs - nowMs) / 1000);
    remainingMins = Math.max(0, Math.round(diffSec / 60));
    try {
      scheduledEndTimeFormatted = new Date(session.scheduled_end).toLocaleTimeString(language === 'ar' ? 'ar-EG' : undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      scheduledEndTimeFormatted = '';
    }
  }

  const isChangingPlayModeOnly = !selectedDeviceId && playMode !== (session.play_mode || 'single');
  const isTransferringDevice = Boolean(selectedDeviceId && selectedDeviceId !== session.device_id);
  const isChangingSessionType = sessionType !== (session.session_type || 'open');
  const isChangingDuration = sessionType === 'fixed' && (parseInt(durationMinutes, 10) || 0) !== initialRemaining;
  const canSubmit = isChangingPlayModeOnly || isTransferringDevice || isChangingSessionType || isChangingDuration;

  const handleTransfer = async () => {
    if (!canSubmit) {
      setErrorMsg(language === 'ar' ? 'يرجى اختيار جهاز هدف أو تعديل نوع الجلسة أو نمط اللعب' : 'Please select target device or adjust session settings');
      return;
    }

    if (sessionType === 'fixed' && (!durationMinutes || parseInt(durationMinutes, 10) <= 0)) {
      setErrorMsg(language === 'ar' ? 'يرجى إدخال مدة صحيحة بالدقائق للجلسة المحددة' : 'Please enter a valid duration in minutes');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      await dataService.transferSession(session.id, {
        target_device_id: selectedDeviceId || session.device_id,
        play_mode: playMode,
        session_type: sessionType,
        duration_minutes: sessionType === 'fixed' ? (parseInt(durationMinutes, 10) || 60) : undefined,
      });
      onDone();
    } catch (err: any) {
      setErrorMsg(apiErrorMessage(err, language === 'ar' ? 'فشل تحويل الجلسة' : 'Could not transfer session'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--accent-cyan)', fontSize: '22px' }}>
            swap_horiz
          </span>
          <span>
            {language === 'ar'
              ? `تحويل الجلسة · من ${session.device?.name ?? 'الجهاز الحالي'}`
              : `Transfer Session · from ${session.device?.name ?? 'Current'}`}
          </span>
        </div>
      }
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!canSubmit || submitting}
            onClick={handleTransfer}
            style={{
              fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              {isChangingPlayModeOnly || (!selectedDeviceId && (isChangingSessionType || isChangingDuration))
                ? 'published_with_changes'
                : 'swap_horiz'}
            </span>
            {isChangingPlayModeOnly || (!selectedDeviceId && (isChangingSessionType || isChangingDuration))
              ? (language === 'ar' ? 'تحديث إعدادات الجلسة' : 'Update Session Settings')
              : (language === 'ar' ? 'تأكيد التحويل الآن' : 'Confirm Transfer')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: isRtl ? 'right' : 'left' }}>
        
        {/* Current Session Summary Card */}
        <div
          style={{
            padding: '12px 14px',
            background: 'rgba(0, 194, 255, 0.05)',
            border: '1px solid rgba(0, 194, 255, 0.22)',
            borderRadius: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {language === 'ar' ? 'الجلسة الحالية:' : 'Current Session:'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>sports_esports</span>
                {session.device?.name}
              </span>
              {/* Prominent Session Type Badge */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'rgba(0, 194, 255, 0.15)',
                  border: '1px solid rgba(0, 194, 255, 0.35)',
                  color: 'var(--accent-cyan)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                  {isFixedTime ? 'timer' : 'all_inclusive'}
                </span>
                {isFixedTime ? (language === 'ar' ? 'وقت محدد' : 'Fixed Time') : (language === 'ar' ? 'وقت مفتوح' : 'Open Time')}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>{language === 'ar' ? 'العميل: ' : 'Customer: '}</span>
              <strong style={{ color: 'var(--text-primary)' }}>{session.customer?.name || 'Walk-in'}</strong>
            </div>
            <div style={{ textAlign: isRtl ? 'left' : 'right' }}>
              <span style={{ color: 'var(--text-muted)' }}>{language === 'ar' ? 'نوع الجلسة: ' : 'Time Mode: '}</span>
              <strong style={{ color: 'var(--accent-cyan)' }}>
                {isFixedTime
                  ? (language === 'ar'
                      ? `وقت محدد (${remainingMins !== null ? `متبقي ${remainingMins} د` : ''}${scheduledEndTimeFormatted ? ` حتى ${scheduledEndTimeFormatted}` : ''})`
                      : `Fixed (${remainingMins !== null ? `${remainingMins}m left` : ''}${scheduledEndTimeFormatted ? ` until ${scheduledEndTimeFormatted}` : ''})`)
                  : (language === 'ar' ? 'وقت مفتوح (مستمر)' : 'Open Time')}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>{language === 'ar' ? 'الوقت المنقضي: ' : 'Elapsed: '}</span>
              <strong style={{ color: 'var(--accent-cyan)' }}>{currentElapsedMins} {language === 'ar' ? 'دقيقة' : 'mins'}</strong>
            </div>
            <div style={{ textAlign: isRtl ? 'left' : 'right' }}>
              <span style={{ color: 'var(--text-muted)' }}>{language === 'ar' ? 'تكلفة المرحلة: ' : 'Segment Cost: '}</span>
              <strong style={{ color: 'var(--accent-green)' }}>{formatCurrency(currentSegmentCost)}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>{language === 'ar' ? 'سعر الساعة الحالي: ' : 'Current Rate: '}</span>
              <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(effectiveCurrentRate)}/{language === 'ar' ? 'س' : 'hr'} ({session.play_mode === 'multiplayer' ? (language === 'ar' ? 'جماعي' : 'Multi') : (language === 'ar' ? 'فردي' : 'Single')})</strong>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'rgba(0, 0, 0, 0.25)', padding: '8px 10px', borderRadius: '6px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-cyan)', flexShrink: 0 }}>
              {isFixedTime ? 'timer' : 'info'}
            </span>
            <span>
              {isFixedTime
                ? (language === 'ar'
                    ? `الجلسة محددة المدة — سيتم نقل الوقت المتبقي (${remainingMins !== null ? `${remainingMins} دقيقة` : ''}) تلقائياً للجهاز/الغرفة الجديدة.`
                    : `Fixed duration session — remaining time (${remainingMins !== null ? `${remainingMins} mins` : ''}) will transfer to the new station.`)
                : (language === 'ar'
                    ? 'الجلسة وقت مفتوح — سيتم حفظ تكلفة الوقت المنقضي كشريحة أولى، ويستمر العداد في الجهاز/الغرفة الجديدة بالتسعيرة المحددة.'
                    : 'Open session — elapsed time will be saved as segment 1, and the timer continues on the new station.')}
            </span>
          </div>
        </div>

        {/* 3. Play Mode Switcher (Positioned right here as requested in Image 3) */}
        <div
          style={{
            padding: '12px 14px',
            background: 'rgba(0, 194, 255, 0.05)',
            border: '1px solid rgba(0, 194, 255, 0.22)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
                group
              </span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {language === 'ar' ? 'نمط اللعب (فردي / جماعي):' : 'Play Mode (Single / Multi):'}
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px', display: 'block' }}>
              {selectedDevice
                ? (playMode === 'single'
                    ? `${language === 'ar' ? 'تسعيرة الفردي للجهاز المختار:' : 'Single Rate:'} ${formatCurrency(selectedDevice.hourly_rate)}/س`
                    : `${language === 'ar' ? 'تسعيرة الجماعي للجهاز المختار:' : 'Multi Rate:'} ${formatCurrency(selectedDevice.hourly_rate_multi || selectedDevice.hourly_rate)}/س`)
                : (playMode === 'single'
                    ? `${language === 'ar' ? 'تسعيرة الفردي:' : 'Single Rate:'} ${formatCurrency(session.device?.hourly_rate)}/س`
                    : `${language === 'ar' ? 'تسعيرة الجماعي:' : 'Multi Rate:'} ${formatCurrency(session.device?.hourly_rate_multi || session.device?.hourly_rate)}/س`)}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setPlayMode('single')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: playMode === 'single' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                background: playMode === 'single' ? 'rgba(0, 194, 255, 0.25)' : 'var(--bg-input)',
                color: playMode === 'single' ? '#FFFFFF' : 'var(--text-secondary)',
                fontWeight: playMode === 'single' ? 700 : 500,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: playMode === 'single' ? 'var(--accent-cyan)' : 'inherit' }}>person</span>
              {language === 'ar' ? 'فردي' : 'Single'}
            </button>
            <button
              type="button"
              onClick={() => setPlayMode('multiplayer')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: playMode === 'multiplayer' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                background: playMode === 'multiplayer' ? 'rgba(0, 194, 255, 0.25)' : 'var(--bg-input)',
                color: playMode === 'multiplayer' ? '#FFFFFF' : 'var(--text-secondary)',
                fontWeight: playMode === 'multiplayer' ? 700 : 500,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: playMode === 'multiplayer' ? 'var(--accent-cyan)' : 'inherit' }}>groups</span>
              {language === 'ar' ? 'جماعي' : 'Multi'}
            </button>
          </div>
        </div>

        {/* 4. Session Type Selector (Open vs Fixed) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span className="ccms-eyebrow" style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
            {language === 'ar' ? 'نوع الجلسة' : 'Session Type'}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={sessionType === 'open' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
              style={{
                flex: 1,
                fontSize: '13px',
                fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                height: '42px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                borderRadius: '8px',
              }}
              onClick={() => setSessionType('open')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>all_inclusive</span>
              {language === 'ar' ? 'وقت مفتوح' : 'Open Time'}
            </button>
            <button
              type="button"
              className={sessionType === 'fixed' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
              style={{
                flex: 1,
                fontSize: '13px',
                fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                height: '42px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                borderRadius: '8px',
              }}
              onClick={() => setSessionType('fixed')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>timer</span>
              {language === 'ar' ? 'وقت محدد' : 'Fixed Time'}
            </button>
          </div>
        </div>

        {sessionType === 'fixed' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              background: 'rgba(0, 194, 255, 0.05)',
              border: '1px solid rgba(0, 194, 255, 0.25)',
              padding: '12px 14px',
              borderRadius: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {language === 'ar' ? 'المدة المحددة للجلسة (بالدقائق)*:' : 'Duration (minutes)*:'}
              </label>
              <input
                type="number"
                min="1"
                step="5"
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                style={{
                  width: '120px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(0, 194, 255, 0.4)',
                  background: 'var(--bg-input)',
                  color: 'var(--accent-cyan)',
                  fontSize: '14px',
                  fontWeight: 700,
                  textAlign: 'center',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[15, 30, 45, 60, 90, 120].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDurationMinutes(String(mins))}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: durationMinutes === String(mins) ? '1px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                    background: durationMinutes === String(mins) ? 'rgba(0, 194, 255, 0.25)' : 'var(--bg-input)',
                    color: durationMinutes === String(mins) ? '#FFFFFF' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: durationMinutes === String(mins) ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {mins} {language === 'ar' ? 'دقيقة' : 'm'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter Chips & Search Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="ccms-eyebrow" style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
              {language === 'ar' ? 'أو اختر جهازاً أو غرفة هدف للتحويل إليها:' : 'Or Select Target Device/Room:'}
            </span>
            {selectedDeviceId && (
              <button
                type="button"
                onClick={() => setSelectedDeviceId('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-cyan)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                {language === 'ar' ? 'إلغاء تحديد الجهاز' : 'Deselect station'}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: language === 'ar' ? 'الكل' : 'All' },
              { id: 'console', label: 'PlayStation / Console' },
              { id: 'pc', label: 'PC' },
              { id: 'table', label: language === 'ar' ? 'بلياردو' : 'Billiards' },
              { id: 'vr', label: 'VR' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterType(f.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '16px',
                  border: filterType === f.id ? '1px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                  background: filterType === f.id ? 'rgba(0, 194, 255, 0.18)' : 'var(--bg-elevated)',
                  color: filterType === f.id ? '#FFFFFF' : 'var(--text-secondary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            className="ccms-input"
            placeholder={language === 'ar' ? 'بحث بالاسم...' : 'Search by name...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ fontSize: '12px', padding: '6px 10px' }}
          />
        </div>

        {/* Available Stations Grid */}
        {loading ? (
          <LoadingSpinner label={language === 'ar' ? 'جاري جلب الأجهزة المتاحة...' : 'Loading available stations...'} />
        ) : availableDevices.length === 0 ? (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              background: 'var(--bg-input)',
              borderRadius: '8px',
              border: '1px dashed var(--border-default)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--accent-yellow)', marginBottom: '4px', display: 'block' }}>
              desktop_access_disabled
            </span>
            <span>
              {language === 'ar'
                ? 'لا توجد أجهزة أخرى متاحة حالياً. يمكنك تغيير نمط اللعب (فردي/جماعي) على نفس الجهاز من الأعلى مباشرة.'
                : 'No other stations available. You can switch play mode (Single/Multi) on the same device above.'}
            </span>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '8px',
              maxHeight: '200px',
              overflowY: 'auto',
              padding: '4px',
            }}
          >
            {availableDevices.map((dev) => {
              const isSelected = selectedDeviceId === dev.id;
              const typeIcon = getDeviceTypeIcon(dev.type);
              const room = rooms?.find((r) => r.device_id === dev.id);

              return (
                <div
                  key={dev.id}
                  onClick={() => setSelectedDeviceId(dev.id)}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(0, 194, 255, 0.12)' : 'var(--bg-input)',
                    border: isSelected ? '2px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 0 12px rgba(0, 194, 255, 0.25)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
                      {typeIcon}
                    </span>
                    {isSelected && (
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-green)' }}>
                        check_circle
                      </span>
                    )}
                  </div>

                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {dev.name}
                  </span>

                  {room && (
                    <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                      {room.name}
                    </span>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: 'auto', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <span>فردي: {formatCurrency(dev.hourly_rate)}</span>
                    {Number(dev.hourly_rate_multi) > 0 && <span>جماعي: {formatCurrency(dev.hourly_rate_multi)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {errorMsg && (
          <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '8px 12px', background: 'rgba(255, 68, 102, 0.1)', borderRadius: '6px', border: '1px solid rgba(255, 68, 102, 0.3)' }}>
            {errorMsg}
          </div>
        )}
      </div>
    </Modal>
  );
}
