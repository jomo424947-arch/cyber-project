import { useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { DeviceCard } from '../components/DeviceCard';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { useNow } from '../hooks/useNow';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
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
      toast('Session extended by 30 minutes', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not extend session'), 'error');
    }
  };

  if (loading || !data) {
    return (
      <Layout title="Device Fleet" subtitle="Real-time status of all stations">
        <LoadingSpinner label="Loading device fleet…" />
      </Layout>
    );
  }

  return (
    <Layout
      title="Device Fleet"
      subtitle={`${data.devices.length} stations · ${data.devices.filter((d) => d.status === 'available').length} available`}
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
            icon="🖥"
            title="No devices yet"
            description="Add devices from the Settings page (admin) to get started."
          />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
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
