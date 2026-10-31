import { useState, useEffect, useMemo } from 'react';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { StatCard } from './StatCard';
import { EmptyState } from './ui/EmptyState';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency } from '../utils/format';
import type {
  MonthlyClosingItem,
  MonthlyFinancialDetails,
  Shift,
} from '../types';

const MONTH_NAMES_AR = [
  'يناير (شهر 1)',
  'فبراير (شهر 2)',
  'مارس (شهر 3)',
  'أبريل (شهر 4)',
  'مايو (شهر 5)',
  'يونيو (شهر 6)',
  'يوليو (شهر 7)',
  'أغسطس (شهر 8)',
  'سبتمبر (شهر 9)',
  'أكتوبر (شهر 10)',
  'نوفمبر (شهر 11)',
  'ديسمبر (شهر 12)',
];

const MONTH_NAMES_EN = [
  'January (Month 1)',
  'February (Month 2)',
  'March (Month 3)',
  'April (Month 4)',
  'May (Month 5)',
  'June (Month 6)',
  'July (Month 7)',
  'August (Month 8)',
  'September (Month 9)',
  'October (Month 10)',
  'November (Month 11)',
  'December (Month 12)',
];

export function MonthlyClosingsView() {
  const isMobile = useIsMobile();
  const { language, isRtl } = useLanguage();
  const { toast } = useToast();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);

  const [monthsList, setMonthsList] = useState<MonthlyClosingItem[]>([]);
  const [details, setDetails] = useState<MonthlyFinancialDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'daily' | 'shifts' | 'expenses' | 'history'>('overview');
  const [dailySortOrder, setDailySortOrder] = useState<'desc' | 'asc'>('desc');
  const [shiftFilter, setShiftFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [shiftSearch, setShiftSearch] = useState<string>('');

  // Load list of available months
  const fetchMonthsList = async () => {
    try {
      const list = await dataService.listFinancialMonths();
      setMonthsList(list || []);
    } catch (err) {
      console.error('Failed to load financial months:', err);
    }
  };

  // Load details for selected month
  const fetchMonthDetails = async (year: number, month: number) => {
    try {
      setLoadingDetails(true);
      const data = await dataService.getMonthlyFinancialDetails(year, month);
      setDetails(data);
    } catch (err) {
      console.error(`Failed to load details for ${year}-${month}:`, err);
      toast(apiErrorMessage(err, 'Failed to load month financial data'), 'error');
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchMonthsList();
  }, []);

  useEffect(() => {
    fetchMonthDetails(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth]);

  // Navigate to previous month
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear((prev) => prev - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  // Navigate to next month
  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear((prev) => prev + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  // Format month name
  const currentMonthLabel = useMemo(() => {
    const list = language === 'ar' ? MONTH_NAMES_AR : MONTH_NAMES_EN;
    return `${list[selectedMonth - 1]} ${selectedYear}`;
  }, [selectedMonth, selectedYear, language]);

  // Daily Ledger sorted (default: latest days first at top)
  const displayedDailyLedger = useMemo(() => {
    if (!details?.daily_ledger) return [];
    const list = [...details.daily_ledger];
    return dailySortOrder === 'desc'
      ? list.sort((a, b) => b.day - a.day)
      : list.sort((a, b) => a.day - b.day);
  }, [details?.daily_ledger, dailySortOrder]);

  // Shifts list filtered & searched
  const filteredShifts = useMemo(() => {
    let list: Shift[] = details?.shifts_list || [];
    if (shiftFilter !== 'all') {
      list = list.filter((s) => s.status === shiftFilter);
    }
    if (shiftSearch.trim()) {
      const q = shiftSearch.toLowerCase();
      list = list.filter(
        (s) =>
          (s.user?.full_name || '').toLowerCase().includes(q) ||
          (s.user?.email || '').toLowerCase().includes(q) ||
          (s.notes || '').toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [details?.shifts_list, shiftFilter, shiftSearch]);

  return (
    <div>
      {/* ─── Top Month Navigation Bar ─── */}
      <div
        className="no-print"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        {/* Navigation controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handlePrevMonth}
            className="ccms-btn ccms-btn-ghost"
            title={language === 'ar' ? 'الشهر السابق' : 'Previous Month'}
            style={{
              padding: '8px 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: '8px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              {isRtl ? 'arrow_forward' : 'arrow_back'}
            </span>
            <span style={{ fontSize: '13px' }}>{language === 'ar' ? 'السابق' : 'Prev'}</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent-cyan)' }}>
              calendar_month
            </span>
            <select
              value={`${selectedYear}-${selectedMonth}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                setSelectedYear(y);
                setSelectedMonth(m);
              }}
              style={{
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {monthsList.map((item) => {
                const names = language === 'ar' ? MONTH_NAMES_AR : MONTH_NAMES_EN;
                const label = `${names[item.month - 1]} ${item.year} ${item.is_current ? (language === 'ar' ? '(الشهر الحالي)' : '(Current)') : ''}`;
                return (
                  <option key={item.period_key} value={item.period_key}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          <button
            onClick={handleNextMonth}
            className="ccms-btn ccms-btn-ghost"
            title={language === 'ar' ? 'الشهر التالي' : 'Next Month'}
            style={{
              padding: '8px 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: '8px',
            }}
          >
            <span style={{ fontSize: '13px' }}>{language === 'ar' ? 'التالي' : 'Next'}</span>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              {isRtl ? 'arrow_back' : 'arrow_forward'}
            </span>
          </button>
        </div>

        {/* Refresh button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => fetchMonthDetails(selectedYear, selectedMonth)}
            disabled={loadingDetails}
            className="ccms-btn ccms-btn-ghost"
            style={{ padding: '8px 14px', fontSize: '13px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title={language === 'ar' ? 'تحديث البيانات' : 'Refresh'}
          >
            <span
              className={`material-symbols-outlined ${loadingDetails ? 'spin' : ''}`}
              style={{ fontSize: '18px' }}
            >
              refresh
            </span>
            <span>{language === 'ar' ? 'تحديث' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Printable Report Header */}
      <div
        className="print-only"
        style={{
          display: 'none',
          paddingBottom: '20px',
          marginBottom: '20px',
          borderBottom: '2px solid #333',
        }}
      >
        <h1 style={{ fontSize: '24px', margin: '0 0 6px 0', textAlign: 'center' }}>
          {language === 'ar' ? 'تقرير الحسابات والماليات الشهرية' : 'Monthly Financial Accounts Statement'}
        </h1>
        <p style={{ margin: 0, textAlign: 'center', color: '#666', fontSize: '14px' }}>
          {currentMonthLabel}
        </p>
      </div>

      {loadingDetails ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <LoadingSpinner label={language === 'ar' ? 'جاري تجميع حسابات الشهر...' : 'Loading monthly metrics...'} />
        </div>
      ) : !details ? (
        <EmptyState
          icon="event_busy"
          title={language === 'ar' ? 'لا توجد بيانات لهذا الشهر' : 'No data for this month'}
          description={language === 'ar' ? 'لم يتم العثور على أي حركات مالية خلال هذه الفترة.' : 'No financial transactions recorded.'}
        />
      ) : (
        <>
          {/* ─── 4 Top Key KPI Cards ─── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: '20px',
              marginBottom: '28px',
            }}
          >
            {/* 1. Total Revenue */}
            <StatCard
              icon="payments"
              label={language === 'ar' ? 'إجمالي إيرادات الشهر' : 'Total Month Revenue'}
              value={formatCurrency(details.totals.total_revenue)}
              accent="var(--accent-cyan)"
              hint={
                details.comparison_previous_month.revenue_growth_pct !== 0
                  ? `${details.comparison_previous_month.revenue_growth_pct > 0 ? '+' : ''}${details.comparison_previous_month.revenue_growth_pct}% ${language === 'ar' ? 'عن الشهر السابق' : 'vs last month'}`
                  : `${formatCurrency(details.totals.device_revenue)} أجهزة | ${formatCurrency(details.totals.cafe_revenue)} كافيه`
              }
              index={0}
            />

            {/* 2. Total Expenses */}
            <StatCard
              icon="receipt_long"
              label={language === 'ar' ? 'إجمالي مصروفات الشهر' : 'Total Month Expenses'}
              value={formatCurrency(details.totals.total_expenses)}
              accent="var(--accent-orange, #FF7A00)"
              hint={
                language === 'ar'
                  ? `${details.totals.expenses_count} سند مصروف مقسمة على ${details.expenses_by_category.length} فئات`
                  : `${details.totals.expenses_count} expenses recorded`
              }
              index={1}
            />

            {/* 3. Net Profit */}
            <StatCard
              icon="trending_up"
              label={language === 'ar' ? 'صافي أرباح الشهر' : 'Net Monthly Profit'}
              value={formatCurrency(details.totals.net_profit)}
              accent={details.totals.net_profit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
              hint={
                language === 'ar'
                  ? `هامش الربحية: ${details.totals.profit_margin_pct}% من الإيراد`
                  : `Profit Margin: ${details.totals.profit_margin_pct}%`
              }
              index={2}
            />

            {/* 4. Shifts & Cash Audit */}
            <StatCard
              icon="account_balance_wallet"
              label={language === 'ar' ? 'حركة الورديات والدرج' : 'Shifts & Cash Audit'}
              value={`${details.totals.shifts_count} ${language === 'ar' ? 'وردية' : 'shifts'}`}
              accent="var(--accent-purple)"
              hint={
                details.totals.cash_discrepancy === 0
                  ? (language === 'ar' ? 'مطابقة تامة للكاش بدون عجز' : 'Exact cash match')
                  : details.totals.cash_discrepancy > 0
                  ? `+${formatCurrency(details.totals.cash_discrepancy)} ${language === 'ar' ? 'زيادة كاش' : 'surplus'}`
                  : `${formatCurrency(details.totals.cash_discrepancy)} ${language === 'ar' ? 'عجز كاش' : 'deficit'}`
              }
              index={3}
            />
          </div>

          {/* ─── Navigation Tabs ─── */}
          <div
            className="no-print"
            style={{
              display: 'flex',
              gap: '8px',
              borderBottom: '1px solid var(--border-default)',
              marginBottom: '24px',
              overflowX: 'auto',
            }}
          >
            {[
              { id: 'overview', label: language === 'ar' ? 'التحليلات وميزان الشهر' : 'Overview & Balance', icon: 'analytics' },
              { id: 'daily', label: language === 'ar' ? 'الجدول المالي اليومي' : 'Daily Financial Ledger', icon: 'table_view' },
              { id: 'shifts', label: language === 'ar' ? 'ورديات الشهر' : 'Month Shifts', icon: 'schedule', count: details.totals.shifts_count },
              { id: 'expenses', label: language === 'ar' ? 'تفاصيل المصروفات' : 'Month Expenses', icon: 'receipt_long', count: details.totals.expenses_count },
              { id: 'history', label: language === 'ar' ? 'أرشيف الشهور' : 'Archive', icon: 'history' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 18px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                  color: activeTab === tab.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  fontWeight: activeTab === tab.id ? 700 : 500,
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    style={{
                      background: activeTab === tab.id ? 'var(--accent-cyan)' : 'var(--bg-base)',
                      color: activeTab === tab.id ? '#000' : 'var(--text-secondary)',
                      borderRadius: '10px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ─── TAB 1: OVERVIEW ─── */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.8fr 1.2fr', gap: '24px' }}>
              {/* Daily Trend Chart */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '12px',
                  padding: '20px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                    {language === 'ar' ? 'مسار الإيرادات والمصروفات اليومية' : 'Daily Revenue & Expense Trend'}
                  </h3>
                  <div style={{ display: 'flex', gap: '14px', fontSize: '13px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--accent-cyan, #00C2FF)' }} />
                      <span style={{ fontWeight: 600 }}>{language === 'ar' ? 'إيرادات' : 'Revenue'}</span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--accent-orange, #FF7A00)' }} />
                      <span style={{ fontWeight: 600, color: 'var(--accent-orange, #FF7A00)' }}>{language === 'ar' ? 'مصروفات' : 'Expenses'}</span>
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '4px',
                    height: '200px',
                    borderBottom: '1px solid var(--border-default)',
                    paddingBottom: '8px',
                    position: 'relative',
                  }}
                >
                  {details.daily_ledger.map((row) => {
                    const maxVal = Math.max(1, ...details.daily_ledger.map((d) => Math.max(d.total_revenue, d.total_expenses)));
                    const revHeight = row.total_revenue > 0 ? Math.max(8, (row.total_revenue / maxVal) * 170) : 2;
                    const expHeight = row.total_expenses > 0 ? Math.max(8, (row.total_expenses / maxVal) * 170) : 2;

                    return (
                      <div
                        key={row.day}
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          height: '100%',
                          gap: '2px',
                        }}
                        title={`${row.date}\nإيراد: ${row.total_revenue}\nمصروف: ${row.total_expenses}\nصافي: ${row.net_profit}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', width: '100%', justifyContent: 'center' }}>
                          <div
                            style={{
                              width: '45%',
                              height: `${revHeight}px`,
                              background: row.total_revenue > 0 ? 'var(--accent-cyan, #00C2FF)' : 'rgba(255, 255, 255, 0.06)',
                              borderRadius: '2px 2px 0 0',
                            }}
                          />
                          <div
                            style={{
                              width: '45%',
                              height: `${expHeight}px`,
                              background: row.total_expenses > 0 ? 'var(--accent-orange, #FF7A00)' : 'rgba(255, 255, 255, 0.06)',
                              borderRadius: '2px 2px 0 0',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '9px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {row.day}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <span>{language === 'ar' ? 'يوم 1' : 'Day 1'}</span>
                  <span>{language === 'ar' ? `يوم ${details.period.days_in_month}` : `Day ${details.period.days_in_month}`}</span>
                </div>
              </div>

              {/* Expense Category Distribution */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '12px',
                  padding: '20px',
                }}
              >
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
                  {language === 'ar' ? 'توزيع مصروفات الشهر حسب البند' : 'Expense Category Distribution'}
                </h3>

                {details.expenses_by_category.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {language === 'ar' ? 'لم تُسجل أي مصروفات خلال هذا الشهر.' : 'No expenses recorded this month.'}
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {details.expenses_by_category.map((cat, idx) => (
                      <div key={idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600 }}>{cat.category}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {formatCurrency(cat.total)} ({cat.percentage}%)
                          </span>
                        </div>
                        <div
                          style={{
                            width: '100%',
                            height: '6px',
                            background: 'var(--bg-base)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${cat.percentage}%`,
                              height: '100%',
                              background: idx === 0 ? 'var(--accent-orange, #FF7A00)' : idx === 1 ? 'var(--accent-purple)' : 'var(--accent-cyan)',
                              borderRadius: '3px',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── TAB 2: DAILY LEDGER TABLE ─── */}
          {activeTab === 'daily' && (
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                  {language === 'ar' ? `الجدول المالي اليومي لشهر (${currentMonthLabel})` : `Daily Ledger for ${currentMonthLabel}`}
                </h3>
                <button
                  onClick={() => setDailySortOrder(dailySortOrder === 'desc' ? 'asc' : 'desc')}
                  className="ccms-btn ccms-btn-ghost"
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--accent-cyan)',
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border-default)',
                  }}
                  title={language === 'ar' ? 'تبديل الترتيب الزمني' : 'Toggle sorting'}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>swap_vert</span>
                  <span>
                    {dailySortOrder === 'desc'
                      ? (language === 'ar' ? 'الترتيب: أواخر الأيام من فوق (تنازلي)' : 'Order: Latest Days First (Descending)')
                      : (language === 'ar' ? 'الترتيب: أوائل الأيام من فوق (تصاعدي)' : 'Order: Earliest Days First (Ascending)')}
                  </span>
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isRtl ? 'right' : 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: '12px' }}>
                      <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'اليوم والتاريخ' : 'Date'}</th>
                      <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'إيراد الأجهزة' : 'Device Rev'}</th>
                      <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'إيراد الكافيه' : 'Café Rev'}</th>
                      <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'إجمالي الإيراد' : 'Total Rev'}</th>
                      <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'المصروفات' : 'Expenses'}</th>
                      <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'صافي اليوم' : 'Net Profit'}</th>
                      <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'الورديات' : 'Shifts'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedDailyLedger.map((row) => (
                      <tr
                        key={row.day}
                        style={{
                          borderBottom: '1px solid var(--border-default)',
                          fontSize: '13px',
                          background: row.net_profit < 0 ? 'rgba(255, 68, 68, 0.04)' : undefined,
                        }}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          <span style={{ color: 'var(--accent-cyan)', marginRight: '6px' }}>#{row.day}</span>
                          <span>{row.date}</span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>{formatCurrency(row.device_revenue)}</td>
                        <td style={{ padding: '10px 12px' }}>{formatCurrency(row.cafe_revenue)}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                          {formatCurrency(row.total_revenue)}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--accent-orange)' }}>
                          {formatCurrency(row.total_expenses)}
                        </td>
                        <td
                          style={{
                            padding: '10px 12px',
                            fontWeight: 700,
                            color: row.net_profit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                          }}
                        >
                          {formatCurrency(row.net_profit)}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                          {row.shifts_count} {language === 'ar' ? 'وردية' : 'shifts'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── TAB: MONTH SHIFTS ─── */}
          {activeTab === 'shifts' && (
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '20px',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                    {language === 'ar' ? `ورديات شهر (${currentMonthLabel})` : `Monthly Shifts for ${currentMonthLabel}`}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {language === 'ar'
                      ? `تم تسجيل ${details.shifts_list?.length || 0} وردية عمل خلال هذا الشهر`
                      : `Total ${details.shifts_list?.length || 0} shifts logged during this month`}
                  </p>
                </div>

                {/* Filter and Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', minWidth: '180px' }}>
                    <span
                      className="material-symbols-outlined"
                      style={{
                        position: 'absolute',
                        [isRtl ? 'right' : 'left']: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '18px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      search
                    </span>
                    <input
                      type="text"
                      value={shiftSearch}
                      onChange={(e) => setShiftSearch(e.target.value)}
                      placeholder={language === 'ar' ? 'بحث عن موظف...' : 'Search staff...'}
                      style={{
                        width: '100%',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '8px',
                        padding: '7px 12px',
                        [isRtl ? 'paddingRight' : 'paddingLeft']: '34px',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => setShiftFilter('all')}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-default)',
                        background: shiftFilter === 'all' ? 'var(--accent-cyan)' : 'var(--bg-base)',
                        color: shiftFilter === 'all' ? '#000' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {language === 'ar' ? 'الكل' : 'All'} ({details.shifts_list?.length || 0})
                    </button>
                    <button
                      onClick={() => setShiftFilter('closed')}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-default)',
                        background: shiftFilter === 'closed' ? 'var(--accent-cyan)' : 'var(--bg-base)',
                        color: shiftFilter === 'closed' ? '#000' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {language === 'ar' ? 'المغلقة' : 'Closed'} ({(details.shifts_list || []).filter(s => s.status === 'closed').length})
                    </button>
                    <button
                      onClick={() => setShiftFilter('active')}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-default)',
                        background: shiftFilter === 'active' ? 'var(--accent-cyan)' : 'var(--bg-base)',
                        color: shiftFilter === 'active' ? '#000' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {language === 'ar' ? 'النشطة' : 'Active'} ({(details.shifts_list || []).filter(s => s.status === 'active').length})
                    </button>
                  </div>
                </div>
              </div>

              {filteredShifts.length === 0 ? (
                <EmptyState
                  icon="schedule"
                  title={language === 'ar' ? 'لا توجد ورديات لهذا الشهر' : 'No shifts found'}
                  description={language === 'ar' ? 'لم يتم العثور على أي ورديات عمل مطابقة للفترة المحددة.' : 'No shifts recorded.'}
                />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isRtl ? 'right' : 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: '12px' }}>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'الموظف المسؤول' : 'Staff'}</th>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'تاريخ ووقت البدء' : 'Started At'}</th>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'تاريخ ووقت الإغلاق' : 'Ended At'}</th>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'كاش البداية' : 'Opening Cash'}</th>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'إيراد الوردية' : 'Revenue'}</th>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'المصروفات' : 'Expenses'}</th>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'كاش الإغلاق' : 'Closing Cash'}</th>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'حالة الدرج' : 'Cash Audit'}</th>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'الحالة' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShifts.map((shift) => {
                        const expectedCash = Number(shift.opening_cash || 0) + Number(shift.total_revenue || 0) - Number(shift.total_expenses || 0);
                        const discrepancy = shift.closing_cash !== null ? Number(shift.closing_cash) - expectedCash : null;

                        return (
                          <tr key={shift.id} style={{ borderBottom: '1px solid var(--border-default)', fontSize: '13px' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
                                  badge
                                </span>
                                <span>{shift.user?.full_name || shift.user?.email || '—'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                              {new Date(shift.started_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                              {shift.ended_at ? (
                                new Date(shift.ended_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              ) : (
                                <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                                  {language === 'ar' ? 'مستمرة الآن...' : 'In Progress...'}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px' }}>{formatCurrency(shift.opening_cash)}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                              {formatCurrency(shift.total_revenue)}
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--accent-orange)' }}>
                              {formatCurrency(shift.total_expenses)}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                              {shift.closing_cash !== null ? formatCurrency(shift.closing_cash) : '—'}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {discrepancy === null ? (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              ) : discrepancy === 0 ? (
                                <span style={{ color: 'var(--accent-green)', fontSize: '12px', fontWeight: 600 }}>
                                  {language === 'ar' ? 'مطابقة تامة' : 'Exact Match'}
                                </span>
                              ) : discrepancy > 0 ? (
                                <span style={{ color: 'var(--accent-cyan)', fontSize: '12px', fontWeight: 600 }}>
                                  +{formatCurrency(discrepancy)} ({language === 'ar' ? 'زيادة' : 'Surplus'})
                                </span>
                              ) : (
                                <span style={{ color: 'var(--accent-red)', fontSize: '12px', fontWeight: 600 }}>
                                  {formatCurrency(discrepancy)} ({language === 'ar' ? 'عجز' : 'Deficit'})
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {shift.status === 'active' ? (
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    background: 'rgba(34, 197, 94, 0.15)',
                                    color: 'var(--accent-green)',
                                  }}
                                >
                                  {language === 'ar' ? 'نشطة' : 'Active'}
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  {language === 'ar' ? 'مغلقة' : 'Closed'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 3: EXPENSES ─── */}
          {activeTab === 'expenses' && (
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
                {language === 'ar' ? 'سجل بنود المصروفات خلال هذا الشهر' : 'Month Expense Records'}
              </h3>

              {details.expenses_list.length === 0 ? (
                <EmptyState
                  icon="receipt"
                  title={language === 'ar' ? 'لا توجد مصروفات' : 'No expenses'}
                  description={language === 'ar' ? 'لم يتم تسجيل أي سند صرف خلال هذا الشهر.' : 'No expenses recorded in this period.'}
                />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isRtl ? 'right' : 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: '12px' }}>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'التاريخ' : 'Date'}</th>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'التصنيف' : 'Category'}</th>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'البيان والتفاصيل' : 'Description'}</th>
                        <th style={{ padding: '10px 12px' }}>{language === 'ar' ? 'المسؤول' : 'Recorded By'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.expenses_list.map((exp) => (
                        <tr key={exp.id} style={{ borderBottom: '1px solid var(--border-default)', fontSize: '13px' }}>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                            {new Date(exp.created_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--accent-orange)' }}>
                            {formatCurrency(exp.amount)}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span
                              style={{
                                background: 'rgba(255, 153, 0, 0.1)',
                                color: 'var(--accent-orange)',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                              }}
                            >
                              {exp.category || (language === 'ar' ? 'عام' : 'General')}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>{exp.description}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                            {exp.creator?.full_name || exp.creator?.email || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 4: ARCHIVE ─── */}
          {activeTab === 'history' && (
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: '12px',
                padding: '16px',
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
                {language === 'ar' ? 'أرشيف الحسابات الشهرية' : 'Monthly Financial Records Archive'}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {monthsList.map((m) => {
                  const names = language === 'ar' ? MONTH_NAMES_AR : MONTH_NAMES_EN;
                  const isCurrentSelected = m.year === selectedYear && m.month === selectedMonth;

                  return (
                    <div
                      key={m.period_key}
                      onClick={() => {
                        setSelectedYear(m.year);
                        setSelectedMonth(m.month);
                        setActiveTab('overview');
                      }}
                      style={{
                        background: isCurrentSelected ? 'rgba(0, 194, 255, 0.08)' : 'var(--bg-base)',
                        border: isCurrentSelected ? '1px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                        borderRadius: '10px',
                        padding: '16px',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <strong style={{ fontSize: '15px' }}>
                          {names[m.month - 1]} {m.year}
                        </strong>
                        {m.is_current && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: 'var(--accent-cyan)',
                              background: 'rgba(0, 229, 255, 0.12)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            {language === 'ar' ? 'الشهر الحالي' : 'Current'}
                          </span>
                        )}
                      </div>

                      {m.total_revenue !== null && (
                        <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          <span>{language === 'ar' ? 'الإيراد:' : 'Revenue:'}</span>
                          <strong style={{ color: 'var(--accent-cyan)' }}>{formatCurrency(m.total_revenue)}</strong>
                        </div>
                      )}
                      {m.net_profit !== null && (
                        <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                          <span>{language === 'ar' ? 'صافي الربح:' : 'Net Profit:'}</span>
                          <strong style={{ color: 'var(--accent-green)' }}>{formatCurrency(m.net_profit)}</strong>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


