import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { AddCafeModal } from '../components/AddCafeModal';
import { useAsync } from '../hooks/useAsync';
import { usePolling } from '../hooks/usePolling';
import { useIsMobile } from '../hooks/useIsMobile';
import { useNow } from '../hooks/useNow';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useSystemSettings } from '../context/SystemSettingsContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatElapsed, formatCurrency } from '../utils/format';
import type { CafeTable, Session, PaymentMethod } from '../types';

export default function CafeTablesPage() {
  const isMobile = useIsMobile();
  const now = useNow(1000);
  const { toast } = useToast();
  const { t, language, isRtl } = useLanguage();
  const { isAdmin } = useAuth();
  const { walletQrUrl, walletPhoneNumber, bankDetails } = useSystemSettings();

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied'>('all');

  // Modals state
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState<CafeTable | null>(null);
  const [deletingTable, setDeletingTable] = useState<CafeTable | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  // Table session targets
  const [startTargetTable, setStartTargetTable] = useState<CafeTable | null>(null);
  const [startCustomerName, setStartCustomerName] = useState('');
  const [startLoading, setStartLoading] = useState(false);

  // Order modals targets
  const [cafeOrderTargetSession, setCafeOrderTargetSession] = useState<Session | null>(null);
  const [viewOrdersTable, setViewOrdersTable] = useState<CafeTable | null>(null);
  const [voidingOrderId, setVoidingOrderId] = useState<string | null>(null);

  // Checkout modal target & settlement workstation
  const [checkoutTable, setCheckoutTable] = useState<CafeTable | null>(null);
  const [checkoutOrders, setCheckoutOrders] = useState<any[] | null>(null);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<PaymentMethod>('cash');
  const [checkoutPaymentRef, setCheckoutPaymentRef] = useState('');
  const [checkoutMarkPaid, setCheckoutMarkPaid] = useState(true);
  const [checkoutShowQrZoom, setCheckoutShowQrZoom] = useState(false);
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Discount state (percentage & fixed amount inputs)
  const [checkoutDiscountType, setCheckoutDiscountType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [checkoutDiscountPercentVal, setCheckoutDiscountPercentVal] = useState<string>('');
  const [checkoutDiscountFixedVal, setCheckoutDiscountFixedVal] = useState<string>('');

  // Service fee state (percentage & fixed amount inputs)
  const [checkoutServiceType, setCheckoutServiceType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [checkoutServicePercentVal, setCheckoutServicePercentVal] = useState<string>('');
  const [checkoutServiceFixedVal, setCheckoutServiceFixedVal] = useState<string>('');

  const resetCheckoutState = () => {
    setCheckoutTable(null);
    setCheckoutOrders(null);
    setCheckoutPaymentMethod('cash');
    setCheckoutPaymentRef('');
    setCheckoutMarkPaid(true);
    setCheckoutShowQrZoom(false);
    setCheckoutNotes('');
    setCheckoutDiscountType('none');
    setCheckoutDiscountPercentVal('');
    setCheckoutDiscountFixedVal('');
    setCheckoutServiceType('none');
    setCheckoutServicePercentVal('');
    setCheckoutServiceFixedVal('');
  };

  // Fetch fresh orders for table checkout workstation
  useEffect(() => {
    if (checkoutTable?.active_session?.id) {
      dataService.listSessionOrders(checkoutTable.active_session.id)
        .then((fetched) => setCheckoutOrders(fetched))
        .catch(() => setCheckoutOrders((checkoutTable.active_session as any)?.orders || []));
    } else {
      setCheckoutOrders(null);
    }
  }, [checkoutTable?.active_session?.id]);

  // Fetch cafe tables
  const { data, loading, refetch } = useAsync(async () => {
    const tables = await dataService.listCafeTables();
    return tables;
  }, []);

  // Auto-poll every 15 seconds for real-time multi-device sync
  usePolling(refetch, 15000);

  const tables = data ?? [];

  // Computed stats
  const stats = useMemo(() => {
    const total = tables.length;
    const occupied = tables.filter((t) => t.device?.status === 'in_use' || !!t.active_session).length;
    const available = total - occupied;
    const activeOrdersTotal = tables.reduce((sum, t) => sum + Number(t.active_session?.current_orders_total || 0), 0);
    return { total, available, occupied, activeOrdersTotal };
  }, [tables]);

  // Filtered tables
  const filteredTables = useMemo(() => {
    return tables.filter((tbl) => {
      const isOccupied = tbl.device?.status === 'in_use' || !!tbl.active_session;
      if (statusFilter === 'available' && isOccupied) return false;
      if (statusFilter === 'occupied' && !isOccupied) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesNumber = tbl.table_number.toLowerCase().includes(q);
        const matchesName = tbl.name.toLowerCase().includes(q);
        const matchesCustomer = tbl.active_session?.customer?.name?.toLowerCase().includes(q);
        return matchesNumber || matchesName || matchesCustomer;
      }
      return true;
    });
  }, [tables, statusFilter, search]);

  // Handle create or update table
  const handleSaveTable = async (tableData: { id?: string; table_number: string; name: string; capacity: number }) => {
    try {
      if (tableData.id) {
        await dataService.updateCafeTable(tableData.id, {
          table_number: tableData.table_number,
          name: tableData.name,
          capacity: tableData.capacity,
        });
        toast(language === 'ar' ? 'تم تحديث بيانات الطاولة بنجاح' : 'Table updated successfully', 'success');
      } else {
        await dataService.createCafeTable({
          table_number: tableData.table_number,
          name: tableData.name,
          capacity: tableData.capacity,
        });
        toast(language === 'ar' ? 'تمت إضافة الطاولة بنجاح' : 'Table added successfully', 'success');
      }
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to save table'), 'error');
    }
  };

  // Handle delete table
  const handleDeleteTable = async () => {
    if (!deletingTable) return;
    setDeletingLoading(true);
    try {
      await dataService.deleteCafeTable(deletingTable.id);
      toast(language === 'ar' ? 'تم حذف الطاولة بنجاح' : 'Table deleted successfully', 'success');
      setDeletingTable(null);
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to delete table'), 'error');
    } finally {
      setDeletingLoading(false);
    }
  };

  // Start table session (zero hourly rate)
  const handleStartTableSession = async () => {
    if (!startTargetTable?.device?.id) return;
    setStartLoading(true);
    try {
      await dataService.startSession({
        device_id: startTargetTable.device.id,
        customer_name: startCustomerName.trim() || undefined,
        session_type: 'open',
        hourly_rate_override: 0,
      });
      toast(language === 'ar' ? `تم فتح جلسة طاولة ${startTargetTable.table_number}` : `Session opened for Table ${startTargetTable.table_number}`, 'success');
      setStartTargetTable(null);
      setStartCustomerName('');
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to open table order'), 'error');
    } finally {
      setStartLoading(false);
    }
  };

  // Void single order line
  const handleVoidOrder = async (sessionId: string, orderId: string) => {
    setVoidingOrderId(orderId);
    try {
      await dataService.voidSessionOrder(sessionId, orderId);
      toast(language === 'ar' ? 'تم إلغاء الصنف وإعادته للمخزون' : 'Item removed and stock restored', 'success');
      await refetch();
      // Update local view orders target
      if (viewOrdersTable) {
        const updated = tables.find((t) => t.id === viewOrdersTable.id);
        if (updated) setViewOrdersTable(updated);
      }
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to void item'), 'error');
    } finally {
      setVoidingOrderId(null);
    }
  };

  // Checkout and close table session
  const handleCheckoutTable = async () => {
    if (!checkoutTable?.active_session?.id) return;
    setCheckoutLoading(true);
    try {
      const activeOrders = checkoutOrders ?? ((checkoutTable.active_session as any)?.orders || []);
      const subtotal = activeOrders.reduce((sum: number, o: any) => sum + Number(o.total_price || 0), 0);

      // 1. Discount calculation
      let parsedDiscountVal = 0;
      let discountAmount = 0;
      if (checkoutDiscountType === 'percentage') {
        parsedDiscountVal = parseFloat(checkoutDiscountPercentVal) || 0;
        if (parsedDiscountVal > 0) {
          discountAmount = Math.round(subtotal * (Math.min(100, parsedDiscountVal) / 100) * 100) / 100;
        }
      } else if (checkoutDiscountType === 'fixed') {
        parsedDiscountVal = parseFloat(checkoutDiscountFixedVal) || 0;
        if (parsedDiscountVal > 0) {
          discountAmount = Math.min(subtotal, Math.round(parsedDiscountVal * 100) / 100);
        }
      }
      const afterDiscount = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

      // 2. Service fee calculation
      let parsedServiceVal = 0;
      let serviceFee = 0;
      if (checkoutServiceType === 'percentage') {
        parsedServiceVal = parseFloat(checkoutServicePercentVal) || 0;
        if (parsedServiceVal > 0) {
          serviceFee = Math.round(afterDiscount * (parsedServiceVal / 100) * 100) / 100;
        }
      } else if (checkoutServiceType === 'fixed') {
        parsedServiceVal = parseFloat(checkoutServiceFixedVal) || 0;
        if (parsedServiceVal > 0) {
          serviceFee = Math.round(parsedServiceVal * 100) / 100;
        }
      }

      // Format notes and payment reference
      let finalNotes = checkoutNotes.trim();
      if (checkoutPaymentRef.trim()) {
        const refLabel = checkoutPaymentMethod === 'card'
          ? (language === 'ar' ? 'مرجع إيصال الماكينة' : 'POS Ref')
          : checkoutPaymentMethod === 'wallet'
          ? (language === 'ar' ? 'رقم محفظة/عملية' : 'Wallet Ref')
          : (language === 'ar' ? 'مرجع التحويل' : 'Transfer Ref');
        finalNotes = finalNotes ? `${finalNotes} | [${refLabel}: ${checkoutPaymentRef.trim()}]` : `[${refLabel}: ${checkoutPaymentRef.trim()}]`;
      }

      await dataService.endSession(checkoutTable.active_session.id, {
        ended_at: new Date().toISOString(),
        mark_paid: checkoutMarkPaid,
        payment_method: checkoutPaymentMethod,
        discount_type: checkoutDiscountType,
        discount_value: parsedDiscountVal,
        service_fee: serviceFee,
        service_rate: checkoutServiceType === 'percentage' ? parsedServiceVal : 0,
        rounding_delta: 0,
        notes: finalNotes || undefined,
      });

      toast(language === 'ar' ? `تم تحصيل فاتورة طاولة #${checkoutTable.table_number} وإخلاؤها بنجاح` : `Table #${checkoutTable.table_number} settled & released`, 'success');
      resetCheckoutState();
      refetch();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to settle table order'), 'error');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <Layout
      title={t('cafe_tables_title')}
      subtitle={t('cafe_tables_subtitle')}
      actions={
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="ghost" onClick={refetch}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: isRtl ? 0 : '6px', marginLeft: isRtl ? '6px' : 0 }}>
              sync
            </span>
            {language === 'ar' ? 'تحديث' : 'Refresh'}
          </Button>
          {isAdmin && (
            <Button variant="primary" onClick={() => setShowAddTableModal(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: isRtl ? 0 : '6px', marginLeft: isRtl ? '6px' : 0 }}>
                add
              </span>
              {t('add_table')}
            </Button>
          )}
        </div>
      }
    >
      {/* Top Stat Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div className="ccms-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(0, 194, 255, 0.1)',
              border: '1px solid rgba(0, 194, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>table_restaurant</span>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {language === 'ar' ? 'إجمالي الطاولات' : 'Total Tables'}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.total}</div>
          </div>
        </div>

        <div className="ccms-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-green)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>event_seat</span>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {language === 'ar' ? 'طاولات متاحة' : 'Available Tables'}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-green)' }}>{stats.available}</div>
          </div>
        </div>

        <div className="ccms-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-yellow)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>groups</span>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {language === 'ar' ? 'طاولات مشغولة' : 'Occupied Tables'}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-yellow)' }}>{stats.occupied}</div>
          </div>
        </div>

        <div className="ccms-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c084fc',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>receipt_long</span>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {language === 'ar' ? 'الطلبات النشطة' : 'Active Orders Value'}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#c084fc' }}>
              {formatCurrency(stats.activeOrdersTotal)}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: '12px',
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={statusFilter === 'all' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
            style={{ fontSize: '13px', padding: '6px 14px' }}
            onClick={() => setStatusFilter('all')}
          >
            {language === 'ar' ? 'الكل' : 'All'} ({stats.total})
          </button>
          <button
            className={statusFilter === 'available' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
            style={{ fontSize: '13px', padding: '6px 14px' }}
            onClick={() => setStatusFilter('available')}
          >
            {language === 'ar' ? 'متاحة' : 'Available'} ({stats.available})
          </button>
          <button
            className={statusFilter === 'occupied' ? 'ccms-btn ccms-btn-primary' : 'ccms-btn ccms-btn-ghost'}
            style={{ fontSize: '13px', padding: '6px 14px' }}
            onClick={() => setStatusFilter('occupied')}
          >
            {language === 'ar' ? 'مشغولة' : 'Occupied'} ({stats.occupied})
          </button>
        </div>

        <div style={{ width: isMobile ? '100%' : '280px' }}>
          <Input
            placeholder={language === 'ar' ? 'بحث برقم الطاولة أو الاسم...' : 'Search table # or name...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table Cards Grid */}
      {loading ? (
        <div style={{ padding: '60px 0', display: 'flex', justifyContent: 'center' }}>
          <LoadingSpinner />
        </div>
      ) : filteredTables.length === 0 ? (
        <EmptyState
          icon="table_restaurant"
          title={t('no_tables_found')}
          description={t('no_tables_desc')}
          action={
            isAdmin && (
              <Button variant="primary" onClick={() => setShowAddTableModal(true)}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                {t('add_table')}
              </Button>
            )
          }
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}
        >
          {filteredTables.map((tbl) => {
            const isOccupied = tbl.device?.status === 'in_use' || !!tbl.active_session;
            const session = tbl.active_session;
            const orders = (session as any)?.orders || [];
            const ordersTotal = Number((session as any)?.current_orders_total || 0);

            return (
              <div
                key={tbl.id}
                className="ccms-card"
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  padding: '20px',
                  border: isOccupied ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-default)',
                  background: isOccupied
                    ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.04) 0%, var(--bg-surface) 100%)'
                    : 'var(--bg-surface)',
                  boxShadow: isOccupied ? '0 4px 20px rgba(245, 158, 11, 0.1)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Header row: Table Number & Status */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        padding: '4px 10px',
                        borderRadius: '8px',
                        background: 'rgba(0, 194, 255, 0.12)',
                        border: '1px solid rgba(0, 194, 255, 0.3)',
                        color: 'var(--accent-cyan)',
                        fontWeight: 700,
                        fontSize: '14px',
                        fontFamily: 'Space Grotesk, monospace',
                      }}
                    >
                      #{tbl.table_number}
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>chair</span>
                      {tbl.capacity} {t('seats')}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isOccupied ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: 'var(--accent-yellow)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--accent-yellow)',
                            boxShadow: '0 0 8px var(--accent-yellow)',
                          }}
                        />
                        {t('occupied')}
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: 'rgba(34, 197, 94, 0.15)',
                          color: 'var(--accent-green)',
                          border: '1px solid rgba(34, 197, 94, 0.3)',
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--accent-green)',
                          }}
                        />
                        {t('available')}
                      </span>
                    )}

                    {/* Admin Edit/Delete Menu */}
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '2px' }}>
                        <button
                          className="ccms-btn-ghost"
                          style={{ padding: '4px', borderRadius: '6px', color: 'var(--text-secondary)' }}
                          title={t('edit_table')}
                          onClick={() => setEditingTable(tbl)}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                        </button>
                        <button
                          className="ccms-btn-ghost"
                          style={{ padding: '4px', borderRadius: '6px', color: 'var(--accent-red)' }}
                          title={t('delete_table')}
                          onClick={() => setDeletingTable(tbl)}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Table Title */}
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    {language === 'ar' ? `طاولة ${tbl.table_number}` : `Table ${tbl.table_number}`}
                  </h3>
                </div>

                <hr style={{ border: 0, borderTop: '1px solid var(--border-default)', margin: '2px 0' }} />

                {/* Body: Occupied vs Available */}
                {isOccupied && session ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                    {/* Customer & Time Info */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-cyan)' }}>person</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{session.customer?.name || 'Walk-in'}</strong>
                      </span>
                      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-yellow)' }}>schedule</span>
                        {formatElapsed(session.started_at, now)}
                      </span>
                    </div>

                    {/* Order summary box */}
                    <div
                      style={{
                        padding: '10px 12px',
                        background: 'rgba(0, 0, 0, 0.25)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#c084fc' }}>local_cafe</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {orders.length} {language === 'ar' ? 'أصناف مطلوبة' : 'ordered items'}
                        </span>
                      </div>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                        {formatCurrency(ordersTotal)}
                      </span>
                    </div>

                    {/* Action buttons for Occupied table */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: 'auto' }}>
                      <Button
                        variant="primary"
                        style={{ fontSize: '12px', padding: '8px' }}
                        onClick={() => setCafeOrderTargetSession(session)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px', marginRight: isRtl ? 0 : '4px', marginLeft: isRtl ? '4px' : 0 }}>
                          add_shopping_cart
                        </span>
                        {t('add_products')}
                      </Button>

                      <Button
                        variant="ghost"
                        style={{ fontSize: '12px', padding: '8px' }}
                        onClick={() => setViewOrdersTable(tbl)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px', marginRight: isRtl ? 0 : '4px', marginLeft: isRtl ? '4px' : 0 }}>
                          receipt
                        </span>
                        {t('order_details')}
                      </Button>
                    </div>

                    <Button
                      variant="danger"
                      style={{ width: '100%', fontSize: '13px', padding: '10px', background: 'rgba(239, 68, 68, 0.15)', borderColor: '#ef4444' }}
                      onClick={() => setCheckoutTable(tbl)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', marginRight: isRtl ? 0 : '6px', marginLeft: isRtl ? '6px' : 0 }}>
                        payments
                      </span>
                      {t('close_order')} ({formatCurrency(ordersTotal)})
                    </Button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '32px', color: 'rgba(255, 255, 255, 0.15)', marginBottom: '6px' }}>
                        coffee
                      </span>
                      <div>{language === 'ar' ? 'الطاولة جاهزة لاستقبال الزبائن' : 'Ready for guests & orders'}</div>
                    </div>

                    <Button
                      variant="primary"
                      style={{ width: '100%', marginTop: 'auto' }}
                      onClick={() => setStartTargetTable(tbl)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: isRtl ? 0 : '6px', marginLeft: isRtl ? '6px' : 0 }}>
                        play_arrow
                      </span>
                      {t('open_order')}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Add Table Modal */}
      {showAddTableModal && (
        <TableFormModal
          onClose={() => setShowAddTableModal(false)}
          onSave={handleSaveTable}
        />
      )}

      {/* MODAL 2: Edit Table Modal */}
      {editingTable && (
        <TableFormModal
          initial={editingTable}
          onClose={() => setEditingTable(null)}
          onSave={handleSaveTable}
        />
      )}

      {/* MODAL 3: Delete Table Confirmation Modal */}
      {deletingTable && (
        <Modal
          open={true}
          title={t('delete_table')}
          onClose={() => setDeletingTable(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeletingTable(null)} disabled={deletingLoading}>
                {t('cancel')}
              </Button>
              <Button variant="danger" onClick={handleDeleteTable} disabled={deletingLoading}>
                {deletingLoading ? t('loading') : t('delete')}
              </Button>
            </>
          }
        >
          <div style={{ padding: '8px 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
            {language === 'ar'
              ? `هل أنت متأكد من رغبتك في حذف طاولة "${deletingTable.table_number}"؟`
              : `Are you sure you want to delete table "${deletingTable.table_number}"?`}
          </div>
        </Modal>
      )}

      {/* MODAL 4: Start Table Session Modal */}
      {startTargetTable && (
        <Modal
          open={true}
          title={`${t('open_order')} — #${startTargetTable.table_number}`}
          onClose={() => {
            setStartTargetTable(null);
            setStartCustomerName('');
          }}
          footer={
            <>
              <Button variant="ghost" onClick={() => setStartTargetTable(null)} disabled={startLoading}>
                {t('cancel')}
              </Button>
              <Button variant="primary" onClick={handleStartTableSession} disabled={startLoading}>
                {startLoading ? t('loading') : t('open_order')}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {language === 'ar'
                ? 'سيتم فتح طلب جديد للطاولة. يمكنك إضافة المشروبات والطلبات في أي وقت دون احتساب تكلفة على وقت الجلوس.'
                : 'A new table session will be opened. You can add items anytime. No duration rate is charged.'}
            </div>

            <Input
              label={language === 'ar' ? 'اسم الزبون / الطاولة (اختياري)' : 'Guest Name (optional)'}
              placeholder={language === 'ar' ? 'مثال: أحمد، أو طاولة 1' : 'e.g. Walk-in, Alex'}
              value={startCustomerName}
              onChange={(e) => setStartCustomerName(e.target.value)}
              autoFocus
            />
          </div>
        </Modal>
      )}

      {/* MODAL 5: Add Cafe Products to Active Session */}
      {cafeOrderTargetSession && (
        <AddCafeModal
          session={cafeOrderTargetSession}
          onClose={() => setCafeOrderTargetSession(null)}
          onDone={() => {
            refetch();
          }}
        />
      )}

      {/* MODAL 6: View Table Order Details & Void items */}
      {viewOrdersTable && (
        <Modal
          open={true}
          title={`${t('order_details')} — #${viewOrdersTable.table_number}`}
          onClose={() => setViewOrdersTable(null)}
          footer={
            <Button variant="ghost" onClick={() => setViewOrdersTable(null)}>
              {language === 'ar' ? 'إغلاق' : 'Close'}
            </Button>
          }
        >
          {(() => {
            const orders = (viewOrdersTable.active_session as any)?.orders || [];
            const ordersTotal = Number((viewOrdersTable.active_session as any)?.current_orders_total || 0);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {orders.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {language === 'ar' ? 'لا توجد طلبات مسجلة على هذه الطاولة بعد.' : 'No items added yet.'}
                  </div>
                ) : (
                  <>
                    <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {orders.map((ord: any) => (
                        <div
                          key={ord.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-default)',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>
                              {ord.product?.name || (language === 'ar' ? 'منتج' : 'Item')}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {ord.quantity} × {formatCurrency(ord.unit_price)}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>
                              {formatCurrency(ord.total_price)}
                            </span>
                            <button
                              className="ccms-btn-ghost"
                              style={{ color: 'var(--accent-red)', padding: '4px' }}
                              title={language === 'ar' ? 'إلغاء الصنف' : 'Void Item'}
                              disabled={voidingOrderId === ord.id}
                              onClick={() => handleVoidOrder(viewOrdersTable.active_session!.id, ord.id)}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        padding: '12px',
                        background: 'rgba(0, 194, 255, 0.08)',
                        border: '1px solid rgba(0, 194, 255, 0.2)',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontWeight: 700,
                      }}
                    >
                      <span>{language === 'ar' ? 'الإجمالي الحالي' : 'Current Subtotal'}</span>
                      <span style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>{formatCurrency(ordersTotal)}</span>
                    </div>
                  </>
                )}

                <Button
                  variant="primary"
                  onClick={() => {
                    setCafeOrderTargetSession(viewOrdersTable.active_session!);
                    setViewOrdersTable(null);
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', marginRight: isRtl ? 0 : '4px', marginLeft: isRtl ? '4px' : 0 }}>
                    add
                  </span>
                  {t('add_products')}
                </Button>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* MODAL 7: Checkout & Close Table Modal (Wide 2-Column POS Workstation) */}
      {checkoutTable && checkoutTable.active_session && (() => {
        const activeOrders = checkoutOrders ?? ((checkoutTable.active_session as any)?.orders || []);
        const ordersSubtotal = activeOrders.reduce((sum: number, o: any) => sum + Number(o.total_price || 0), 0);
        const subtotal = Math.round(ordersSubtotal * 100) / 100;

        // Seating timing
        const startedTime = checkoutTable.active_session?.started_at
          ? new Date(checkoutTable.active_session.started_at).getTime()
          : Date.now();
        const elapsedSec = Math.max(0, Math.floor((now - startedTime) / 1000));
        const seatedMinutes = Math.max(1, Math.round(elapsedSec / 60));

        // 1. Discount calculation
        let parsedDiscountVal = 0;
        let discountAmount = 0;
        if (checkoutDiscountType === 'percentage') {
          parsedDiscountVal = parseFloat(checkoutDiscountPercentVal) || 0;
          if (parsedDiscountVal > 0) {
            discountAmount = Math.round(subtotal * (Math.min(100, parsedDiscountVal) / 100) * 100) / 100;
          }
        } else if (checkoutDiscountType === 'fixed') {
          parsedDiscountVal = parseFloat(checkoutDiscountFixedVal) || 0;
          if (parsedDiscountVal > 0) {
            discountAmount = Math.min(subtotal, Math.round(parsedDiscountVal * 100) / 100);
          }
        }
        const afterDiscount = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

        // 2. Service fee calculation
        let parsedServiceVal = 0;
        let serviceFee = 0;
        if (checkoutServiceType === 'percentage') {
          parsedServiceVal = parseFloat(checkoutServicePercentVal) || 0;
          if (parsedServiceVal > 0) {
            serviceFee = Math.round(afterDiscount * (parsedServiceVal / 100) * 100) / 100;
          }
        } else if (checkoutServiceType === 'fixed') {
          parsedServiceVal = parseFloat(checkoutServiceFixedVal) || 0;
          if (parsedServiceVal > 0) {
            serviceFee = Math.round(parsedServiceVal * 100) / 100;
          }
        }
        const finalTotal = Math.max(0, Math.round((afterDiscount + serviceFee) * 100) / 100);

        const customerDisplay = checkoutTable.active_session?.customer?.name 
          ? checkoutTable.active_session.customer.name 
          : (language === 'ar' ? 'طلب مباشر (طاولة)' : 'Walk-in Table');

        return (
          <>
            <Modal
              open={true}
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, rgba(0, 194, 255, 0.2), rgba(0, 102, 255, 0.15))',
                    border: '1px solid rgba(0, 194, 255, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-cyan)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>receipt_long</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{language === 'ar' ? 'إنهاء ودفع الفاتورة' : 'End & Settle Bill'}</span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 10px',
                        borderRadius: '12px',
                        background: 'rgba(0, 194, 255, 0.15)',
                        color: 'var(--accent-cyan)',
                        border: '1px solid rgba(0, 194, 255, 0.3)',
                      }}>
                        #{checkoutTable.table_number}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {language === 'ar'
                        ? `العميل: ${customerDisplay} · تسوية حساب واستهلاك الطاولة وإخلاؤها`
                        : `Customer: ${customerDisplay} · Table bill settlement & release`}
                    </div>
                  </div>
                </div>
              }
              onClose={resetCheckoutState}
              width="min(1180px, 96vw)"
              bodyStyle={{ padding: '16px 20px', overflow: 'hidden' }}
              footer={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {language === 'ar' ? 'المبلغ النهائي المطلوب:' : 'Final Amount Due:'}
                    </span>
                    <span style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '18px',
                      fontWeight: 800,
                      color: 'var(--accent-cyan)',
                    }}>
                      {formatCurrency(finalTotal)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <Button variant="ghost" onClick={resetCheckoutState} disabled={checkoutLoading} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
                      {t('cancel')}
                    </Button>
                    <Button
                      variant="primary"
                      loading={checkoutLoading}
                      disabled={checkoutLoading}
                      onClick={handleCheckoutTable}
                      style={{
                        fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 24px',
                        fontWeight: 700,
                        fontSize: '14px',
                        boxShadow: '0 0 16px rgba(0, 194, 255, 0.3)',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
                      {language === 'ar' ? `تحصيل وإخلاء الطاولة (${formatCurrency(finalTotal)})` : `Settle & Release Table (${formatCurrency(finalTotal)})`}
                    </Button>
                  </div>
                </div>
              }
            >
              {/* 2-Column POS Checkout Layout */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.15fr) minmax(0, 1fr)',
                  gap: '20px',
                  height: isMobile ? 'auto' : 'calc(78vh - 75px)',
                  minHeight: isMobile ? 'auto' : '480px',
                  maxHeight: isMobile ? '70vh' : '660px',
                  textAlign: isRtl ? 'right' : 'left',
                }}
              >
                {/* ================= COLUMN 1: TABLE CONSUMPTION & ITEM BREAKDOWN ================= */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    minHeight: 0,
                    overflowY: 'auto',
                    paddingRight: isRtl ? 0 : '6px',
                    paddingLeft: isRtl ? '6px' : 0,
                  }}
                >
                  {/* Table Details & Seating Box */}
                  <div
                    style={{
                      padding: '14px',
                      background: 'var(--bg-surface)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>table_restaurant</span>
                      {language === 'ar' ? 'بيانات الطاولة والجلسة' : 'Table & Session Info'}
                    </div>

                    <BillRow label={language === 'ar' ? 'رقم / كود الطاولة' : 'Table'} value={`#${checkoutTable.table_number}`} isBold />
                    <BillRow label={language === 'ar' ? 'العميل' : 'Customer'} value={customerDisplay} />
                    <BillRow label={language === 'ar' ? 'وقت بدء الجلوس' : 'Started At'} value={new Date(startedTime).toLocaleTimeString(language === 'ar' ? 'ar-EG' : undefined, { hour: '2-digit', minute: '2-digit' })} />
                    <BillRow
                      label={language === 'ar' ? 'مدة الجلوس' : 'Duration'}
                      value={language === 'ar' ? `${seatedMinutes} دقيقة` : `${seatedMinutes} mins`}
                      valueColor="var(--accent-green)"
                      isBold
                    />
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: 'rgba(34, 197, 94, 0.08)',
                      border: '1px solid rgba(34, 197, 94, 0.25)',
                      borderRadius: '6px',
                      marginTop: '2px',
                    }}>
                      <span style={{ fontSize: '12px', color: 'var(--accent-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>chair</span>
                        {language === 'ar' ? 'رسوم وقت الجلوس (طاولة كافيه)' : 'Table Seating Fee'}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--accent-green)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                        {language === 'ar' ? 'مجاني (0.00 ج.م)' : 'Free (0.00)'}
                      </span>
                    </div>
                  </div>

                  {/* Orders Itemized Box */}
                  <div
                    style={{
                      padding: '14px',
                      background: 'var(--bg-surface)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      border: '1px solid var(--border-default)',
                      flex: 1,
                      minHeight: 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>receipt_long</span>
                        {language === 'ar' ? `طلبات البوفيه والكافيه (${activeOrders.length} أصناف)` : `Orders (${activeOrders.length} items)`}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {language === 'ar' ? 'تفاصيل الأصناف' : 'Item breakdown'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1, minHeight: '120px', paddingRight: isRtl ? 0 : '4px', paddingLeft: isRtl ? '4px' : 0 }}>
                      {activeOrders.length === 0 ? (
                        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'rgba(255, 255, 255, 0.15)', display: 'block', marginBottom: '4px' }}>
                            shopping_cart
                          </span>
                          {language === 'ar' ? 'لا توجد طلبات مسجلة على هذه الطاولة.' : 'No orders on this table.'}
                        </div>
                      ) : (
                        activeOrders.map((ord: any) => (
                          <div
                            key={ord.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '13px',
                              padding: '8px 10px',
                              background: 'rgba(0, 0, 0, 0.2)',
                              borderRadius: '6px',
                              border: '1px solid rgba(255, 255, 255, 0.05)',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {ord.product?.name || (language === 'ar' ? 'منتج' : 'Item')}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                {ord.quantity} × {formatCurrency(ord.unit_price)}
                              </div>
                            </div>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--accent-green)' }}>
                              {formatCurrency(ord.total_price)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />

                    <BillRow
                      label={language === 'ar' ? 'المجموع الفرعي للطلبات (قبل الخصم والخدمة)' : 'Orders Subtotal'}
                      value={formatCurrency(subtotal)}
                      valueColor="#FFFFFF"
                      isBold
                    />
                  </div>

                  {/* Invoice Notes Field */}
                  <div style={{
                    padding: '12px 14px',
                    background: 'var(--bg-surface)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-default)',
                  }}>
                    <Input
                      label={language === 'ar' ? 'ملاحظات الفاتورة (اختياري)' : 'Invoice Notes (optional)'}
                      placeholder={language === 'ar' ? 'مثال: سبب الخصم، العميل طلب كذا، ملاحظات خاصة...' : 'e.g. Discount reason, special notes...'}
                      value={checkoutNotes}
                      onChange={(e) => setCheckoutNotes(e.target.value)}
                    />
                  </div>
                </div>

                {/* ================= COLUMN 2: DISCOUNTS, FEES, PAYMENT & SETTLEMENT ================= */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    minHeight: 0,
                    overflowY: 'auto',
                    paddingRight: isRtl ? 0 : '6px',
                    paddingLeft: isRtl ? '6px' : 0,
                  }}
                >
                  {/* SECTION 1: DISCOUNT */}
                  <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: checkoutDiscountType === 'percentage' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
                          {language === 'ar' ? 'نسبة مئوية (%)' : 'Percentage (%)'}
                        </label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="0"
                            value={checkoutDiscountPercentVal}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCheckoutDiscountPercentVal(v);
                              if (v && parseFloat(v) > 0) {
                                setCheckoutDiscountType('percentage');
                                setCheckoutDiscountFixedVal('');
                              } else if (!checkoutDiscountFixedVal) {
                                setCheckoutDiscountType('none');
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 24px 8px 10px',
                              background: checkoutDiscountType === 'percentage' ? 'rgba(0, 194, 255, 0.08)' : 'var(--bg-input)',
                              border: checkoutDiscountType === 'percentage' ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-default)',
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

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: checkoutDiscountType === 'fixed' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
                          {language === 'ar' ? 'مبلغ ثابت بالعملة (ج)' : 'Fixed Amount (EGP)'}
                        </label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            placeholder="0.00"
                            value={checkoutDiscountFixedVal}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCheckoutDiscountFixedVal(v);
                              if (v && parseFloat(v) > 0) {
                                setCheckoutDiscountType('fixed');
                                setCheckoutDiscountPercentVal('');
                              } else if (!checkoutDiscountPercentVal) {
                                setCheckoutDiscountType('none');
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 28px 8px 10px',
                              background: checkoutDiscountType === 'fixed' ? 'rgba(0, 194, 255, 0.08)' : 'var(--bg-input)',
                              border: checkoutDiscountType === 'fixed' ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-default)',
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

                  {/* SECTION 2: SERVICE FEE */}
                  <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: checkoutServiceType === 'percentage' ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}>
                          {language === 'ar' ? 'نسبة مئوية (%)' : 'Percentage (%)'}
                        </label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="0"
                            value={checkoutServicePercentVal}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCheckoutServicePercentVal(v);
                              if (v && parseFloat(v) > 0) {
                                setCheckoutServiceType('percentage');
                                setCheckoutServiceFixedVal('');
                              } else if (!checkoutServiceFixedVal) {
                                setCheckoutServiceType('none');
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 24px 8px 10px',
                              background: checkoutServiceType === 'percentage' ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-input)',
                              border: checkoutServiceType === 'percentage' ? '1.5px solid var(--accent-yellow)' : '1px solid var(--border-default)',
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

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: checkoutServiceType === 'fixed' ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}>
                          {language === 'ar' ? 'مبلغ ثابت بالعملة (ج)' : 'Fixed Amount (EGP)'}
                        </label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            placeholder="0.00"
                            value={checkoutServiceFixedVal}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCheckoutServiceFixedVal(v);
                              if (v && parseFloat(v) > 0) {
                                setCheckoutServiceType('fixed');
                                setCheckoutServicePercentVal('');
                              } else if (!checkoutServicePercentVal) {
                                setCheckoutServiceType('none');
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 28px 8px 10px',
                              background: checkoutServiceType === 'fixed' ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-input)',
                              border: checkoutServiceType === 'fixed' ? '1.5px solid var(--accent-yellow)' : '1px solid var(--border-default)',
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

                  {/* SECTION 3: FINAL NET TOTAL BOX */}
                  <div
                    style={{
                      padding: '14px 16px',
                      background: 'linear-gradient(135deg, rgba(0, 194, 255, 0.1) 0%, rgba(0, 102, 255, 0.04) 100%)',
                      border: '1.5px solid rgba(0, 194, 255, 0.35)',
                      borderRadius: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      boxShadow: '0 0 15px rgba(0, 194, 255, 0.1)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF' }}>
                        {language === 'ar' ? 'الإجمالي الصافي المطلوب دفعه:' : 'Net Total Due:'}
                      </span>
                      <span
                        style={{
                          fontSize: '26px',
                          fontWeight: 900,
                          color: 'var(--accent-cyan)',
                          fontFamily: 'JetBrains Mono, monospace',
                          textShadow: '0 0 14px rgba(0, 194, 255, 0.4)',
                        }}
                      >
                        {formatCurrency(finalTotal)}
                      </span>
                    </div>

                    {(discountAmount > 0 || serviceFee > 0) && (
                      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                        <span>المجموع الفرعي: {formatCurrency(subtotal)}</span>
                        {discountAmount > 0 && <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>خصم: -{formatCurrency(discountAmount)}</span>}
                        {serviceFee > 0 && <span style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>خدمة: +{formatCurrency(serviceFee)}</span>}
                      </div>
                    )}
                  </div>

                  {/* SECTION 4: PAYMENT METHOD & SETTLEMENT */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <input
                        type="checkbox"
                        checked={checkoutMarkPaid}
                        onChange={(e) => setCheckoutMarkPaid(e.target.checked)}
                      />
                      {language === 'ar' ? 'تسجيل الفاتورة كمدفوعة فوراً في الوردية' : 'Mark as Paid Immediately in Shift'}
                    </label>

                    {checkoutMarkPaid && (
                      <>
                        <Select
                          label={language === 'ar' ? 'طريقة الدفع' : 'Payment Method'}
                          value={checkoutPaymentMethod}
                          onChange={(e) => setCheckoutPaymentMethod(e.target.value as PaymentMethod)}
                        >
                          <option value="cash">{language === 'ar' ? 'نقدي (Cash)' : 'Cash'}</option>
                          <option value="card">{language === 'ar' ? 'فيزا / كارت ائتمان (POS)' : 'Credit/Debit Card'}</option>
                          <option value="transfer">{language === 'ar' ? 'تحويل بنكي / InstaPay' : 'Bank Transfer'}</option>
                          <option value="wallet">{language === 'ar' ? 'محفظة إلكترونية (فودافون كاش)' : 'Digital Wallet'}</option>
                        </Select>

                        {/* Wallet details */}
                        {checkoutPaymentMethod === 'wallet' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px', padding: '12px', background: 'var(--bg-input)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px' }}>
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
                                  onClick={() => setCheckoutShowQrZoom(true)}
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
                                  style={{ width: '80px', height: '80px', objectFit: 'contain', cursor: 'pointer', borderRadius: '4px' }}
                                  onClick={() => setCheckoutShowQrZoom(true)}
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
                                <span>{language === 'ar' ? 'لم يتم تعيين صورة الـ QR للمحفظة في الإعدادات بعد.' : 'No E-Wallet QR image set in settings yet.'}</span>
                              </div>
                            )}

                            <Input
                              label={language === 'ar' ? 'رقم عملية المحفظة / هاتف المحول (اختياري)' : 'Wallet Transaction Ref (optional)'}
                              placeholder={language === 'ar' ? 'مثال: 010xxxxxxxx أو رقم العملية' : 'e.g. 010xxxxxxxx or TXN id'}
                              value={checkoutPaymentRef}
                              onChange={(e) => setCheckoutPaymentRef(e.target.value)}
                            />
                          </div>
                        )}

                        {/* Card details */}
                        {checkoutPaymentMethod === 'card' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                            <Input
                              label={language === 'ar' ? 'رقم إيصال الماكينة / POS Reference (اختياري)' : 'POS Receipt / Reference (optional)'}
                              placeholder={language === 'ar' ? 'مثال: POS-99482' : 'e.g. POS-99482'}
                              value={checkoutPaymentRef}
                              onChange={(e) => setCheckoutPaymentRef(e.target.value)}
                            />
                          </div>
                        )}

                        {/* Bank Transfer details */}
                        {checkoutPaymentMethod === 'transfer' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px', padding: '12px', background: 'var(--bg-input)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-cyan)', fontSize: '12px', fontWeight: 700 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>account_balance</span>
                              <span>{language === 'ar' ? 'بيانات التحويل البنكي / InstaPay' : 'Bank Transfer / InstaPay Details'}</span>
                            </div>

                            {bankDetails ? (
                              <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'pre-line', lineHeight: '1.4', border: '1px solid var(--border-default)' }}>
                                {bankDetails}
                              </div>
                            ) : (
                              <div style={{ padding: '8px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '6px', fontSize: '11px', color: 'var(--accent-yellow)' }}>
                                {language === 'ar' ? 'لم يتم تعيين تفاصيل الحساب البنكي في الإعدادات.' : 'No bank details configured in settings.'}
                              </div>
                            )}

                            <Input
                              label={language === 'ar' ? 'رقم العملية أو اسم المحوّل (اختياري)' : 'Transfer Reference / Sender (optional)'}
                              placeholder={language === 'ar' ? 'مثال: تحويل إنستاباي - محمد' : 'e.g. InstaPay - John'}
                              value={checkoutPaymentRef}
                              onChange={(e) => setCheckoutPaymentRef(e.target.value)}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Modal>

            {/* QR Zoom Modal */}
            {checkoutShowQrZoom && walletQrUrl && (
              <Modal
                open
                title={language === 'ar' ? 'رمز QR لمحفظة فودافون كاش' : 'Vodafone Cash QR Code'}
                onClose={() => setCheckoutShowQrZoom(false)}
                footer={
                  <Button variant="ghost" onClick={() => setCheckoutShowQrZoom(false)}>
                    {language === 'ar' ? 'إغلاق' : 'Close'}
                  </Button>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '10px 0' }}>
                  <img
                    src={walletQrUrl}
                    alt="Vodafone Cash QR"
                    style={{ maxWidth: '300px', maxHeight: '300px', width: '100%', height: 'auto', objectFit: 'contain', borderRadius: '12px', border: '1px solid var(--border-default)', background: '#FFFFFF', padding: '8px' }}
                  />
                  {walletPhoneNumber && (
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                        {language === 'ar' ? 'رقم المحفظة المعتمد للتحويل:' : 'Wallet Phone Number:'}
                      </span>
                      <span style={{ fontSize: '20px', fontWeight: 800, color: '#D97706', fontFamily: 'JetBrains Mono, monospace' }}>
                        {walletPhoneNumber}
                      </span>
                    </div>
                  )}
                </div>
              </Modal>
            )}
          </>
        );
      })()}
    </Layout>
  );
}

// ─── Table Form Modal Component (Add / Edit) ───────────────────────────────

function TableFormModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: CafeTable;
  onClose: () => void;
  onSave: (data: { id?: string; table_number: string; name: string; capacity: number }) => Promise<void>;
}) {
  const { language } = useLanguage();
  const [tableNumber, setTableNumber] = useState(initial?.table_number || initial?.name || '');
  const [capacity, setCapacity] = useState(String(initial?.capacity || 4));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanVal = tableNumber.trim();
    if (!cleanVal) {
      setError(language === 'ar' ? 'اسم / كود الطاولة مطلوب' : 'Table name / code is required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onSave({
        id: initial?.id,
        table_number: cleanVal,
        name: cleanVal,
        capacity: Number(capacity) || 4,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save table');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={true}
      title={initial ? (language === 'ar' ? 'تعديل طاولة' : 'Edit Table') : (language === 'ar' ? 'إضافة طاولة كافيه' : 'Add Café Table')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={loading}>
            {loading ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (language === 'ar' ? 'حفظ' : 'Save')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {error && (
          <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px' }}>
            {error}
          </div>
        )}

        <Input
          label={language === 'ar' ? 'اسم / كود الطاولة*' : 'Table Name / Code*'}
          placeholder={language === 'ar' ? 'مثال: T5، طاولة 1، VIP-1' : 'e.g. T5, Table 1, VIP-1'}
          value={tableNumber}
          onChange={(e) => setTableNumber(e.target.value)}
          autoFocus
        />

        <Input
          label={language === 'ar' ? 'سعة الطاولة (عدد الكراسي)' : 'Capacity (Seats)'}
          type="number"
          min="1"
          max="50"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
      </form>
    </Modal>
  );
}

// ─── Table Checkout Bill Row Helper ─────────────────────────────────────────

function BillRow({
  label,
  value,
  valueColor,
  isBold,
}: {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  isBold?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '13px',
        color: isBold ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: isBold ? 600 : 400,
      }}
    >
      <span>{label}</span>
      <span
        style={{
          color: valueColor,
          fontFamily: typeof value === 'string' && (value.includes('EGP') || value.includes('ج.م') || value.includes('دقيقة') || value.includes('mins')) ? 'JetBrains Mono, monospace' : 'inherit',
        }}
      >
        {value}
      </span>
    </div>
  );
}
