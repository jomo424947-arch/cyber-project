import { useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { DeviceCard } from '../components/DeviceCard';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { useNow } from '../hooks/useNow';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { 
  StartSessionModal, 
  EndSessionModal, 
  EditSessionModal 
} from '../components/SessionModals';
import type { Device, Session } from '../types';

export default function DevicesPage() {
  const now = useNow(1000);
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { isAdmin } = useAuth();

  const { data, loading, refetch } = useAsync(async () => {
    const [devices, sessions] = await Promise.all([
      dataService.listDevices(),
      dataService.listSessions('active'),
    ]);
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
        <button 
          className="ccms-btn ccms-btn-ghost" 
          onClick={refetch}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>sync</span>
          {language === 'ar' ? 'تحديث' : 'Refresh'}
        </button>
      }
    >
      {data.devices.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon="devices"
            title={language === 'ar' ? 'لا توجد أجهزة مسجلة' : 'No devices yet'}
            description={language === 'ar' ? 'أضف أجهزة من صفحة إعدادات الأمان (المدير) للبدء.' : 'Add devices from the Settings page (admin) to get started.'}
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
              onDeleteDevice={isAdmin ? (dev) => setDeleteTarget(dev) : undefined}
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
