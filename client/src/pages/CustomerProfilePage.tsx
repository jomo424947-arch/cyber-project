import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
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
        <button className="ccms-btn ccms-btn-ghost" onClick={() => navigate(-1)}>
          ← Back
        </button>
      }
    >
      {/* Detail card */}
      <div 
        className="ccms-card ccms-stagger" 
        style={{ 
          padding: '24px', 
          marginBottom: '24px', 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '20px',
          borderLeft: '3px solid var(--accent-cyan)'
        }}
      >
        <div>
          <span className="ccms-eyebrow">Display Name</span>
          <h2 style={{ fontSize: '1.4rem', color: 'var(--text-primary)', marginTop: '4px', fontWeight: 700 }}>
            {customer.name}
          </h2>
        </div>
        <div>
          <span className="ccms-eyebrow">Username Handle</span>
          <div style={{ fontSize: '1.2rem', color: 'var(--accent-cyan)', marginTop: '4px', fontFamily: 'Audiowide, sans-serif' }}>
            @{customer.username}
          </div>
        </div>
        <div>
          <span className="ccms-eyebrow">Contact Phone</span>
          <div style={{ color: 'var(--text-primary)', marginTop: '4px', fontSize: '14px' }}>
            {customer.phone || '—'}
          </div>
        </div>
        <div>
          <span className="ccms-eyebrow">Date Joined</span>
          <div style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '13px' }}>
            {new Date(customer.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })}
          </div>
        </div>
      </div>

      {/* Stats tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <StatTile icon="⏱" label="Total Playtime" value={`${stats.total_hours} hrs`} color="var(--accent-cyan)" />
        <StatTile icon="🕹" label="Total Sessions" value={stats.total_sessions} color="var(--accent-purple)" />
        <StatTile icon="💳" label="Total Spent" value={formatCurrency(stats.total_spend)} color="var(--accent-green)" />
        
        <div className="ccms-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 170, 0, 0.15)', color: 'var(--accent-yellow)', fontSize: '20px' }}>
              🎯
            </div>
            <span className="ccms-eyebrow">Favorite Station</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.6rem', fontFamily: 'Audiowide, sans-serif', color: 'var(--text-primary)', lineHeight: 1 }}>
            {favoriteMeta ? (
              <>
                <span style={{ fontSize: '22px' }}>{favoriteMeta.icon}</span>
                <span>{favoriteMeta.label}</span>
              </>
            ) : (
              'None yet'
            )}
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="ccms-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-default)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Session History</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
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
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{s.device ? DEVICE_TYPE_META[s.device.type].icon : '🖥'}</span>
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
                    bg={s.session_type === 'fixed' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(0, 212, 255, 0.15)'}
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
                  <span style={{ color: 'var(--accent-green)', fontFamily: 'Audiowide, sans-serif', fontWeight: 600 }}>
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

function StatTile({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="ccms-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div 
          style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: `${color}22`, 
            color: color, 
            fontSize: '20px' 
          }}
        >
          {icon}
        </div>
        <span className="ccms-eyebrow">{label}</span>
      </div>
      <div 
        style={{ 
          fontFamily: 'Audiowide, sans-serif', 
          fontSize: '1.8rem', 
          color: 'var(--text-primary)', 
          lineHeight: 1 
        }}
      >
        {value}
      </div>
    </div>
  );
}
