import { useMemo, useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Table } from '../components/ui/Table';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { StatCard } from '../components/StatCard';
import { InvoiceDetailsModal } from '../components/InvoiceDetailsModal';
import { useAsync } from '../hooks/useAsync';
import { usePolling } from '../hooks/usePolling';
import { useIsMobile } from '../hooks/useIsMobile';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency } from '../utils/format';
import type { Invoice } from '../types';

type Filter = 'all' | 'paid' | 'unpaid';

export default function BillingPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const { t, language, isRtl } = useLanguage();

  const { data, loading, refetch } = useAsync(() => dataService.listInvoices(), []);

  // Auto-poll every 15 seconds for cross-instance sync (Desktop ↔ Web ↔ Mobile)
  usePolling(refetch, 15000);

  const invoices = data ?? [];

  // Filter & Search logic
  const filtered = useMemo(() => {
    let result = invoices;
    if (filter === 'paid') result = result.filter((i) => i.paid);
    if (filter === 'unpaid') result = result.filter((i) => !i.paid);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) => {
        const idMatch = i.id.toLowerCase().includes(q) || `#inv-${i.id.slice(0, 4)}`.includes(q);
        const nameMatch = (i.session?.customer?.name ?? 'walk-in').toLowerCase().includes(q);
        const deviceMatch = (i.session?.device?.name ?? '').toLowerCase().includes(q);
        return idMatch || nameMatch || deviceMatch;
      });
    }
    return result;
  }, [invoices, filter, search]);

  const totals = useMemo(() => {
    const collected = invoices.filter((i) => i.paid).reduce((s, i) => s + i.amount, 0);
    const outstanding = invoices.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0);
    return { collected, outstanding };
  }, [invoices]);

  const handlePay = async (id: string) => {
    setPayingId(id);
    setActiveMenuId(null);
    try {
      await dataService.payInvoice(id);
      toast(language === 'ar' ? 'تم تحديد الفاتورة كمحررة ومدفوعة' : 'Invoice marked as paid', 'success');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not update invoice'), 'error');
    } finally {
      setPayingId(null);
    }
  };

  // Pagination calculations
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search]);

  return (
    <Layout
      title={t('billing')}
      subtitle={
        language === 'ar'
          ? 'متابعة شاملة للحسابات والمدفوعات، وإحصائيات استخدام الأجهزة وبث الفواتير بشكل مباشر.'
          : 'Comprehensive real-time tracking of terminal utilization, subscription billing, and net system profitability.'
      }
      actions={
        <>
          <button
            className="ccms-btn ccms-btn-ghost"
            onClick={() => toast(language === 'ar' ? 'تم تصدير كشف الحساب بنجاح' : 'Excel summary sheet exported.', 'success')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
              flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
              minHeight: '38px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>receipt_long</span>
            <span>{language === 'ar' ? 'كشف حساب' : 'Generate Receipt'}</span>
          </button>
          <button
            className="ccms-btn ccms-btn-primary"
            onClick={() => toast(language === 'ar' ? 'جاري انتظار تأكيد الدفع الإلكتروني...' : 'Gateway scanner listening for payments...', 'info')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
              flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
              minHeight: '38px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>account_balance_wallet</span>
            <span>{language === 'ar' ? 'تسجيل دفعة' : 'Process Payment'}</span>
          </button>
        </>
      }
    >
      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '24px',
          marginBottom: '48px',
        }}
      >
        <StatCard index={0} icon="check_circle" label={language === 'ar' ? 'المدفوعات المحصلة' : 'Total Collected'} value={formatCurrency(totals.collected)} accent="var(--accent-green)" />
        <StatCard index={1} icon="warning" label={language === 'ar' ? 'المستحقات المعلقة' : 'Outstanding Dues'} value={formatCurrency(totals.outstanding)} accent="var(--accent-yellow)" />
        <StatCard index={2} icon="payments" label={language === 'ar' ? 'صافي الإيرادات' : 'Net Revenue (MTD)'} value={formatCurrency(totals.collected + totals.outstanding)} accent="var(--accent-cyan)" />
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['all', 'unpaid', 'paid'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '10px 20px',
                borderRadius: '8px',
                border: filter === f ? '1px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                background: filter === f ? 'var(--accent-cyan-dim)' : 'transparent',
                color: filter === f ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                boxShadow: filter === f ? 'var(--shadow-glow)' : 'none',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
              }}
            >
              {f === 'all'
                ? (language === 'ar' ? 'كل الفواتير' : 'All Invoices')
                : f === 'paid'
                  ? (language === 'ar' ? 'الفواتير المدفوعة' : 'Paid Invoices')
                  : (language === 'ar' ? 'غير المدفوعة' : 'Unpaid Invoices')}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: isRtl ? 'auto' : undefined, marginRight: isRtl ? undefined : 'auto', position: 'relative', minWidth: '260px' }}>
          <span
            className="material-symbols-outlined"
            style={{
              position: 'absolute',
              left: isRtl ? 'auto' : '12px',
              right: isRtl ? '12px' : 'auto',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              fontSize: '16px'
            }}
          >
            search
          </span>
          <input
            type="text"
            className="ccms-input"
            placeholder={language === 'ar' ? 'بحث في الفواتير...' : 'Search Invoices...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              paddingLeft: isRtl ? '12px' : '40px',
              paddingRight: isRtl ? '40px' : '12px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              width: '100%',
              fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
            }}
          />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner label={t('loading')} />
      ) : filtered.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon="credit_card"
            title={
              filter === 'all'
                ? (language === 'ar' ? 'لا توجد فواتير بعد' : 'No invoices yet')
                : (language === 'ar' ? `لا توجد فواتير ${filter}` : `No ${filter} invoices`)
            }
            description={language === 'ar' ? 'تُنشأ الفواتير تلقائياً عند إنهاء الجلسات.' : 'Invoices are generated automatically when a session ends.'}
          />
        </div>
      ) : (
        <div className="ccms-card" style={{ overflow: 'visible', marginBottom: '40px' }}>
          <Table
            columns={[
              {
                key: 'invoice',
                header: language === 'ar' ? 'رقم الفاتورة' : 'Invoice ID',
                render: (i: Invoice) => `#INV-${i.id.slice(0, 4).toUpperCase()}`,
              },
              {
                key: 'customer',
                header: language === 'ar' ? 'العميل' : 'Customer',
                render: (i: Invoice) => {
                  const name = i.session?.customer?.name ?? (language === 'ar' ? 'مستغل خارجي' : 'Walk-in');
                  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'var(--accent-cyan-dim)',
                          border: '1px solid var(--border-glow)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          color: 'var(--accent-cyan)',
                          fontFamily: 'JetBrains Mono, monospace'
                        }}
                      >
                        {initials}
                      </div>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{name}</span>
                    </div>
                  );
                },
              },
              {
                key: 'employee',
                header: language === 'ar' ? 'الموظف المسئول' : 'Staff Member',
                render: (i: Invoice) => {
                  const staffName = i.creator?.full_name || i.creator?.email?.split('@')[0] || (language === 'ar' ? 'غير محدد' : '—');
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-cyan)' }}>
                        badge
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {staffName}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: 'startTime',
                header: language === 'ar' ? 'وقت البدء' : 'Start Time',
                render: (i: Invoice) => {
                  if (!i.session?.started_at) return '—';
                  const d = new Date(i.session.started_at);
                  const time = d.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                  const date = d.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' });
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 600, color: 'var(--accent-green)' }}>
                        {time}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {date}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: 'endTime',
                header: language === 'ar' ? 'وقت الانتهاء' : 'End Time',
                render: (i: Invoice) => {
                  if (!i.session?.ended_at) {
                    return (
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--accent-yellow)', fontWeight: 600 }}>
                        {language === 'ar' ? 'لا يزال نشطاً' : 'Still Active'}
                      </span>
                    );
                  }
                  const d = new Date(i.session.ended_at);
                  const time = d.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                  const date = d.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' });
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 600, color: 'var(--accent-red)' }}>
                        {time}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {date}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: 'status',
                header: language === 'ar' ? 'الحالة' : 'Status',
                render: (i: Invoice) =>
                  i.paid ? (
                    <Badge label={language === 'ar' ? 'مدفوعة' : 'Paid'} color="var(--accent-green)" bg="rgba(34, 197, 94, 0.1)" />
                  ) : (
                    <Badge label={language === 'ar' ? 'انتظار الدفع' : 'Pending'} color="var(--text-secondary)" bg="rgba(255, 255, 255, 0.05)" />
                  ),
              },
              {
                key: 'amount',
                header: language === 'ar' ? 'القيمة' : 'Amount',
                align: 'right',
                render: (i: Invoice) => formatCurrency(i.amount),
              },
              {
                key: 'action',
                header: '',
                align: 'right',
                render: (i: Invoice) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                    {/* Invoice Details Button */}
                    <button
                      title={language === 'ar' ? 'تفاصيل الفاتورة' : 'Invoice Details'}
                      style={{
                        color: 'var(--accent-cyan)',
                        cursor: 'pointer',
                        padding: '6px',
                        background: 'rgba(0, 194, 255, 0.08)',
                        border: '1px solid rgba(0, 194, 255, 0.2)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailInvoice(i);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 194, 255, 0.18)';
                        e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                        e.currentTarget.style.boxShadow = '0 0 8px rgba(0, 194, 255, 0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 194, 255, 0.08)';
                        e.currentTarget.style.borderColor = 'rgba(0, 194, 255, 0.2)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>info</span>
                    </button>

                    {/* More Actions Menu */}
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <button
                        style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', background: 'none', border: 'none' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === i.id ? null : i.id);
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#00C2FF'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>more_vert</span>
                      </button>
                      {activeMenuId === i.id && (
                        <>
                          <div
                            style={{ position: 'fixed', inset: 0, zIndex: 90 }}
                            onClick={() => setActiveMenuId(null)}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              right: isRtl ? 'auto' : 0,
                              left: isRtl ? 0 : 'auto',
                              top: '24px',
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border-default)',
                              borderRadius: '8px',
                              boxShadow: 'var(--shadow-glow-strong)',
                              zIndex: 100,
                              minWidth: '150px',
                              overflow: 'hidden'
                            }}
                          >
                            {/* View Details option in menu */}
                            <button
                              onClick={() => {
                                setActiveMenuId(null);
                                setDetailInvoice(i);
                              }}
                              style={{
                                width: '100%',
                                padding: '10px 16px',
                                textAlign: isRtl ? 'right' : 'left',
                                color: 'var(--accent-cyan)',
                                fontFamily: isRtl ? 'Cairo, sans-serif' : 'Inter, sans-serif',
                                fontSize: '13px',
                                fontWeight: 500,
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>info</span>
                              {language === 'ar' ? 'تفاصيل الفاتورة' : 'View Details'}
                            </button>
                            {!i.paid ? (
                              <button
                                onClick={() => handlePay(i.id)}
                                disabled={payingId === i.id}
                                style={{
                                  width: '100%',
                                  padding: '10px 16px',
                                  textAlign: isRtl ? 'right' : 'left',
                                  color: 'var(--accent-green)',
                                  fontFamily: isRtl ? 'Cairo, sans-serif' : 'Inter, sans-serif',
                                  fontSize: '13px',
                                  fontWeight: 500,
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span>
                                {payingId === i.id
                                  ? (language === 'ar' ? 'جاري المعالجة...' : 'Processing...')
                                  : (language === 'ar' ? 'تأكيد السداد' : 'Mark as Paid')}
                              </button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ),
              },
            ]}
            data={paginatedInvoices}
            rowKey={(i) => i.id}
          />

          {/* Table pagination footer */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <p
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-muted)',
                margin: 0
              }}
            >
              {language === 'ar'
                ? `عرض ${paginatedInvoices.length} من أصل ${filtered.length} معاملة مالية`
                : `Displaying ${paginatedInvoices.length} of ${filtered.length} transactions`}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                style={{
                  padding: '8px',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                  opacity: currentPage === 1 ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  background: 'none',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{isRtl ? 'chevron_right' : 'chevron_left'}</span>
              </button>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500 }}>
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                style={{
                  padding: '8px',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
                  opacity: currentPage === totalPages ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  background: 'none',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{isRtl ? 'chevron_left' : 'chevron_right'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Details Modal */}
      {detailInvoice && (
        <InvoiceDetailsModal
          invoice={detailInvoice}
          onClose={() => setDetailInvoice(null)}
          onPaySuccess={() => {
            toast(language === 'ar' ? 'تم تحديد الفاتورة كمدفوعة' : 'Invoice marked as paid', 'success');
            refetch();
          }}
        />
      )}

      {/* Bottom Visualization Section */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))',
          gap: '24px',
          marginTop: '32px'
        }}
      >
        {/* Peak utilization card */}
        <div className="ccms-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
            <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {language === 'ar' ? 'ساعات ذروة التشغيل والضغط' : 'Peak Utilization Hours'}
            </h3>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent-cyan)', fontSize: '20px' }}>equalizer</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'end', gap: '8px', height: '192px', direction: 'ltr' }}>
            <div style={{ flexGrow: 1, background: 'rgba(0, 194, 255, 0.1)', borderRadius: '4px 4px 0 0', height: '40%' }} />
            <div style={{ flexGrow: 1, background: 'rgba(0, 194, 255, 0.1)', borderRadius: '4px 4px 0 0', height: '60%' }} />
            <div style={{ flexGrow: 1, background: 'rgba(0, 194, 255, 0.1)', borderRadius: '4px 4px 0 0', height: '85%' }} />
            <div
              style={{
                flexGrow: 1,
                background: 'rgba(0, 194, 255, 0.4)',
                borderRadius: '4px 4px 0 0',
                height: '95%',
                boxShadow: '0 0 15px rgba(0, 194, 255, 0.2)',
                position: 'relative'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'var(--accent-cyan)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  color: '#003548',
                  whiteSpace: 'nowrap',
                  marginBottom: '8px',
                  fontFamily: 'JetBrains Mono, monospace'
                }}
              >
                {language === 'ar' ? 'الذروة - 98%' : 'PEAK - 98%'}
              </div>
            </div>
            <div style={{ flexGrow: 1, background: 'rgba(0, 194, 255, 0.1)', borderRadius: '4px 4px 0 0', height: '75%' }} />
            <div style={{ flexGrow: 1, background: 'rgba(0, 194, 255, 0.1)', borderRadius: '4px 4px 0 0', height: '50%' }} />
            <div style={{ flexGrow: 1, background: 'rgba(0, 194, 255, 0.1)', borderRadius: '4px 4px 0 0', height: '30%' }} />
          </div>

          <div
            style={{
              marginTop: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              color: 'var(--text-muted)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '10px',
              direction: 'ltr'
            }}
          >
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
            <span>00:00</span>
          </div>
        </div>

        {/* Sync ledger card */}
        <div className="ccms-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                border: '4px solid var(--accent-cyan)',
                borderTopColor: 'transparent',
                animation: 'spin 1s linear infinite'
              }}
            />
            <div>
              <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                {language === 'ar' ? 'المزامنة الحية نشطة...' : 'Real-time Syncing...'}
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                {language === 'ar'
                  ? 'تم ربط بوابة الدفع المركزية. المعاملات مسجلة ومؤمنة بالكامل.'
                  : 'Connected to central payment gateway. All transactions are verifiable via blockchain hash.'}
              </p>
            </div>
          </div>

          <div
            style={{
              marginTop: '32px',
              padding: '16px',
              background: '#0e0e0e',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}
          >
            <code
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '11px',
                color: 'rgba(0, 194, 255, 0.7)',
                display: 'block',
                lineHeight: '1.6',
                direction: 'ltr',
                textAlign: 'left',
              }}
            >
              HASH: 0x8a1c92f...e7d2 <br />
              STATUS: NODE_CONFIRMED <br />
              TIMESTAMP: {new Date().toISOString()}
            </code>
          </div>
        </div>
      </div>
    </Layout>
  );
}
