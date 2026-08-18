import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { useLanguage } from '../context/LanguageContext';
import { useSystemSettings } from '../context/SystemSettingsContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency } from '../utils/format';
import type { Device, Session, Customer, PaymentMethod, SessionAuditLog, SessionOrder } from '../types';

// Helper to format Date objects for datetime-local inputs
const toLocalISOString = (date: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// ─── Start Session modal ───────────────────────────────────────────────
export function StartSessionModal({
  device,
  playMode = 'single',
  onClose,
  onDone,
}: {
  device: Device;
  playMode?: 'single' | 'multiplayer';
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, language, isRtl } = useLanguage();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  
  // Quick-create state
  const [name, setName] = useState('');

  // Session options
  const [sessionType, setSessionType] = useState<'open' | 'fixed'>('open');
  const [startedAt, setStartedAt] = useState(toLocalISOString(new Date()));
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [gracePeriod, setGracePeriod] = useState('0');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    dataService.listCustomers().then(setCustomers).catch(() => setCustomers([]));
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) => 
      c.username.toLowerCase().includes(q) || 
      c.name.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const computedScheduledEnd = useMemo(() => {
    if (sessionType !== 'fixed') return '';
    const startDate = new Date(startedAt);
    const mins = parseInt(durationMinutes, 10) || 0;
    const endDate = new Date(startDate.getTime() + mins * 60000);
    return toLocalISOString(endDate);
  }, [sessionType, startedAt, durationMinutes]);

  const submit = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const payload: any = {
        device_id: device.id,
        session_type: sessionType,
        play_mode: playMode,
        grace_period_minutes: sessionType === 'fixed' ? (parseInt(gracePeriod, 10) || 0) : 0,
      };

      if (mode === 'existing') {
        if (!customerId) throw new Error(language === 'ar' ? 'يرجى اختيار عميل مسجل' : 'Please select a customer');
        payload.customer_id = customerId;
      } else {
        payload.customer_name = name.trim() || undefined;
      }

      const now = new Date();
      const start = new Date(startedAt);
      if (start.getTime() > now.getTime() + 10000) {
        throw new Error(language === 'ar' ? 'وقت البدء لا يمكن أن يكون في المستقبل' : 'Start time cannot be in the future');
      }
      payload.started_at = start.toISOString();

      if (sessionType === 'fixed') {
        payload.scheduled_end = new Date(computedScheduledEnd).toISOString();
      }

      await dataService.startSession(payload);
      onDone();
    } catch (err: any) {
      setErrorMsg(err.message || apiErrorMessage(err, 'Could not start session'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      title={language === 'ar' ? `بدء الجلسة · ${device.name}` : `Start Session · ${device.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>{t('cancel')}</Button>
          <Button
            loading={loading}
            disabled={mode === 'existing' && !customerId}
            onClick={submit}
            style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
          >
            {language === 'ar' ? 'بدء الجلسة' : 'Start Session'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px', textAlign: isRtl ? 'right' : 'left' }}>
        
        {/* Toggle Mode: Existing vs New Customer */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={mode === 'new' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
            style={{ flex: 1, fontSize: '13px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
            onClick={() => setMode('new')}
          >
            {language === 'ar' ? 'عميل جديد' : 'New Customer'}
          </button>
          <button
            type="button"
            className={mode === 'existing' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
            style={{ flex: 1, fontSize: '13px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
            onClick={() => setMode('existing')}
          >
            {language === 'ar' ? 'عميل مسجل' : 'Existing'}
          </button>
        </div>

        {mode === 'new' ? (
          <Input
            label={language === 'ar' ? 'اسم العميل (اختياري)' : 'Customer Display Name (optional)'}
            placeholder={language === 'ar' ? 'مثال: عمر خالد' : 'e.g. Omar Khalid'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        ) : (
          <>
            <Input
              label={language === 'ar' ? 'البحث عن عميل' : 'Search Customers'}
              placeholder={language === 'ar' ? 'اكتب اسم العميل...' : 'Type username...'}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCustomerId('');
              }}
            />
            <Select
              label={language === 'ar' ? 'اختر العميل*' : 'Select Customer*'}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={!customers || customers.length === 0}
            >
              <option value="">
                {customers === null 
                  ? (language === 'ar' ? 'جاري التحميل...' : 'Loading…') 
                  : filteredCustomers.length === 0 
                  ? (language === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching customers') 
                  : (language === 'ar' ? 'اختر عميلاً...' : 'Choose…')}
              </option>
              {filteredCustomers.map((c) => (
                <option key={c.id} value={c.id}>@{c.username} — {c.name}</option>
              ))}
            </Select>
          </>
        )}

        <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />

        {/* Toggle Session Type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span className="ccms-eyebrow" style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
            {language === 'ar' ? 'نوع الجلسة' : 'Session Type'}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={sessionType === 'open' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
              style={{ flex: 1, fontSize: '13px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
              onClick={() => setSessionType('open')}
            >
              {language === 'ar' ? 'وقت مفتوح' : 'Open Time'}
            </button>
            <button
              type="button"
              className={sessionType === 'fixed' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
              style={{ flex: 1, fontSize: '13px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
              onClick={() => setSessionType('fixed')}
            >
              {language === 'ar' ? 'وقت محدد' : 'Fixed Time'}
            </button>
          </div>
        </div>

        {/* Start time */}
        <Input
          type="datetime-local"
          label={language === 'ar' ? 'وقت البدء (تعديل تاريخي)' : 'Start Time (Backdate)'}
          value={startedAt}
          max={toLocalISOString(new Date())}
          onChange={(e) => setStartedAt(e.target.value)}
        />

        {sessionType === 'fixed' && (
          <>
            <div className="ccms-grid-form" style={{ gap: '12px' }}>
              <Input
                type="number"
                label={language === 'ar' ? 'المدة (بالدقائق)*' : 'Duration (minutes)*'}
                min="1"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
              <Input
                type="number"
                label={language === 'ar' ? 'فترة السماح (بالدقائق)' : 'Grace Period (minutes)'}
                min="0"
                value={gracePeriod}
                onChange={(e) => setGracePeriod(e.target.value)}
              />
            </div>
            {durationMinutes && startedAt && (
              <div style={{ fontSize: '12px', color: 'var(--accent-cyan)' }}>
                {language === 'ar' ? 'نهاية الجلسة المجدولة:' : 'Scheduled End:'} <strong>{new Date(computedScheduledEnd).toLocaleString(language === 'ar' ? 'ar-EG' : undefined)}</strong>
              </div>
            )}
          </>
        )}

        {errorMsg && (
          <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '8px', background: 'rgba(255, 68, 102, 0.1)', borderRadius: '6px', border: '1px solid rgba(255, 68, 102, 0.3)' }}>
            {errorMsg}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── End Session modal ─────────────────────────────────────────────────
export function EndSessionModal({
  session,
  onClose,
  onDone,
}: {
  session: Session;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, language, isRtl } = useLanguage();
  const { walletQrUrl, walletPhoneNumber, bankDetails } = useSystemSettings();
  const [endedAt, setEndedAt] = useState(toLocalISOString(new Date()));
  const [markPaid, setMarkPaid] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [showQrZoom, setShowQrZoom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [orders, setOrders] = useState<SessionOrder[] | null>(null);

  useEffect(() => {
    dataService.listSessionOrders(session.id)
      .then(setOrders)
      .catch((err) => console.error('Failed to list session orders in end modal:', err));
  }, [session.id]);

  const startedTime = new Date(session.started_at).getTime();
  const endingTime = new Date(endedAt).getTime();
  
  const pausedMinutes = session.total_paused_minutes || 0;
  const rawMinutes = Math.max(0, Math.ceil((endingTime - startedTime) / 60000));
  const effectiveMinutes = Math.max(0, rawMinutes - pausedMinutes);
  const billedMinutes = Math.max(30, effectiveMinutes);
  
  const rate = Number(
    session.hourly_rate_override !== null
      ? session.hourly_rate_override
      : (session.play_mode === 'multiplayer' ? session.device?.hourly_rate_multi : session.device?.hourly_rate) ?? 0
  );

  let overtimeMinutes = 0;
  let overtimeCost = 0;

  if (session.session_type === 'fixed' && session.scheduled_end) {
    const scheduledMinutes = Math.max(0, Math.ceil((new Date(session.scheduled_end).getTime() - startedTime) / 60000));
    const graceMinutes = Number(session.grace_period_minutes || 0);
    overtimeMinutes = Math.max(0, effectiveMinutes - scheduledMinutes - graceMinutes);
    if (overtimeMinutes > 0) {
      overtimeCost = (overtimeMinutes / 60) * rate * 1.0;
    }
  }

  const baseMinutes = billedMinutes - overtimeMinutes;
  const baseCost = (baseMinutes / 60) * rate;

  const cafeCost = orders ? orders.reduce((sum, ord) => sum + Number(ord.total_price), 0) : 0;
  const totalCost = baseCost + overtimeCost + cafeCost;

  const submit = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (endingTime < startedTime) {
        throw new Error(language === 'ar' ? 'وقت الانتهاء لا يمكن أن يكون أقدم من بدء اللعب' : 'End time cannot be earlier than start time');
      }
      const now = new Date();
      if (endingTime > now.getTime() + 10000) {
        throw new Error(language === 'ar' ? 'وقت الانتهاء لا يمكن أن يكون في المستقبل' : 'End time cannot be in the future');
      }

      await dataService.endSession(session.id, {
        ended_at: new Date(endedAt).toISOString(),
        mark_paid: markPaid,
        payment_method: paymentMethod,
      });

      onDone();
    } catch (err: any) {
      setErrorMsg(err.message || apiErrorMessage(err, 'Could not end session'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal
        open
        title={language === 'ar' ? `إنهاء الجلسة · ${session.device?.name ?? 'الجهاز'}` : `End Session · ${session.device?.name ?? 'Device'}`}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>{t('cancel')}</Button>
            <Button 
              variant="danger" 
              loading={loading} 
              disabled={session.is_paused}
              onClick={submit} 
              style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
            >
              {language === 'ar' ? 'إنهاء وإصدار الفاتورة' : 'End & Generate Invoice'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: isRtl ? 'right' : 'left' }}>
          <Input
            type="datetime-local"
            label={language === 'ar' ? 'وقت الانتهاء' : 'End Time'}
            value={endedAt}
            max={toLocalISOString(new Date())}
            onChange={(e) => setEndedAt(e.target.value)}
          />

          <div style={{ padding: '14px', background: 'var(--bg-input)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--border-default)' }}>
            <Row label={language === 'ar' ? 'العميل' : 'Customer'} value={session.customer ? `@${session.customer.username} (${session.customer.name})` : (language === 'ar' ? 'مستغل خارجي' : 'Walk-in')} />
            <Row label={language === 'ar' ? 'سعر الساعة' : 'Hourly Rate'} value={`${formatCurrency(rate)} / ${language === 'ar' ? 'ساعة' : 'hr'}`} />
            <Row label={language === 'ar' ? 'تاريخ البدء' : 'Started At'} value={new Date(session.started_at).toLocaleString(language === 'ar' ? 'ar-EG' : undefined)} />
            <Row 
              label={language === 'ar' ? 'الوقت المحسوب' : 'Billed Time'} 
              value={language === 'ar' 
                ? `${billedMinutes} دقيقة (الفعلي: ${effectiveMinutes} د، الحد الأدنى 30 د)`
                : `${billedMinutes} minutes (effective: ${effectiveMinutes}m, min 30m)`
              } 
            />
            {pausedMinutes > 0 && (
              <Row
                label={language === 'ar' ? 'الوقت المعلّق' : 'Paused Time'}
                value={`${pausedMinutes} ${language === 'ar' ? 'دقيقة' : 'min'}`}
                valueColor="var(--accent-yellow)"
              />
            )}
            
            <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
            
            <Row label={language === 'ar' ? 'التكلفة الأساسية' : 'Base Cost'} value={formatCurrency(baseCost)} />
            
            {session.session_type === 'fixed' && (
              <>
                <Row 
                  label={language === 'ar' ? 'دقائق الوقت الإضافي' : 'Overtime Minutes'} 
                  value={language === 'ar'
                    ? `${overtimeMinutes} دقيقة (مع تطبيق ${session.grace_period_minutes} د سماح)`
                    : `${overtimeMinutes} mins (${session.grace_period_minutes}m grace applied)`
                  } 
                  valueColor={overtimeMinutes > 0 ? 'var(--accent-red)' : 'var(--text-secondary)'}
                />
                <Row 
                  label={language === 'ar' ? 'تكلفة الوقت الإضافي' : 'Overtime Cost'} 
                  value={formatCurrency(overtimeCost)} 
                  valueColor={overtimeCost > 0 ? 'var(--accent-red)' : 'var(--text-secondary)'}
                />
              </>
            )}

            {cafeCost > 0 && (
              <>
                <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: isRtl ? 0 : '8px', paddingRight: isRtl ? '8px' : 0 }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
                    {language === 'ar' ? 'طلبات البوفيه:' : 'Café Orders:'}
                  </span>
                  {(orders ?? []).map((ord) => (
                    <div key={ord.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span>{ord.product?.name} (x{ord.quantity})</span>
                      <span>{formatCurrency(ord.total_price)}</span>
                    </div>
                  ))}
                </div>
                <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
                <Row label={language === 'ar' ? 'إجمالي تكلفة البوفيه' : 'Total Café Cost'} value={formatCurrency(cafeCost)} valueColor="var(--accent-cyan)" />
              </>
            )}

            <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
            
            <Row 
              label={language === 'ar' ? 'إجمالي الحساب' : 'Total Cost'} 
              value={formatCurrency(totalCost)} 
              valueColor="var(--accent-green)" 
              isBold 
            />
          </div>

          {session.is_paused && (
            <div style={{ color: 'var(--accent-yellow)', fontSize: '13px', padding: '10px 12px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '6px', border: '1px solid var(--accent-yellow)' }}>
              ⚠️ {language === 'ar' ? 'الجلسة معلّقة حالياً. يرجى استئناف الجلسة أولاً قبل إنهائها.' : 'Session is currently paused. Please resume the session before ending it.'}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              <input 
                type="checkbox" 
                checked={markPaid} 
                onChange={(e) => setMarkPaid(e.target.checked)} 
              />
              {language === 'ar' ? 'تسجيل كمدفوع فوراً' : 'Mark as Paid Immediately'}
            </label>
            
            {markPaid && (
              <>
                <Select
                  label={language === 'ar' ? 'طريقة الدفع' : 'Payment Method'}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  <option value="cash">{language === 'ar' ? 'نقدي' : 'Cash'}</option>
                  <option value="card">{language === 'ar' ? 'فيزا / كارت ائتمان' : 'Credit/Debit Card'}</option>
                  <option value="transfer">{language === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                  <option value="wallet">{language === 'ar' ? 'محفظة إلكترونية' : 'Digital Wallet'}</option>
                </Select>

                {/* Wallet Details & QR Code display */}
                {paymentMethod === 'wallet' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px', padding: '12px', background: 'var(--bg-elevated)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>qr_code_2</span>
                        {language === 'ar' ? 'سداد عبر المحفظة الإلكترونية (فودافون كاش)' : 'Pay via E-Wallet (Vodafone Cash)'}
                      </span>
                      {walletQrUrl && (
                        <button 
                          type="button" 
                          className="ccms-btn ccms-btn-ghost" 
                          style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--accent-green)' }}
                          onClick={() => setShowQrZoom(true)}
                        >
                          {language === 'ar' ? 'تكبير الـ QR' : 'Zoom QR'}
                        </button>
                      )}
                    </div>

                    {walletQrUrl ? (
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)' }}>
                        <img 
                          src={walletQrUrl} 
                          alt="Vodafone Cash QR" 
                          style={{ width: '100px', height: '100px', objectFit: 'contain', cursor: 'pointer', borderRadius: '4px' }} 
                          onClick={() => setShowQrZoom(true)}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#1E293B' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
                            {language === 'ar' ? 'امسح الـ QR للتحويل الفوري' : 'Scan QR code to pay'}
                          </span>
                          {walletPhoneNumber ? (
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#D97706', fontFamily: 'JetBrains Mono, monospace' }}>
                              📱 {walletPhoneNumber}
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#475569' }}>
                              {language === 'ar' ? 'حوالة فودافون كاش المباشرة' : 'Vodafone Cash Direct Wallet'}
                            </span>
                          )}
                          <span style={{ fontSize: '10px', color: '#64748B' }}>
                            {language === 'ar' ? 'تأكد من مطابقة المبلغ قبل إتمام العملية' : 'Please verify amount before transfer'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '10px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '6px', fontSize: '12px', color: 'var(--accent-yellow)', lineHeight: '1.5' }}>
                        ⚠️ {language === 'ar' ? 'لم يتم تعيين صورة الـ QR للمحفظة في الإعدادات بعد (الديفولت فارغة). يمكنك رفع صورة QR فودافون كاش من صفحة الإعدادات.' : 'No E-Wallet QR image set in settings yet. You can upload your QR code in the Settings page.'}
                      </div>
                    )}

                    <Input
                      label={language === 'ar' ? 'رقم عملية المحفظة / رقم المحوّل (اختياري)' : 'Wallet Transaction Ref / Phone (optional)'}
                      placeholder={language === 'ar' ? 'مثال: 010xxx أو رقم العملية' : 'e.g. 010xxx or TxID'}
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                    />
                  </div>
                )}

                {/* Card POS Details */}
                {paymentMethod === 'card' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px', padding: '12px', background: 'rgba(0, 194, 255, 0.05)', border: '1px solid rgba(0, 194, 255, 0.2)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>credit_card</span>
                      {language === 'ar' ? 'دفع عبر ماكينة الفيزا (POS)' : 'Card Terminal (POS)'}
                    </div>
                    <Input
                      label={language === 'ar' ? 'رقم العملية / مرجع ماكينة الـ POS (اختياري)' : 'POS Transaction Ref / Auth Code (optional)'}
                      placeholder={language === 'ar' ? 'مثال: Auth Code #123456' : 'e.g. Auth Code #123456'}
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                    />
                  </div>
                )}

                {/* Bank Transfer Details */}
                {paymentMethod === 'transfer' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px', padding: '12px', background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#c084fc' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>account_balance</span>
                      {language === 'ar' ? 'تحويل بنكي / InstaPay' : 'Bank Transfer / InstaPay'}
                    </div>
                    {bankDetails ? (
                      <div style={{ fontSize: '12px', background: '#111', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                        {bankDetails}
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {language === 'ar' ? 'يمكنك تدوين بيانات الحساب البنكي من صفحة الإعدادات.' : 'You can configure bank details in Settings.'}
                      </div>
                    )}
                    <Input
                      label={language === 'ar' ? 'رقم مرجع التحويل / اسم المحوّل (اختياري)' : 'Bank Reference / Sender Name (optional)'}
                      placeholder={language === 'ar' ? 'رقم الحوالة أو الاسم' : 'Transfer Ref or Name'}
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {errorMsg && (
            <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '8px', background: 'rgba(255, 68, 102, 0.1)', borderRadius: '6px', border: '1px solid rgba(255, 68, 102, 0.3)' }}>
              {errorMsg}
            </div>
          )}
        </div>
      </Modal>

      {/* QR Code Zoom Popup Modal */}
      {showQrZoom && walletQrUrl && (
        <Modal
          open
          title={language === 'ar' ? 'رمز QR المحفظة الإلكترونية (فودافون كاش)' : 'E-Wallet QR Code (Vodafone Cash)'}
          onClose={() => setShowQrZoom(false)}
          width={380}
          footer={
            <Button onClick={() => setShowQrZoom(false)} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
              {language === 'ar' ? 'إغلاق' : 'Close'}
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '10px' }}>
            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '16px', boxShadow: '0 0 24px rgba(34, 197, 94, 0.3)' }}>
              <img src={walletQrUrl} alt="QR Code Large" style={{ width: '240px', height: '240px', objectFit: 'contain' }} />
            </div>
            {walletPhoneNumber && (
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace' }}>
                📱 {walletPhoneNumber}
              </div>
            )}
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
              {language === 'ar' ? 'قم بمسح الكود من تطبيق محفظتك الإلكترونية على الهاتف لإكمال عملية التحويل.' : 'Scan code using your mobile wallet app to complete payment.'}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── Edit Session modal ─────────────────────────────────────────────────
export function EditSessionModal({
  session,
  onClose,
  onDone,
}: {
  session: Session;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, language, isRtl } = useLanguage();
  const [startedAt, setStartedAt] = useState(toLocalISOString(new Date(session.started_at)));
  const [scheduledEnd, setScheduledEnd] = useState(session.scheduled_end ? toLocalISOString(new Date(session.scheduled_end)) : '');
  const [gracePeriod, setGracePeriod] = useState(session.grace_period_minutes.toString());
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const start = new Date(startedAt);
      const origStart = new Date(session.started_at);
      const now = new Date();
      if (start.getTime() > now.getTime() + 10000) {
        throw new Error(language === 'ar' ? 'وقت البدء لا يمكن أن يكون في المستقبل' : 'Start time cannot be in the future');
      }

      if (start.getTime() > origStart.getTime() + 1000) {
        throw new Error(
          language === 'ar'
            ? 'غير مسموح بتقديم وقت البدء لزمن أحدث من الوقت الأصلي لمنع التلاعب بالحسابات (يُسمح فقط بالتأريخ التراجعي Backdate).'
            : 'Start time cannot be moved forward to a later time than the original start time.'
        );
      }

      const patch: any = {
        started_at: start.toISOString(),
      };

      if (session.session_type === 'fixed') {
        if (!scheduledEnd) throw new Error(language === 'ar' ? 'وقت الانتهاء المجدول مطلوب للجلسات المحددة' : 'Scheduled end is required for fixed sessions');
        const end = new Date(scheduledEnd);
        if (end.getTime() <= start.getTime()) {
          throw new Error(language === 'ar' ? 'وقت الانتهاء المجدول يجب أن يكون بعد وقت البدء' : 'Scheduled end must be after started_at');
        }
        patch.scheduled_end = end.toISOString();
        patch.grace_period_minutes = parseInt(gracePeriod, 10) || 0;
      }

      await dataService.updateSession(session.id, patch);
      onDone();
    } catch (err: any) {
      setErrorMsg(err.message || apiErrorMessage(err, 'Could not update session'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      title={language === 'ar' ? `تعديل الجلسة النشطة · ${session.device?.name ?? 'الجهاز'}` : `Edit Active Session · ${session.device?.name ?? 'Device'}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>{t('cancel')}</Button>
          <Button loading={loading} onClick={submit} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
            {language === 'ar' ? 'حفظ التغييرات' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: isRtl ? 'right' : 'left' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          {language === 'ar' 
            ? 'تعديل خيارات الجلسة الحالية. سيتم تسجيل أي تغيير في سجل التدقيق لأمان النظام.'
            : 'Adjust active session parameters. Every change will be logged in the audit trail.'}
        </p>

        <Input
          type="datetime-local"
          label={language === 'ar' ? 'وقت البدء (تأريخ تراجعي فقط - Backdate Only)' : 'Start Time (Backdate Only)'}
          value={startedAt}
          max={toLocalISOString(new Date(session.started_at))}
          onChange={(e) => setStartedAt(e.target.value)}
        />

        {session.session_type === 'fixed' && (
          <>
            <Input
              type="datetime-local"
              label={language === 'ar' ? 'نهاية الجلسة المجدولة' : 'Scheduled End Time'}
              value={scheduledEnd}
              onChange={(e) => setScheduledEnd(e.target.value)}
            />
            <Input
              type="number"
              label={language === 'ar' ? 'فترة السماح (بالدقائق)' : 'Grace Period (minutes)'}
              min="0"
              value={gracePeriod}
              onChange={(e) => setGracePeriod(e.target.value)}
            />
          </>
        )}

        {errorMsg && (
          <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '8px', background: 'rgba(255, 68, 102, 0.1)', borderRadius: '6px', border: '1px solid rgba(255, 68, 102, 0.3)' }}>
            {errorMsg}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Local Sub-Modal to view Audit Logs ───────────────────────────────
export function AuditLogModal({ 
  session, 
  onClose 
}: { 
  session: Session; 
  onClose: () => void 
}) {
  const { language, isRtl } = useLanguage();
  const [logs, setLogs] = useState<SessionAuditLog[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dataService.getSessionAuditLogs(session.id)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [session.id]);

  return (
    <Modal
      open
      title={language === 'ar' ? `سجل تدقيق وتغييرات الجلسة · @${session.customer?.username ?? 'walkin'}` : `Session Audit Trail · @${session.customer?.username ?? 'walkin'}`}
      onClose={onClose}
      footer={<Button onClick={onClose} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>{language === 'ar' ? 'إغلاق' : 'Close'}</Button>}
    >
      {loading ? (
        <LoadingSpinner label={language === 'ar' ? 'جاري جلب سجلات التدقيق...' : 'Fetching audit logs…'} />
      ) : !logs || logs.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '16px' }}>
          {language === 'ar' ? 'لم يتم العثور على أي تغييرات مسجلة.' : 'No audit records found.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '50vh', overflowY: 'auto', paddingRight: '4px', textAlign: isRtl ? 'right' : 'left' }}>
          {logs.map((log) => (
            <div 
              key={log.id} 
              style={{
                padding: '10px 12px',
                background: 'var(--bg-input)',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                fontSize: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-cyan)', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold' }}>{language === 'ar' ? `تم تعديل حقل: ${log.field_changed}` : `Changed: ${log.field_changed}`}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{new Date(log.edited_at).toLocaleString(language === 'ar' ? 'ar-EG' : undefined)}</span>
              </div>
              <div style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                <strong>{language === 'ar' ? 'القيمة السابقة:' : 'Old:'}</strong> {log.old_value !== null ? log.old_value : '—'} <br />
                <strong>{language === 'ar' ? 'القيمة الجديدة:' : 'New:'}</strong> {log.new_value !== null ? log.new_value : '—'}
              </div>
              {log.editor?.full_name && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '6px', textAlign: isRtl ? 'left' : 'right' }}>
                  {language === 'ar' ? `تم التعديل بواسطة الموظف: ` : `Edited by: `}<strong>{log.editor.full_name}</strong>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Row({ 
  label, 
  value, 
  valueColor = 'var(--text-primary)', 
  isBold = false 
}: { 
  label: string; 
  value: string; 
  valueColor?: string; 
  isBold?: boolean 
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: valueColor, fontWeight: isBold ? 700 : 500 }}>{value}</span>
    </div>
  );
}
