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
      <Layout title="Reports" subtitle="Revenue and usage analytics">
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
    <Layout title="Reports" subtitle="Revenue and usage analytics">
      {/* Revenue totals */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
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
      <div className="ccms-card ccms-stagger" style={{ padding: '24px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Revenue — Last 14 Days
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Daily collected revenue across all devices
        </p>
        <BarChart data={revenueBars} height={240} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="report-grid">
        {/* Device usage */}
        <div className="ccms-card ccms-stagger" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Device Usage — 30 Days
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
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
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Peak Hours
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Session starts by hour of day (0–23)
          </p>
          <HeatStrip counts={peakHourCounts} />
          <div style={{ marginTop: '16px', display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <span>● Quiet</span>
            <span style={{ color: 'var(--accent-cyan)' }}>● Busy</span>
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
    <div className="ccms-card" style={{ padding: '18px', borderTop: `2px solid ${accent}` }}>
      <div className="ccms-eyebrow" style={{ marginBottom: '8px' }}>{label}</div>
      <div
        style={{
          fontFamily: 'Audiowide, sans-serif',
          fontSize: '1.6rem',
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
    <div className="ccms-card ccms-stagger" style={{ padding: '24px', marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Top Customers Leaderboard
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
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
              render: (row) => <strong>{row.session_count}</strong>
            },
            {
              key: 'hours',
              header: 'Total Playtime',
              align: 'right' as const,
              render: (row) => `${row.total_hours} hrs`
            },
            {
              key: 'spend',
              header: 'Total Spend',
              align: 'right' as const,
              render: (row) => (
                <span style={{ fontFamily: 'Audiowide, sans-serif', color: 'var(--accent-green)', fontWeight: 600 }}>
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
