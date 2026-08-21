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
  const currentElapsedMins = Math.max(0, Math.ceil(currentElapsedMs / 60000));
  const currentRate = session.play_mode === 'multiplayer'
    ? Number(session.device?.hourly_rate_multi ?? 0)
    : Number(session.device?.hourly_rate ?? 0);
  const effectiveCurrentRate = session.hourly_rate_override !== null && session.hourly_rate_override !== undefined
    ? Number(session.hourly_rate_override)
    : currentRate;
  const currentSegmentCost = Math.round((currentElapsedMins / 60) * effectiveCurrentRate * 100) / 100;

  const handleTransfer = async () => {
    if (!selectedDeviceId) {
      setErrorMsg(language === 'ar' ? 'يرجى اختيار الجهاز أو الغرفة الهدف أولاً' : 'Please select target device');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      await dataService.transferSession(session.id, {
        target_device_id: selectedDeviceId,
        play_mode: playMode,
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
            disabled={!selectedDeviceId || submitting}
            onClick={handleTransfer}
            style={{
              fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>swap_horiz</span>
            {language === 'ar' ? 'تأكيد التحويل الآن' : 'Confirm Transfer'}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {language === 'ar' ? 'الجلسة الحالية:' : 'Current Session:'}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>sports_esports</span>
              {session.device?.name}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>{language === 'ar' ? 'العميل: ' : 'Customer: '}</span>
              <strong style={{ color: 'var(--text-primary)' }}>{session.customer?.name || 'Walk-in'}</strong>
            </div>
            <div style={{ textAlign: isRtl ? 'left' : 'right' }}>
              <span style={{ color: 'var(--text-muted)' }}>{language === 'ar' ? 'الوقت المنقضي: ' : 'Elapsed: '}</span>
              <strong style={{ color: 'var(--accent-cyan)' }}>{currentElapsedMins} {language === 'ar' ? 'دقيقة' : 'mins'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>{language === 'ar' ? 'سعر الساعة الحالي: ' : 'Current Rate: '}</span>
              <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(effectiveCurrentRate)}/{language === 'ar' ? 'س' : 'hr'}</strong>
            </div>
            <div style={{ textAlign: isRtl ? 'left' : 'right' }}>
              <span style={{ color: 'var(--text-muted)' }}>{language === 'ar' ? 'تكلفة المرحلة: ' : 'Segment Cost: '}</span>
              <strong style={{ color: 'var(--accent-green)' }}>{formatCurrency(currentSegmentCost)}</strong>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'rgba(0, 0, 0, 0.25)', padding: '6px 10px', borderRadius: '6px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--accent-cyan)', flexShrink: 0 }}>info</span>
            <span>
              {language === 'ar'
                ? 'سيتم حفظ تكلفة الوقت المنقضي على هذا الجهاز كشريحة أولى، ثم يبدأ العداد على الجهاز الجديد بالتسعيرة الجديدة.'
                : 'Time elapsed on the current device will be billed as segment 1, then a new segment starts on the selected station.'}
            </span>
          </div>
        </div>

        {/* Filter Chips & Search Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span className="ccms-eyebrow" style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
            {language === 'ar' ? 'اختر الجهاز أو الغرفة الهدف المتاحة:' : 'Select Target Available Device/Room:'}
          </span>

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
              padding: '24px',
              textAlign: 'center',
              background: 'var(--bg-input)',
              borderRadius: '8px',
              border: '1px dashed var(--border-default)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '32px', color: 'var(--accent-yellow)', marginBottom: '6px', display: 'block' }}>
              desktop_access_disabled
            </span>
            {language === 'ar'
              ? 'لا توجد أجهزة أو غرف أخرى متاحة حالياً للتحويل إليها.'
              : 'No available devices or rooms found for transfer.'}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '8px',
              maxHeight: '220px',
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

        {/* Play mode selection for destination device */}
        {selectedDevice && (
          <div
            style={{
              padding: '12px',
              background: 'var(--bg-elevated)',
              borderRadius: '8px',
              border: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                {language === 'ar' ? 'نمط اللعب على الجهاز الجديد:' : 'Play Mode on New Device:'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {playMode === 'single'
                  ? `${formatCurrency(selectedDevice.hourly_rate)} / ساعة`
                  : `${formatCurrency(selectedDevice.hourly_rate_multi || selectedDevice.hourly_rate)} / ساعة`}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={playMode === 'single' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => setPlayMode('single')}
              >
                {language === 'ar' ? 'فردي' : 'Single'}
              </button>
              <button
                type="button"
                className={playMode === 'multiplayer' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => setPlayMode('multiplayer')}
              >
                {language === 'ar' ? 'جماعي' : 'Multi'}
              </button>
            </div>
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
