import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { StatCard } from '../components/StatCard';
import { useAsync } from '../hooks/useAsync';
import { dataService } from '../services';
import { formatCurrency, formatDuration, formatDateTime } from '../utils/format';
import { DEVICE_TYPE_META } from '../utils/constants';
import type { CustomerProfileData, Session } from '../types';

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, loading, error } = useAsync(async () => {
    if (!id) throw new Error('Customer ID is required');
    return dataService.getCustomerProfile(id);
  }, [id]);

  if (loading) {
    return (
      <Layout title="Customer Profile" subtitle="Loading profile details...">
        <LoadingSpinner label="Fetching customer records…" />
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout title="Error" subtitle="Profile not found">
        <div className="ccms-card" style={{ padding: '24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--accent-red)', marginBottom: '16px' }}>
            {error || 'Failed to load customer profile details.'}
          </p>
          <button className="ccms-btn ccms-btn-primary" onClick={() => navigate('/sessions')}>
            Back to Sessions
          </button>
        </div>
      </Layout>
    );
  }

  const { customer, stats, sessions } = data as CustomerProfileData;

  const favoriteMeta = stats.favorite_device_type !== 'none'
    ? DEVICE_TYPE_META[stats.favorite_device_type as keyof typeof DEVICE_TYPE_META]
    : null;

  return (
    <Layout
      title={`Customer Profile · @${customer.username}`}
      subtitle="Complete gamer statistics and session history"
      actions={
        <button 
          className="ccms-btn ccms-btn-ghost" 
          onClick={() => navigate(-1)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
          Back
        </button>
      }
    >
      {/* Detail card */}
      <div 
        className="ccms-card ccms-stagger" 
        style={{ 
          padding: '24px', 
          marginBottom: '32px', 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '24px',
          borderTop: '1px solid rgba(0, 194, 255, 0.3)' // Redesign spec inner glow
        }}
      >
        <div>
          <span className="ccms-eyebrow">Display Name</span>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '24px', color: 'var(--text-primary)', marginTop: '8px', fontWeight: 600, margin: 0 }}>
            {customer.name}
          </h2>
        </div>
        <div>
          <span className="ccms-eyebrow">Username Handle</span>
          <div style={{ fontSize: '18px', color: 'var(--accent-cyan)', marginTop: '8px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold' }}>
            @{customer.username}
          </div>
        </div>
        <div>
          <span className="ccms-eyebrow">Contact Phone</span>
          <div style={{ color: 'var(--text-primary)', marginTop: '8px', fontSize: '14px', fontFamily: 'JetBrains Mono, monospace' }}>
            {customer.phone || '—'}
          </div>
        </div>
        <div>
          <span className="ccms-eyebrow">Date Joined</span>
          <div style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '14px' }}>
            {new Date(customer.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })}
          </div>
        </div>
      </div>

      {/* Stats tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '24px',
          marginBottom: '48px',
        }}
      >
        <StatCard index={0} icon="⏱" label="Total Playtime" value={`${stats.total_hours} hrs`} accent="var(--accent-cyan)" />
        <StatCard index={1} icon="🕹" label="Total Sessions" value={stats.total_sessions} accent="var(--accent-purple)" />
        <StatCard index={2} icon="💳" label="Total Spent" value={formatCurrency(stats.total_spend)} accent="var(--accent-green)" />
        
        {/* Favorite device type custom card matching StatCard style */}
        <div
          className="ccms-card-stat ccms-card-stat-hover ccms-stagger group"
          style={{
            animationDelay: '240ms',
            borderTop: '1px solid var(--accent-yellow)', // Inner glow warning
          }}
        >
          {/* Background Decorative Icon */}
          <div
            className="absolute top-0 right-0 p-4 opacity-[0.06] group-hover:opacity-10 transition-opacity"
            style={{ color: 'var(--accent-yellow)' }}
          >
            <span className="material-symbols-outlined style-icon text-[72px] leading-none">
              target
            </span>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[16px] leading-none" style={{ color: 'var(--accent-yellow)' }}>
              stars
            </span>
            <span className="font-label-caps text-label-caps text-text-secondary leading-none">
              Favorite Station
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <div
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '28px',
                fontWeight: 600,
                lineHeight: 1.2,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {favoriteMeta ? (
                <>
                  <span className="material-symbols-outlined" style={{ color: 'var(--accent-yellow)', fontSize: '24px' }}>
                    {stats.favorite_device_type === 'pc' ? 'desktop_windows' : stats.favorite_device_type === 'console' ? 'sports_esports' : 'smart_display'}
                  </span>
                  <span>{favoriteMeta.label}</span>
                </>
              ) : (
                'None yet'
              )}
            </div>
          </div>

          <div style={{ marginTop: '16px', height: '4px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden' }}>
            <div 
              style={{ 
                height: '100%', 
                background: 'var(--accent-yellow)', 
                width: favoriteMeta ? '80%' : '0%', 
                borderRadius: '9999px',
                boxShadow: favoriteMeta ? '0 0 8px var(--accent-yellow)' : 'none',
              }} 
            />
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="ccms-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-default)' }}>
          <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Session History</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            Detailed record of all gaming sessions played
          </p>
        </div>
        {sessions.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No sessions recorded for this customer.
          </div>
        ) : (
          <Table
            columns={[
              {
                key: 'device',
                header: 'Device',
                render: (s: Session) => (
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
                      {s.device?.type === 'pc' ? 'desktop_windows' : s.device?.type === 'console' ? 'sports_esports' : 'smart_display'}
                    </span>
                    <span>{s.device?.name ?? 'Deleted Device'}</span>
                  </strong>
                )
              },
              {
                key: 'type',
                header: 'Session Type',
                render: (s: Session) => (
                  <Badge 
                    label={s.session_type === 'fixed' ? 'Fixed Time' : 'Open Time'} 
                    color={s.session_type === 'fixed' ? 'var(--accent-purple)' : 'var(--accent-cyan)'} 
                    bg={s.session_type === 'fixed' ? 'rgba(54, 38, 206, 0.1)' : 'rgba(0, 194, 255, 0.1)'}
                  />
                )
              },
              {
                key: 'date',
                header: 'Date',
                render: (s: Session) => formatDateTime(s.started_at)
              },
              {
                key: 'duration',
                header: 'Duration',
                render: (s: Session) => s.status === 'active' ? (
                  <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>Active now</span>
                ) : (
                  formatDuration(s.duration_minutes)
                )
              },
              {
                key: 'cost',
                header: 'Total Cost',
                align: 'right' as const,
                render: (s: Session) => s.status === 'active' ? (
                  '—'
                ) : (
                  <span style={{ color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                    {formatCurrency(s.total_cost)}
                  </span>
                )
              }
            ]}
            data={sessions}
            rowKey={(s) => s.id}
          />
        )}
      </div>
    </Layout>
  );
}
