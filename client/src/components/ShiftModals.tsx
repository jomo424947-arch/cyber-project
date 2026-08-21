import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency } from '../utils/format';
import type { Shift, ShiftSummary } from '../types';

// ============================================================================
// 1. START SHIFT MODAL
// ============================================================================
export function StartShiftModal({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  onStarted?: (shift: Shift) => void;
}) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [startNotes, setStartNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const handleStartShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const newShift = await dataService.startShift({
        opening_cash: Number(openingCash) || 0,
        notes: startNotes.trim() || undefined,
      });
      toast(language === 'ar' ? 'تم بدء الوردية بنجاح!' : 'Shift started successfully!', 'success');
      setOpeningCash(0);
      setStartNotes('');
      window.dispatchEvent(new CustomEvent('shift-changed', { detail: newShift }));
      onClose();
      if (onStarted) onStarted(newShift);
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not start shift'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--accent-cyan)', fontSize: '22px' }}>
            play_circle
          </span>
          <span>{language === 'ar' ? 'بدء وردية جديدة' : 'Start Work Shift'}</span>
        </div>
      }
    >
      <form onSubmit={handleStartShift} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
          {language === 'ar'
            ? 'أدخل مبلغ العهدة النقدية الموجودة في الكاشير عند بدء استلامك للوردية.'
            : 'Enter the opening float cash present in the register drawer at the start of your shift.'}
        </p>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            {language === 'ar' ? 'العهدة الافتتاحية (المبلغ في الكاشير) * (إلزامي)' : 'Opening Float Cash * (Required)'}
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            required
            value={openingCash}
            onChange={(e) => setOpeningCash(Number(e.target.value))}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '16px',
              fontWeight: 700,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            {language === 'ar' ? 'ملاحظات عند البدء (اختياري)' : 'Opening Notes (Optional)'}
          </label>
          <textarea
            rows={3}
            value={startNotes}
            onChange={(e) => setStartNotes(e.target.value)}
            placeholder={language === 'ar' ? 'أي ملاحظات خاصة عند استلام الوردية...' : 'Any opening remarks...'}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              resize: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? (language === 'ar' ? 'جارٍ البدء...' : 'Starting...') : language === 'ar' ? 'تأكيد وبدء الوردية' : 'Start Shift'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// 2. CLOSE SHIFT MODAL WITH AUTO LOGOUT
// ============================================================================
export function CloseShiftModal({
  open,
  shift,
  onClose,
  onClosed,
}: {
  open: boolean;
  shift: Shift | null;
  onClose: () => void;
  onClosed?: () => void;
}) {
  const { logout } = useAuth();
  const { language } = useLanguage();
  const { toast } = useToast();
  const [closingCash, setClosingCash] = useState<number | ''>('');
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const activeOpening = Number(shift?.opening_cash || 0);
  const activeRev = Number(shift?.total_revenue || 0);
  const activeExp = Number(shift?.total_expenses || 0);
  const activeExpectedCash = activeOpening + activeRev - activeExp;

  const isDiscrepant = closingCash !== '' && Math.abs(Number(closingCash) - activeExpectedCash) > 0.01;
  const canSubmit = closingCash !== '' && Number(closingCash) >= 0 && (!isDiscrepant || closeNotes.trim().length > 0);

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift) return;

    if (closingCash === '' || Number(closingCash) < 0) {
      toast(language === 'ar' ? 'يجب إدخال المبلغ الفعلي الموجود بالدرج' : 'Actual counted cash is required', 'error');
      return;
    }

    if (isDiscrepant && !closeNotes.trim()) {
      toast(language === 'ar' ? 'يجب كتابة سبب العجز أو الزيادة في خانة الملاحظات' : 'Please provide remarks explaining the discrepancy', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await dataService.closeShift(shift.id, {
        closing_cash: Number(closingCash),
        notes: closeNotes.trim() || undefined,
      });
      toast(language === 'ar' ? 'تم إغلاق الوردية وتسجيل الخروج بنجاح' : 'Shift closed. Logged out successfully.', 'success');
      window.dispatchEvent(new CustomEvent('shift-changed', { detail: null }));
      onClose();
      if (onClosed) onClosed();
      // Automatic logout on shift close
      await logout();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not close shift'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--accent-red)', fontSize: '22px' }}>
            lock_clock
          </span>
          <span>{language === 'ar' ? 'إغلاق الوردية وتسجيل الخروج' : 'End Shift & Logout'}</span>
        </div>
      }
    >
      <form onSubmit={handleCloseShift} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Live calculation breakdown */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--border-default)',
            fontSize: '13px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{language === 'ar' ? 'العهدة الافتتاحية:' : 'Opening Float:'}</span>
            <span style={{ fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{formatCurrency(activeOpening)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--accent-green)' }}>{language === 'ar' ? '+ إجمالي الفواتير والطلبات المحصلة:' : '+ Invoiced Revenue:'}</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace' }}>
              +{formatCurrency(activeRev)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--accent-red)' }}>{language === 'ar' ? '- إجمالي المصروفات المنفقة:' : '- Shift Expenses:'}</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-red)', fontFamily: 'JetBrains Mono, monospace' }}>
              -{formatCurrency(activeExp)}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--border-default)',
              paddingTop: '8px',
              marginTop: '4px',
              fontSize: '14px',
              fontWeight: 700,
            }}
          >
            <span style={{ color: 'var(--accent-cyan)' }}>{language === 'ar' ? 'المبلغ المفترض بالدرج:' : 'Expected Drawer Cash:'}</span>
            <span style={{ color: 'var(--accent-cyan)', fontFamily: 'JetBrains Mono, monospace' }}>
              {formatCurrency(activeExpectedCash)}
            </span>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            {language === 'ar' ? 'المبلغ الفعلي الموجود بالكاشير عند العد * (إلزامي)' : 'Actual Counted Closing Cash * (Required)'}
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            required
            placeholder={formatCurrency(activeExpectedCash)}
            value={closingCash}
            onChange={(e) => setClosingCash(e.target.value === '' ? '' : Number(e.target.value))}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'var(--bg-input)',
              border: closingCash === '' ? '1px solid var(--accent-red)' : '1px solid var(--border-default)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '16px',
              fontWeight: 700,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          />
          {closingCash !== '' && (
            <div style={{ marginTop: '8px', fontSize: '12px' }}>
              {Math.abs(Number(closingCash) - activeExpectedCash) <= 0.01 ? (
                <span style={{ color: 'var(--accent-green)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>check_circle</span>
                  {language === 'ar' ? 'مطابق تماماً للمبلغ المتوقع' : 'Exact match with expected cash'}
                </span>
              ) : Number(closingCash) > activeExpectedCash ? (
                <span style={{ color: 'var(--accent-yellow)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>trending_up</span>
                  {language === 'ar' ? 'يوجد فائض بالدرج بمقدار:' : 'Cash Surplus:'}{' '}
                  +{formatCurrency(Number(closingCash) - activeExpectedCash)}
                </span>
              ) : (
                <span style={{ color: 'var(--accent-red)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>trending_down</span>
                  {language === 'ar' ? 'يوجد عجز بالدرج بمقدار:' : 'Cash Deficit:'}{' '}
                  {formatCurrency(Number(closingCash) - activeExpectedCash)}
                </span>
              )}
            </div>
          )}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDiscrepant ? 'var(--accent-yellow)' : 'var(--text-primary)', marginBottom: '6px' }}>
            {isDiscrepant
              ? (language === 'ar' ? 'ملاحظات الإغلاق والتسليم * (إلزامي لتوضيح سبب الفارق/العجز/الزيادة)' : 'Closing Remarks * (Mandatory for Discrepancy)')
              : (language === 'ar' ? 'ملاحظات الإغلاق (اختياري)' : 'Closing Remarks (Optional)')}
          </label>
          <textarea
            rows={3}
            required={isDiscrepant}
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
            placeholder={
              isDiscrepant
                ? (language === 'ar' ? 'اكتب سبب وجود عجز أو زيادة في النقدية للإدارة...' : 'Explain the cash difference...')
                : (language === 'ar' ? 'أي ملاحظات للموظف القادم أو الإدارة...' : 'Notes for next shift / manager...')
            }
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'var(--bg-input)',
              border: isDiscrepant && !closeNotes.trim() ? '1px solid var(--accent-yellow)' : '1px solid var(--border-default)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              resize: 'none',
            }}
          />
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 194, 255, 0.06)', border: '1px solid rgba(0, 194, 255, 0.2)', padding: '8px 12px', borderRadius: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-cyan)' }}>
            info
          </span>
          {language === 'ar' ? 'ملاحظة: سيتم تسجيل وإثبات كل الأرقام والملاحظات في تقرير الوردية للأدمن.' : 'Note: All reconciliation details will be logged in the Admin Shift Report.'}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button variant="danger" type="submit" disabled={submitting || !canSubmit}>
            {submitting ? (language === 'ar' ? 'جارٍ الإغلاق...' : 'Closing...') : language === 'ar' ? 'تأكيد إغلاق الوردية وتسجيل الخروج' : 'Confirm Close Shift & Logout'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// 3. QUICK EXPENSE MODAL
// ============================================================================
export function ExpenseModal({
  open,
  shift,
  onClose,
  onAdded,
}: {
  open: boolean;
  shift: Shift | null;
  onClose: () => void;
  onAdded?: () => void;
}) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [expenseAmount, setExpenseAmount] = useState<number | ''>('');
  const [expenseCategory, setExpenseCategory] = useState<string>('');
  const [expenseDescription, setExpenseDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift) {
      toast(language === 'ar' ? 'لا توجد وردية نشطة لتسجيل مصروف عليها' : 'No active shift to record expense on', 'error');
      return;
    }
    if (!expenseAmount || Number(expenseAmount) <= 0) {
      toast(language === 'ar' ? 'يرجى إدخال مبلغ صحيح' : 'Please enter a valid amount', 'error');
      return;
    }
    if (!expenseDescription.trim()) {
      toast(language === 'ar' ? 'يرجى إدخال بيان أو وصف المصروف' : 'Please enter a description', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await dataService.createShiftExpense(shift.id, {
        amount: Number(expenseAmount),
        category: expenseCategory.trim() || (language === 'ar' ? 'عام' : 'General'),
        description: expenseDescription.trim(),
      });
      toast(language === 'ar' ? 'تم تسجيل المصروف بنجاح' : 'Expense recorded successfully', 'success');
      setExpenseAmount('');
      setExpenseCategory('');
      setExpenseDescription('');
      onClose();
      if (onAdded) onAdded();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not record expense'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const currentAvailableCash = Number(shift?.opening_cash || 0) + Number(shift?.total_revenue || 0) - Number(shift?.total_expenses || 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--accent-red)', fontSize: '22px' }}>
            receipt_long
          </span>
          <span>{language === 'ar' ? 'تسجيل مصروف أثناء الوردية' : 'Record Shift Expense'}</span>
        </div>
      }
    >
      <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ padding: '10px 14px', background: 'rgba(0, 194, 255, 0.08)', borderRadius: '8px', border: '1px solid rgba(0, 194, 255, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{language === 'ar' ? 'رصيد الدرج المتاح حالياً:' : 'Current Drawer Balance:'}</span>
          <span style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-cyan)', fontSize: '14px' }}>{formatCurrency(currentAvailableCash)}</span>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            {language === 'ar' ? 'قيمة المصروف (المبلغ)' : 'Expense Amount'}
          </label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            required
            placeholder="0.00"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value === '' ? '' : Number(e.target.value))}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '16px',
              fontWeight: 700,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          />
          {expenseAmount !== '' && Number(expenseAmount) > currentAvailableCash && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--accent-yellow)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>warning</span>
              <span>{language === 'ar' ? 'تنبيه: المبلغ المطلوب صرفه يتجاوز رصيد النقدية الحالي بالدرج!' : 'Warning: Expense amount exceeds current drawer cash!'}</span>
            </div>
          )}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            {language === 'ar' ? 'فئة المصروف (اختياري)' : 'Category (Optional)'}
          </label>
          <input
            type="text"
            placeholder={language === 'ar' ? 'مثال: مشتريات بوفيه، صيانة، نظافة...' : 'e.g. Supplies, Maintenance'}
            value={expenseCategory}
            onChange={(e) => setExpenseCategory(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '14px',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            {language === 'ar' ? 'بيان وتفاصيل المصروف' : 'Description'}
          </label>
          <textarea
            rows={2}
            required
            placeholder={language === 'ar' ? 'سبب الصرف بالتفصيل...' : 'Reason for expense...'}
            value={expenseDescription}
            onChange={(e) => setExpenseDescription(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              resize: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button variant="danger" type="submit" disabled={submitting}>
            {submitting ? (language === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : language === 'ar' ? 'حفظ وخصم المصروف' : 'Record Expense'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// 4. SHIFT DETAILS & BREAKDOWN POPUP MODAL
// ============================================================================
export function ShiftDetailsModal({
  open,
  shift,
  onClose,
}: {
  open: boolean;
  shift?: Shift | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { language, isRtl } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<ShiftSummary | null>(null);

  useEffect(() => {
    if (open && shift?.id) {
      setLoading(true);
      dataService.getShiftSummary(shift.id)
        .then((res) => setSummaryData(res))
        .catch((err) => console.error('Failed to load shift details modal summary:', err))
        .finally(() => setLoading(false));
    }
  }, [open, shift?.id]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--accent-cyan)', fontSize: '24px' }}>
            analytics
          </span>
          <span>{language === 'ar' ? 'تفاصيل وكشف حساب الوردية' : 'Shift Details & Ledger'}</span>
        </div>
      }
    >
      {!shift ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--accent-yellow)' }}>
            warning_amber
          </span>
          <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)', fontWeight: 700 }}>
            {language === 'ar' ? 'لا توجد وردية عمل مفتوحة حالياً' : 'No Active Shift Open'}
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '340px' }}>
            {language === 'ar'
              ? 'يمكنك بدء وردية عمل جديدة لتسجيل إيرادات الفواتير وحركات الخزينة، أو تصفح سجل الورديات السابقة.'
              : 'You can start a new shift to record receipts, or browse past shift reports.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                navigate('/shifts');
              }}
            >
              {language === 'ar' ? 'الانتقال لصفحة الورديات' : 'Go to Shifts Page'}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {language === 'ar' ? 'إغلاق' : 'Close'}
            </Button>
          </div>
        </div>
      ) : loading || !summaryData ? (
        <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
          <LoadingSpinner label={language === 'ar' ? 'جاري تحميل تفاصيل الوردية...' : 'Loading shift details...'} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '72vh', overflowY: 'auto', paddingRight: '2px' }}>
          {/* Staff & Timing Banner */}
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--bg-input)',
              borderRadius: '10px',
              border: '1px solid var(--border-default)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px',
              fontSize: '12px',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>{language === 'ar' ? 'الموظف المسؤول:' : 'Staff:'}</span>
              <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                {summaryData.shift.user?.full_name || summaryData.shift.user?.email || 'Staff'}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>{language === 'ar' ? 'وقت البدء:' : 'Started:'}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-cyan)' }}>
                {new Date(summaryData.shift.started_at).toLocaleTimeString(language === 'ar' ? 'ar-EG' : undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>{language === 'ar' ? 'حالة الوردية:' : 'Status:'}</span>
              {summaryData.shift.status === 'active' ? (
                <Badge label={language === 'ar' ? 'نشطة الآن' : 'Active'} color="var(--accent-green)" bg="rgba(34, 197, 94, 0.15)" />
              ) : (
                <Badge label={language === 'ar' ? 'مغلقة' : 'Closed'} color="var(--text-secondary)" bg="rgba(255, 255, 255, 0.05)" />
              )}
            </div>
          </div>

          {/* Key Metric Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '8px',
            }}
          >
            <div style={{ padding: '10px 12px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{language === 'ar' ? 'العهدة الافتتاحية' : 'Opening Float'}</span>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'JetBrains Mono, monospace' }}>
                {formatCurrency(summaryData.opening_cash)}
              </div>
            </div>
            <div style={{ padding: '10px 12px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{language === 'ar' ? 'الإيرادات (+)' : 'Revenue (+)'}</span>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace' }}>
                +{formatCurrency(summaryData.total_revenue)}
              </div>
            </div>
            <div style={{ padding: '10px 12px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{language === 'ar' ? 'المصروفات (-)' : 'Expenses (-)'}</span>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent-red)', fontFamily: 'JetBrains Mono, monospace' }}>
                -{formatCurrency(summaryData.total_expenses)}
              </div>
            </div>
            <div style={{ padding: '10px 12px', background: 'rgba(0, 194, 255, 0.1)', borderRadius: '8px', border: '1px solid rgba(0, 194, 255, 0.3)' }}>
              <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 600 }}>{language === 'ar' ? 'المتوقع بالدرج' : 'Expected in Drawer'}</span>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>
                {formatCurrency(summaryData.expected_closing)}
              </div>
            </div>
          </div>

          {/* Notes if available */}
          {summaryData.shift.notes && (
            <div style={{ padding: '10px 14px', background: 'rgba(234, 179, 8, 0.08)', borderRadius: '8px', border: '1px solid rgba(234, 179, 8, 0.3)', fontSize: '12px' }}>
              <strong style={{ color: 'var(--accent-yellow)', display: 'block', marginBottom: '2px' }}>
                {language === 'ar' ? 'ملاحظات الوردية:' : 'Shift Notes:'}
              </strong>
              <span style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{summaryData.shift.notes}</span>
            </div>
          )}

          {/* Recent Invoices in Shift */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-green)' }}>receipt</span>
              {language === 'ar' ? 'فواتير الجلسات بالوردية' : 'Session Invoices'} ({summaryData.invoices.length})
            </h4>
            {summaryData.invoices.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-input)', borderRadius: '6px' }}>
                {language === 'ar' ? 'لا توجد فواتير مسجلة في هذه الوردية حتى الآن' : 'No invoices recorded in this shift yet'}
              </div>
            ) : (
              <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border-default)', textAlign: isRtl ? 'right' : 'left' }}>
                      <th style={{ padding: '6px 10px' }}>{language === 'ar' ? 'الجهاز' : 'Terminal'}</th>
                      <th style={{ padding: '6px 10px' }}>{language === 'ar' ? 'العميل' : 'Customer'}</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>{language === 'ar' ? 'القيمة' : 'Amount'}</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center' }}>{language === 'ar' ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryData.invoices.map((inv) => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>{inv.session?.device?.name || 'Device'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{inv.session?.customer?.name || (language === 'ar' ? 'مستغل خارجي' : 'Walk-in')}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-green)' }}>
                          {formatCurrency(inv.amount)}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: inv.paid ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)', color: inv.paid ? 'var(--accent-green)' : 'var(--text-secondary)', fontWeight: 600 }}>
                            {inv.paid ? (language === 'ar' ? 'مدفوعة' : 'Paid') : (language === 'ar' ? 'معلقة' : 'Pending')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Shift Expenses list */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-red)' }}>receipt_long</span>
              {language === 'ar' ? 'مصروفات الوردية' : 'Shift Expenses'} ({summaryData.expenses.length})
            </h4>
            {summaryData.expenses.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-input)', borderRadius: '6px' }}>
                {language === 'ar' ? 'لا توجد مصروفات مسجلة في هذه الوردية' : 'No expenses recorded in this shift'}
              </div>
            ) : (
              <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border-default)', textAlign: isRtl ? 'right' : 'left' }}>
                      <th style={{ padding: '6px 10px' }}>{language === 'ar' ? 'الفئة' : 'Category'}</th>
                      <th style={{ padding: '6px 10px' }}>{language === 'ar' ? 'البيان' : 'Description'}</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryData.expenses.map((exp) => (
                      <tr key={exp.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--accent-red)', fontWeight: 600 }}>{exp.category || (language === 'ar' ? 'عام' : 'General')}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>{exp.description}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-red)' }}>
                          -{formatCurrency(exp.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '10px', borderTop: '1px solid var(--border-default)' }}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                onClose();
                navigate('/shifts');
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
              {language === 'ar' ? 'صفحة الورديات الكاملة' : 'Full Shifts Page'}
            </Button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="ghost"
                type="button"
                onClick={() => window.print()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>print</span>
                {language === 'ar' ? 'طباعة' : 'Print'}
              </Button>
              <Button variant="primary" onClick={onClose} style={{ fontSize: '12px' }}>
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

