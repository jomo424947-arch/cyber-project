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
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatElapsed, formatDuration, formatCurrency, formatDateTime } from '../utils/format';
import { 
  EndSessionModal, 
  EditSessionModal, 
  AuditLogModal 
} from '../components/SessionModals';
import type { Session } from '../types';

type Tab = 'active' | 'history';

export default function SessionsPage() {
  const [tab, setTab] = useState<Tab>('active');
  const now = useNow(1000);
  const { toast } = useToast();

  const [endTarget, setEndTarget] = useState<Session | null>(null);
  const [editTarget, setEditTarget] = useState<Session | null>(null);
  const [auditTarget, setAuditTarget] = useState<Session | null>(null);

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
      toast('Session extended by 30 minutes', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not extend session'), 'error');
    }
  };

  return (
    <Layout
      title="Sessions"
      subtitle="Track active sessions and review history"
      actions={<button className="ccms-btn ccms-btn-ghost" onClick={refetch}>↻ Refresh</button>}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--border-default)' }}>
        <TabButton active={tab === 'active'} onClick={() => setTab('active')}>
          Active ({activeSessions.length})
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          History ({historySessions.length})
        </TabButton>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading sessions…" />
      ) : visible.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon={tab === 'active' ? '⏱' : '🗂'}
            title={tab === 'active' ? 'No active sessions' : 'No session history yet'}
            description={
              tab === 'active'
                ? 'Start a session from the Devices page to begin tracking.'
                : 'Ended sessions will appear here with their cost and duration.'
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
                      header: 'Device', 
                      render: (s: Session) => <strong>{s.device?.name ?? '—'}</strong> 
                    },
                    { 
                      key: 'customer', 
                      header: 'Customer', 
                      render: (s: Session) => s.customer ? (
                        <Link 
                          to={`/customers/${s.customer_id}`} 
                          style={{ color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 600 }}
                        >
                          @{s.customer.username} ({s.customer.name})
                        </Link>
                      ) : (
                        'Walk-in'
                      )
                    },
                    { 
                      key: 'started', 
                      header: 'Started', 
                      render: (s: Session) => formatDateTime(s.started_at) 
                    },
                    {
                      key: 'elapsed',
                      header: 'Time Status',
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
                              <span style={{ color: 'var(--accent-yellow)', fontWeight: 'bold' }}>
                                Grace {mins}:{secs.toString().padStart(2, '0')}
                              </span>
                            );
                          }

                          if (isOvertime) {
                            const overtimeElapsed = Math.floor((now - endTime) / 1000);
                            const hrs = Math.floor(overtimeElapsed / 3600);
                            const mins = Math.floor((overtimeElapsed % 3600) / 60);
                            const secs = overtimeElapsed % 60;
                            return (
                              <span style={{ color: 'var(--accent-red)', fontWeight: 'bold' }}>
                                Overtime +{hrs > 0 ? hrs + ':' : ''}{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
                              </span>
                            );
                          }

                          const remainingSeconds = Math.max(0, Math.floor((endTime - now) / 1000));
                          const hrs = Math.floor(remainingSeconds / 3600);
                          const mins = Math.floor((remainingSeconds % 3600) / 60);
                          const secs = remainingSeconds % 60;
                          return (
                            <span style={{ color: 'var(--accent-cyan)', fontFamily: 'Audiowide, sans-serif' }}>
                              {hrs > 0 ? hrs + ':' : ''}{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
                            </span>
                          );
                        }

                        // Open (Pay-As-You-Go) Timer
                        return (
                          <span style={{ color: 'var(--accent-green)', fontFamily: 'Audiowide, sans-serif' }}>
                            {formatElapsed(s.started_at, now)}
                          </span>
                        );
                      },
                    },
                    { 
                      key: 'rate', 
                      header: 'Rate', 
                      align: 'right' as const, 
                      render: (s: Session) => {
                        const rate = Number(s.hourly_rate_override !== null ? s.hourly_rate_override : s.device?.hourly_rate ?? 0);
                        return (
                          <span>
                            {s.hourly_rate_override !== null && (
                              <span style={{ fontSize: '11px', color: 'var(--accent-green)', marginRight: '4px' }}>[override]</span>
                            )}
                            {formatCurrency(rate)}/hr
                          </span>
                        );
                      }
                    },
                    {
                      key: 'action',
                      header: 'Actions',
                      align: 'right' as const,
                      render: (s: Session) => (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {s.edited_start_at && (
                            <button
                              type="button"
                              title="Audit Trail Logs"
                              className="ccms-btn ccms-btn-ghost"
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                              onClick={() => setAuditTarget(s)}
                            >
                              📜 Logs
                            </button>
                          )}
                          <button
                            type="button"
                            className="ccms-btn ccms-btn-ghost"
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                            onClick={() => setEditTarget(s)}
                          >
                            ✏️ Edit
                          </button>
                          {s.session_type === 'fixed' && (
                            <button
                              type="button"
                              className="ccms-btn ccms-btn-ghost"
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                              onClick={() => handleExtend(s)}
                            >
                              ➕ Extend 30m
                            </button>
                          )}
                          <Button 
                            variant="danger" 
                            onClick={() => setEndTarget(s)} 
                            style={{ padding: '6px 14px', fontSize: '13px' }}
                          >
                            End
                          </Button>
                        </div>
                      ),
                    },
                  ]
                : [
                    { 
                      key: 'device', 
                      header: 'Device', 
                      render: (s: Session) => <strong>{s.device?.name ?? '—'}</strong> 
                    },
                    { 
                      key: 'customer', 
                      header: 'Customer', 
                      render: (s: Session) => s.customer ? (
                        <Link 
                          to={`/customers/${s.customer_id}`} 
                          style={{ color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 600 }}
                        >
                          @{s.customer.username} ({s.customer.name})
                        </Link>
                      ) : (
                        'Walk-in'
                      )
                    },
                    { 
                      key: 'ended', 
                      header: 'Ended', 
                      render: (s: Session) => formatDateTime(s.ended_at) 
                    },
                    { 
                      key: 'duration', 
                      header: 'Duration', 
                      render: (s: Session) => formatDuration(s.duration_minutes) 
                    },
                    {
                      key: 'cost',
                      header: 'Cost',
                      align: 'right' as const,
                      render: (s: Session) => (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ fontFamily: 'Audiowide, sans-serif', color: 'var(--accent-green)' }}>
                            {formatCurrency(s.total_cost)}
                          </span>
                          {s.is_overtime && s.overtime_minutes && (
                            <span style={{ fontSize: '10px', color: 'var(--accent-red)', fontWeight: 'bold' }}>
                              Overtime ({s.overtime_minutes}m)
                            </span>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      align: 'right' as const,
                      render: () => <Badge label="Ended" color="var(--text-secondary)" bg="rgba(100,116,139,0.1)" />,
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
            toast('Session ended successfully', 'success');
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
            toast('Session parameters updated', 'success');
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
    </Layout>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px',
        fontSize: '13px',
        fontWeight: 600,
        color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
        borderBottom: active ? '2px solid var(--accent-cyan)' : '2px solid transparent',
        transition: 'all 0.2s ease',
        marginBottom: '-1px',
      }}
    >
      {children}
    </button>
  );
}
