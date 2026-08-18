import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { formatCurrency } from '../utils/format';
import { getDeviceTypeIcon, PAYMENT_METHOD_LABELS } from '../utils/constants';
import type { Invoice, SessionOrder } from '../types';

interface InvoiceDetailsModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onPaySuccess?: () => void;
}

export function InvoiceDetailsModal({ invoice, onClose, onPaySuccess }: InvoiceDetailsModalProps) {
  const { language, isRtl } = useLanguage();
  const [orders, setOrders] = useState<SessionOrder[] | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (invoice?.session_id) {
      setLoadingOrders(true);
      dataService.listSessionOrders(invoice.session_id)
        .then(setOrders)
        .catch(() => setOrders([]))
        .finally(() => setLoadingOrders(false));
    } else {
      setOrders([]);
    }
  }, [invoice?.session_id]);

  if (!invoice) return null;

  const session = invoice.session;
  const customerName = session?.customer?.name ?? (language === 'ar' ? 'مستغل خارجي (Walk-in)' : 'Walk-in');
  const deviceName = session?.device?.name ?? (language === 'ar' ? 'جهاز غير محدد' : 'Terminal');
  const deviceType = session?.device?.type ?? 'pc';
  const typeIcon = getDeviceTypeIcon(deviceType);

  const startTimeStr = session?.started_at ? new Date(session.started_at).toLocaleString(language === 'ar' ? 'ar-EG' : undefined) : '—';
  const endTimeStr = session?.ended_at ? new Date(session.ended_at).toLocaleString(language === 'ar' ? 'ar-EG' : undefined) : '—';
  const durationMins = session?.duration_minutes ?? (
    session?.started_at && session?.ended_at
      ? Math.max(1, Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000))
      : null
  );

  const cafeTotal = orders ? orders.reduce((sum, ord) => sum + Number(ord.total_price), 0) : 0;
  const baseSessionCost = Math.max(0, invoice.amount - cafeTotal);

  const handlePrint = () => {
    window.print();
  };

  const handleMarkPaid = async () => {
    setPaying(true);
    try {
      await dataService.payInvoice(invoice.id);
      if (onPaySuccess) onPaySuccess();
      onClose();
    } catch (err) {
      console.error('Failed to mark invoice as paid:', err);
    } finally {
      setPaying(false);
    }
  };

  const paymentMethodLabel = PAYMENT_METHOD_LABELS[invoice.payment_method] || invoice.payment_method;

  return (
    <Modal
      open
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--accent-cyan)', fontSize: '22px' }}>
            info
          </span>
          <span>{language === 'ar' ? `تفاصيل الفاتورة #INV-${invoice.id.slice(0, 6).toUpperCase()}` : `Invoice Details #INV-${invoice.id.slice(0, 6).toUpperCase()}`}</span>
        </div>
      }
      onClose={onClose}
      width={520}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <Button 
            variant="ghost" 
            onClick={handlePrint}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>print</span>
            {language === 'ar' ? 'طباعة الفاتورة' : 'Print Receipt'}
          </Button>

          <div style={{ display: 'flex', gap: '8px' }}>
            {!invoice.paid && (
              <Button
                variant="primary"
                loading={paying}
                onClick={handleMarkPaid}
                style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit', background: 'var(--accent-green)', borderColor: 'var(--accent-green)' }}
              >
                {language === 'ar' ? 'تأكيد السداد' : 'Mark as Paid'}
              </Button>
            )}
            <Button onClick={onClose} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
              {language === 'ar' ? 'إغلاق' : 'Close'}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: isRtl ? 'right' : 'left' }}>
        
        {/* Top Badges Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{language === 'ar' ? 'حالة الفاتورة:' : 'Status:'}</span>
            {invoice.paid ? (
              <Badge label={language === 'ar' ? 'مدفوعة' : 'Paid'} color="var(--accent-green)" bg="rgba(34, 197, 94, 0.1)" />
            ) : (
              <Badge label={language === 'ar' ? 'غير مدفوعة' : 'Unpaid'} color="var(--accent-yellow)" bg="rgba(245, 158, 11, 0.1)" />
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{language === 'ar' ? 'طريقة الدفع:' : 'Payment:'}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-cyan)', background: 'rgba(0, 194, 255, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
              {paymentMethodLabel}
            </span>
          </div>
        </div>

        {/* Customer & Device Card */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ padding: '12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              {language === 'ar' ? 'الجهاز المستغل' : 'Terminal / Device'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>{typeIcon}</span>
              {deviceName}
            </div>
          </div>

          <div style={{ padding: '12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              {language === 'ar' ? 'العميل' : 'Customer'}
            </span>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
              👤 {customerName}
            </div>
          </div>
        </div>

        {/* Timestamps */}
        <div style={{ padding: '12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{language === 'ar' ? 'وقت البدء:' : 'Started:'}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-green)', fontWeight: 600 }}>{startTimeStr}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{language === 'ar' ? 'وقت الانتهاء:' : 'Ended:'}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-red)', fontWeight: 600 }}>{endTimeStr}</span>
          </div>
          {durationMins !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-default)', paddingTop: '6px', marginTop: '2px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{language === 'ar' ? 'مدة الجلسة:' : 'Duration:'}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{durationMins} {language === 'ar' ? 'دقيقة' : 'minutes'}</span>
            </div>
          )}
          {Boolean(session?.total_paused_minutes && session.total_paused_minutes > 0) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-default)', paddingTop: '6px', marginTop: '2px' }}>
              <span style={{ color: 'var(--accent-yellow)' }}>{language === 'ar' ? 'الوقت المعلّق (غير محسوب):' : 'Paused Time (not billed):'}</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-yellow)' }}>
                {session!.total_paused_minutes} {language === 'ar' ? 'دقيقة' : 'minutes'}
              </span>
            </div>
          )}
        </div>

        {/* Financial Breakdown */}
        <div style={{ padding: '14px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {language === 'ar' ? 'تفاصيل الحساب والتكلفة' : 'Financial Breakdown'}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{language === 'ar' ? 'تكلفة استخدام الجهاز' : 'Session Base Fee'}</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(baseSessionCost)}</span>
          </div>

          {/* Café items if available */}
          {loadingOrders ? (
            <LoadingSpinner label={language === 'ar' ? 'جاري تحميل الطلبات...' : 'Loading orders...'} />
          ) : orders && orders.length > 0 ? (
            <>
              <div style={{ borderTop: '1px dashed var(--border-default)', paddingTop: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  🍹 {language === 'ar' ? 'طلبات البوفيه / الكافيه:' : 'Café Orders:'}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: isRtl ? 0 : '8px', paddingRight: isRtl ? '8px' : 0 }}>
                  {orders.map((ord) => (
                    <div key={ord.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span>{ord.product?.name ?? (language === 'ar' ? 'صنف' : 'Product')} × {ord.quantity}</span>
                      <span>{formatCurrency(ord.total_price)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--accent-cyan)', paddingTop: '4px' }}>
                <span>{language === 'ar' ? 'إجمالي البوفيه:' : 'Café Subtotal:'}</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(cafeTotal)}</span>
              </div>
            </>
          ) : null}

          <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '6px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{language === 'ar' ? 'إجمالي الفاتورة' : 'Total Amount'}</span>
            <span style={{ fontWeight: 800, color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace' }}>
              {formatCurrency(invoice.amount)}
            </span>
          </div>

          {invoice.paid_at && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: isRtl ? 'left' : 'right', marginTop: '4px' }}>
              {language === 'ar' ? `تاريخ السداد: ${new Date(invoice.paid_at).toLocaleString('ar-EG')}` : `Paid on: ${new Date(invoice.paid_at).toLocaleString()}`}
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}
