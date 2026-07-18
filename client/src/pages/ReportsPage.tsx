import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Select } from '../components/ui/Select';
import { Table } from '../components/ui/Table';
import { BarChart } from '../components/charts/BarChart';
import { UsageBars } from '../components/charts/UsageBars';
import { HeatStrip } from '../components/charts/HeatStrip';
import { useAsync } from '../hooks/useAsync';
import { dataService } from '../services';
import { formatCurrency } from '../utils/format';
import { DEVICE_TYPE_META } from '../utils/constants';
import type { RevenueReport, UsageReport, LeaderboardEntry } from '../types';

export default function ReportsPage() {
  const { data, loading } = useAsync(async () => {
    const [revenue, usage] = await Promise.all([
      dataService.revenueReport(),
      dataService.usageReport(),
    ]);
    return { revenue, usage } as { revenue: RevenueReport; usage: UsageReport };
  }, []);

  if (loading || !data) {
    return (
      <Layout title="Intelligence Reports" subtitle="Revenue and usage analytics">
        <LoadingSpinner label="Loading reports…" />
      </Layout>
    );
  }

  const { revenue, usage } = data;

  // Revenue bar data — last 14 days, label = day number.
  const revenueBars = revenue.daily.map((d) => ({
    label: new Date(d.date).getDate().toString(),
    value: d.total,
  }));

  // Usage rows sorted by utilization desc.
  const usageRows = [...usage.devices]
    .sort((a, b) => b.minutes_used - a.minutes_used)
    .map((d) => ({
      label: d.name,
      type: DEVICE_TYPE_META[d.type].label,
      icon: DEVICE_TYPE_META[d.type].icon,
      minutes: d.minutes_used,
      utilization: d.utilization,
    }));

  const peakHourCounts = usage.peak_hours.map((h) => h.count);
  const peakHour = usage.peak_hours.reduce((a, b) => (b.count > a.count ? b : a), usage.peak_hours[0]);

  return (
    <Layout title="Intelligence Reports" subtitle="Comprehensive device fleet metrics, peak monitoring, and billing analytics">
      {/* Revenue totals */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        }}
      >
        <RevenueTile label="Today" value={formatCurrency(revenue.totals.today)} accent="var(--accent-cyan)" />
        <RevenueTile label="This Week" value={formatCurrency(revenue.totals.week)} accent="var(--accent-green)" />
        <RevenueTile label="This Month" value={formatCurrency(revenue.totals.month)} accent="var(--accent-purple)" />
        <RevenueTile
          label="Peak Hour"
          value={peakHour ? `${peakHour.hour}:00` : '—'}
          accent="var(--accent-yellow)"
        />
      </div>

      {/* Revenue chart */}
      <div className="ccms-card ccms-stagger" style={{ padding: '24px', marginBottom: '32px' }}>
        <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', margin: 0 }}>
          Revenue — Last 14 Days
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', margin: 0 }}>
          Daily collected revenue across all devices
        </p>
        <BarChart data={revenueBars} height={240} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }} className="report-grid">
        {/* Device usage */}
        <div className="ccms-card ccms-stagger" style={{ padding: '24px' }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', margin: 0 }}>
            Device Fleet Usage — 30 Days
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', margin: 0 }}>
            Total active time per device
          </p>
          {usageRows.every((r) => r.minutes === 0) ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>
              No usage recorded in this period.
            </p>
          ) : (
            <UsageBars rows={usageRows} />
          )}
        </div>

        {/* Peak hours */}
        <div className="ccms-card ccms-stagger" style={{ padding: '24px' }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', margin: 0 }}>
            Peak Operating Hours
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', margin: 0 }}>
            Session starts by hour of day (0–23)
          </p>
          <HeatStrip counts={peakHourCounts} />
          <div style={{ marginTop: '20px', display: 'flex', gap: '16px', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)' }} />
              Quiet
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-cyan)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-cyan)' }} />
              Busy Peak
            </span>
          </div>
        </div>
      </div>

      {/* Leaderboard widget */}
      <LeaderboardWidget />

      <style>{`
        @media (max-width: 860px) {
          .report-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </Layout>
  );
}

function RevenueTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div 
      className="ccms-card" 
      style={{ 
        padding: '24px', 
        borderTop: `1px solid ${accent}` // Redesign spec inner glow
      }}
    >
      <div className="ccms-eyebrow" style={{ marginBottom: '12px' }}>{label}</div>
      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '32px',
          fontWeight: 700,
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LeaderboardWidget() {
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const value = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      options.push({ label, value });
    }
    return options;
  }, []);

  const [month, setMonth] = useState(monthOptions[0].value);

  const { data: leaderboard, loading, error } = useAsync(
    () => dataService.getLeaderboard(month),
    [month]
  );

  return (
    <div className="ccms-card ccms-stagger" style={{ padding: '24px', marginTop: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', margin: 0 }}>
            Top Customers Leaderboard
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Ranked by session count and total hours played
          </p>
        </div>
        <div style={{ minWidth: '180px' }}>
          <Select 
            value={month} 
            onChange={(e) => setMonth(e.target.value)}
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner label="Fetching leaderboard..." />
      ) : error ? (
        <p style={{ color: 'var(--accent-red)', fontSize: '13px', textAlign: 'center', padding: '16px' }}>{error}</p>
      ) : !leaderboard || leaderboard.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '24px' }}>
          No data recorded for this month.
        </p>
      ) : (
        <Table<LeaderboardEntry>
          columns={[
            {
              key: 'rank',
              header: 'Rank',
              width: '60px',
              render: (_, index) => (
                <strong 
                  style={{ 
                    color: index === 0 
                      ? 'var(--accent-yellow)' 
                      : index === 1 
                        ? 'var(--text-secondary)' 
                        : index === 2 
                          ? '#cd7f32' 
                          : 'var(--text-muted)' 
                  }}
                >
                  #{index + 1}
                </strong>
              )
            },
            {
              key: 'username',
              header: 'Username',
              render: (row) => (
                <Link 
                  to={`/customers/${row.customer_id}`} 
                  style={{ color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 600 }}
                >
                  @{row.username}
                </Link>
              )
            },
            {
              key: 'name',
              header: 'Display Name',
              render: (row) => row.name
            },
            {
              key: 'sessions',
              header: 'Sessions Played',
              align: 'right' as const,
              render: (row) => <strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>{row.session_count}</strong>
            },
            {
              key: 'hours',
              header: 'Total Playtime',
              align: 'right' as const,
              render: (row) => <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{row.total_hours} hrs</span>
            },
            {
              key: 'spend',
              header: 'Total Spend',
              align: 'right' as const,
              render: (row) => (
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-green)', fontWeight: 600 }}>
                  {formatCurrency(row.total_spend)}
                </span>
              )
            }
          ]}
          data={leaderboard}
          rowKey={(row) => row.customer_id}
        />
      )}
    </div>
  );
}
