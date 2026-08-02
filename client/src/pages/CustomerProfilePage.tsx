import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { StatCard } from '../components/StatCard';
import { useAsync } from '../hooks/useAsync';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { formatCurrency, formatDuration, formatDateTime } from '../utils/format';
import { DEVICE_TYPE_META } from '../utils/constants';
import type { CustomerProfileData, Session } from '../types';

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, language, isRtl } = useLanguage();

  const { data, loading, error } = useAsync(async () => {
    if (!id) throw new Error('Customer ID is required');
    return dataService.getCustomerProfile(id);
  }, [id]);

  if (loading) {
    return (
      <Layout title={language === 'ar' ? 'ملف تعريف العميل' : 'Customer Profile'} subtitle={t('loading')}>
        <LoadingSpinner label={t('loading')} />
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout title={language === 'ar' ? 'خطأ' : 'Error'} subtitle={language === 'ar' ? 'الملف غير موجود' : 'Profile not found'}>
        <div className="ccms-card" style={{ padding: '24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--accent-red)', marginBottom: '16px' }}>
            {error || (language === 'ar' ? 'فشل تحميل بيانات ملف تعريف العميل.' : 'Failed to load customer profile details.')}
          </p>
          <button className="ccms-btn ccms-btn-primary" onClick={() => navigate('/sessions')}>
            {language === 'ar' ? 'العودة للجلسات' : 'Back to Sessions'}
          </button>
        </div>
      </Layout>
    );
  }

  const { customer, stats, sessions } = data as CustomerProfileData;

  const favoriteMeta = stats.favorite_device_type !== 'none'
    ? DEVICE_TYPE_META[stats.favorite_device_type as keyof typeof DEVICE_TYPE_META]
    : null;

  let localizedFavLabel = favoriteMeta ? favoriteMeta.label : '';
  if (language === 'ar' && favoriteMeta) {
    if (stats.favorite_device_type === 'pc') localizedFavLabel = 'أجهزة الكمبيوتر';
    else if (stats.favorite_device_type === 'console') localizedFavLabel = 'منصات ألعاب (PS/Xbox)';
    else if (stats.favorite_device_type === 'vr') localizedFavLabel = 'أجهزة الواقع الافتراضي';
    else if (stats.favorite_device_type === 'table') localizedFavLabel = 'طربيزات الألعاب';
  }

  return (
    <Layout
      title={language === 'ar' ? `ملف العميل · @${customer.username}` : `Customer Profile · @${customer.username}`}
      subtitle={language === 'ar' ? 'إحصائيات اللاعب التفصيلية وسجل الألعاب المسجل بالكامل' : 'Complete gamer statistics and session history'}
      actions={
        <button 
          className="ccms-btn ccms-btn-ghost" 
          onClick={() => navigate(-1)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
          {language === 'ar' ? 'رجوع' : 'Back'}
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
          borderTop: '1px solid rgba(0, 194, 255, 0.3)',
          textAlign: isRtl ? 'right' : 'left',
        }}
      >
        <div>
          <span className="ccms-eyebrow">{language === 'ar' ? 'الاسم الظاهر' : 'Display Name'}</span>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '24px', color: 'var(--text-primary)', marginTop: '8px', fontWeight: 600, margin: 0 }}>
            {customer.name}
          </h2>
        </div>
        <div>
          <span className="ccms-eyebrow">{language === 'ar' ? 'اسم المستخدم' : 'Username Handle'}</span>
          <div style={{ fontSize: '18px', color: 'var(--accent-cyan)', marginTop: '8px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold' }}>
            @{customer.username}
          </div>
        </div>
        <div>
          <span className="ccms-eyebrow">{language === 'ar' ? 'رقم الهاتف' : 'Contact Phone'}</span>
          <div style={{ color: 'var(--text-primary)', marginTop: '8px', fontSize: '14px', fontFamily: 'JetBrains Mono, monospace' }}>
            {customer.phone || '—'}
          </div>
        </div>
        <div>
          <span className="ccms-eyebrow">{language === 'ar' ? 'تاريخ الانضمام' : 'Date Joined'}</span>
          <div style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '14px' }}>
            {new Date(customer.created_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : undefined, { dateStyle: 'long' })}
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
        <StatCard index={0} icon="history_toggle_off" label={language === 'ar' ? 'إجمالي ساعات اللعب' : 'Total Playtime'} value={`${stats.total_hours} ${language === 'ar' ? 'ساعة' : 'hrs'}`} accent="var(--accent-cyan)" />
        <StatCard index={1} icon="sports_esports" label={language === 'ar' ? 'إجمالي الجلسات' : 'Total Sessions'} value={stats.total_sessions} accent="var(--accent-purple)" />
        <StatCard index={2} icon="credit_card" label={language === 'ar' ? 'إجمالي المشتريات واللعب' : 'Total Spent'} value={formatCurrency(stats.total_spend)} accent="var(--accent-green)" />
        
        {/* Favorite device type custom card */}
        <div
          className="ccms-card-stat ccms-card-stat-hover ccms-stagger group"
          style={{
            animationDelay: '240ms',
            borderTop: '1px solid var(--accent-yellow)',
            position: 'relative',
          }}
        >
          {/* Background Decorative Icon */}
          <div
            className="absolute top-0 right-0 p-4 opacity-[0.06] group-hover:opacity-10 transition-opacity"
            style={{ color: 'var(--accent-yellow)', left: isRtl ? '0' : 'auto', right: isRtl ? 'auto' : '0' }}
          >
            <span className="material-symbols-outlined style-icon text-[72px] leading-none">
              target
            </span>
          </div>

          <div className="flex items-center gap-2 mb-4" style={{ justifyContent: isRtl ? 'flex-start' : undefined }}>
            <span className="material-symbols-outlined text-[16px] leading-none" style={{ color: 'var(--accent-yellow)' }}>
              stars
            </span>
            <span className="font-label-caps text-label-caps text-text-secondary leading-none" style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
              {language === 'ar' ? 'المنصة المفضلة' : 'Favorite Station'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', justifyContent: isRtl ? 'flex-start' : undefined }}>
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
                    {stats.favorite_device_type === 'pc' ? 'desktop_windows' : stats.favorite_device_type === 'console' ? 'sports_esports' : stats.favorite_device_type === 'vr' ? 'smart_display' : 'sports_tennis'}
                  </span>
                  <span>{localizedFavLabel}</span>
                </>
              ) : (
                language === 'ar' ? 'لا يوجد بعد' : 'None yet'
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
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-default)', textAlign: isRtl ? 'right' : 'left' }}>
          <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {language === 'ar' ? 'سجل الجلسات والألعاب' : 'Session History'}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            {language === 'ar' ? 'سجل تفصيلي لجميع الجلسات التي لعبها العميل' : 'Detailed record of all gaming sessions played'}
          </p>
        </div>
        {sessions.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {language === 'ar' ? 'لا توجد جلسات مسجلة لهذا العميل.' : 'No sessions recorded for this customer.'}
          </div>
        ) : (
          <Table
            columns={[
              {
                key: 'device',
                header: language === 'ar' ? 'الجهاز' : 'Device',
                render: (s: Session) => (
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
                      {s.device?.type === 'pc' ? 'desktop_windows' : s.device?.type === 'console' ? 'sports_esports' : s.device?.type === 'vr' ? 'smart_display' : 'sports_tennis'}
                    </span>
                    <span>{s.device?.name ?? (language === 'ar' ? 'جهاز محذوف' : 'Deleted Device')}</span>
                  </strong>
                )
              },
              {
                key: 'type',
                header: language === 'ar' ? 'نوع اللعب' : 'Session Type',
                render: (s: Session) => (
                  <Badge 
                    label={s.session_type === 'fixed' ? (language === 'ar' ? 'وقت محدد' : 'Fixed Time') : (language === 'ar' ? 'وقت مفتوح' : 'Open Time')} 
                    color={s.session_type === 'fixed' ? 'var(--accent-purple)' : 'var(--accent-cyan)'} 
                    bg={s.session_type === 'fixed' ? 'rgba(54, 38, 206, 0.1)' : 'rgba(0, 194, 255, 0.1)'}
                  />
                )
              },
              {
                key: 'date',
                header: language === 'ar' ? 'التاريخ والبدء' : 'Date',
                render: (s: Session) => formatDateTime(s.started_at)
              },
              {
                key: 'duration',
                header: language === 'ar' ? 'المدة بالدقائق' : 'Duration',
                render: (s: Session) => s.status === 'active' ? (
                  <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{language === 'ar' ? 'نشط الآن' : 'Active now'}</span>
                ) : (
                  formatDuration(s.duration_minutes)
                )
              },
              {
                key: 'cost',
                header: language === 'ar' ? 'التكلفة الإجمالية' : 'Total Cost',
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
