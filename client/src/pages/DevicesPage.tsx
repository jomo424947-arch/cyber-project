import { useMemo, useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { DeviceCard } from '../components/DeviceCard';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useNow } from '../hooks/useNow';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { 
  StartSessionModal, 
  EndSessionModal, 
  EditSessionModal 
} from '../components/SessionModals';
import type { Device, DeviceType, Session, PricingTier } from '../types';

export default function DevicesPage() {
  const now = useNow(1000);
  const { toast } = useToast();
  const { t, language } = useLanguage();

  const { data, loading, refetch } = useAsync(async () => {
    const [allDevices, sessions] = await Promise.all([
      dataService.listDevices(),
      dataService.listSessions('active'),
    ]);
    // Filter out 'table' type devices — they belong to the Rooms/Game Halls page only
    const devices = allDevices.filter((d: Device) => d.type !== 'table');
    return { devices, sessions } as { devices: Device[]; sessions: Session[] };
  }, []);

  // Map device_id → active session for the live timer.
  const activeByDevice = useMemo(() => {
    const map = new Map<string, Session>();
    (data?.sessions ?? []).forEach((s) => map.set(s.device_id, s));
    return map;
  }, [data]);

  const [startTarget, setStartTarget] = useState<Device | null>(null);
  const [endTarget, setEndTarget] = useState<Session | null>(null);
  const [editTarget, setEditTarget] = useState<Session | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const handleAction = (device: Device) => {
    if (device.status === 'in_use') {
      const session = activeByDevice.get(device.id);
      if (session) setEndTarget(session);
    } else if (device.status === 'available') {
      setStartTarget(device);
    } else {
      toast(`${device.name} is ${device.status} — manage it from Reservations or Settings.`, 'info');
    }
  };

  const handleExtendSession = async (session: Session) => {
    try {
      await dataService.extendSession(session.id, 30);
      toast(language === 'ar' ? 'تم تمديد الجلسة بمقدار 30 دقيقة' : 'Session extended by 30 minutes', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not extend session'), 'error');
    }
  };

  const handleDeleteDevice = async () => {
    if (!deleteTarget) return;
    setDeletingLoading(true);
    try {
      await dataService.deleteDevice(deleteTarget.id);
      toast(language === 'ar' ? 'تمت إزالة الجهاز بنجاح' : 'Device removed successfully', 'success');
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not delete device'), 'error');
    } finally {
      setDeletingLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <Layout title={t('devices')} subtitle={t('loading')}>
        <LoadingSpinner label={t('loading')} />
      </Layout>
    );
  }

  return (
    <Layout
      title={t('devices')}
      subtitle={
        language === 'ar'
          ? `${data.devices.length} محطات أجهزة · ${data.devices.filter((d) => d.status === 'available').length} متاح حالياً`
          : `${data.devices.length} stations · ${data.devices.filter((d) => d.status === 'available').length} available`
      }
      actions={
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="ccms-btn ccms-btn-ghost" 
            onClick={refetch}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>sync</span>
            {language === 'ar' ? 'تحيث' : 'Refresh'}
          </button>
          <Button 
            onClick={() => setCreating(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
            {language === 'ar' ? 'إضافة جهاز' : 'Add Device'}
          </Button>
        </div>
      }
    >
      {data.devices.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon="devices"
            title={language === 'ar' ? 'لا توجد أجهزة مسجلة' : 'No devices yet'}
            description={language === 'ar' ? 'أضف أول جهاز لبدء إدارة الصالة.' : 'Add your first device to get started.'}
            action={<Button onClick={() => setCreating(true)}>{language === 'ar' ? 'إضافة جهاز' : 'Add Device'}</Button>}
          />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
            gap: '24px',
          }}
        >
          {data.devices.map((device, i) => (
            <DeviceCard
              key={device.id}
              device={device}
              index={i}
              activeSession={activeByDevice.get(device.id)}
              now={now}
              onAction={handleAction}
              onEditSession={(session) => setEditTarget(session)}
              onExtendSession={handleExtendSession}
              onDeleteDevice={(dev) => setDeleteTarget(dev)}
            />
          ))}
        </div>
      )}

      {/* Start session modal */}
      {startTarget && (
        <StartSessionModal
          device={startTarget}
          onClose={() => setStartTarget(null)}
          onDone={() => {
            setStartTarget(null);
            toast(language === 'ar' ? 'تم بدء اللعب وتنشيط الجهاز' : 'Session started', 'success');
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

      {/* Delete device modal */}
      {/* Create device modal */}
      {creating && (
        <DeviceFormModal
          title={language === 'ar' ? 'تسجيل جهاز جديد' : 'Register New Device'}
          initial={null}
          existingDevices={data.devices}
          onClose={() => setCreating(false)}
          onDone={async (patch) => {
            try {
              await dataService.createDevice(patch as { name: string; type: DeviceType; hourly_rate: number; specs?: Record<string, string> });
              toast(language === 'ar' ? 'تم إضافة الجهاز بنجاح' : 'Device added successfully', 'success');
              refetch();
              setCreating(false);
            } catch (err) {
              toast(apiErrorMessage(err, 'Could not create device'), 'error');
            }
          }}
        />
      )}

      {deleteTarget && (
        <Modal
          open
          title={language === 'ar' ? `حذف الجهاز · ${deleteTarget.name}` : `Delete Device · ${deleteTarget.name}`}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t('cancel')}</Button>
              <Button variant="danger" loading={deletingLoading} onClick={handleDeleteDevice}>
                {t('delete')}
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0, lineHeight: 1.6 }}>
            {language === 'ar'
              ? `هل أنت متأكد من رغبتك في حذف وإزالة الجهاز (${deleteTarget.name}) من النظام نهائياً؟`
              : `Are you sure you want to delete and remove device (${deleteTarget.name}) from the system?`}
          </p>
        </Modal>
      )}
    </Layout>
  );
}

function DeviceFormModal({
  title,
  initial,
  existingDevices = [],
  onClose,
  onDone,
}: {
  title: string;
  initial: Device | null;
  existingDevices?: Device[];
  onClose: () => void;
  onDone: (patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<DeviceType>(initial?.type ?? 'pc');
  const [hourlyRate, setHourlyRate] = useState(String(initial?.hourly_rate ?? ''));
  const [hourlyRateMulti, setHourlyRateMulti] = useState(String(initial?.hourly_rate_multi ?? ''));
  const [specsCpu, setSpecsCpu] = useState((initial?.specs as Record<string, string>)?.CPU ?? '');
  const [specsGpu, setSpecsGpu] = useState((initial?.specs as Record<string, string>)?.GPU ?? '');
  const [specsRam, setSpecsRam] = useState((initial?.specs as Record<string, string>)?.RAM ?? '');
  const [loading, setLoading] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<Record<string, { rate: number; rateMulti: number }>>({});
  const { t, language } = useLanguage();

  const getFallbackFromDevices = (devType: string) => {
    const match = existingDevices.find((d) => d.type === devType);
    if (match) {
      return { rate: match.hourly_rate, rateMulti: match.hourly_rate_multi };
    }
    return null;
  };

  useEffect(() => {
    async function loadPricing() {
      try {
        const tiers = await dataService.getPricing();
        const map: Record<string, { rate: number; rateMulti: number }> = {};
        tiers.forEach((tier: PricingTier) => {
          map[tier.type] = { rate: tier.hourly_rate, rateMulti: tier.hourly_rate_multi };
        });
        setPricingTiers(map);

        if (!initial) {
          const defaultTier = map[type] || getFallbackFromDevices(type);
          if (defaultTier) {
            setHourlyRate(String(defaultTier.rate));
            setHourlyRateMulti(String(defaultTier.rateMulti));
          }
        }
      } catch {
        if (!initial) {
          const defaultTier = getFallbackFromDevices(type);
          if (defaultTier) {
            setHourlyRate(String(defaultTier.rate));
            setHourlyRateMulti(String(defaultTier.rateMulti));
          }
        }
      }
    }
    loadPricing();
  }, []);

  const handleTypeChange = (newType: DeviceType) => {
    setType(newType);
    if (!initial) {
      const tier = pricingTiers[newType] || getFallbackFromDevices(newType);
      if (tier) {
        setHourlyRate(String(tier.rate));
        setHourlyRateMulti(String(tier.rateMulti));
      }
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const specs: Record<string, string> = {};
      if (specsCpu) specs.CPU = specsCpu;
      if (specsGpu) specs.GPU = specsGpu;
      if (specsRam) specs.RAM = specsRam;
      const rate = parseFloat(hourlyRate || '0');
      const rateMulti = parseFloat(hourlyRateMulti || '0');
      if (Number.isNaN(rate) || rate < 0 || Number.isNaN(rateMulti) || rateMulti < 0) {
        throw new Error('Invalid hourly rate');
      }
      const patch: Record<string, unknown> = {
        name,
        type,
        hourly_rate: rate,
        hourly_rate_multi: rateMulti,
        specs: Object.keys(specs).length > 0 ? specs : null,
      };
      await onDone(patch);
    } catch (err) {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const isValid = name.trim() && !Number.isNaN(parseFloat(hourlyRate)) && !Number.isNaN(parseFloat(hourlyRateMulti));

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button loading={loading} disabled={!isValid} onClick={handleSubmit}>
            {initial ? t('save') : (language === 'ar' ? 'تسجيل الجهاز' : 'Add Device')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input label={language === 'ar' ? 'معرّف الجهاز (الاسم)' : 'Device Name'} placeholder="e.g. PS 5, PC-05" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Select label={language === 'ar' ? 'القسم / النوع' : 'Category'} value={type} onChange={(e) => handleTypeChange(e.target.value as DeviceType)}>
          <option value="pc">{language === 'ar' ? 'كمبيوتر مكتبى (PC)' : 'PC'}</option>
          <option value="console">{language === 'ar' ? 'منصة ألعاب (Console)' : 'Console'}</option>
          <option value="vr">{language === 'ar' ? 'واقع افتراضي (VR)' : 'VR'}</option>
        </Select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label={language === 'ar' ? 'سعر الساعة فردي ($)' : 'Single Rate ($/hr)'}
            type="number"
            step="0.5"
            min="0"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
          />
          <Input
            label={language === 'ar' ? 'سعر الساعة جماعي ($)' : 'Multi Rate ($/hr)'}
            type="number"
            step="0.5"
            min="0"
            value={hourlyRateMulti}
            onChange={(e) => setHourlyRateMulti(e.target.value)}
          />
        </div>
        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '14px' }}>
          <span className="ccms-eyebrow">{language === 'ar' ? 'مواصفات العتاد والقطع (اختياري)' : 'Hardware Specifications (optional)'}</span>
        </div>
        <Input label={language === 'ar' ? 'المعالج (CPU)' : 'CPU'} placeholder="e.g. i5-12400F" value={specsCpu} onChange={(e) => setSpecsCpu(e.target.value)} />
        <Input label={language === 'ar' ? 'كرت الشاشة (GPU)' : 'GPU'} placeholder="e.g. RTX 3060" value={specsGpu} onChange={(e) => setSpecsGpu(e.target.value)} />
        <Input label={language === 'ar' ? 'الذاكرة (RAM)' : 'RAM'} placeholder="e.g. 16GB" value={specsRam} onChange={(e) => setSpecsRam(e.target.value)} />
      </div>
    </Modal>
  );
}
