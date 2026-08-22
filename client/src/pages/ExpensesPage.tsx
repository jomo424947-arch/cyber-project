import { useEffect, useMemo, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Layout } from '../components/Layout';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { StatCard } from '../components/StatCard';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency } from '../utils/format';
import type { ShiftExpense, Shift } from '../types';

export default function ExpensesPage() {
  const isMobile = useIsMobile();
  const { user, isAdmin } = useAuth();
  const { language, isRtl } = useLanguage();
  const { toast } = useToast();

  const [expenses, setExpenses] = useState<ShiftExpense[]>([]);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const fetchExpensesData = async () => {
    try {
      setLoading(true);
      const [allExpenses, currentActiveShift] = await Promise.all([
        dataService.listAllExpenses(),
        dataService.getActiveShift(),
      ]);
      setExpenses(allExpenses || []);
      setActiveShift(currentActiveShift || null);
    } catch (err) {
      console.error('Failed to load expenses:', err);
      toast(apiErrorMessage(err, 'Failed to load expenses'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpensesData();
  }, []);

  // Auto-poll every 15 seconds for cross-instance sync (Desktop ↔ Web)
  usePolling(fetchExpensesData, 15000);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) {
      toast(
        language === 'ar'
          ? 'يجب بدء وردية أولاً قبل تسجيل أي مصروفات'
          : 'You must have an active shift to record expenses',
        'error'
      );
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast(language === 'ar' ? 'يرجى إدخال مبلغ صحيح' : 'Please enter a valid amount', 'error');
      return;
    }
    if (!description.trim()) {
      toast(language === 'ar' ? 'يرجى إدخال بيان المصروف' : 'Please enter a description', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await dataService.createShiftExpense(activeShift.id, {
        amount: Number(amount),
        category: category.trim() || (language === 'ar' ? 'عام' : 'General'),
        description: description.trim(),
      });
      toast(language === 'ar' ? 'تم تسجيل المصروف بنجاح' : 'Expense recorded successfully', 'success');
      setShowAddModal(false);
      setAmount('');
      setCategory('');
      setDescription('');
      fetchExpensesData();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to record expense'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (expense: ShiftExpense) => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذا المصروف؟' : 'Are you sure you want to delete this expense?')) {
      return;
    }

    try {
      await dataService.deleteShiftExpense(expense.shift_id, expense.id);
      toast(language === 'ar' ? 'تم حذف المصروف بنجاح' : 'Expense deleted successfully', 'success');
      fetchExpensesData();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not delete expense'), 'error');
    }
  };

  // Distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach((e) => {
      if (e.category) set.add(e.category);
    });
    return Array.from(set);
  }, [expenses]);

  // Filtered expenses
  const filtered = useMemo(() => {
    let list = expenses;
    if (selectedCategory !== 'all') {
      list = list.filter((e) => e.category === selectedCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          (e.description || '').toLowerCase().includes(q) ||
          (e.category || '').toLowerCase().includes(q) ||
          (e.creator?.full_name || '').toLowerCase().includes(q) ||
          (e.creator?.email || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [expenses, selectedCategory, search]);

  // Statistics
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const todayExpenses = expenses.filter((e) => e.created_at.startsWith(todayStr));
    const todayTotal = todayExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const activeShiftExpenses = activeShift
      ? expenses.filter((e) => e.shift_id === activeShift.id)
      : [];
    const activeShiftTotal = activeShiftExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const totalAll = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    return {
      todayTotal,
      todayCount: todayExpenses.length,
      activeShiftTotal,
      activeShiftCount: activeShiftExpenses.length,
      totalAll,
      totalCount: expenses.length,
    };
  }, [expenses, activeShift]);

  return (
    <Layout
      title={language === 'ar' ? 'سجل المصروفات النثرية' : 'Expense Tracking'}
      subtitle={
        language === 'ar'
          ? 'تسجيل ومتابعة كافة المصروفات والمدفوعات الخارجة من الكاشير أثناء الورديات، مصنفة حسب الفئات.'
          : 'Detailed log of operational expenses, supplier payouts, maintenance, and petty cash disbursed during shifts.'
      }
      actions={
        <Button
          variant="primary"
          onClick={() => setShowAddModal(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: isMobile ? '100%' : 'auto', minHeight: '38px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            add_circle
          </span>
          {language === 'ar' ? 'تسجيل مصروف جديد' : 'Record Expense'}
        </Button>
      }
    >
      {/* 1. STATS CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <StatCard
          label={language === 'ar' ? 'مصروفات اليوم' : "Today's Expenses"}
          value={formatCurrency(stats.todayTotal)}
          icon="today"
          accent="var(--accent-red)"
        />
        <StatCard
          label={language === 'ar' ? 'مصروفات الوردية الحالية' : 'Active Shift Expenses'}
          value={formatCurrency(stats.activeShiftTotal)}
          icon="schedule"
          accent="var(--accent-yellow)"
        />
        <StatCard
          label={language === 'ar' ? 'إجمالي المصروفات المسجلة' : 'Total All Expenses'}
          value={formatCurrency(stats.totalAll)}
          icon="account_balance_wallet"
          accent="var(--accent-cyan)"
        />
        <StatCard
          label={language === 'ar' ? 'عدد العمليات' : 'Total Expense Count'}
          value={stats.totalCount}
          icon="receipt_long"
          accent="var(--accent-green)"
        />
      </div>

      {/* 2. ACTIVE SHIFT WARNING IF NO SHIFT */}
      {!activeShift && (
        <div
          style={{
            padding: '12px 18px',
            background: 'rgba(234, 179, 8, 0.1)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: '12px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            color: 'var(--accent-yellow)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            warning
          </span>
          <span>
            {language === 'ar'
              ? 'تنبيه: لا توجد وردية مفتوحة حالياً لحسابك. لتسجيل مصروف جديد، يرجى فتح وردية عمل أولاً من صفحة الورديات.'
              : 'Notice: You do not have an active shift open. Please start a shift first from the Shifts page to record new expenses.'}
          </span>
        </div>
      )}

      {/* 3. TABLE AND FILTERS */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '16px',
          padding: '20px',
        }}
      >
        {/* Filter controls */}
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
          {/* Category Chips */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedCategory('all')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                background: selectedCategory === 'all' ? 'var(--accent-cyan)' : 'transparent',
                color: selectedCategory === 'all' ? '#000' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {language === 'ar' ? 'كل الفئات' : 'All Categories'} ({expenses.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                  background: selectedCategory === cat ? 'var(--accent-cyan)' : 'transparent',
                  color: selectedCategory === cat ? '#000' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {cat} ({expenses.filter((e) => e.category === cat).length})
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: 'relative', width: '280px' }}>
            <input
              type="text"
              placeholder={language === 'ar' ? 'بحث بالبيان أو الفئة أو الموظف...' : 'Search by description or staff...'}
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
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="receipt_long"
            title={language === 'ar' ? 'لا توجد مصروفات مسجلة' : 'No expenses recorded'}
            description={
              language === 'ar'
                ? 'لم يتم العثور على أي مصروفات تطابق خيارات البحث.'
                : 'No expense records found matching your current filter.'
            }
          />
        ) : (
          <Table<ShiftExpense>
            data={filtered}
            rowKey={(e) => e.id}
            columns={[
              {
                key: 'category',
                header: language === 'ar' ? 'فئة المصروف' : 'Category',
                render: (e) => (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: '6px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: 'var(--accent-red)',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    {e.category || (language === 'ar' ? 'عام' : 'General')}
                  </span>
                ),
              },
              {
                key: 'description',
                header: language === 'ar' ? 'بيان وتفاصيل المصروف' : 'Description',
                render: (e) => (
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                    {e.description}
                  </span>
                ),
              },
              {
                key: 'amount',
                header: language === 'ar' ? 'المبلغ' : 'Amount',
                align: 'right',
                render: (e) => (
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '14px',
                      color: 'var(--accent-red)',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    -{formatCurrency(e.amount)}
                  </span>
                ),
              },
              {
                key: 'staff',
                header: language === 'ar' ? 'الموظف المسجل' : 'Staff Member',
                render: (e) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-cyan)' }}>
                      badge
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {e.creator?.full_name || e.creator?.email?.split('@')[0] || (language === 'ar' ? 'كاشير' : 'Staff')}
                    </span>
                  </div>
                ),
              },
              {
                key: 'created_at',
                header: language === 'ar' ? 'التاريخ والوقت' : 'Date & Time',
                render: (e) => {
                  const d = new Date(e.created_at);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-primary)' }}>
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
                key: 'actions',
                header: '',
                align: 'right',
                render: (e) => (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {(isAdmin || e.created_by === user?.id) && (
                      <button
                        title={language === 'ar' ? 'حذف المصروف' : 'Delete Expense'}
                        onClick={() => handleDeleteExpense(e)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: 'var(--accent-red)',
                          padding: '6px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(el) => (el.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)')}
                        onMouseLeave={(el) => (el.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)')}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                          delete
                        </span>
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>

      {/* ADD EXPENSE MODAL */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent-red)', fontSize: '22px' }}>
              receipt_long
            </span>
            <span>{language === 'ar' ? 'تسجيل مصروف جديد' : 'Record New Expense'}</span>
          </div>
        }
      >
        <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              {language === 'ar' ? 'قيمة المصروف (المبلغ المنصرف من الكاشير)' : 'Expense Amount'}
            </label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              required
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
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
              {language === 'ar' ? 'فئة / نوع المصروف (نص حر - اكتب الفئة)' : 'Category (Free text)'}
            </label>
            <input
              type="text"
              placeholder={language === 'ar' ? 'مثال: صيانة أجهزة، بوفيه ومشروبات، نظافة، فواتير، إلخ...' : 'e.g., Hardware Repair, Buffet Supplies, Cleaning...'}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
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
              {language === 'ar' ? 'بيان / تفاصيل وسبب الصرف' : 'Description / Reason'}
            </label>
            <textarea
              rows={3}
              required
              placeholder={language === 'ar' ? 'اكتب تفاصيل الصرف وما تم شراؤه...' : 'Describe what this cash was spent on...'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
            <Button variant="ghost" type="button" onClick={() => setShowAddModal(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? (language === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : language === 'ar' ? 'حفظ وتسجيل المصروف' : 'Record Expense'}
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
