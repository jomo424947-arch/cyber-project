import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatCard } from '../components/StatCard';
import { Table } from '../components/ui/Table';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { SessionOrdersRow } from '../components/SessionOrdersRow';
import { EndSessionModal } from '../components/SessionModals';
import { useNow } from '../hooks/useNow';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { dataService } from '../services';
import { formatElapsed, formatCurrency, formatDateTime } from '../utils/format';
import { AddCafeModal } from '../components/AddCafeModal';
import type { Device, Session, Invoice, Reservation } from '../types';

export default function DashboardPage() {
  const navigate = useNavigate();
  const now = useNow(1000);
  const { toast } = useToast();
  const [cafeTarget, setCafeTarget] = useState<Session | null>(null);
  const [endTarget, setEndTarget] = useState<Session | null>(null);

  // Fetch everything in parallel via a single async wrapper.
  const { data, loading, error, refetch } = useAsync(async () => {
    const [devices, sessions, invoices, reservations] = await Promise.all([
      dataService.listDevices(),
      dataService.listSessions('active'),
      dataService.listInvoices(),
      dataService.listReservations(),
    ]);
    return { devices, sessions, invoices, reservations } as {
      devices: Device[];
      sessions: Session[];
      invoices: Invoice[];
      reservations: Reservation[];
    };
  }, []);

  const stats = useMemo(() => {
    if (!data) return { active: 0, available: 0, revenue: 0, pending: 0 };
    const active = data.sessions.length;
    const available = data.devices.filter((d) => d.status === 'available').length;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const revenue = data.invoices
      .filter((i) => i.paid && i.paid_at && new Date(i.paid_at) >= todayStart)
      .reduce((sum, i) => sum + i.amount, 0);
    const pending = data.reservations.filter((r) => r.status === 'pending').length;
    return { active, available, revenue, pending };
  }, [data]);

  if (loading) {
    return (
      <Layout title="Dashboard" subtitle="Live overview of café operations">
        <LoadingSpinner label="Loading dashboard…" />
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout title="Dashboard" subtitle="Live overview of café operations">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 24px',
            gap: '16px',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '48px' }}>⚠️</span>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
            Failed to load dashboard
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '480px', margin: 0 }}>
            {error ?? 'An unexpected error occurred.'}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '520px', margin: 0, opacity: 0.7 }}>
            Make sure the server is running and the database schema has been applied in Supabase.
          </p>
          <button className="ccms-btn ccms-btn-primary" onClick={refetch} style={{ marginTop: '8px' }}>
            ↻ Try again
          </button>
        </div>
      </Layout>
    );
  }

  const activeSessions = data.sessions;

  return (
    <Layout
      title="Dashboard"
      subtitle="Live overview of café operations"
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
      {/* Stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '24px',
          marginBottom: '48px',
        }}
      >
        <StatCard index={0} icon="⏱" label="Active Sessions" value={stats.active} accent="var(--accent-red)" />
        <StatCard index={1} icon="🖥" label="Available PCs" value={stats.available} accent="var(--accent-green)" />
        <StatCard index={2} icon="$" label="Today's Revenue" value={formatCurrency(stats.revenue)} accent="var(--accent-cyan)" />
        <StatCard index={3} icon="📅" label="Pending Reservations" value={stats.pending} accent="var(--accent-yellow)" />
      </div>

      {/* Active sessions */}
      <div className="ccms-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Active Sessions
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
              {activeSessions.length} session{activeSessions.length === 1 ? '' : 's'} running now
            </p>
          </div>
          <button
            className="ccms-btn ccms-btn-ghost"
            style={{ fontSize: '12px', padding: '8px 16px', minHeight: '36px' }}
            onClick={() => navigate('/sessions')}
          >
            View all →
          </button>
        </div>

        {activeSessions.length === 0 ? (
          <EmptyState
            icon="🎮"
            title="No active sessions"
            description="Start a session from the Devices page to see it here."
          />
        ) : (
          <Table
            columns={[
              {
                key: 'device',
                header: 'Device',
                render: (s) => (
                  <span style={{ fontWeight: 600 }}>{s.device?.name ?? '—'}</span>
                ),
              },
              {
                key: 'customer',
                header: 'Customer',
                render: (s) => s.customer?.name ?? 'Walk-in',
              },
              {
                key: 'started',
                header: 'Started',
                render: (s) => formatDateTime(s.started_at),
              },
              {
                key: 'elapsed',
                header: 'Elapsed',
                render: (s) => (
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      color: 'var(--accent-cyan)',
                      fontWeight: 600,
                    }}
                  >
                    {formatElapsed(s.started_at, now)}
                  </span>
                ),
              },
              {
                key: 'rate',
                header: 'Rate',
                align: 'right',
                render: (s) => {
                  const rate = s.hourly_rate_override !== null
                    ? s.hourly_rate_override
                    : (s.play_mode === 'multiplayer' ? s.device?.hourly_rate_multi : s.device?.hourly_rate) ?? 0;
                  return (
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>
                      {formatCurrency(rate)}/hr
                    </span>
                  );
                },
              },
              {
                key: 'status',
                header: 'Status',
                align: 'right',
                render: (s) => (
                  <span style={{ display: 'inline-flex', gap: '12px', alignItems: 'center' }}>
                    {s.device && <StatusBadge status="in_use" />}
                    <button
                      className="ccms-btn ccms-btn-ghost"
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        minHeight: '28px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        borderColor: 'var(--accent-cyan)',
                        color: 'var(--accent-cyan)',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCafeTarget(s);
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>local_cafe</span>
                      + Café
                    </button>
                  </span>
                ),
              },
            ]}
            data={activeSessions}
            rowKey={(s) => s.id}
            renderExpandedRow={(s, expanded) => (
              <SessionOrdersRow session={s} expanded={expanded} onEndSession={(s) => setEndTarget(s)} />
            )}
          />
        )}
      </div>
      {cafeTarget && (
        <AddCafeModal
          session={cafeTarget}
          onClose={() => setCafeTarget(null)}
          onDone={refetch}
        />
      )}
      {endTarget && (
        <EndSessionModal
          session={endTarget}
          onClose={() => setEndTarget(null)}
          onDone={() => {
            setEndTarget(null);
            toast('Session ended successfully', 'success');
            refetch();
          }}
        />
      )}
    </Layout>
  );
}
