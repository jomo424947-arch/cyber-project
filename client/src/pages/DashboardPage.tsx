import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatCard } from '../components/StatCard';
import { Table } from '../components/ui/Table';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { SessionOrdersRow } from '../components/SessionOrdersRow';
import { EndSessionModal, TransferSessionModal } from '../components/SessionModals';
import { useNow } from '../hooks/useNow';
import { useAsync } from '../hooks/useAsync';
import { useIsMobile } from '../hooks/useIsMobile';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatElapsed, formatCurrency, formatDateTime } from '../utils/format';
import { AddCafeModal } from '../components/AddCafeModal';
import { StartShiftModal, CloseShiftModal, ExpenseModal, ShiftDetailsModal } from '../components/ShiftModals';
import type { Session } from '../types';

export default function DashboardPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const now = useNow(1000);
  const { toast } = useToast();
  const { t, language, isRtl } = useLanguage();
  const [cafeTarget, setCafeTarget] = useState<Session | null>(null);
  const [endTarget, setEndTarget] = useState<Session | null>(null);
  const [transferTarget, setTransferTarget] = useState<Session | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Shift Modals state
  const [showStartShiftModal, setShowStartShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const handlePause = async (session: Session) => {
    try {
      await dataService.pauseSession(session.id);
      toast(language === 'ar' ? 'تم تعليق الجلسة' : 'Session paused', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not pause session'), 'error');
    }
  };

  const handleResume = async (session: Session) => {
    try {
      await dataService.resumeSession(session.id);
      toast(language === 'ar' ? 'تم استئناف الجلسة' : 'Session resumed', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not resume session'), 'error');
    }
  };

  const handleRefresh = async () => {
    setSyncing(true);
    try {
      if (dataService.syncCloud) {
        await dataService.syncCloud();
      }
    } catch (e) {
      // ignore sync errors, refetch local
    }
    await refetch();
    setSyncing(false);
  };

  // Fetch everything in parallel via a single async wrapper.
  const { data, loading, error, refetch } = useAsync(async () => {
    const [devices, sessions, invoices, reservations, revReport, salesReport, activeShift] = await Promise.all([
      dataService.listDevices(),
      dataService.listSessions('active'),
      dataService.listInvoices(),
      dataService.listReservations(),
      dataService.revenueReport().catch(() => null),
      dataService.getProductSalesReport().catch(() => null),
      dataService.getActiveShift().catch(() => null),
    ]);
    return { devices, sessions, invoices, reservations, revReport, salesReport, activeShift };
  }, []);

  const stats = useMemo(() => {
    if (!data) return { active: 0, available: 0, revenue: 0, deviceRevenue: 0, cafeRevenue: 0, pending: 0 };
    const active = data.sessions.length;
    const available = data.devices.filter((d) => d.status === 'available').length;
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const invoiceRevenue = data.invoices
      .filter((i) => i.paid && i.paid_at && new Date(i.paid_at) >= todayStart)
      .reduce((sum, i) => sum + i.amount, 0);

    const cafeRevenue = data.revReport?.totals?.today_cafe ?? 0;
    const deviceRevenue = data.revReport?.totals?.today_device ?? invoiceRevenue;
    const revenue = data.revReport?.totals?.today ?? (deviceRevenue + cafeRevenue);

    const pending = data.reservations.filter((r) => r.status === 'pending').length;
    return { active, available, revenue, deviceRevenue, cafeRevenue, pending };
  }, [data]);

  if (loading) {
    return (
      <Layout title={t('dashboard_title')} subtitle={t('dashboard_subtitle')}>
        <LoadingSpinner label={t('loading')} />
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout title={t('dashboard_title')} subtitle={t('dashboard_subtitle')}>
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
          <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'var(--accent-red)' }}>
            warning
          </span>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
            {t('failed_load_dashboard')}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '480px', margin: 0 }}>
            {error ?? 'An unexpected error occurred.'}
          </p>
          <button className="ccms-btn ccms-btn-primary" onClick={refetch} style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>refresh</span>
            {t('try_again')}
          </button>
        </div>
      </Layout>
    );
  }

  const activeSessions = data.sessions;

  return (
    <Layout
      title=""
      subtitle=""
      currentShift={data.activeShift}
      actions={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '8px' : '10px',
            flexWrap: 'wrap',
            width: isMobile ? '100%' : 'auto',
            maxWidth: '100%',
          }}
        >
          {data.activeShift ? (
            <>
              <button
                className="ccms-btn ccms-btn-ghost"
                onClick={() => setShowExpenseModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  minHeight: '38px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-red)' }}>receipt_long</span>
                <span>{language === 'ar' ? 'تسجيل مصروف' : 'Expense'}</span>
              </button>
              <button
                className="ccms-btn ccms-btn-danger"
                onClick={() => setShowCloseShiftModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  minHeight: '38px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>lock_clock</span>
                <span>{language === 'ar' ? 'إغلاق الوردية' : 'End Shift'}</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowStartShiftModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: '#0066FF',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 700,
                fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(0, 102, 255, 0.3)',
                transition: 'all 0.2s ease',
                flex: isMobile ? '1 1 100%' : 'none',
                minHeight: '38px',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#0052CC')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#0066FF')}
            >
              <span style={{ fontSize: '16px', fontWeight: 900, lineHeight: 1 }}>+</span>
              <span>{language === 'ar' ? 'بدء وردية جديدة' : 'Start Shift'}</span>
            </button>
          )}

          <button
            className="ccms-btn ccms-btn-ghost"
            onClick={() => setShowDetailsModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              minHeight: '38px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(0, 194, 255, 0.3)',
              background: 'rgba(0, 194, 255, 0.08)',
              fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
              cursor: 'pointer',
              flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>analytics</span>
            <span>{language === 'ar' ? 'تفاصيل الوردية' : 'Shift Details'}</span>
          </button>

          <button 
            className="ccms-btn ccms-btn-ghost" 
            onClick={handleRefresh}
            disabled={syncing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              minHeight: '38px',
              padding: '8px 12px',
              fontSize: '12px',
              flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>sync</span>
            <span>{language === 'ar' ? (syncing ? 'مزامنة...' : 'تحديث') : (syncing ? 'Syncing…' : 'Refresh')}</span>
          </button>
        </div>
      }
    >
      {/* Shift Alert Banner if no active shift */}
      {!data.activeShift && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 20px',
            marginBottom: '20px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.12) 0%, rgba(234, 179, 8, 0.05) 100%)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '26px', color: 'var(--accent-yellow)' }}>
            warning_amber
          </span>
          <div>
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)', display: 'block' }}>
              {language === 'ar' ? 'لا توجد وردية عمل مفتوحة حالياً' : 'No Active Work Shift'}
            </strong>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {language === 'ar'
                ? 'لبدء تسجيل فواتير اللعب وحركة النقدية بالدرج، اضغط على زر بدء الوردية.'
                : 'Start a work shift to log cashier revenue and register receipts.'}
            </span>
          </div>
        </div>
      )}
      {/* Stat cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
        {/* Row 1: Operations (2 Cards) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '14px',
          }}
        >
          <StatCard index={0} icon="history_toggle_off" label={t('active_sessions_title')} value={stats.active} accent="var(--accent-red)" />
          <StatCard index={1} icon="devices" label={language === 'ar' ? 'الأجهزة المتاحة' : 'Available PCs'} value={stats.available} accent="var(--accent-green)" />
        </div>

        {/* Row 2: Financial Breakdown (3 Cards) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
          }}
        >
          <StatCard index={2} icon="sports_esports" label={language === 'ar' ? 'أرباح الأجهزة اليوم' : 'Device Revenue Today'} value={formatCurrency(stats.deviceRevenue)} accent="#8b5cf6" />
          <StatCard index={3} icon="local_cafe" label={language === 'ar' ? 'أرباح الكافيه اليوم' : 'Café Revenue Today'} value={formatCurrency(stats.cafeRevenue)} accent="#ffaa00" />
          <StatCard index={4} icon="payments" label={language === 'ar' ? 'إجمالي أرباح اليوم' : 'Total Revenue Today'} value={formatCurrency(stats.revenue)} accent="var(--accent-cyan)" />
        </div>
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
              {t('active_sessions_title')}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
              {activeSessions.length} {language === 'ar' ? 'جلسة تعمل الآن' : `session${activeSessions.length === 1 ? '' : 's'} running now`}
            </p>
          </div>
          <button
            className="ccms-btn ccms-btn-ghost"
            style={{ fontSize: '12px', padding: '8px 16px', minHeight: '36px' }}
            onClick={() => navigate('/sessions')}
          >
            {language === 'ar' ? 'عرض الكل ←' : 'View all →'}
          </button>
        </div>

        {activeSessions.length === 0 ? (
          <EmptyState
            icon="sports_esports"
            title={language === 'ar' ? 'لا توجد جلسات نشطة' : 'No active sessions'}
            description={language === 'ar' ? 'ابدأ جلسة من صفحة الأجهزة لرؤيتها هنا.' : 'Start a session from the Devices page to see it here.'}
          />
        ) : (
          <Table
            columns={[
              {
                key: 'device',
                header: language === 'ar' ? 'الجهاز' : 'Device',
                render: (s) => (
                  <span style={{ fontWeight: 600 }}>{s.device?.name ?? '—'}</span>
                ),
              },
              {
                key: 'customer',
                header: language === 'ar' ? 'العميل' : 'Customer',
                render: (s) => (
                  s.customer?.name && s.customer.name !== 'Walk-in'
                    ? s.customer.name
                    : s.customer?.username && !s.customer.username.startsWith('walkin_')
                    ? `@${s.customer.username}`
                    : (language === 'ar' ? 'عميل بدون حساب' : 'Walk-in')
                ),
              },
              {
                key: 'started',
                header: language === 'ar' ? 'البدء' : 'Started',
                render: (s) => formatDateTime(s.started_at),
              },
              {
                key: 'elapsed',
                header: language === 'ar' ? 'الوقت المنقضي' : 'Elapsed',
                render: (s) => {
                  if (s.is_paused) {
                    return (
                      <span style={{ color: 'var(--accent-yellow)', fontWeight: 'bold' }}>
                        {language === 'ar' ? '⏸ معلّقة' : '⏸ Paused'}
                      </span>
                    );
                  }
                  return (
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        color: 'var(--accent-cyan)',
                        fontWeight: 600,
                      }}
                    >
                      {formatElapsed(s.started_at, now, s.total_paused_minutes)}
                    </span>
                  );
                },
              },
              {
                key: 'rate',
                header: language === 'ar' ? 'السعر' : 'Rate',
                align: 'right',
                render: (s) => {
                  const rate = s.hourly_rate_override !== null
                    ? s.hourly_rate_override
                    : (s.play_mode === 'multiplayer' ? s.device?.hourly_rate_multi : s.device?.hourly_rate) ?? 0;
                  return (
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>
                      {formatCurrency(rate)}/{language === 'ar' ? 'ساعة' : 'hr'}
                    </span>
                  );
                },
              },
              {
                key: 'status',
                header: language === 'ar' ? 'الحالة' : 'Status',
                align: 'right',
                render: (s) => s.device && <StatusBadge status="in_use" />,
              },
              {
                key: 'actions',
                header: language === 'ar' ? 'التحكم' : 'Actions',
                align: 'right',
                render: (s) => (
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {/* Pause / Resume Button */}
                    {!s.is_paused ? (
                      <button
                        type="button"
                        className="ccms-btn ccms-btn-ghost"
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          minHeight: '28px',
                          color: 'var(--accent-yellow)',
                          borderColor: 'rgba(245, 158, 11, 0.4)',
                          fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePause(s);
                        }}
                        title={language === 'ar' ? 'تعليق الجلسة' : 'Pause Session'}
                      >
                        ⏸ {language === 'ar' ? 'تعليق' : 'Pause'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ccms-btn ccms-btn-ghost"
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          minHeight: '28px',
                          color: 'var(--accent-green)',
                          borderColor: 'rgba(34, 197, 94, 0.4)',
                          fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResume(s);
                        }}
                        title={language === 'ar' ? 'استئناف الجلسة' : 'Resume Session'}
                      >
                        ▶ {language === 'ar' ? 'استئناف' : 'Resume'}
                      </button>
                    )}

                    {/* Transfer Button */}
                    <button
                      type="button"
                      className="ccms-btn ccms-btn-ghost"
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        minHeight: '28px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        borderColor: 'rgba(168, 85, 247, 0.4)',
                        color: 'var(--accent-purple)',
                        fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTransferTarget(s);
                      }}
                      title={language === 'ar' ? 'تحويل لجهاز أو غرفة أخرى' : 'Transfer Session'}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>swap_horiz</span>
                      {language === 'ar' ? 'تحويل' : 'Transfer'}
                    </button>

                    {/* Add Cafe Button */}
                    <button
                      type="button"
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
                        fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCafeTarget(s);
                      }}
                      title={language === 'ar' ? 'إضافة طلب كافيه' : 'Add Café Item'}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>local_cafe</span>
                      {language === 'ar' ? 'مشروب +' : '+ Café'}
                    </button>
                  </div>
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
      {transferTarget && (
        <TransferSessionModal
          session={transferTarget}
          onClose={() => setTransferTarget(null)}
          onDone={() => {
            setTransferTarget(null);
            toast(language === 'ar' ? 'تم تحويل الجلسة بنجاح' : 'Session transferred successfully', 'success');
            refetch();
          }}
        />
      )}
      {endTarget && (
        <EndSessionModal
          session={endTarget}
          onClose={() => setEndTarget(null)}
          onDone={() => {
            setEndTarget(null);
            toast(language === 'ar' ? 'تم إنهاء الجلسة وحساب الفاتورة بنجاح' : 'Session ended successfully', 'success');
            refetch();
          }}
        />
      )}
      {/* Shift Modals */}
      <StartShiftModal
        open={showStartShiftModal}
        onClose={() => setShowStartShiftModal(false)}
        onStarted={() => {
          setShowStartShiftModal(false);
          refetch();
        }}
      />
      <CloseShiftModal
        open={showCloseShiftModal}
        shift={data?.activeShift || null}
        onClose={() => setShowCloseShiftModal(false)}
        onClosed={() => {
          setShowCloseShiftModal(false);
          refetch();
        }}
      />
      <ExpenseModal
        open={showExpenseModal}
        shift={data?.activeShift || null}
        onClose={() => setShowExpenseModal(false)}
        onAdded={() => {
          setShowExpenseModal(false);
          refetch();
        }}
      />
      <ShiftDetailsModal
        open={showDetailsModal}
        shift={data?.activeShift || null}
        onClose={() => setShowDetailsModal(false)}
      />
    </Layout>
  );
}
