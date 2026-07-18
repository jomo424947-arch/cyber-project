import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { RESERVATION_STATUS_META, DEVICE_TYPE_META } from '../utils/constants';
import { formatDateTime, toDateTimeLocalValue } from '../utils/format';
import type { Reservation, Device } from '../types';

type Filter = 'upcoming' | 'all';

export default function ReservationsPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [showCreate, setShowCreate] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data, loading, refetch } = useAsync(async () => {
    const [devices, reservations] = await Promise.all([
      dataService.listDevices(),
      dataService.listReservations(),
    ]);
    return { devices, reservations } as { devices: Device[]; reservations: Reservation[] };
  }, []);

  const reservations = data?.reservations ?? [];
  const visible = useMemo(() => {
    if (filter === 'upcoming') {
      const now = Date.now();
      return reservations.filter(
        (r) => r.status !== 'cancelled' && new Date(r.reserved_until).getTime() >= now
      );
    }
    return reservations;
  }, [reservations, filter]);

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await dataService.updateReservation(id, { status: 'cancelled' });
      toast('Reservation cancelled', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not cancel reservation'), 'error');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <Layout
      title="Reservations"
      subtitle="Manage device bookings and reservations conflict detection"
      actions={
        <Button 
          onClick={() => setShowCreate(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          New Reservation
        </Button>
      }
    >
      {/* Filter row */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {(['upcoming', 'all'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              padding: '10px 20px',
              borderRadius: '8px',
              border: filter === f ? '1px solid var(--accent-cyan)' : '1px solid rgba(255, 255, 255, 0.1)',
              background: filter === f ? 'rgba(0, 194, 255, 0.15)' : 'transparent',
              color: filter === f ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              boxShadow: filter === f ? '0 0 10px rgba(0, 194, 255, 0.2)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {f} Bookings
          </button>
        ))}
      </div>

      {loading || !data ? (
        <LoadingSpinner label="Loading reservations…" />
      ) : visible.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon="📅"
            title="No reservations"
            description="Create a reservation to book a device for a future time slot."
            action={<Button onClick={() => setShowCreate(true)}>+ New Reservation</Button>}
          />
        </div>
      ) : (
        <div className="ccms-card" style={{ overflow: 'hidden' }}>
          <Table
            columns={[
              {
                key: 'device',
                header: 'Device',
                render: (r: Reservation) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
                      {r.device?.type === 'pc' ? 'desktop_windows' : r.device?.type === 'console' ? 'sports_esports' : 'smart_display'}
                    </span>
                    <strong>{r.device?.name ?? '—'}</strong>
                  </span>
                ),
              },
              { key: 'customer', header: 'Customer', render: (r: Reservation) => r.customer?.name ?? 'Walk-in' },
              { key: 'from', header: 'From', render: (r: Reservation) => formatDateTime(r.reserved_from) },
              { key: 'until', header: 'Until', render: (r: Reservation) => formatDateTime(r.reserved_until) },
              {
                key: 'status',
                header: 'Status',
                align: 'right',
                render: (r: Reservation) => {
                  const m = RESERVATION_STATUS_META[r.status];
                  return <Badge label={m.label} color={m.color} bg={m.bg} />;
                },
              },
              {
                key: 'notes',
                header: 'Notes',
                render: (r: Reservation) => (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {r.notes ?? '—'}
                  </span>
                ),
              },
              {
                key: 'action',
                header: '',
                align: 'right',
                render: (r: Reservation) =>
                  r.status === 'cancelled' ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>
                  ) : (
                    <Button
                      variant="ghost"
                      loading={cancellingId === r.id}
                      onClick={() => handleCancel(r.id)}
                      style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--accent-red)', minHeight: '32px' }}
                    >
                      Cancel
                    </Button>
                  ),
              },
            ]}
            data={visible}
            rowKey={(r) => r.id}
          />
        </div>
      )}

      {showCreate && data && (
        <CreateReservationModal
          devices={data.devices}
          onClose={() => setShowCreate(false)}
          onDone={() => {
            setShowCreate(false);
            refetch();
          }}
        />
      )}
    </Layout>
  );
}

function CreateReservationModal({
  devices,
  onClose,
  onDone,
}: {
  devices: Device[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<{ id: string; name: string }[] | null>(null);

  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30 - (d.getMinutes() % 30), 0, 0);
    return d;
  }, []);
  const defaultUntil = useMemo(() => new Date(defaultFrom.getTime() + 60 * 60000), [defaultFrom]);

  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? '');
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [reservedFrom, setReservedFrom] = useState(toDateTimeLocalValue(defaultFrom));
  const [reservedUntil, setReservedUntil] = useState(toDateTimeLocalValue(defaultUntil));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dataService.listCustomers().then(setCustomers).catch(() => setCustomers([]));
  }, []);

  const submit = async () => {
    setLoading(true);
    try {
      await dataService.createReservation({
        device_id: deviceId,
        customer_id: mode === 'existing' && customerId ? customerId : undefined,
        customer_name: mode === 'new' ? name : undefined,
        reserved_from: new Date(reservedFrom).toISOString(),
        reserved_until: new Date(reservedUntil).toISOString(),
        notes: notes || undefined,
      });
      toast('Reservation created', 'success');
      onDone();
    } catch (err) {
      const status = (err as { status?: number }).status;
      const msg = apiErrorMessage(err, 'Could not create reservation');
      toast(status === 409 ? `Conflict: ${msg}` : msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const valid = deviceId && (mode === 'existing' ? customerId : name.trim()) && reservedFrom && reservedUntil;

  return (
    <Modal
      open
      title="New Reservation"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} disabled={!valid} onClick={submit}>
            Create Reservation
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Select label="Device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">Choose a device…</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} — {formatCurrency(d.hourly_rate)}/hr
            </option>
          ))}
        </Select>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={mode === 'new' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
            style={{ flex: 1, fontSize: '11px', minHeight: '36px' }}
            onClick={() => setMode('new')}
          >
            New Customer
          </button>
          <button
            type="button"
            className={mode === 'existing' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
            style={{ flex: 1, fontSize: '11px', minHeight: '36px' }}
            onClick={() => setMode('existing')}
          >
            Existing
          </button>
        </div>

        {mode === 'new' ? (
          <Input
            label="Customer Name"
            placeholder="e.g. Omar Khalid"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        ) : (
          <Select
            label="Select Customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={!customers || customers.length === 0}
          >
            <option value="">
              {customers === null ? 'Loading…' : customers.length === 0 ? 'No customers yet' : 'Choose…'}
            </option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}

        <div className="ccms-grid-form" style={{ gap: '12px' }}>
          <Input
            label="From"
            type="datetime-local"
            value={reservedFrom}
            onChange={(e) => setReservedFrom(e.target.value)}
          />
          <Input
            label="Until"
            type="datetime-local"
            value={reservedUntil}
            onChange={(e) => setReservedUntil(e.target.value)}
          />
        </div>

        <Input
          label="Notes (optional)"
          placeholder="e.g. birthday party booking"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Modal>
  );
}
