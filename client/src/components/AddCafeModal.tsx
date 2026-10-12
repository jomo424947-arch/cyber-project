import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency } from '../utils/format';
import type { Session, Product, SessionOrder } from '../types';

type FilterType = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
type SortType = 'default' | 'name' | 'price_asc' | 'price_desc';

export function AddCafeModal({
  session,
  onClose,
  onDone,
}: {
  session: Session;
  onClose: () => void;
  onDone: () => void;
}) {
  const { language, isRtl } = useLanguage();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [existingOrders, setExistingOrders] = useState<SessionOrder[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('default');
  
  // Track selected quantities for each product (productId -> quantity)
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<any[] | null>(null);
  const [now, setNow] = useState(Date.now());
  const [errorMsg, setErrorMsg] = useState('');

  // Live timer tick every 15s to update duration and live cost
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Fetch products, active session orders, and transfers on mount
  useEffect(() => {
    dataService.listProducts()
      .then((data) => {
        setProducts(data);
        const qtyMap: Record<string, number> = {};
        data.forEach((p) => {
          qtyMap[p.id] = 1;
        });
        setQuantities(qtyMap);
      })
      .catch((err) => setErrorMsg(apiErrorMessage(err, 'Failed to load café products')))
      .finally(() => setLoadingProducts(false));

    dataService.listSessionOrders(session.id)
      .then(setExistingOrders)
      .catch((err) => console.error('Failed to load session orders:', err))
      .finally(() => setLoadingOrders(false));

    dataService.listSessionTransfers(session.id)
      .then(setTransfers)
      .catch((err) => console.error('Failed to load session transfers:', err));
  }, [session.id]);

  // Counts for filter chips
  const filterCounts = useMemo(() => {
    if (!products) return { all: 0, inStock: 0, lowStock: 0, outOfStock: 0 };
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    for (const p of products) {
      const s = Number(p.stock ?? 0);
      if (s <= 0) outOfStock++;
      else {
        inStock++;
        if (s <= 5) lowStock++;
      }
    }
    return { all: products.length, inStock, lowStock, outOfStock };
  }, [products]);

  // Filtered and sorted products
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    let list = [...products];

    // Filter by search query
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    // Filter by stock status
    if (activeFilter === 'in_stock') {
      list = list.filter((p) => Number(p.stock ?? 0) > 0);
    } else if (activeFilter === 'low_stock') {
      list = list.filter((p) => {
        const s = Number(p.stock ?? 0);
        return s > 0 && s <= 5;
      });
    } else if (activeFilter === 'out_of_stock') {
      list = list.filter((p) => Number(p.stock ?? 0) <= 0);
    }

    // Sorting
    if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'price_asc') {
      list.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => Number(b.price) - Number(a.price));
    }

    return list;
  }, [products, searchQuery, activeFilter, sortBy]);

  const handleIncrement = (product: Product) => {
    setQuantities((prev) => {
      const current = prev[product.id] || 1;
      const maxStock = Number(product.stock ?? 0);
      return {
        ...prev,
        [product.id]: Math.min(maxStock, current + 1),
      };
    });
  };

  const handleDecrement = (productId: string) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(1, (prev[productId] || 1) - 1),
    }));
  };

  const handleQuantityChange = (product: Product, val: number) => {
    const maxStock = Number(product.stock ?? 0);
    setQuantities((prev) => ({
      ...prev,
      [product.id]: Math.min(maxStock, Math.max(1, val)),
    }));
  };

  const handleAddProduct = async (product: Product, customQty?: number) => {
    const qty = customQty ?? (quantities[product.id] || 1);
    if (qty <= 0) return;
    
    setSubmittingId(product.id);
    setErrorMsg('');
    try {
      await dataService.addSessionOrder(session.id, product.id, qty);
      
      // Update local product stock copy so catalog updates instantly
      setProducts((prev) =>
        prev
          ? prev.map((p) => (p.id === product.id ? { ...p, stock: Math.max(0, p.stock - qty) } : p))
          : prev
      );

      // Reset quantity back to 1 for this product
      setQuantities((prev) => ({ ...prev, [product.id]: 1 }));
      
      // Flash "Just Added" badge
      setJustAddedId(product.id);
      setTimeout(() => setJustAddedId((curr) => (curr === product.id ? null : curr)), 1400);

      // Reload existing orders
      const orders = await dataService.listSessionOrders(session.id);
      setExistingOrders(orders);
      
      // Trigger parent callback to refresh totals in parent views
      onDone();
    } catch (err: any) {
      setErrorMsg(apiErrorMessage(err, `Failed to add ${product.name}`));
    } finally {
      setSubmittingId(null);
    }
  };

  const handleVoidOrder = async (orderId: string) => {
    if (!window.confirm(language === 'ar' ? 'هل تريد بالتأكيد إلغاء هذا الطلب وإرجاع الكمية إلى المخزون؟' : 'Void this order line and restore stock?')) {
      return;
    }
    setVoidingId(orderId);
    setErrorMsg('');
    try {
      await dataService.voidSessionOrder(session.id, orderId);
      const [pList, oList] = await Promise.all([
        dataService.listProducts(),
        dataService.listSessionOrders(session.id),
      ]);
      setProducts(pList);
      setExistingOrders(oList);
      onDone();
    } catch (err: any) {
      setErrorMsg(apiErrorMessage(err, 'Failed to void order'));
    } finally {
      setVoidingId(null);
    }
  };

  const ordersTotal = useMemo(() => {
    if (!existingOrders) return 0;
    return existingOrders.reduce((sum, ord) => sum + Number(ord.total_price), 0);
  }, [existingOrders]);

  const ordersTotalItems = useMemo(() => {
    if (!existingOrders) return 0;
    return existingOrders.reduce((sum, ord) => sum + Number(ord.quantity), 0);
  }, [existingOrders]);

  // Session Duration & Cost calculations (matching EndSessionModal)
  const startedTime = new Date(session.started_at).getTime();
  const endingTime = session.ended_at ? new Date(session.ended_at).getTime() : now;
  const pausedMinutes = session.total_paused_minutes || 0;
  const elapsedSec = Math.max(0, Math.floor((endingTime - startedTime) / 1000));
  const rawMinutes = elapsedSec > 0 ? Math.max(1, Math.round(elapsedSec / 60)) : 0;
  const effectiveMinutes = Math.max(0, rawMinutes - pausedMinutes);

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

  const baseMinutes = effectiveMinutes - overtimeMinutes;
  const baseCost = rate > 0 ? (baseMinutes / 60) * rate : 0;
  const currentSegmentCost = baseCost + overtimeCost;
  const transfersCost = transfers ? transfers.reduce((sum, t) => sum + Number(t.cost || 0), 0) : 0;
  const totalDeviceCost = currentSegmentCost + transfersCost;

  const grandTotalSoFar = Math.round((totalDeviceCost + ordersTotal) * 100) / 100;

  const clientName = session.customer?.name ?? (language === 'ar' ? 'عميل بدون اسم' : 'Walk-in');
  const targetName = session.device?.name ?? (language === 'ar' ? 'الجهاز' : 'Device');

  return (
    <Modal
      open
      width="min(1240px, 96vw)"
      bodyStyle={{ padding: '16px 22px', overflow: 'hidden' }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(0, 194, 255, 0.2), rgba(0, 230, 153, 0.2))',
            border: '1px solid rgba(0, 194, 255, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-cyan)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>local_cafe</span>
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>{language === 'ar' ? 'إضافة طلبات البوفيه والكافيه' : 'Café & Beverage Orders'}</span>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 10px',
                borderRadius: '12px',
                background: 'rgba(0, 194, 255, 0.15)',
                color: 'var(--accent-cyan)',
                border: '1px solid rgba(0, 194, 255, 0.3)',
              }}>
                {targetName}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {language === 'ar' ? `العميل: ${clientName} · حساب فوري ومباشر` : `Customer: ${clientName} · Real-time POS`}
            </div>
          </div>
        </div>
      }
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {rate > 0 && (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {language === 'ar' ? 'وقت اللعب:' : 'Device Time:'}
                <span style={{
                  marginRight: isRtl ? '6px' : 0,
                  marginLeft: isRtl ? 0 : '6px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}>
                  {formatCurrency(totalDeviceCost)}
                </span>
                <span style={{ fontSize: '11px', opacity: 0.75, marginRight: isRtl ? '4px' : 0, marginLeft: isRtl ? 0 : '4px' }}>
                  ({effectiveMinutes} {language === 'ar' ? 'دقيقة' : 'min'})
                </span>
              </div>
            )}
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {language === 'ar' ? 'طلبات البوفيه:' : 'Café Orders:'}
              <span style={{
                marginRight: isRtl ? '6px' : 0,
                marginLeft: isRtl ? 0 : '6px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--accent-green)',
              }}>
                {formatCurrency(ordersTotal)}
              </span>
              <span style={{ fontSize: '11px', opacity: 0.75, marginRight: isRtl ? '4px' : 0, marginLeft: isRtl ? 0 : '4px' }}>
                ({ordersTotalItems} {language === 'ar' ? 'قطعة' : 'items'})
              </span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 12px',
              background: 'rgba(0, 194, 255, 0.12)',
              border: '1px solid rgba(0, 194, 255, 0.3)',
              borderRadius: '8px',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                {language === 'ar' ? 'الإجمالي الكلي حتى الآن:' : 'Grand Total So Far:'}
              </span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '17px',
                fontWeight: 800,
                color: 'var(--accent-cyan)',
              }}>
                {formatCurrency(grandTotalSoFar)}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button
              variant="primary"
              onClick={onClose}
              style={{
                minWidth: '130px',
                padding: '10px 24px',
                fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
              {language === 'ar' ? 'تم / إغلاق' : 'Done / Close'}
            </Button>
          </div>
        </div>
      }
    >
      {/* Outer 2-Column POS Workspace */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.75fr) minmax(330px, 1fr)',
          gap: '20px',
          height: 'calc(78vh - 80px)',
          minHeight: '480px',
          maxHeight: '680px',
          textAlign: isRtl ? 'right' : 'left',
        }}
      >
        {/* ================= COLUMN 1: PRODUCT CATALOG & FAST POS GRID ================= */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Error alert if any */}
          {errorMsg && (
            <div style={{
              color: 'var(--accent-red)',
              fontSize: '13px',
              padding: '10px 14px',
              background: 'rgba(255, 68, 102, 0.12)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 68, 102, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Search Bar & Fast Filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
            {/* Search Input Row with clear button and sort dropdown */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Input
                  placeholder={language === 'ar' ? 'ابحث عن أي منتج (مثال: بيبسي، شاي، قهوة، شيبسي...)' : 'Search products (e.g. Cola, Tea, Water, Chips...)'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={loadingProducts}
                  style={{
                    paddingRight: isRtl ? '38px' : '14px',
                    paddingLeft: isRtl ? '36px' : '38px',
                    height: '42px',
                    fontSize: '14px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                  }}
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      [isRtl ? 'left' : 'right']: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title={language === 'ar' ? 'مسح البحث' : 'Clear search'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                  </button>
                )}
              </div>

              {/* Sort selector */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                style={{
                  height: '42px',
                  padding: '0 12px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="default">{language === 'ar' ? 'الترتيب: الافتراضي' : 'Sort: Default'}</option>
                <option value="name">{language === 'ar' ? 'الترتيب: بالاسم' : 'Sort: Name'}</option>
                <option value="price_asc">{language === 'ar' ? 'السعر: من الأقل للأعلى' : 'Price: Low to High'}</option>
                <option value="price_desc">{language === 'ar' ? 'السعر: من الأعلى للأقل' : 'Price: High to Low'}</option>
              </select>
            </div>

            {/* Quick Filter Chips */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                style={{
                  padding: '5px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: activeFilter === 'all' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-default)',
                  background: activeFilter === 'all' ? 'rgba(0, 194, 255, 0.15)' : 'var(--bg-surface)',
                  color: activeFilter === 'all' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{language === 'ar' ? 'الكل' : 'All'}</span>
                <span style={{ fontSize: '10px', opacity: 0.8, background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '10px' }}>
                  {filterCounts.all}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('in_stock')}
                style={{
                  padding: '5px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: activeFilter === 'in_stock' ? '1px solid var(--accent-green)' : '1px solid var(--border-default)',
                  background: activeFilter === 'in_stock' ? 'rgba(0, 230, 153, 0.15)' : 'var(--bg-surface)',
                  color: activeFilter === 'in_stock' ? 'var(--accent-green)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{language === 'ar' ? 'متوفر بالمخزون' : 'In Stock'}</span>
                <span style={{ fontSize: '10px', opacity: 0.8, background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '10px' }}>
                  {filterCounts.inStock}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('low_stock')}
                style={{
                  padding: '5px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: activeFilter === 'low_stock' ? '1px solid #ffaa00' : '1px solid var(--border-default)',
                  background: activeFilter === 'low_stock' ? 'rgba(255, 170, 0, 0.15)' : 'var(--bg-surface)',
                  color: activeFilter === 'low_stock' ? '#ffaa00' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{language === 'ar' ? 'مخزون منخفض' : 'Low Stock'}</span>
                <span style={{ fontSize: '10px', opacity: 0.8, background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '10px' }}>
                  {filterCounts.lowStock}
                </span>
              </button>

              {filterCounts.outOfStock > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveFilter('out_of_stock')}
                  style={{
                    padding: '5px 14px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: activeFilter === 'out_of_stock' ? '1px solid var(--accent-red)' : '1px solid var(--border-default)',
                    background: activeFilter === 'out_of_stock' ? 'rgba(255, 68, 102, 0.15)' : 'var(--bg-surface)',
                    color: activeFilter === 'out_of_stock' ? 'var(--accent-red)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{language === 'ar' ? 'نفذت الكمية' : 'Out of Stock'}</span>
                  <span style={{ fontSize: '10px', opacity: 0.8, background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '10px' }}>
                    {filterCounts.outOfStock}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Product Cards Grid Area */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              minHeight: 0,
              paddingRight: isRtl ? 0 : '6px',
              paddingLeft: isRtl ? '6px' : 0,
            }}
          >
            {loadingProducts ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '260px' }}>
                <LoadingSpinner label={language === 'ar' ? 'جاري تحميل قائمة المنتجات...' : 'Loading catalog…'} />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '48px 24px',
                color: 'var(--text-secondary)',
                background: 'var(--bg-surface)',
                borderRadius: '12px',
                border: '1px solid var(--border-default)',
                marginTop: '10px',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '42px', color: 'var(--text-secondary)', opacity: 0.5, marginBottom: '10px' }}>
                  search_off
                </span>
                <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>
                  {language === 'ar' ? 'لم يتم العثور على أي منتج' : 'No products found'}
                </div>
                <div style={{ fontSize: '13px', marginTop: '6px' }}>
                  {language === 'ar' ? `لا توجد نتائج تطابق "${searchQuery}"` : `No matches for "${searchQuery}"`}
                </div>
                {searchQuery && (
                  <Button
                    variant="ghost"
                    onClick={() => { setSearchQuery(''); setActiveFilter('all'); }}
                    style={{ marginTop: '14px', fontSize: '12px' }}
                  >
                    {language === 'ar' ? 'إعادة ضبط البحث' : 'Reset search'}
                  </Button>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                  gap: '12px',
                  paddingBottom: '10px',
                }}
              >
                {filteredProducts.map((p) => {
                  const stockNum = Number(p.stock ?? 0);
                  const isOutOfStock = stockNum <= 0;
                  const qty = isOutOfStock ? 0 : Math.min(stockNum, quantities[p.id] || 1);
                  const isSubmitting = submittingId === p.id;
                  const isJustAdded = justAddedId === p.id;

                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '14px',
                        background: isJustAdded ? 'rgba(0, 230, 153, 0.08)' : 'var(--bg-surface)',
                        borderRadius: '10px',
                        border: isJustAdded 
                          ? '1px solid var(--accent-green)' 
                          : '1px solid var(--border-default)',
                        opacity: isOutOfStock ? 0.65 : 1,
                        transition: 'all 0.2s ease',
                        boxShadow: isJustAdded ? '0 0 15px rgba(0, 230, 153, 0.2)' : 'none',
                        position: 'relative',
                      }}
                    >
                      {/* Top Row: Stock Badge & Unit Price */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          {isOutOfStock ? (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: 'rgba(255, 68, 102, 0.15)',
                              color: 'var(--accent-red)',
                              border: '1px solid rgba(255, 68, 102, 0.3)',
                            }}>
                              {language === 'ar' ? 'نفذت الكمية' : 'Out of stock'}
                            </span>
                          ) : stockNum <= 5 ? (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: 'rgba(255, 170, 0, 0.15)',
                              color: '#ffaa00',
                              border: '1px solid rgba(255, 170, 0, 0.3)',
                            }}>
                              {language === 'ar' ? `متبقي ${stockNum}` : `${stockNum} left`}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: 'rgba(0, 194, 255, 0.1)',
                              color: 'var(--accent-cyan)',
                              border: '1px solid rgba(0, 194, 255, 0.2)',
                            }}>
                              {language === 'ar' ? `المخزون: ${stockNum}` : `Stock: ${stockNum}`}
                            </span>
                          )}

                          <span style={{
                            fontSize: '14px',
                            fontWeight: 700,
                            color: 'var(--accent-green)',
                            fontFamily: 'JetBrains Mono, monospace',
                          }}>
                            {formatCurrency(p.price)}
                          </span>
                        </div>

                        {/* Product Title */}
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: '15px',
                            color: 'var(--text-primary)',
                            marginBottom: '12px',
                            lineHeight: 1.3,
                            minHeight: '38px',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                          title={p.name}
                        >
                          {p.name}
                        </div>
                      </div>

                      {/* Bottom Controls: Stepper and Big Add Button */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {!isOutOfStock ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {/* Stepper */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                border: '1px solid var(--border-default)',
                                borderRadius: '8px',
                                background: 'var(--bg-input)',
                                flex: 1,
                                height: '36px',
                                overflow: 'hidden',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => handleDecrement(p.id)}
                                style={{
                                  width: '32px',
                                  height: '100%',
                                  fontSize: '16px',
                                  fontWeight: 'bold',
                                  color: 'var(--text-primary)',
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: qty <= 1 || isSubmitting ? 'not-allowed' : 'pointer',
                                  opacity: qty <= 1 ? 0.4 : 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                disabled={isSubmitting || qty <= 1}
                              >
                                -
                              </button>
                              <input
                                type="number"
                                value={qty}
                                onChange={(e) => handleQuantityChange(p, parseInt(e.target.value, 10) || 1)}
                                style={{
                                  width: '36px',
                                  textAlign: 'center',
                                  border: 'none',
                                  background: 'transparent',
                                  fontSize: '14px',
                                  fontWeight: 700,
                                  outline: 'none',
                                  MozAppearance: 'textfield',
                                  color: '#fff',
                                }}
                                disabled={isSubmitting}
                              />
                              <button
                                type="button"
                                onClick={() => handleIncrement(p)}
                                style={{
                                  width: '32px',
                                  height: '100%',
                                  fontSize: '16px',
                                  fontWeight: 'bold',
                                  color: 'var(--text-primary)',
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: qty >= stockNum || isSubmitting ? 'not-allowed' : 'pointer',
                                  opacity: qty >= stockNum ? 0.4 : 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                disabled={isSubmitting || qty >= stockNum}
                              >
                                +
                              </button>
                            </div>

                            {/* Direct Add Button */}
                            <button
                              type="button"
                              className="ccms-btn ccms-btn-primary"
                              onClick={() => handleAddProduct(p)}
                              disabled={isSubmitting}
                              style={{
                                height: '36px',
                                padding: '0 14px',
                                fontSize: '13px',
                                fontWeight: 600,
                                borderRadius: '8px',
                                fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {isSubmitting ? (
                                <span className="material-symbols-outlined" style={{ fontSize: '16px', animation: 'spin 1s linear infinite' }}>
                                  refresh
                                </span>
                              ) : isJustAdded ? (
                                <>
                                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#fff' }}>check</span>
                                  <span>{language === 'ar' ? 'أُضيف!' : 'Added!'}</span>
                                </>
                              ) : (
                                <>
                                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_shopping_cart</span>
                                  <span>{language === 'ar' ? 'إضافة' : 'Add'}</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div
                            style={{
                              height: '36px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'var(--bg-input)',
                              borderRadius: '8px',
                              color: 'var(--text-secondary)',
                              fontSize: '12px',
                              border: '1px dashed var(--border-default)',
                            }}
                          >
                            {language === 'ar' ? 'غير متوفر حالياً' : 'Currently Unavailable'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ================= COLUMN 2: COMPLETE SESSION INVOICE TICKET ================= */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--border-default)',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {/* Ticket Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-default)',
              background: 'var(--bg-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--accent-cyan)', fontSize: '20px' }}>
                receipt_long
              </span>
              <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                {language === 'ar' ? 'فاتورة الحساب الشاملة للجلسة' : 'Complete Session Invoice'}
              </span>
            </div>
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '10px',
              background: 'rgba(0, 230, 153, 0.1)',
              color: 'var(--accent-green)',
              border: '1px solid rgba(0, 230, 153, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-green)' }} />
              {language === 'ar' ? 'مباشر' : 'Live'}
            </span>
          </div>

          {/* Device Gaming / Sitting Duration Card */}
          <div style={{ padding: '12px 14px 4px 14px', flexShrink: 0 }}>
            {rate > 0 ? (
              <div style={{
                padding: '10px 12px',
                background: 'linear-gradient(135deg, rgba(0, 194, 255, 0.08) 0%, rgba(0, 102, 255, 0.03) 100%)',
                border: '1px solid rgba(0, 194, 255, 0.25)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-cyan)' }}>
                      desktop_windows
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {targetName}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      ({formatCurrency(rate)}/س)
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 800,
                    fontSize: '15px',
                    color: 'var(--accent-cyan)',
                  }}>
                    {formatCurrency(totalDeviceCost)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <span>
                    {language === 'ar' ? 'بدء اللعب:' : 'Started:'} {new Date(session.started_at).toLocaleTimeString(language === 'ar' ? 'ar-EG' : undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{
                    padding: '1px 8px',
                    borderRadius: '6px',
                    background: 'rgba(0, 230, 153, 0.12)',
                    color: 'var(--accent-green)',
                    fontWeight: 600,
                  }}>
                    {language === 'ar' ? `الوقت المحسوب: ${effectiveMinutes} دقيقة` : `Billed: ${effectiveMinutes} min`}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{
                padding: '10px 12px',
                background: 'rgba(0, 230, 153, 0.05)',
                border: '1px solid rgba(0, 230, 153, 0.2)',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-green)' }}>
                    table_restaurant
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {language === 'ar' ? `طاولة: ${targetName}` : `Table: ${targetName}`}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    ({effectiveMinutes} {language === 'ar' ? 'دقيقة جلوس' : 'min'})
                  </span>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-green)' }}>
                  {language === 'ar' ? 'استهلاك مجاني' : 'Free Time'}
                </span>
              </div>
            )}
          </div>

          {/* Café Orders Header Line */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px 2px 14px', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--accent-green)' }}>local_cafe</span>
              {language === 'ar' ? `طلبات البوفيه والمشروبات (${existingOrders?.length ?? 0}):` : `Café Orders (${existingOrders?.length ?? 0}):`}
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-green)' }}>
              {formatCurrency(ordersTotal)}
            </span>
          </div>

          {/* Ticket Line Items List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              minHeight: 0,
              padding: '8px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {loadingOrders ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '140px' }}>
                <LoadingSpinner label={language === 'ar' ? 'جاري تحميل الطلبات...' : 'Loading ticket…'} />
              </div>
            ) : !existingOrders || existingOrders.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '24px 14px',
                color: 'var(--text-secondary)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                background: 'var(--bg-input)',
                borderRadius: '8px',
                border: '1px dashed var(--border-default)',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--text-secondary)', opacity: 0.5, marginBottom: '6px' }}>
                  coffee
                </span>
                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                  {language === 'ar' ? 'لا توجد طلبات بوفيه مضافة للجلسة بعد' : 'No café items added yet'}
                </div>
                <div style={{ fontSize: '11px', marginTop: '4px', maxWidth: '240px', lineHeight: 1.4 }}>
                  {language === 'ar' 
                    ? 'اختر أي مشروب من القائمة لإضافته مباشرة لحساب الجلسة.' 
                    : 'Select products from the catalog to add them.'}
                </div>
              </div>
            ) : (
              existingOrders.map((ord) => {
                const isVoiding = voidingId === ord.id;
                const unitPrice = Number(ord.unit_price || (Number(ord.total_price) / Math.max(1, ord.quantity)));
                return (
                  <div
                    key={ord.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      background: 'var(--bg-input)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-default)',
                      opacity: isVoiding ? 0.5 : 1,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: isRtl ? 0 : '8px', paddingLeft: isRtl ? '8px' : 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ord.product?.name ?? 'Unknown item'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <span style={{
                          padding: '1px 6px',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.06)',
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: '11px',
                        }}>
                          x{ord.quantity}
                        </span>
                        <span>@ {formatCurrency(unitPrice)}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontWeight: 700,
                        fontSize: '13px',
                        color: 'var(--accent-green)',
                      }}>
                        {formatCurrency(ord.total_price)}
                      </span>

                      {session.status === 'active' && (
                        <button
                          type="button"
                          title={language === 'ar' ? 'إلغاء هذا الطلب واسترجاع الكمية للمخزون' : 'Void order & restore stock'}
                          onClick={() => handleVoidOrder(ord.id)}
                          disabled={isVoiding}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-red)',
                            cursor: isVoiding ? 'not-allowed' : 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '6px',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 68, 102, 0.15)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                            {isVoiding ? 'refresh' : 'delete'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Ticket Total Summary & Reassurance */}
          <div
            style={{
              padding: '12px 14px',
              borderTop: '1px solid var(--border-default)',
              background: 'linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-elevated) 100%)',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {/* Quick summary sub-lines */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {rate > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{language === 'ar' ? 'تكلفة الجهاز / وقت اللعب:' : 'Device Usage Cost:'}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {formatCurrency(totalDeviceCost)}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{language === 'ar' ? 'إجمالي طلبات البوفيه:' : 'Café Orders Subtotal:'}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--accent-green)' }}>
                  {formatCurrency(ordersTotal)}
                </span>
              </div>
            </div>

            {/* Grand Total Highlight Box */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: 'linear-gradient(135deg, rgba(0, 194, 255, 0.12) 0%, rgba(0, 230, 153, 0.08) 100%)',
                border: '1.5px solid rgba(0, 194, 255, 0.35)',
                borderRadius: '8px',
                boxShadow: '0 0 12px rgba(0, 194, 255, 0.12)',
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#FFFFFF' }}>
                  {language === 'ar' ? 'إجمالي الفاتورة حتى الآن:' : 'Grand Total So Far:'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {rate > 0 ? (language === 'ar' ? '(الوقت المحسوب + البوفيه)' : '(Device Time + Café)') : (language === 'ar' ? '(حساب البوفيه)' : '(Café Total)')}
                </div>
              </div>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '22px',
                fontWeight: 900,
                color: 'var(--accent-cyan)',
                letterSpacing: '-0.5px',
                textShadow: '0 0 10px rgba(0, 194, 255, 0.3)',
              }}>
                {formatCurrency(grandTotalSoFar)}
              </div>
            </div>

            {/* Informational note for the cashier */}
            <div style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              lineHeight: 1.35,
              opacity: 0.85,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--accent-cyan)' }}>
                info
              </span>
              <span>
                {language === 'ar'
                  ? 'تتحدث الفاتورة تلقائياً بالوقت والطلبات، وترحّل كاملة عند إنهاء الجلسة.'
                  : 'Live invoice automatically updates with elapsed time and orders.'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
