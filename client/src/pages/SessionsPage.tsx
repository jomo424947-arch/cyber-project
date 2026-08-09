import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Table } from '../components/ui/Table';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useNow } from '../hooks/useNow';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatElapsed, formatDuration, formatCurrency, formatDateTime } from '../utils/format';
import { 
  EndSessionModal, 
  EditSessionModal, 
  AuditLogModal 
} from '../components/SessionModals';
import { AddCafeModal } from '../components/AddCafeModal';
import type { Session } from '../types';

type Tab = 'active' | 'history';

export default function SessionsPage() {
  const [tab, setTab] = useState<Tab>('active');
  const now = useNow(1000);
  const { toast } = useToast();
  const { t, language, isRtl } = useLanguage();

  const [endTarget, setEndTarget] = useState<Session | null>(null);
  const [editTarget, setEditTarget] = useState<Session | null>(null);
  const [auditTarget, setAuditTarget] = useState<Session | null>(null);
  const [cafeTarget, setCafeTarget] = useState<Session | null>(null);

  const { data, loading, refetch } = useAsync(
    () => dataService.listSessions(),
    []
  );

  const sessions = data ?? [];

  const activeSessions = sessions.filter((s) => s.status === 'active');
  const historySessions = sessions.filter((s) => s.status === 'ended');
  const visible = tab === 'active' ? activeSessions : historySessions;

  const handleExtend = async (session: Session) => {
    try {
      await dataService.extendSession(session.id, 30);
      toast(language === 'ar' ? 'تم تمديد الجلسة بمقدار 30 دقيقة' : 'Session extended by 30 minutes', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not extend session'), 'error');
    }
  };

  return (
    <Layout
      title={t('active_sessions_title')}
      subtitle={language === 'ar' ? 'متابعة الجلسات النشطة حالياً ومراجعة سجل الجلسات السابقة' : 'Track active sessions and review history'}
      actions={
        <button 
          className="ccms-btn ccms-btn-ghost" 
          onClick={refetch}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>sync</span>
          {language === 'ar' ? 'تحديث' : 'Refresh'}
        </button>
      }
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-default)' }}>
        <TabButton active={tab === 'active'} onClick={() => setTab('active')} isRtl={isRtl}>
          {language === 'ar' ? `نشطة (${activeSessions.length})` : `Active (${activeSessions.length})`}
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')} isRtl={isRtl}>
          {language === 'ar' ? `السجل (${historySessions.length})` : `History (${historySessions.length})`}
        </TabButton>
      </div>

      {loading ? (
        <LoadingSpinner label={t('loading')} />
      ) : visible.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon={tab === 'active' ? 'history_toggle_off' : 'receipt_long'}
            title={
              tab === 'active' 
                ? (language === 'ar' ? 'لا توجد جلسات نشطة' : 'No active sessions') 
                : (language === 'ar' ? 'لا يوجد سجل للجلسات بعد' : 'No session history yet')
            }
            description={
              tab === 'active'
                ? (language === 'ar' ? 'ابدأ جلسة لعب من صفحة الأجهزة لبدء المتابعة.' : 'Start a session from the Devices page to begin tracking.')
                : (language === 'ar' ? 'الجلسات المنتهية ستظهر هنا مع تكلفتها ومدتها.' : 'Ended sessions will appear here with their cost and duration.')
            }
          />
        </div>
      ) : (
        <div className="ccms-card" style={{ overflow: 'hidden' }}>
          <Table
            columns={
              tab === 'active'
                ? [
                    { 
                      key: 'device', 
                      header: language === 'ar' ? 'الجهاز' : 'Device', 
                      render: (s: Session) => <strong>{s.device?.name ?? '—'}</strong> 
                    },
                    { 
                      key: 'customer', 
                      header: language === 'ar' ? 'العميل' : 'Customer', 
                      render: (s: Session) => {
                        const hasCustomName = s.customer?.name && s.customer.name !== 'Walk-in';
                        const isRegistered = s.customer?.username && !s.customer.username.startsWith('walkin_');
                        if (hasCustomName) {
                          return <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.customer!.name}</span>;
                        }
                        if (isRegistered) {
                          return (
                            <Link 
                              to={`/customers/${s.customer_id}`} 
                              style={{ color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 600 }}
                            >
                              @{s.customer!.username}
                            </Link>
                          );
                        }
                        return <span style={{ color: 'var(--text-secondary)' }}>{language === 'ar' ? 'عميل بدون حساب' : 'Walk-in'}</span>;
                      }
                    },
                    { 
                      key: 'started', 
                      header: language === 'ar' ? 'البدء' : 'Started', 
                      render: (s: Session) => formatDateTime(s.started_at) 
                    },
                    {
                      key: 'elapsed',
                      header: language === 'ar' ? 'حالة الوقت' : 'Time Status',
                      render: (s: Session) => {
                        if (s.session_type === 'fixed' && s.scheduled_end) {
                          const endTime = new Date(s.scheduled_end).getTime();
                          const graceMins = s.grace_period_minutes || 0;
                          const graceTime = endTime + graceMins * 60000;
                          const isGrace = now >= endTime && now < graceTime;
                          const isOvertime = now >= graceTime;

                          if (isGrace) {
                            const remainingGrace = Math.max(0, Math.floor((graceTime - now) / 1000));
                            const mins = Math.floor(remainingGrace / 60);
                            const secs = remainingGrace % 60;
                            return (
                              <span style={{ color: 'var(--accent-yellow)', fontWeight: 'bold', fontFamily: 'JetBrains Mono, monospace' }}>
                                {language === 'ar' ? 'فترة سماح' : 'Grace'} {mins}:{secs.toString().padStart(2, '0')}
                              </span>
                            );
                          }

                          if (isOvertime) {
                            const overtimeElapsed = Math.floor((now - endTime) / 1000);
                            const hrs = Math.floor(overtimeElapsed / 3600);
                            const mins = Math.floor((overtimeElapsed % 3600) / 60);
                            const secs = overtimeElapsed % 60;
                            return (
                              <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', fontFamily: 'JetBrains Mono, monospace' }}>
                                {language === 'ar' ? 'وقت إضافي +' : 'Overtime +'}{hrs > 0 ? hrs + ':' : ''}{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
                              </span>
                            );
                          }

                          const remainingSeconds = Math.max(0, Math.floor((endTime - now) / 1000));
                          const hrs = Math.floor(remainingSeconds / 3600);
                          const mins = Math.floor((remainingSeconds % 3600) / 60);
                          const secs = remainingSeconds % 60;
                          return (
                            <span style={{ color: 'var(--accent-cyan)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                              {hrs > 0 ? hrs + ':' : ''}{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
                            </span>
                          );
                        }

                        // Open (Pay-As-You-Go) Timer
                        return (
                          <span style={{ color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                            {formatElapsed(s.started_at, now)}
                          </span>
                        );
                      },
                    },
                    { 
                      key: 'rate', 
                      header: language === 'ar' ? 'السعر' : 'Rate', 
                      align: 'right' as const, 
                      render: (s: Session) => {
                        const rate = Number(
                          s.hourly_rate_override !== null
                            ? s.hourly_rate_override
                            : (s.play_mode === 'multiplayer' ? s.device?.hourly_rate_multi : s.device?.hourly_rate) ?? 0
                        );
                        return (
                          <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {s.hourly_rate_override !== null && (
                              <span style={{ fontSize: '10px', color: 'var(--accent-green)', marginRight: '4px', fontWeight: 'bold' }}>[تعديل]</span>
                            )}
                            {formatCurrency(rate)}/{language === 'ar' ? 'ساعة' : 'hr'}
                          </span>
                        );
                      }
                    },
                    {
                      key: 'action',
                      header: language === 'ar' ? 'التحكم' : 'Actions',
                      align: 'right' as const,
                      render: (s: Session) => (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {s.edited_start_at && (
                            <button
                              type="button"
                              title={language === 'ar' ? 'سجلات المراجعة' : 'Audit Trail Logs'}
                              className="ccms-btn ccms-btn-ghost"
                              style={{ 
                                padding: '6px 12px', 
                                fontSize: '11px',
                                minHeight: '32px',
                              }}
                              onClick={() => setAuditTarget(s)}
                            >
                              {language === 'ar' ? 'السجلات' : 'Logs'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="ccms-btn ccms-btn-ghost"
                            style={{ 
                              padding: '6px 12px', 
                              fontSize: '11px',
                              minHeight: '32px',
                            }}
                            onClick={() => setEditTarget(s)}
                          >
                            {t('edit')}
                          </button>
                          {s.session_type === 'fixed' && (
                            <button
                              type="button"
                              className="ccms-btn ccms-btn-ghost"
                              style={{ 
                                padding: '6px 12px', 
                                fontSize: '11px',
                                minHeight: '32px',
                              }}
                              onClick={() => handleExtend(s)}
                            >
                              {language === 'ar' ? '+30 دقيقة' : 'Extend 30m'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="ccms-btn ccms-btn-ghost"
                            style={{ 
                              padding: '6px 12px', 
                              fontSize: '11px',
                              minHeight: '32px',
                              color: 'var(--accent-cyan)',
                              borderColor: 'rgba(0, 194, 255, 0.4)',
                              fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            onClick={() => setCafeTarget(s)}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>local_cafe</span>
                            {language === 'ar' ? 'مشروب +' : '+ Café'}
                          </button>
                          <Button 
                            variant="danger" 
                            onClick={() => setEndTarget(s)} 
                            style={{ 
                              padding: '6px 14px', 
                              fontSize: '11px',
                              minHeight: '32px',
                            }}
                          >
                            {language === 'ar' ? 'إنهاء' : 'End'}
                          </Button>
                        </div>
                      ),
                    },
                  ]
                : [
                    { 
                      key: 'device', 
                      header: language === 'ar' ? 'الجهاز' : 'Device', 
                      render: (s: Session) => <strong>{s.device?.name ?? '—'}</strong> 
                    },
                    { 
                      key: 'customer', 
                      header: language === 'ar' ? 'العميل' : 'Customer', 
                      render: (s: Session) => {
                        const hasCustomName = s.customer?.name && s.customer.name !== 'Walk-in';
                        const isRegistered = s.customer?.username && !s.customer.username.startsWith('walkin_');
                        if (hasCustomName) {
                          return <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.customer!.name}</span>;
                        }
                        if (isRegistered) {
                          return (
                            <Link 
                              to={`/customers/${s.customer_id}`} 
                              style={{ color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 600 }}
                            >
                              @{s.customer!.username}
                            </Link>
                          );
                        }
                        return <span style={{ color: 'var(--text-secondary)' }}>{language === 'ar' ? 'عميل بدون حساب' : 'Walk-in'}</span>;
                      }
                    },
                    { 
                      key: 'ended', 
                      header: language === 'ar' ? 'انتهت في' : 'Ended', 
                      render: (s: Session) => formatDateTime(s.ended_at) 
                    },
                    { 
                      key: 'duration', 
                      header: language === 'ar' ? 'المدة' : 'Duration', 
                      render: (s: Session) => formatDuration(s.duration_minutes) 
                    },
                    {
                      key: 'cost',
                      header: language === 'ar' ? 'التكلفة' : 'Cost',
                      align: 'right' as const,
                      render: (s: Session) => (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-green)', fontWeight: 600 }}>
                            {formatCurrency(s.total_cost)}
                          </span>
                          {s.is_overtime && s.overtime_minutes && (
                            <span style={{ fontSize: '10px', color: 'var(--accent-red)', fontWeight: 'bold' }}>
                              {language === 'ar' ? `وقت إضافي (${s.overtime_minutes} د)` : `Overtime (${s.overtime_minutes}m)`}
                            </span>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'status',
                      header: language === 'ar' ? 'الحالة' : 'Status',
                      align: 'right' as const,
                      render: () => <Badge label={language === 'ar' ? 'منتهية' : 'Ended'} color="var(--text-secondary)" bg="rgba(255, 255, 255, 0.05)" />,
                    },
                  ]
            }
            data={visible}
            rowKey={(s) => s.id}
          />
        </div>
      )}

      {/* End session modal */}
      {endTarget && (
        <EndSessionModal
          session={endTarget}
          onClose={() => setEndTarget(null)}
          onDone={() => {
            setEndTarget(null);
            toast(language === 'ar' ? 'تم إنهاء الجلسة بنجاح' : 'Session ended successfully', 'success');
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
            toast(language === 'ar' ? 'تم تحديث خيارات الجلسة' : 'Session parameters updated', 'success');
            refetch();
          }}
        />
      )}

      {/* Audit Log Modal */}
      {auditTarget && (
        <AuditLogModal
          session={auditTarget}
          onClose={() => setAuditTarget(null)}
        />
      )}

      {/* Add Cafe Modal */}
      {cafeTarget && (
        <AddCafeModal
          session={cafeTarget}
          onClose={() => setCafeTarget(null)}
          onDone={refetch}
        />
      )}
    </Layout>
  );
}

function TabButton({
  active,
  onClick,
  children,
  isRtl,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  isRtl: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px 24px',
        fontSize: '12px',
        fontWeight: 600,
        color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
        borderBottom: active ? '2px solid var(--accent-cyan)' : '2px solid transparent',
        transition: 'all 0.15s ease',
        marginBottom: '-1px',
        minHeight: '44px',
        fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace',
        cursor: 'pointer',
        background: 'transparent',
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
      }}
    >
      {children}
    </button>
  );
}
