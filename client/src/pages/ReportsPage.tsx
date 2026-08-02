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
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { formatCurrency } from '../utils/format';
import { DEVICE_TYPE_META } from '../utils/constants';
import type { RevenueReport, UsageReport, LeaderboardEntry } from '../types';

export default function ReportsPage() {
  const { t, language } = useLanguage();
  const { data, loading } = useAsync(async () => {
    const [revenue, usage] = await Promise.all([
      dataService.revenueReport(),
      dataService.usageReport(),
    ]);
    return { revenue, usage } as { revenue: RevenueReport; usage: UsageReport };
  }, []);

  if (loading || !data) {
    return (
      <Layout title={t('reports')} subtitle={t('loading')}>
        <LoadingSpinner label={t('loading')} />
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
    .map((d) => {
      let localizedType = DEVICE_TYPE_META[d.type].label;
      if (language === 'ar') {
        if (d.type === 'pc') localizedType = 'جهاز كمبيوتر';
        else if (d.type === 'console') localizedType = 'جهاز كونسول';
        else if (d.type === 'table') localizedType = 'طربيزة';
        else localizedType = 'شاشة ذكية';
      }
      return {
        label: d.name,
        type: localizedType,
        icon: DEVICE_TYPE_META[d.type].icon,
        minutes: d.minutes_used,
        utilization: d.utilization,
      };
    });

  const peakHourCounts = usage.peak_hours.map((h) => h.count);
  const peakHour = usage.peak_hours.reduce((a, b) => (b.count > a.count ? b : a), usage.peak_hours[0]);

  return (
    <Layout title={t('reports')} subtitle={language === 'ar' ? 'إحصائيات شاملة ومقاييس استخدام الأجهزة وسجلات الإيرادات والمبيعات.' : 'Comprehensive device fleet metrics, peak monitoring, and billing analytics'}>
      {/* Revenue totals */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        }}
      >
        <RevenueTile label={language === 'ar' ? 'اليوم' : 'Today'} value={formatCurrency(revenue.totals.today)} accent="var(--accent-cyan)" />
        <RevenueTile label={language === 'ar' ? 'هذا الأسبوع' : 'This Week'} value={formatCurrency(revenue.totals.week)} accent="var(--accent-green)" />
        <RevenueTile label={language === 'ar' ? 'هذا الشهر' : 'This Month'} value={formatCurrency(revenue.totals.month)} accent="var(--accent-purple)" />
        <RevenueTile
          label={language === 'ar' ? 'ساعة الذروة' : 'Peak Hour'}
          value={peakHour ? `${peakHour.hour}:00` : '—'}
          accent="var(--accent-yellow)"
        />
      </div>

      {/* Revenue chart */}
      <div className="ccms-card ccms-stagger" style={{ padding: '24px', marginBottom: '32px' }}>
        <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', margin: 0 }}>
          {language === 'ar' ? 'الإيرادات — آخر 14 يوماً' : 'Revenue — Last 14 Days'}
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', margin: 0 }}>
          {language === 'ar' ? 'الإيرادات اليومية المحصلة لجميع الأجهزة والأغذية' : 'Daily collected revenue across all devices'}
        </p>
        <BarChart data={revenueBars} height={240} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }} className="report-grid">
        {/* Device usage */}
        <div className="ccms-card ccms-stagger" style={{ padding: '24px' }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', margin: 0 }}>
            {language === 'ar' ? 'استخدام أجهزة الصالة — 30 يوماً' : 'Device Fleet Usage — 30 Days'}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', margin: 0 }}>
            {language === 'ar' ? 'إجمالي وقت النشاط لكل جهاز بالدقائق' : 'Total active time per device'}
          </p>
          {usageRows.every((r) => r.minutes === 0) ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>
              {language === 'ar' ? 'لا توجد سجلات استخدام في هذه الفترة.' : 'No usage recorded in this period.'}
            </p>
          ) : (
            <UsageBars rows={usageRows} />
          )}
        </div>

        {/* Peak hours */}
        <div className="ccms-card ccms-stagger" style={{ padding: '24px' }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', margin: 0 }}>
            {language === 'ar' ? 'ساعات النشاط والتشغيل العالية' : 'Peak Operating Hours'}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', margin: 0 }}>
            {language === 'ar' ? 'جلسات اللعب المفتوحة بحسب الساعة (0–23)' : 'Session starts by hour of day (0–23)'}
          </p>
          <HeatStrip counts={peakHourCounts} />
          <div style={{ marginTop: '20px', display: 'flex', gap: '16px', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)' }} />
              {language === 'ar' ? 'هادئ' : 'Quiet'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-cyan)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-cyan)' }} />
              {language === 'ar' ? 'ذروة وضغط' : 'Busy Peak'}
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
  const { isRtl } = useLanguage();
  return (
    <div 
      className="ccms-card" 
      style={{ 
        padding: '24px', 
        borderTop: `1px solid ${accent}`
      }}
    >
      <div className="ccms-eyebrow" style={{ marginBottom: '12px', textAlign: isRtl ? 'right' : 'left' }}>{label}</div>
      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '32px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          textAlign: isRtl ? 'right' : 'left',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LeaderboardWidget() {
  const { language } = useLanguage();
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' });
      const value = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      options.push({ label, value });
    }
    return options;
  }, [language]);

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
            {language === 'ar' ? 'قائمة العملاء الأكثر لعباً ونشاطاً' : 'Top Customers Leaderboard'}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            {language === 'ar' ? 'مرتبين بحسب عدد الجلسات وإجمالي الساعات التي قضوها باللعب' : 'Ranked by session count and total hours played'}
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
        <LoadingSpinner label={language === 'ar' ? 'جاري جلب القائمة...' : 'Fetching leaderboard...'} />
      ) : error ? (
        <p style={{ color: 'var(--accent-red)', fontSize: '13px', textAlign: 'center', padding: '16px' }}>{error}</p>
      ) : !leaderboard || leaderboard.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '24px' }}>
          {language === 'ar' ? 'لا توجد بيانات مسجلة لهذا الشهر.' : 'No data recorded for this month.'}
        </p>
      ) : (
        <Table<LeaderboardEntry>
          columns={[
            {
              key: 'rank',
              header: language === 'ar' ? 'الترتيب' : 'Rank',
              width: '80px',
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
              header: language === 'ar' ? 'اسم المستخدم' : 'Username',
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
              header: language === 'ar' ? 'الاسم الظاهر' : 'Display Name',
              render: (row) => row.name
            },
            {
              key: 'sessions',
              header: language === 'ar' ? 'الجلسات الملعوبة' : 'Sessions Played',
              align: 'right' as const,
              render: (row) => <strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>{row.session_count}</strong>
            },
            {
              key: 'hours',
              header: language === 'ar' ? 'إجمالي الساعات' : 'Total Playtime',
              align: 'right' as const,
              render: (row) => <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{row.total_hours} {language === 'ar' ? 'ساعة' : 'hrs'}</span>
            },
            {
              key: 'spend',
              header: language === 'ar' ? 'إجمالي الصرف' : 'Total Spend',
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
