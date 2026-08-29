import { useEffect, useMemo, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Layout } from '../components/Layout';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { StatCard } from '../components/StatCard';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ShiftLedgerTableReport } from '../components/ShiftLedgerTableReport';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency } from '../utils/format';
import type { Shift, ShiftSummary } from '../types';

export default function ShiftsPage() {
  const isMobile = useIsMobile();
  const { user, logout, isAdmin } = useAuth();
  const { language, isRtl } = useLanguage();
  const { toast } = useToast();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [search, setSearch] = useState('');

  // Live Timer
  const [elapsedTime, setElapsedTime] = useState<string>('00:00:00');

  // Modals state
  const [showStartModal, setShowStartModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [summaryShiftId, setSummaryShiftId] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<ShiftSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryViewMode, setSummaryViewMode] = useState<'ledger' | 'overview'>('ledger');

  // Form states
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [startNotes, setStartNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Expense form state
  const [expenseAmount, setExpenseAmount] = useState<number | ''>('');
  const [expenseCategory, setExpenseCategory] = useState<string>('');
  const [expenseDescription, setExpenseDescription] = useState<string>('');

  const fetchShiftsData = async () => {
    try {
      setLoading(true);
      const [allShifts, currentActive] = await Promise.all([
        dataService.listShifts(),
        dataService.getActiveShift(),
      ]);
      setShifts(allShifts || []);
      setActiveShift(currentActive || null);
    } catch (err) {
      console.error('Failed to load shifts:', err);
      toast(apiErrorMessage(err, 'Failed to load shifts data'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShiftsData();
  }, []);

  // Auto-poll every 15 seconds for cross-instance sync (Desktop ↔ Web ↔ Mobile)
  usePolling(fetchShiftsData, 15000);

  // Live timer for active shift
  useEffect(() => {
    if (!activeShift?.started_at) {
      setElapsedTime('00:00:00');
      return;
    }

    const updateTimer = () => {
      const start = new Date(activeShift.started_at).getTime();
      const now = new Date().getTime();
      const diffMs = Math.max(0, now - start);

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      const pad = (n: number) => n.toString().padStart(2, '0');
      setElapsedTime(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeShift]);

  // Handle Start Shift
  const handleStartShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const newShift = await dataService.startShift({
        opening_cash: Number(openingCash) || 0,
        notes: startNotes.trim() || undefined,
      });
      setActiveShift(newShift);
      setShowStartModal(false);
      setOpeningCash(0);
      setStartNotes('');
      toast(language === 'ar' ? 'تم بدء الوردية بنجاح!' : 'Shift started successfully!', 'success');
      fetchShiftsData();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not start shift'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Close Shift & Automatic Logout
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    setSubmitting(true);
    try {
      await dataService.closeShift(activeShift.id);
      toast(language === 'ar' ? 'تم إغلاق الوردية وتسجيل الخروج بنجاح' : 'Shift closed. Logged out successfully.', 'success');
      setShowCloseModal(false);
      // Auto logout from account upon shift closure
      await logout();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not close shift'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Add Expense
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
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
      await dataService.createShiftExpense(activeShift.id, {
        amount: Number(expenseAmount),
        category: expenseCategory.trim() || (language === 'ar' ? 'عام' : 'General'),
        description: expenseDescription.trim(),
      });
      toast(language === 'ar' ? 'تم تسجيل المصروف بنجاح' : 'Expense recorded successfully', 'success');
      setShowExpenseModal(false);
      setExpenseAmount('');
      setExpenseCategory('');
      setExpenseDescription('');
      fetchShiftsData();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not record expense'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle View Summary
  const handleViewSummary = async (shiftId: string) => {
    setSummaryShiftId(shiftId);
    setLoadingSummary(true);
    try {
      const summary = await dataService.getShiftSummary(shiftId);
      setSummaryData(summary);
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to load shift summary'), 'error');
      setSummaryShiftId(null);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Filtered list
  const filteredShifts = useMemo(() => {
    let list = shifts;
    if (filter === 'active') list = list.filter((s) => s.status === 'active');
    if (filter === 'closed') list = list.filter((s) => s.status === 'closed');

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          (s.user?.full_name || '').toLowerCase().includes(q) ||
          (s.user?.email || '').toLowerCase().includes(q) ||
          (s.notes || '').toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [shifts, filter, search]);

  // Overall statistics
  const stats = useMemo(() => {
    const closedShifts = shifts.filter((s) => s.status === 'closed');
    const totalRev = shifts.reduce((sum, s) => sum + Number(s.total_revenue || 0), 0);
    const totalExp = shifts.reduce((sum, s) => sum + Number(s.total_expenses || 0), 0);
    const activeCount = shifts.filter((s) => s.status === 'active').length;
    return { totalRev, totalExp, activeCount, totalShifts: shifts.length, closedShiftsCount: closedShifts.length };
  }, [shifts]);

  const activeOpening = Number(activeShift?.opening_cash || 0);
  const activeRev = Number(activeShift?.total_revenue || 0);
  const activeExp = Number(activeShift?.total_expenses || 0);
  const activeExpectedCash = activeOpening + activeRev - activeExp;

  return (
    <Layout
      title={language === 'ar' ? 'إدارة الشيفتات والورديات' : 'Staff Shifts Management'}
      subtitle={
        language === 'ar'
          ? 'نظام تتبع ورديات الموظفين، حركة الكاشير النقدية، المصروفات، وربط كل فاتورة بالموظف المسؤول.'
          : 'Live shift tracking, cashier reconciliation, on-shift expense logging, and per-staff invoice attribution.'
      }
      actions={
        <div style={{ display: 'flex', gap: isMobile ? '8px' : '10px', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
          {activeShift ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setShowExpenseModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
                  minHeight: '38px',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-red)' }}>
                  receipt_long
                </span>
                {language === 'ar' ? 'تسجيل مصروف' : 'Record Expense'}
              </Button>
              <Button
                variant="danger"
                onClick={() => setShowCloseModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
                  minHeight: '38px',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  lock_clock
                </span>
                {language === 'ar' ? 'إغلاق الوردية' : 'End & Close Shift'}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={() => setShowStartModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                flex: isMobile ? '1 1 100%' : 'none',
                minHeight: '38px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                play_circle
              </span>
              {language === 'ar' ? 'بدء وردية جديدة' : 'Start Shift'}
            </Button>
          )}
        </div>
      }
    >
      {/* 1. ACTIVE SHIFT HERO CARD */}
      {activeShift ? (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(0, 194, 255, 0.08) 0%, rgba(16, 185, 129, 0.06) 100%)',
            border: '1px solid rgba(0, 194, 255, 0.3)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '28px',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0, 194, 255, 0.08)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '180px',
              height: '180px',
              background: 'radial-gradient(circle, rgba(0, 194, 255, 0.15) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            {/* Left Info: Staff & Timer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '14px',
                  background: 'rgba(0, 194, 255, 0.12)',
                  border: '1px solid rgba(0, 194, 255, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '26px',
                  color: 'var(--accent-cyan)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>
                  badge
                </span>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {activeShift.user?.full_name || activeShift.user?.email || user?.full_name || 'Staff'}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '20px',
                      background: 'rgba(34, 197, 94, 0.15)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      color: 'var(--accent-green)',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--accent-green)',
                        animation: 'pulse 1.5s infinite',
                      }}
                    />
                    {language === 'ar' ? 'الوردية نشطة الآن' : 'Active Shift'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>schedule</span>
                    {language === 'ar' ? 'وقت البدء:' : 'Started:'}{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {new Date(activeShift.started_at).toLocaleTimeString(language === 'ar' ? 'ar-EG' : undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </strong>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--accent-cyan)' }}>timer</span>
                    {language === 'ar' ? 'المدة المنقضية:' : 'Elapsed:'}{' '}
                    <strong style={{ color: 'var(--accent-cyan)', fontFamily: 'JetBrains Mono, monospace', fontSize: '14px' }}>
                      {elapsedTime}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick action buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleViewSummary(activeShift.id)}
                className="ccms-btn"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
                  analytics
                </span>
                {language === 'ar' ? 'كشف الحساب الحي' : 'Live Breakdown'}
              </button>
            </div>
          </div>

          {/* Key Metrics Grid inside Active Card */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '14px',
              marginTop: '20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '18px',
            }}
          >
            {/* Opening cash */}
            <div style={{ padding: '12px 16px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {language === 'ar' ? 'العهدة الافتتاحية' : 'Opening Cash'}
              </span>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-cyan)', marginTop: '4px', fontFamily: 'JetBrains Mono, monospace' }}>
                {formatCurrency(activeOpening)}
              </div>
            </div>

            {/* Shift Revenue */}
            <div style={{ padding: '12px 16px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {language === 'ar' ? 'إيرادات الوردية (الفواتير)' : 'Shift Invoiced Revenue'}
              </span>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-green)', marginTop: '4px', fontFamily: 'JetBrains Mono, monospace' }}>
                +{formatCurrency(activeRev)}
              </div>
            </div>

            {/* Shift Expenses */}
            <div style={{ padding: '12px 16px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {language === 'ar' ? 'المصروفات المسجلة' : 'Logged Expenses'}
              </span>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-red)', marginTop: '4px', fontFamily: 'JetBrains Mono, monospace' }}>
                -{formatCurrency(activeExp)}
              </div>
            </div>

            {/* Expected Drawer Cash */}
            <div
              style={{
                padding: '12px 16px',
                background: 'linear-gradient(135deg, rgba(0, 194, 255, 0.15) 0%, rgba(0, 194, 255, 0.05) 100%)',
                borderRadius: '10px',
                border: '1px solid rgba(0, 194, 255, 0.4)',
              }}
            >
              <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {language === 'ar' ? 'المبلغ المتوقع بالدرج' : 'Expected Drawer Cash'}
              </span>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginTop: '4px', fontFamily: 'JetBrains Mono, monospace' }}>
                {formatCurrency(activeExpectedCash)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* No active shift state banner */
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border-default)',
            borderRadius: '16px',
            padding: '28px',
            marginBottom: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>
                schedule
              </span>
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {language === 'ar' ? 'لا يوجد وردية مفتوحة لحسابك حالياً' : 'No Active Shift Open'}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                {language === 'ar'
                  ? 'ابدأ وردية عمل جديدة لتسجيل العهدة وربط الفواتير والمصروفات باسمك.'
                  : 'Start a work shift to log opening cashier float and attribute sales to your account.'}
              </p>
            </div>
          </div>
          <Button variant="primary" onClick={() => setShowStartModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              play_circle
            </span>
            {language === 'ar' ? 'بدء الوردية الآن' : 'Start Shift Now'}
          </Button>
        </div>
      )}

      {/* 2. STATS CARDS (Admin only) */}
      {isAdmin && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <StatCard
            label={language === 'ar' ? 'إجمالي الورديات' : 'Total Shifts'}
            value={stats.totalShifts}
            icon="history"
            accent="var(--accent-cyan)"
          />
          <StatCard
            label={language === 'ar' ? 'إجمالي إيرادات الورديات' : 'Total Invoiced Revenue'}
            value={formatCurrency(stats.totalRev)}
            icon="payments"
            accent="var(--accent-green)"
          />
          <StatCard
            label={language === 'ar' ? 'إجمالي المصروفات' : 'Total Shift Expenses'}
            value={formatCurrency(stats.totalExp)}
            icon="receipt_long"
            accent="var(--accent-red)"
          />
          <StatCard
            label={language === 'ar' ? 'صافي الحصيلة النقدية' : 'Net Total Cash'}
            value={formatCurrency(stats.totalRev - stats.totalExp)}
            icon="account_balance_wallet"
            accent="var(--accent-yellow)"
          />
        </div>
      )}

      {/* 3. SHIFTS HISTORY TABLE & FILTERS (Admin only) */}
      {isAdmin && (
        <div
          style={{
            background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '16px',
          padding: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className={`ccms-filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                background: filter === 'all' ? 'var(--accent-cyan)' : 'transparent',
                color: filter === 'all' ? '#000' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {language === 'ar' ? 'الكل' : 'All Shifts'} ({shifts.length})
            </button>
            <button
              className={`ccms-filter-btn ${filter === 'active' ? 'active' : ''}`}
              onClick={() => setFilter('active')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                background: filter === 'active' ? 'var(--accent-green)' : 'transparent',
                color: filter === 'active' ? '#000' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {language === 'ar' ? 'النشطة حالياً' : 'Active'} ({shifts.filter((s) => s.status === 'active').length})
            </button>
            <button
              className={`ccms-filter-btn ${filter === 'closed' ? 'active' : ''}`}
              onClick={() => setFilter('closed')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                background: filter === 'closed' ? 'var(--text-secondary)' : 'transparent',
                color: filter === 'closed' ? '#000' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {language === 'ar' ? 'المغلقة' : 'Closed'} ({shifts.filter((s) => s.status === 'closed').length})
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', width: '260px' }}>
            <input
              type="text"
              placeholder={language === 'ar' ? 'بحث بالموظف أو الملاحظات...' : 'Search by staff or notes...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            />
            <span
              className="material-symbols-outlined"
              style={{
                position: 'absolute',
                left: isRtl ? 'auto' : '10px',
                right: isRtl ? '10px' : 'auto',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '18px',
                color: 'var(--text-muted)',
              }}
            >
              search
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
            <LoadingSpinner />
          </div>
        ) : filteredShifts.length === 0 ? (
          <EmptyState
            icon="schedule"
            title={language === 'ar' ? 'لا توجد ورديات مسجلة' : 'No shifts found'}
            description={
              language === 'ar'
                ? 'لم يتم تسجيل أي ورديات تطابق الفلتر الحالي.'
                : 'No shift records match your current search or filter criteria.'
            }
          />
        ) : (
          <Table<Shift>
            data={filteredShifts}
            rowKey={(s) => s.id}
            columns={[
              {
                key: 'staff',
                header: language === 'ar' ? 'الموظف' : 'Staff Member',
                render: (s) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'rgba(0, 194, 255, 0.1)',
                        border: '1px solid rgba(0, 194, 255, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-cyan)',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {(s.user?.full_name || s.user?.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                        {s.user?.full_name || s.user?.email?.split('@')[0] || 'Staff'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.user?.email || ''}</div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'started_at',
                header: language === 'ar' ? 'وقت البدء' : 'Started At',
                render: (s) => {
                  const d = new Date(s.started_at);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                        {d.toLocaleTimeString(language === 'ar' ? 'ar-EG' : undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {d.toLocaleDateString(language === 'ar' ? 'ar-EG' : undefined, { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: 'ended_at',
                header: language === 'ar' ? 'وقت الإغلاق' : 'Ended At',
                render: (s) => {
                  if (!s.ended_at) {
                    return (
                      <span style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: '12px' }}>
                        {language === 'ar' ? 'نشط حالياً' : 'In Progress'}
                      </span>
                    );
                  }
                  const d = new Date(s.ended_at);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {d.toLocaleTimeString(language === 'ar' ? 'ar-EG' : undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {d.toLocaleDateString(language === 'ar' ? 'ar-EG' : undefined, { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: 'opening_cash',
                header: language === 'ar' ? 'العهدة' : 'Opening Cash',
                align: 'right',
                render: (s) => formatCurrency(s.opening_cash),
              },
              {
                key: 'revenue',
                header: language === 'ar' ? 'الإيرادات' : 'Revenue',
                align: 'right',
                render: (s) => (
                  <span style={{ color: 'var(--accent-green)', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                    +{formatCurrency(s.total_revenue)}
                  </span>
                ),
              },
              {
                key: 'expenses',
                header: language === 'ar' ? 'المصروفات' : 'Expenses',
                align: 'right',
                render: (s) => (
                  <span style={{ color: 'var(--accent-red)', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                    -{formatCurrency(s.total_expenses)}
                  </span>
                ),
              },
              {
                key: 'status',
                header: language === 'ar' ? 'الحالة' : 'Status',
                render: (s) =>
                  s.status === 'active' ? (
                    <Badge label={language === 'ar' ? 'نشطة' : 'Active'} color="var(--accent-green)" bg="rgba(34, 197, 94, 0.15)" />
                  ) : (
                    <Badge label={language === 'ar' ? 'مغلقة' : 'Closed'} color="var(--text-secondary)" bg="rgba(255, 255, 255, 0.05)" />
                  ),
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (s) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                    <button
                      title={language === 'ar' ? 'عرض ملخص الوردية' : 'View Shift Summary'}
                      onClick={() => handleViewSummary(s.id)}
                      style={{
                        background: 'rgba(0, 194, 255, 0.1)',
                        border: '1px solid rgba(0, 194, 255, 0.2)',
                        color: 'var(--accent-cyan)',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                        receipt
                      </span>
                      {language === 'ar' ? 'الملخص' : 'Report'}
                    </button>
                    {s.status === 'active' && (
                      <button
                        title={language === 'ar' ? 'إغلاق الوردية' : 'Close Shift'}
                        onClick={() => {
                          setActiveShift(s);
                          setShowCloseModal(true);
                        }}
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: 'var(--accent-red)',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                          lock_clock
                        </span>
                        {language === 'ar' ? 'إغلاق' : 'Close'}
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
      )}

      {/* MODAL 1: START SHIFT */}
      <Modal
        open={showStartModal}
        onClose={() => setShowStartModal(false)}
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
              {language === 'ar' ? 'العهدة الافتتاحية (المبلغ في الكاشير)' : 'Opening Float Cash (Required)'}
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
              placeholder={language === 'ar' ? 'أي ملاحظات خاصة عند استلام الوردية...' : 'Any handover remarks...'}
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <Button variant="ghost" type="button" onClick={() => setShowStartModal(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? (language === 'ar' ? 'جارٍ البدء...' : 'Starting...') : language === 'ar' ? 'بدء الوردية' : 'Start Shift'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: CLOSE SHIFT / CLOSE CYBER RECONCILIATION */}
      <Modal
        open={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent-red)', fontSize: '22px' }}>
              lock_clock
            </span>
            <span>{language === 'ar' ? 'إغلاق السايبر وإنهاء الوردية' : 'End Shift & Close Cyber'}</span>
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
              <span style={{ color: 'var(--accent-green)' }}>{language === 'ar' ? '+ إجمالي الفواتير المحصلة:' : '+ Invoiced Revenue:'}</span>
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

          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 194, 255, 0.06)', border: '1px solid rgba(0, 194, 255, 0.2)', padding: '10px 14px', borderRadius: '8px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
              info
            </span>
            <span>
              {language === 'ar'
                ? 'سيتم اعتماد المبلغ المفترض بالدرج وإغلاق الوردية وتوثيق كل العمليات تلقائياً.'
                : 'Expected cash will be recorded and the shift will be closed successfully.'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <Button variant="ghost" type="button" onClick={() => setShowCloseModal(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="danger" type="submit" disabled={submitting}>
              {submitting ? (language === 'ar' ? 'جارٍ الإغلاق...' : 'Closing...') : language === 'ar' ? 'تأكيد إغلاق الوردية وتسجيل الخروج' : 'Confirm Close Shift & Logout'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: RECORD EXPENSE */}
      <Modal
        open={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
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
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              {language === 'ar' ? 'فئة / نوع المصروف (نص حر)' : 'Category (Free text)'}
            </label>
            <input
              type="text"
              placeholder={language === 'ar' ? 'مثال: صيانة، مشتريات بوفيه، نظافة، نقل، إلخ...' : 'e.g., Supplies, Maintenance, Snacks...'}
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              {language === 'ar' ? 'بيان / تفاصيل المصروف' : 'Description / Reason'}
            </label>
            <textarea
              rows={3}
              required
              placeholder={language === 'ar' ? 'اكتب تفاصيل المصروف وسبب الخروج من الكاشير...' : 'Reason for expense...'}
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <Button variant="ghost" type="button" onClick={() => setShowExpenseModal(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? (language === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : language === 'ar' ? 'حفظ المصروف' : 'Record Expense'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: DETAILED SHIFT BREAKDOWN SUMMARY */}
      <Modal
        open={Boolean(summaryShiftId)}
        width={summaryViewMode === 'ledger' ? 880 : 620}
        onClose={() => {
          setSummaryShiftId(null);
          setSummaryData(null);
        }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: isRtl ? '0' : '20px', paddingLeft: isRtl ? '20px' : '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--accent-cyan)', fontSize: '22px' }}>
                analytics
              </span>
              <span>{language === 'ar' ? 'تقرير وملخص الوردية الشامل' : 'Comprehensive Shift Report'}</span>
            </div>

            {summaryData && (
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-input)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                <button
                  type="button"
                  onClick={() => setSummaryViewMode('ledger')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    background: summaryViewMode === 'ledger' ? 'var(--accent-cyan)' : 'transparent',
                    color: summaryViewMode === 'ledger' ? '#000' : 'var(--text-secondary)',
                    fontWeight: summaryViewMode === 'ledger' ? 700 : 500,
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>table_chart</span>
                  {language === 'ar' ? 'جدول العمليات (المحاسبي)' : 'Ledger Table'}
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryViewMode('overview')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    background: summaryViewMode === 'overview' ? 'var(--accent-cyan)' : 'transparent',
                    color: summaryViewMode === 'overview' ? '#000' : 'var(--text-secondary)',
                    fontWeight: summaryViewMode === 'overview' ? 700 : 500,
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>dashboard</span>
                  {language === 'ar' ? 'الملخص' : 'Overview'}
                </button>
              </div>
            )}
          </div>
        }
      >
        {loadingSummary || !summaryData ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
            <LoadingSpinner />
          </div>
        ) : summaryViewMode === 'ledger' ? (
          <ShiftLedgerTableReport
            summaryData={summaryData}
            onClose={() => {
              setSummaryShiftId(null);
              setSummaryData(null);
            }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxHeight: '75vh', overflowY: 'auto' }}>
            {/* Header info */}
            <div
              style={{
                padding: '14px 18px',
                background: 'var(--bg-input)',
                borderRadius: '12px',
                border: '1px solid var(--border-default)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '12px',
                fontSize: '12px',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>{language === 'ar' ? 'الموظف المسئول:' : 'Staff Member:'}</span>
                <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                  {summaryData.shift.user?.full_name || summaryData.shift.user?.email || 'Staff'}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>{language === 'ar' ? 'وقت البدء:' : 'Started:'}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-cyan)' }}>
                  {new Date(summaryData.shift.started_at).toLocaleString(language === 'ar' ? 'ar-EG' : undefined)}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>{language === 'ar' ? 'وقت الإغلاق:' : 'Closed:'}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: summaryData.shift.ended_at ? 'var(--text-primary)' : 'var(--accent-green)' }}>
                  {summaryData.shift.ended_at
                    ? new Date(summaryData.shift.ended_at).toLocaleString(language === 'ar' ? 'ar-EG' : undefined)
                    : (language === 'ar' ? 'لا يزال نشطاً' : 'Still Active')}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>{language === 'ar' ? 'الحالة:' : 'Status:'}</span>
                {summaryData.shift.status === 'active' ? (
                  <Badge label={language === 'ar' ? 'نشطة' : 'Active'} color="var(--accent-green)" bg="rgba(34, 197, 94, 0.15)" />
                ) : (
                  <Badge label={language === 'ar' ? 'مغلقة' : 'Closed'} color="var(--text-secondary)" bg="rgba(255, 255, 255, 0.05)" />
                )}
              </div>
            </div>

            {/* Financial Reconciliation Summary Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '10px',
              }}
            >
              <div style={{ padding: '10px 14px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{language === 'ar' ? 'العهدة الافتتاحية' : 'Opening Float'}</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {formatCurrency(summaryData.opening_cash)}
                </div>
              </div>
              <div style={{ padding: '10px 14px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{language === 'ar' ? 'الإيرادات (+)' : 'Revenue (+)'}</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace' }}>
                  +{formatCurrency(summaryData.total_revenue)}
                </div>
              </div>
              <div style={{ padding: '10px 14px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{language === 'ar' ? 'المصروفات (-)' : 'Expenses (-)'}</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-red)', fontFamily: 'JetBrains Mono, monospace' }}>
                  -{formatCurrency(summaryData.total_expenses)}
                </div>
              </div>
              <div style={{ padding: '10px 14px', background: 'rgba(0, 194, 255, 0.1)', borderRadius: '10px', border: '1px solid rgba(0, 194, 255, 0.3)' }}>
                <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 600 }}>{language === 'ar' ? 'المتوقع بالدرج' : 'Expected Total'}</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>
                  {formatCurrency(summaryData.expected_closing)}
                </div>
              </div>
            </div>

            {/* Reconciliation difference */}
            {summaryData.closing_cash !== null && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background:
                    summaryData.cash_difference === 0
                      ? 'rgba(34, 197, 94, 0.1)'
                      : summaryData.cash_difference! > 0
                        ? 'rgba(234, 179, 8, 0.1)'
                        : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${summaryData.cash_difference === 0
                    ? 'rgba(34, 197, 94, 0.3)'
                    : summaryData.cash_difference! > 0
                      ? 'rgba(234, 179, 8, 0.3)'
                      : 'rgba(239, 68, 68, 0.3)'
                    }`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>{language === 'ar' ? 'المبلغ الفعلي المسلم عند الإغلاق:' : 'Actual Counted Handover:'}</span>
                  <strong style={{ marginLeft: '8px', marginRight: '8px', color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {formatCurrency(summaryData.closing_cash)}
                  </strong>
                </div>
                <div>
                  {summaryData.cash_difference === 0 ? (
                    <span style={{ color: 'var(--accent-green)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
                      {language === 'ar' ? 'مطابق تماماً (لا يوجد عجز أو زيادة)' : 'Perfect Reconciliation'}
                    </span>
                  ) : summaryData.cash_difference! > 0 ? (
                    <span style={{ color: 'var(--accent-yellow)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>trending_up</span>
                      {language === 'ar' ? 'فائض نقدي:' : 'Cash Surplus:'} +{formatCurrency(summaryData.cash_difference!)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--accent-red)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>trending_down</span>
                      {language === 'ar' ? 'عجز نقدي:' : 'Cash Deficit:'} {formatCurrency(summaryData.cash_difference!)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Shift notes / Handover remarks for Admin */}
            {summaryData.shift.notes && (
              <div
                style={{
                  padding: '12px 16px',
                  background: 'rgba(234, 179, 8, 0.08)',
                  borderRadius: '10px',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  fontSize: '13px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-yellow)', fontWeight: 700, marginBottom: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    notes
                  </span>
                  <span>{language === 'ar' ? 'ملاحظات الموظف عند التسليم والإغلاق:' : 'Staff Handover Notes & Remarks:'}</span>
                </div>
                <p style={{ margin: 0, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {summaryData.shift.notes}
                </p>
              </div>
            )}

            {/* Invoices list */}
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-green)' }}>
                  receipt
                </span>
                {language === 'ar' ? 'فواتير الجلسات أثناء الوردية' : 'Shift Session Invoices'} ({summaryData.invoices.length})
              </h4>
              {summaryData.invoices.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-input)', borderRadius: '8px' }}>
                  {language === 'ar' ? 'لا توجد فواتير مسجلة أثناء هذه الوردية' : 'No invoices generated during this shift'}
                </div>
              ) : (
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border-default)', textAlign: isRtl ? 'right' : 'left' }}>
                        <th style={{ padding: '8px 12px' }}>{language === 'ar' ? 'الجهاز' : 'Terminal'}</th>
                        <th style={{ padding: '8px 12px' }}>{language === 'ar' ? 'العميل' : 'Customer'}</th>
                        <th style={{ padding: '8px 12px' }}>{language === 'ar' ? 'الوقت' : 'Time'}</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>{language === 'ar' ? 'القيمة' : 'Amount'}</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>{language === 'ar' ? 'الحالة' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryData.invoices.map((inv) => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {inv.session?.device?.name || 'Device'}
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                            {inv.session?.customer?.name || (language === 'ar' ? 'مستغل خارجي' : 'Walk-in')}
                          </td>
                          <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                            {new Date(inv.issued_at).toLocaleTimeString(language === 'ar' ? 'ar-EG' : undefined, { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-green)' }}>
                            {formatCurrency(inv.amount)}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {inv.paid ? (
                              <Badge label={language === 'ar' ? 'مدفوعة' : 'Paid'} color="var(--accent-green)" bg="rgba(34, 197, 94, 0.15)" />
                            ) : (
                              <Badge label={language === 'ar' ? 'معلقة' : 'Pending'} color="var(--text-secondary)" bg="rgba(255, 255, 255, 0.05)" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Standalone Café Sales list */}
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-yellow)' }}>
                  local_cafe
                </span>
                {language === 'ar' ? 'مبيعات الكافيه والبيع المباشر' : 'Direct Café & Standalone Sales'} ({summaryData.standalone_orders?.length || 0})
              </h4>
              {(!summaryData.standalone_orders || summaryData.standalone_orders.length === 0) ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-input)', borderRadius: '8px' }}>
                  {language === 'ar' ? 'لا توجد مبيعات كافيه مباشرة مسجلة أثناء هذه الوردية' : 'No standalone café sales during this shift'}
                </div>
              ) : (
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border-default)', textAlign: isRtl ? 'right' : 'left' }}>
                        <th style={{ padding: '8px 12px' }}>{language === 'ar' ? 'المنتج' : 'Product'}</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>{language === 'ar' ? 'الكمية' : 'Quantity'}</th>
                        <th style={{ padding: '8px 12px' }}>{language === 'ar' ? 'الوقت' : 'Time'}</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryData.standalone_orders.map((ord) => (
                        <tr key={ord.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {ord.product?.name || 'Item'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-cyan)' }}>
                            {ord.quantity}x
                          </td>
                          <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                            {new Date(ord.created_at).toLocaleTimeString(language === 'ar' ? 'ar-EG' : undefined, { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-green)' }}>
                            +{formatCurrency(ord.total_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-red)' }}>
                  receipt_long
                </span>
                {language === 'ar' ? 'مصروفات الوردية' : 'Shift Expenses'} ({summaryData.expenses.length})
              </h4>
              {summaryData.expenses.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-input)', borderRadius: '8px' }}>
                  {language === 'ar' ? 'لا توجد مصروفات مسجلة أثناء هذه الوردية' : 'No expenses recorded during this shift'}
                </div>
              ) : (
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border-default)', textAlign: isRtl ? 'right' : 'left' }}>
                        <th style={{ padding: '8px 12px' }}>{language === 'ar' ? 'الفئة' : 'Category'}</th>
                        <th style={{ padding: '8px 12px' }}>{language === 'ar' ? 'البيان' : 'Description'}</th>
                        <th style={{ padding: '8px 12px' }}>{language === 'ar' ? 'الوقت' : 'Time'}</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryData.expenses.map((exp) => (
                        <tr key={exp.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', fontWeight: 600 }}>
                              {exp.category || (language === 'ar' ? 'عام' : 'General')}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{exp.description}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                            {new Date(exp.created_at).toLocaleTimeString(language === 'ar' ? 'ar-EG' : undefined, { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-red)' }}>
                            -{formatCurrency(exp.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <Button variant="ghost" type="button" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  print
                </span>
                {language === 'ar' ? 'طباعة التقرير' : 'Print Report'}
              </Button>
              <Button variant="primary" onClick={() => setSummaryShiftId(null)}>
                {language === 'ar' ? 'إغلاق النافذة' : 'Close'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
