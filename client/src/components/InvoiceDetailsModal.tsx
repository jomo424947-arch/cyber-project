import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { formatCurrency } from '../utils/format';
import { getDeviceTypeIcon, PAYMENT_METHOD_LABELS } from '../utils/constants';
import type { Invoice, SessionOrder, SessionTransfer } from '../types';

interface InvoiceDetailsModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onPaySuccess?: () => void;
}

export function InvoiceDetailsModal({ invoice, onClose, onPaySuccess }: InvoiceDetailsModalProps) {
  const { language, isRtl } = useLanguage();
  const [orders, setOrders] = useState<SessionOrder[] | null>(null);
  const [transfers, setTransfers] = useState<SessionTransfer[] | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (invoice?.session_id) {
      setLoadingDetails(true);
      Promise.all([
        dataService.listSessionOrders(invoice.session_id).catch(() => []),
        dataService.listSessionTransfers(invoice.session_id).catch(() => []),
      ])
        .then(([ord, tr]) => {
          setOrders(ord);
          setTransfers(tr);
        })
        .finally(() => setLoadingDetails(false));
    } else {
      setOrders([]);
      setTransfers([]);
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
  const transfersTotal = transfers ? transfers.reduce((sum, tr) => sum + Number(tr.cost || 0), 0) : 0;

  const subtotal = invoice.subtotal || Math.round((invoice.amount + (invoice.discount_amount || 0) - (invoice.service_fee || 0) - (invoice.rounding_delta || 0)) * 100) / 100;
  const currentDeviceCost = Math.max(0, Math.round((subtotal - cafeTotal - transfersTotal) * 100) / 100);

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
      width={540}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: isRtl ? 'right' : 'left', maxHeight: '72vh', overflowY: 'auto', paddingRight: '4px' }}>
        
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
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>person</span>
              {customerName}
            </div>
          </div>

          <div style={{ padding: '12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-default)', gridColumn: 'span 2' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              {language === 'ar' ? 'الموظف المسؤول / كاشير الوردية' : 'Staff Member / Shift Cashier'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px', color: 'var(--accent-cyan)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>badge</span>
              {invoice.creator?.full_name || invoice.creator?.email?.split('@')[0] || (language === 'ar' ? 'غير محدد (مباشر)' : 'Default Cashier')}
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
              <span style={{ color: 'var(--text-secondary)' }}>{language === 'ar' ? 'إجمالي مدة الجلسة:' : 'Total Duration:'}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{durationMins} {language === 'ar' ? 'دقيقة' : 'minutes'}</span>
            </div>
          )}
        </div>

        {/* Financial Breakdown Card */}
        <div style={{ padding: '14px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {language === 'ar' ? 'تفاصيل الحساب والتكلفة' : 'Financial Breakdown'}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{language === 'ar' ? `تكلفة الجهاز الحالي (${deviceName})` : 'Current Device Fee'}</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(currentDeviceCost)}</span>
          </div>

          {/* Transfers list if any */}
          {transfers && transfers.length > 0 && (
            <div style={{ borderTop: '1px dashed var(--border-default)', paddingTop: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--accent-purple)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>swap_horiz</span>
                {language === 'ar' ? 'مراحل التحويل السابقة:' : 'Transfers History:'}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {transfers.map((tr) => (
                  <div key={tr.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span>{tr.from_device?.name ?? 'جهاز سابق'} ({tr.duration_minutes} دقيقة)</span>
                    <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>{formatCurrency(tr.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Café items if available */}
          {loadingDetails ? (
            <LoadingSpinner label={language === 'ar' ? 'جاري تحميل التفاصيل...' : 'Loading details...'} />
          ) : orders && orders.length > 0 ? (
            <div style={{ borderTop: '1px dashed var(--border-default)', paddingTop: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>local_cafe</span>
                {language === 'ar' ? 'طلبات البوفيه / الكافيه:' : 'Café Orders:'}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {orders.map((ord) => (
                  <div key={ord.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span>{ord.product?.name ?? 'صنف'} × {ord.quantity}</span>
                    <span>{formatCurrency(ord.total_price)}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--accent-cyan)', paddingTop: '4px' }}>
                <span>{language === 'ar' ? 'إجمالي البوفيه:' : 'Café Subtotal:'}</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(cafeTotal)}</span>
              </div>
            </div>
          ) : null}

          {/* Subtotal */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid var(--border-default)', paddingTop: '6px', marginTop: '2px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{language === 'ar' ? 'المجموع الفرعي (Subtotal)' : 'Subtotal'}</span>
            <span style={{ fontWeight: 700, color: '#FFFFFF' }}>{formatCurrency(subtotal)}</span>
          </div>

          {/* Discount if present */}
          {Boolean(invoice.discount_amount && invoice.discount_amount > 0) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--accent-green)' }}>
              <span>
                {language === 'ar' ? 'الخصم / التخفيض' : 'Discount'}
                {invoice.discount_type === 'percentage' ? ` (${invoice.discount_value}%)` : ''}
              </span>
              <span style={{ fontWeight: 700 }}>- {formatCurrency(invoice.discount_amount || 0)}</span>
            </div>
          )}

          {/* Service fee if present */}
          {Boolean(invoice.service_fee && invoice.service_fee > 0) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--accent-yellow)' }}>
              <span>
                {language === 'ar' ? 'رسوم الخدمة' : 'Service Fee'}
                {invoice.service_rate && invoice.service_rate > 0 ? ` (${invoice.service_rate}%)` : ''}
              </span>
              <span style={{ fontWeight: 700 }}>+ {formatCurrency(invoice.service_fee || 0)}</span>
            </div>
          )}

          {/* Rounding Delta if present */}
          {Boolean(invoice.rounding_delta && invoice.rounding_delta !== 0) && (() => {
            const delta = Number(invoice.rounding_delta || 0);
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: delta < 0 ? 'var(--accent-green)' : '#38bdf8' }}>
                <span>{language === 'ar' ? 'تسوية الفكة / التقريب' : 'Cash Rounding / Change'}</span>
                <span style={{ fontWeight: 700 }}>
                  {delta < 0 ? `- ${formatCurrency(Math.abs(delta))}` : `+ ${formatCurrency(delta)}`}
                </span>
              </div>
            );
          })()}

          {/* Notes if present */}
          {invoice.notes && (
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '6px', marginTop: '2px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{language === 'ar' ? 'ملاحظات: ' : 'Notes: '}</strong>
              {invoice.notes}
            </div>
          )}

          <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '6px 0' }} />

          {/* Final Net Amount */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '17px' }}>
            <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{language === 'ar' ? 'صافي الفاتورة' : 'Net Total Amount'}</span>
            <span style={{ fontWeight: 900, color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace' }}>
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
