import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency, formatDateTime, formatDuration } from '../utils/format';
import type { Session, SessionSummary } from '../types';

const mono: CSSProperties = { fontFamily: 'JetBrains Mono, monospace' };

/**
 * Per-session bill: time cost + café orders (grouped by product) + total.
 * Works for both active (live, up to now) and ended sessions.
 */
export function SessionReceiptModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const { language, isRtl } = useLanguage();
  const ar = language === 'ar';
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setSummary(null);
    setError('');
    dataService
      .getSessionSummary(session.id)
      .then((s) => alive && setSummary(s))
      .catch((err) => alive && setError(apiErrorMessage(err, ar ? 'تعذر تحميل الحساب' : 'Could not load bill')));
    return () => {
      alive = false;
    };
  }, [session.id, ar]);

  const customerLabel = (() => {
    const c = session.customer;
    if (c?.name && c.name !== 'Walk-in') return c.name;
    if (c?.username && !c.username.startsWith('walkin_')) return `@${c.username}`;
    return ar ? 'عميل بدون حساب' : 'Walk-in';
  })();

  const paymentLabel = (m?: string) => {
    const map: Record<string, [string, string]> = {
      cash: ['كاش', 'Cash'],
      card: ['كارت', 'Card'],
      transfer: ['تحويل', 'Transfer'],
      wallet: ['محفظة', 'Wallet'],
    };
    const entry = m ? map[m] : undefined;
    return entry ? (ar ? entry[0] : entry[1]) : m ?? '';
  };

  return (
    <Modal
      open
      title={`${ar ? 'حساب' : 'Bill'} · ${session.device?.name ?? '—'}`}
      onClose={onClose}
      width={460}
      footer={
        <Button onClick={onClose} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
          {ar ? 'إغلاق' : 'Close'}
        </Button>
      }
    >
      {error ? (
        <p style={{ color: 'var(--accent-red)', textAlign: 'center', padding: '16px', fontSize: '13px' }}>{error}</p>
      ) : !summary ? (
        <LoadingSpinner label={ar ? 'جاري تحميل الحساب…' : 'Loading bill…'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: isRtl ? 'right' : 'left' }}>
          {/* Header */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{ar ? 'العميل' : 'Customer'}</span>
              <span style={{ fontWeight: 600 }}>{customerLabel}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{ar ? 'البدء' : 'Started'}</span>
              <span>{formatDateTime(session.started_at)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{ar ? 'الانتهاء' : 'Ended'}</span>
              <span>
                {summary.is_live ? (
                  <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                    {ar ? 'جارية الآن (حساب لحظي)' : 'Live (up to now)'}
                  </span>
                ) : (
                  formatDateTime(summary.session.ended_at)
                )}
              </span>
            </div>
          </div>

          {/* Time */}
          <Section icon="schedule" title={ar ? 'الوقت' : 'Time'} total={summary.time.cost}>
            {summary.time.segments.map((seg, i) => (
              <Row
                key={i}
                label={
                  <>
                    {summary.time.segments.length > 1 && <strong>{seg.device_name} · </strong>}
                    {formatDuration(seg.minutes)}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                      {' '}× {formatCurrency(seg.hourly_rate)}/{ar ? 'س' : 'h'}
                    </span>
                  </>
                }
                value={seg.cost}
              />
            ))}
            {summary.time.paused_minutes > 0 && (
              <div style={{ fontSize: '11px', color: 'var(--accent-yellow)' }}>
                {ar ? `تعليق غير محسوب: ${formatDuration(summary.time.paused_minutes)}` : `Paused (not billed): ${formatDuration(summary.time.paused_minutes)}`}
              </div>
            )}
          </Section>

          {/* Café */}
          <Section icon="local_cafe" title={ar ? 'المشاريب' : 'Café'} total={summary.cafe.cost}>
            {summary.cafe.items.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{ar ? 'لا توجد طلبات' : 'No orders'}</div>
            ) : (
              summary.cafe.items.map((it) => (
                <Row
                  key={`${it.product_id}-${it.unit_price}`}
                  label={
                    <>
                      {it.name}
                      <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                        {' '}× {it.quantity} ({formatCurrency(it.unit_price)})
                      </span>
                    </>
                  }
                  value={it.total}
                />
              ))
            )}
          </Section>

          {/* Totals */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              background: 'rgba(34, 197, 94, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '13px',
            }}
          >
            <Row label={ar ? 'الوقت' : 'Time'} value={summary.time.cost} />
            <Row label={ar ? 'المشاريب' : 'Café'} value={summary.cafe.cost} />
            {summary.discount_amount > 0 && <Row label={ar ? 'خصم' : 'Discount'} value={-summary.discount_amount} color="var(--accent-red)" />}
            {summary.service_fee > 0 && <Row label={ar ? 'خدمة' : 'Service'} value={summary.service_fee} />}
            {summary.rounding_delta !== 0 && <Row label={ar ? 'تقريب' : 'Rounding'} value={summary.rounding_delta} />}
            <div style={{ borderTop: '1px dashed var(--border-default)', margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '15px' }}>{ar ? 'الإجمالي' : 'Total'}</strong>
              <strong style={{ ...mono, fontSize: '17px', color: 'var(--accent-green)' }}>{formatCurrency(summary.total)}</strong>
            </div>
            {summary.invoice && (
              <div style={{ fontSize: '11px', color: summary.invoice.paid ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                {summary.invoice.paid
                  ? `${ar ? 'مدفوع' : 'Paid'} · ${paymentLabel(summary.invoice.payment_method)}`
                  : ar ? 'غير مدفوع' : 'Unpaid'}
              </div>
            )}
            {summary.invoice?.notes && (
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{summary.invoice.notes}</div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Section({ icon, title, total, children }: { icon: string; title: string; total: number; children: ReactNode }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: '10px',
        border: '1px solid var(--border-default)',
        background: 'var(--bg-input)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-cyan)' }}>{icon}</span>
          {title}
        </span>
        <span style={{ ...mono, fontWeight: 700, fontSize: '13px' }}>{formatCurrency(total)}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, color }: { label: ReactNode; value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px' }}>
      <span>{label}</span>
      <span style={{ ...mono, color, whiteSpace: 'nowrap' }}>{formatCurrency(value)}</span>
    </div>
  );
}
