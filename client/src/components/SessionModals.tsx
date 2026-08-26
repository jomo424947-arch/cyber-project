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

export { TransferSessionModal } from './TransferSessionModal';
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
  const [hasActiveShift, setHasActiveShift] = useState<boolean | null>(null);

  useEffect(() => {
    dataService.listCustomers().then(setCustomers).catch(() => setCustomers([]));
    dataService.getActiveShift().then((shift) => setHasActiveShift(!!shift)).catch(() => setHasActiveShift(true));
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
      const msg = apiErrorMessage(err, language === 'ar' ? 'فشل بدء الجلسة' : 'Could not start session');
      setErrorMsg(msg);
      if (err?.response?.data?.error?.code === 'NO_ACTIVE_SHIFT' || msg.includes('وردية') || msg.includes('shift')) {
        setHasActiveShift(false);
      }
    } finally {
      setLoading(false);
    }
  };

  if (hasActiveShift === false) {
    return (
      <Modal
        open
        title={language === 'ar' ? 'تنبيه: لا توجد وردية مفتوحة' : 'Warning: No Active Shift'}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                window.location.href = '/shifts';
              }}
              style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
            >
              {language === 'ar' ? 'الانتقال لصفحة الورديات لبدء الوردية' : 'Go to Shifts to Start'}
            </Button>
          </>
        }
      >
        <div style={{ textAlign: 'center', padding: '16px 8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--accent-yellow)', marginBottom: '12px' }}>
            schedule
          </span>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
            {language === 'ar' ? 'يجب بدء الوردية أولاً' : 'Shift Required'}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
            {language === 'ar'
              ? 'حسب قواعد النظام المحاسبي، لا يمكن بدء أي جلسات أو إصدار فواتير دون وجود وردية عمل مفتوحة للموظف لتسجيل العهدة والإيرادات.'
              : 'Per accounting rules, starting gaming sessions or generating invoices requires an active staff shift.'}
          </p>
        </div>
      </Modal>
    );
  }

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
          <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '10px 12px', background: 'rgba(255, 68, 102, 0.1)', borderRadius: '8px', border: '1px solid rgba(255, 68, 102, 0.3)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>{errorMsg}</div>
            {(errorMsg.includes('وردية') || errorMsg.includes('shift') || errorMsg.includes('400')) && (
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  window.location.href = '/shifts';
                }}
                style={{ alignSelf: 'flex-start', fontSize: '12px', padding: '4px 12px', marginTop: '4px' }}
              >
                {language === 'ar' ? 'فتح صفحة الورديات لبدء الوردية' : 'Open Shifts to Start'}
              </Button>
            )}
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
  const [transfers, setTransfers] = useState<any[] | null>(null);

  // Discount state (percentage & fixed amount inputs)
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [discountPercentVal, setDiscountPercentVal] = useState<string>('');
  const [discountFixedVal, setDiscountFixedVal] = useState<string>('');
  
  // Service fee state (percentage & fixed amount inputs)
  const [serviceType, setServiceType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [servicePercentVal, setServicePercentVal] = useState<string>('');
  const [serviceFixedVal, setServiceFixedVal] = useState<string>('');

  // Rounding mode state
  const [roundingMode, setRoundingMode] = useState<'none' | 'floor_5' | 'nearest_5' | 'nearest_10'>('none');
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');

  useEffect(() => {
    dataService.listSessionOrders(session.id)
      .then(setOrders)
      .catch((err) => console.error('Failed to list session orders in end modal:', err));

    dataService.listSessionTransfers(session.id)
      .then(setTransfers)
      .catch((err) => console.error('Failed to list session transfers in end modal:', err));
  }, [session.id]);

  const startedTime = new Date(session.started_at).getTime();
  const endingTime = new Date(endedAt).getTime();
  
  const pausedMinutes = session.total_paused_minutes || 0;
  const elapsedSec = Math.max(0, Math.floor((endingTime - startedTime) / 1000));
  const rawMinutes = elapsedSec > 0 ? Math.max(1, Math.round(elapsedSec / 60)) : 0;
  const effectiveMinutes = Math.max(0, rawMinutes - pausedMinutes);
  
  // Previous transfers
  const transfersCost = transfers ? transfers.reduce((sum, t) => sum + Number(t.cost || 0), 0) : 0;
  
  const minBilling = 0;
  const billedMinutes = Math.max(minBilling, effectiveMinutes);
  
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
  const currentSegmentCost = baseCost + overtimeCost;
  const totalDeviceCost = currentSegmentCost + transfersCost;

  // Café orders cost
  const cafeCost = orders ? orders.reduce((sum, ord) => sum + Number(ord.total_price), 0) : 0;
  
  // Subtotal before discounts and fees
  const subtotal = Math.round((totalDeviceCost + cafeCost) * 100) / 100;

  // 1. Discount calculation
  let parsedDiscountVal = 0;
  let discountAmount = 0;
  if (discountType === 'percentage') {
    parsedDiscountVal = parseFloat(discountPercentVal) || 0;
    if (parsedDiscountVal > 0) {
      discountAmount = Math.round(subtotal * (Math.min(100, parsedDiscountVal) / 100) * 100) / 100;
    }
  } else if (discountType === 'fixed') {
    parsedDiscountVal = parseFloat(discountFixedVal) || 0;
    if (parsedDiscountVal > 0) {
      discountAmount = Math.min(subtotal, Math.round(parsedDiscountVal * 100) / 100);
    }
  }
  const afterDiscount = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

  // 2. Service fee calculation
  let parsedServiceVal = 0;
  let serviceFee = 0;
  if (serviceType === 'percentage') {
    parsedServiceVal = parseFloat(servicePercentVal) || 0;
    if (parsedServiceVal > 0) {
      serviceFee = Math.round(afterDiscount * (parsedServiceVal / 100) * 100) / 100;
    }
  } else if (serviceType === 'fixed') {
    parsedServiceVal = parseFloat(serviceFixedVal) || 0;
    if (parsedServiceVal > 0) {
      serviceFee = Math.round(parsedServiceVal * 100) / 100;
    }
  }
  const beforeRounding = Math.round((afterDiscount + serviceFee) * 100) / 100;

  // 3. Cash Rounding / Fakkah calculation
  let calculatedDelta = 0;
  if (roundingMode === 'floor_5') {
    const target = Math.floor(beforeRounding / 5) * 5;
    calculatedDelta = Math.round((target - beforeRounding) * 100) / 100;
  } else if (roundingMode === 'nearest_5') {
    const target = Math.round(beforeRounding / 5) * 5;
    calculatedDelta = Math.round((target - beforeRounding) * 100) / 100;
  } else if (roundingMode === 'nearest_10') {
    const target = Math.round(beforeRounding / 10) * 10;
    calculatedDelta = Math.round((target - beforeRounding) * 100) / 100;
  }
  const finalTotalCost = Math.max(0, Math.round((beforeRounding + calculatedDelta) * 100) / 100);

  // Rounding options dynamic targets
  const floor5Target = Math.floor(beforeRounding / 5) * 5;
  const floor5Diff = Math.round((floor5Target - beforeRounding) * 100) / 100;
  const nearest5Target = Math.round(beforeRounding / 5) * 5;
  const nearest5Diff = Math.round((nearest5Target - beforeRounding) * 100) / 100;
  const nearest10Target = Math.round(beforeRounding / 10) * 10;
  const nearest10Diff = Math.round((nearest10Target - beforeRounding) * 100) / 100;

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
        discount_type: discountType,
        discount_value: parsedDiscountVal,
        service_fee: serviceFee,
        service_rate: serviceType === 'percentage' ? parsedServiceVal : 0,
        rounding_delta: calculatedDelta,
        notes: invoiceNotes.trim() || undefined,
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
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent-red)', fontSize: '22px' }}>
              receipt_long
            </span>
            <span>
              {language === 'ar'
                ? `إنهاء الجلسة وإصدار الفاتورة · ${session.device?.name ?? 'الجهاز'}`
                : `End Session & Invoice · ${session.device?.name ?? 'Device'}`}
            </span>
          </div>
        }
        onClose={onClose}
        width={580}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>{t('cancel')}</Button>
            <Button 
              variant="danger" 
              loading={loading} 
              disabled={session.is_paused}
              onClick={submit} 
              style={{
                fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                fontWeight: 700,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
              {language === 'ar' ? `إنهاء ودفع (${formatCurrency(finalTotalCost)})` : `End & Checkout (${formatCurrency(finalTotalCost)})`}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: isRtl ? 'right' : 'left', maxHeight: '72vh', overflowY: 'auto', paddingRight: '4px' }}>
          
          <Input
            type="datetime-local"
            label={language === 'ar' ? 'وقت الانتهاء' : 'End Time'}
            value={endedAt}
            max={toLocalISOString(new Date())}
            onChange={(e) => setEndedAt(e.target.value)}
          />

          {/* Session Breakdown Box */}
          <div style={{ padding: '14px', background: 'var(--bg-input)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--border-default)' }}>
            <Row label={language === 'ar' ? 'العميل' : 'Customer'} value={session.customer ? `@${session.customer.username} (${session.customer.name})` : (language === 'ar' ? 'مستغل خارجي' : 'Walk-in')} />
            <Row label={language === 'ar' ? 'الجهاز الحالي' : 'Current Device'} value={`${session.device?.name} (${formatCurrency(rate)}/س)`} />
            <Row label={language === 'ar' ? 'تاريخ البدء' : 'Started At'} value={new Date(session.started_at).toLocaleString(language === 'ar' ? 'ar-EG' : undefined)} />
            <Row 
              label={language === 'ar' ? 'الوقت المحسوب للجهاز الحالي' : 'Current Billed Time'} 
              value={language === 'ar' 
                ? `${effectiveMinutes} دقيقة`
                : `${effectiveMinutes} minutes`
              } 
            />
            {pausedMinutes > 0 && (
              <Row
                label={language === 'ar' ? 'الوقت المعلّق' : 'Paused Time'}
                value={`${pausedMinutes} ${language === 'ar' ? 'دقيقة' : 'min'}`}
                valueColor="var(--accent-yellow)"
              />
            )}
            
            <Row label={language === 'ar' ? 'تكلفة الجهاز الحالي' : 'Current Device Cost'} value={formatCurrency(currentSegmentCost)} />

            {/* Previous Transfers Breakdown */}
            {transfers && transfers.length > 0 && (
              <>
                <hr style={{ border: '0', borderTop: '1px dashed var(--border-default)', margin: '4px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--accent-purple)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>swap_horiz</span>
                    {language === 'ar' ? 'مراحل التحويل السابقة:' : 'Previous Transfers:'}
                  </span>
                  {transfers.map((tr, idx) => (
                    <div key={tr.id || idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span>{tr.from_device?.name ?? 'الجهاز السابق'} ({tr.duration_minutes} دقيقة)</span>
                      <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>{formatCurrency(tr.cost)}</span>
                    </div>
                  ))}
                </div>
                <Row label={language === 'ar' ? 'إجمالي تكلفة التحويلات السابقة' : 'Transfers Total'} value={formatCurrency(transfersCost)} valueColor="var(--accent-purple)" />
              </>
            )}

            {/* Overtime in fixed sessions */}
            {session.session_type === 'fixed' && overtimeMinutes > 0 && (
              <>
                <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
                <Row 
                  label={language === 'ar' ? 'دقائق الوقت الإضافي' : 'Overtime Minutes'} 
                  value={`${overtimeMinutes} دقيقة`} 
                  valueColor="var(--accent-red)"
                />
                <Row 
                  label={language === 'ar' ? 'تكلفة الوقت الإضافي' : 'Overtime Cost'} 
                  value={formatCurrency(overtimeCost)} 
                  valueColor="var(--accent-red)"
                />
              </>
            )}

            {/* Café Orders */}
            {cafeCost > 0 && (
              <>
                <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {language === 'ar' ? 'طلبات البوفيه:' : 'Café Orders:'}
                  </span>
                  {(orders ?? []).map((ord) => (
                    <div key={ord.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span>{ord.product?.name} (×{ord.quantity})</span>
                      <span>{formatCurrency(ord.total_price)}</span>
                    </div>
                  ))}
                </div>
                <Row label={language === 'ar' ? 'إجمالي تكلفة البوفيه' : 'Total Café Cost'} value={formatCurrency(cafeCost)} valueColor="var(--accent-cyan)" />
              </>
            )}

            <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
            
            {/* Subtotal */}
            <Row 
              label={language === 'ar' ? 'المجموع الفرعي (قبل الخصم والخدمة)' : 'Subtotal'} 
              value={formatCurrency(subtotal)} 
              valueColor="#FFFFFF" 
              isBold 
            />
          </div>

          {/* ─── SECTION 1: DISCOUNT / التخفيض ─── */}
          <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>local_offer</span>
                {language === 'ar' ? 'الخصم / التخفيض' : 'Discount'}
              </span>
              {discountAmount > 0 && (
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace' }}>
                  - {formatCurrency(discountAmount)}
                </span>
              )}
            </div>

            {/* Side-by-Side: Percentage Box and Fixed Amount Box */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Field 1: Discount Percentage */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: discountType === 'percentage' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
                  {language === 'ar' ? 'نسبة مئوية (%)' : 'Percentage (%)'}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={discountPercentVal}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDiscountPercentVal(v);
                      if (v && parseFloat(v) > 0) {
                        setDiscountType('percentage');
                        setDiscountFixedVal('');
                      } else if (!discountFixedVal) {
                        setDiscountType('none');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 24px 8px 10px',
                      background: discountType === 'percentage' ? 'rgba(0, 194, 255, 0.08)' : 'var(--bg-input)',
                      border: discountType === 'percentage' ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      fontWeight: 700,
                      fontFamily: 'JetBrains Mono, monospace',
                      outline: 'none',
                    }}
                  />
                  <span style={{ position: 'absolute', [isRtl ? 'left' : 'right']: '8px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700 }}>
                    %
                  </span>
                </div>
              </div>

              {/* Field 2: Fixed Amount */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: discountType === 'fixed' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
                  {language === 'ar' ? 'مبلغ ثابت بالعملة (ج)' : 'Fixed Amount (EGP)'}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={discountFixedVal}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDiscountFixedVal(v);
                      if (v && parseFloat(v) > 0) {
                        setDiscountType('fixed');
                        setDiscountPercentVal('');
                      } else if (!discountPercentVal) {
                        setDiscountType('none');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 28px 8px 10px',
                      background: discountType === 'fixed' ? 'rgba(0, 194, 255, 0.08)' : 'var(--bg-input)',
                      border: discountType === 'fixed' ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      fontWeight: 700,
                      fontFamily: 'JetBrains Mono, monospace',
                      outline: 'none',
                    }}
                  />
                  <span style={{ position: 'absolute', [isRtl ? 'left' : 'right']: '8px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    {language === 'ar' ? 'ج' : 'EGP'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── SECTION 2: SERVICE FEE / خدمة الصالة ─── */}
          <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-yellow)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>room_service</span>
                {language === 'ar' ? 'رسوم الخدمة / خدمة الصالة' : 'Service Fee'}
              </span>
              {serviceFee > 0 && (
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-yellow)', fontFamily: 'JetBrains Mono, monospace' }}>
                  + {formatCurrency(serviceFee)}
                </span>
              )}
            </div>

            {/* Side-by-Side: Percentage Box and Fixed Amount Box */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Field 1: Service Percentage */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: serviceType === 'percentage' ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}>
                  {language === 'ar' ? 'نسبة مئوية (%)' : 'Percentage (%)'}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={servicePercentVal}
                    onChange={(e) => {
                      const v = e.target.value;
                      setServicePercentVal(v);
                      if (v && parseFloat(v) > 0) {
                        setServiceType('percentage');
                        setServiceFixedVal('');
                      } else if (!serviceFixedVal) {
                        setServiceType('none');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 24px 8px 10px',
                      background: serviceType === 'percentage' ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-input)',
                      border: serviceType === 'percentage' ? '1.5px solid var(--accent-yellow)' : '1px solid var(--border-default)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      fontWeight: 700,
                      fontFamily: 'JetBrains Mono, monospace',
                      outline: 'none',
                    }}
                  />
                  <span style={{ position: 'absolute', [isRtl ? 'left' : 'right']: '8px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700 }}>
                    %
                  </span>
                </div>
              </div>

              {/* Field 2: Fixed Service Amount */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: serviceType === 'fixed' ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}>
                  {language === 'ar' ? 'مبلغ ثابت بالعملة (ج)' : 'Fixed Amount (EGP)'}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={serviceFixedVal}
                    onChange={(e) => {
                      const v = e.target.value;
                      setServiceFixedVal(v);
                      if (v && parseFloat(v) > 0) {
                        setServiceType('fixed');
                        setServicePercentVal('');
                      } else if (!servicePercentVal) {
                        setServiceType('none');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 28px 8px 10px',
                      background: serviceType === 'fixed' ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-input)',
                      border: serviceType === 'fixed' ? '1.5px solid var(--accent-yellow)' : '1px solid var(--border-default)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      fontWeight: 700,
                      fontFamily: 'JetBrains Mono, monospace',
                      outline: 'none',
                    }}
                  />
                  <span style={{ position: 'absolute', [isRtl ? 'left' : 'right']: '8px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    {language === 'ar' ? 'ج' : 'EGP'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── SECTION 3: CASH ROUNDING / تسوية الفكة ─── */}
          <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>price_change</span>
                {language === 'ar' ? 'تقريب الحساب / تسوية الفكة' : 'Cash Rounding & Change'}
              </span>
              {calculatedDelta !== 0 && (
                <span style={{ fontSize: '12px', fontWeight: 700, color: calculatedDelta < 0 ? 'var(--accent-green)' : 'var(--accent-cyan)' }}>
                  {calculatedDelta < 0 ? `- ${formatCurrency(Math.abs(calculatedDelta))}` : `+ ${formatCurrency(calculatedDelta)}`}
                </span>
              )}
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
              {language === 'ar' 
                ? `المبلغ قبل التقريب: ${formatCurrency(beforeRounding)}. يمكنك تقريب المبلغ لتفادي مشاكل الفكة:` 
                : `Amount before rounding: ${formatCurrency(beforeRounding)}.`}
            </p>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {/* Option 1: Exact (No Rounding) */}
              <button
                type="button"
                onClick={() => setRoundingMode('none')}
                style={{
                  padding: '5px 10px',
                  borderRadius: '16px',
                  border: roundingMode === 'none' ? '1px solid #38bdf8' : '1px solid var(--border-default)',
                  background: roundingMode === 'none' ? 'rgba(56, 189, 248, 0.2)' : 'var(--bg-input)',
                  color: roundingMode === 'none' ? '#FFFFFF' : 'var(--text-secondary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {language === 'ar' ? `المبلغ الدقيق (${formatCurrency(beforeRounding)})` : `Exact (${formatCurrency(beforeRounding)})`}
              </button>

              {/* Option 2: Floor 5 (Forgive change / خصم الفكة) */}
              {floor5Diff !== 0 && (
                <button
                  type="button"
                  onClick={() => setRoundingMode('floor_5')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '16px',
                    border: roundingMode === 'floor_5' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                    background: roundingMode === 'floor_5' ? 'rgba(0, 194, 255, 0.2)' : 'var(--bg-input)',
                    color: roundingMode === 'floor_5' ? '#FFFFFF' : 'var(--accent-cyan)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {language === 'ar' ? `خصم الفكة لـ ${formatCurrency(floor5Target)} (${floor5Diff} ج)` : `Floor to ${formatCurrency(floor5Target)}`}
                </button>
              )}

              {/* Option 3: Nearest 5 */}
              {nearest5Diff !== 0 && nearest5Target !== floor5Target && (
                <button
                  type="button"
                  onClick={() => setRoundingMode('nearest_5')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '16px',
                    border: roundingMode === 'nearest_5' ? '1px solid #38bdf8' : '1px solid var(--border-default)',
                    background: roundingMode === 'nearest_5' ? 'rgba(56, 189, 248, 0.2)' : 'var(--bg-input)',
                    color: roundingMode === 'nearest_5' ? '#FFFFFF' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {language === 'ar' ? `تقريب لأقرب 5 (${formatCurrency(nearest5Target)})` : `Nearest 5 (${formatCurrency(nearest5Target)})`}
                </button>
              )}

              {/* Option 4: Nearest 10 */}
              {nearest10Diff !== 0 && nearest10Target !== floor5Target && nearest10Target !== nearest5Target && (
                <button
                  type="button"
                  onClick={() => setRoundingMode('nearest_10')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '16px',
                    border: roundingMode === 'nearest_10' ? '1px solid #38bdf8' : '1px solid var(--border-default)',
                    background: roundingMode === 'nearest_10' ? 'rgba(56, 189, 248, 0.2)' : 'var(--bg-input)',
                    color: roundingMode === 'nearest_10' ? '#FFFFFF' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {language === 'ar' ? `تقريب لأقرب 10 (${formatCurrency(nearest10Target)})` : `Nearest 10 (${formatCurrency(nearest10Target)})`}
                </button>
              )}
            </div>
          </div>

          {/* ─── FINAL NET TOTAL BOX ─── */}
          <div
            style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, rgba(0, 194, 255, 0.08) 0%, rgba(0, 102, 255, 0.03) 100%)',
              border: '1px solid rgba(0, 194, 255, 0.28)',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF' }}>
                {language === 'ar' ? 'الإجمالي الصافي المطلوب دفعه:' : 'Net Total Due:'}
              </span>
              <span
                style={{
                  fontSize: '24px',
                  fontWeight: 900,
                  color: 'var(--accent-cyan)',
                  fontFamily: 'JetBrains Mono, monospace',
                  textShadow: '0 0 12px rgba(0, 194, 255, 0.35)',
                }}
              >
                {formatCurrency(finalTotalCost)}
              </span>
            </div>

            {(discountAmount > 0 || serviceFee > 0 || calculatedDelta !== 0) && (
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span>المجموع: {formatCurrency(subtotal)}</span>
                {discountAmount > 0 && <span style={{ color: 'var(--accent-cyan)' }}>خصم: -{formatCurrency(discountAmount)}</span>}
                {serviceFee > 0 && <span style={{ color: 'var(--accent-yellow)' }}>خدمة: +{formatCurrency(serviceFee)}</span>}
                {calculatedDelta !== 0 && <span>تقريب: {calculatedDelta > 0 ? `+${calculatedDelta}` : calculatedDelta} ج</span>}
              </div>
            )}
          </div>

          <Input
            label={language === 'ar' ? 'ملاحظات الفاتورة (اختياري)' : 'Invoice Notes (optional)'}
            placeholder={language === 'ar' ? 'مثال: سبب الخصم أو ملاحظات الدفع' : 'e.g. Discount reason...'}
            value={invoiceNotes}
            onChange={(e) => setInvoiceNotes(e.target.value)}
          />

          {session.is_paused && (
            <div style={{ color: 'var(--accent-yellow)', fontSize: '13px', padding: '10px 12px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '6px', border: '1px solid var(--accent-yellow)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>pause_circle</span>
              <span>{language === 'ar' ? 'الجلسة معلّقة حالياً. يرجى استئناف الجلسة أولاً قبل إنهائها.' : 'Session is currently paused. Please resume the session before ending it.'}</span>
            </div>
          )}

          {/* Payment Method & Shift Checkbox */}
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
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#D97706', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>phone_iphone</span>
                              {walletPhoneNumber}
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
                      <div style={{ padding: '10px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '6px', fontSize: '12px', color: 'var(--accent-yellow)', lineHeight: '1.5', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>info</span>
                        <span>{language === 'ar' ? 'لم يتم تعيين صورة الـ QR للمحفظة في الإعدادات بعد (الديفولت فارغة). يمكنك رفع صورة QR فودافون كاش من صفحة الإعدادات.' : 'No E-Wallet QR image set in settings yet. You can upload your QR code in the Settings page.'}</span>
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
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>phone_iphone</span>
                {walletPhoneNumber}
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
