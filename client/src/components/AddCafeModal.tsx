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
  
  // Track selected quantities for each product (productId -> quantity)
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch products and active session orders on mount
  useEffect(() => {
    dataService.listProducts()
      .then((data) => {
        setProducts(data);
        // Initialize quantity map with 1 for all products
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
  }, [session.id]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, searchQuery]);

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

  const handleAddProduct = async (product: Product) => {
    const qty = quantities[product.id] || 1;
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
      
      // Reload existing orders
      setLoadingOrders(true);
      const orders = await dataService.listSessionOrders(session.id);
      setExistingOrders(orders);
      
      // Trigger a light refresh callback in parent if needed (e.g. notifications)
      onDone();
    } catch (err: any) {
      setErrorMsg(apiErrorMessage(err, `Failed to add ${product.name}`));
    } finally {
      setSubmittingId(null);
      setLoadingOrders(false);
    }
  };

  const ordersTotal = useMemo(() => {
    if (!existingOrders) return 0;
    return existingOrders.reduce((sum, ord) => sum + Number(ord.total_price), 0);
  }, [existingOrders]);

  const clientName = session.customer?.name ?? (language === 'ar' ? 'مستغل خارجي' : 'Walk-in');

  return (
    <Modal
      open
      title={
        language === 'ar' 
          ? `إضافة طلبات بوفيه · ${session.device?.name ?? 'جهاز'} (${clientName})`
          : `Add Café · ${session.device?.name ?? 'Device'} (${clientName})`
      }
      onClose={onClose}
      footer={<Button onClick={onClose} style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>{language === 'ar' ? 'إغلاق' : 'Close'}</Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '75vh', overflowY: 'auto', paddingRight: '4px', textAlign: isRtl ? 'right' : 'left' }}>
        
        {/* Error alert */}
        {errorMsg && (
          <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '10px', background: 'rgba(255, 68, 102, 0.1)', borderRadius: '8px', border: '1px solid rgba(255, 68, 102, 0.3)' }}>
            {errorMsg}
          </div>
        )}

        {/* Catalog Section */}
        <div>
          <h3 className="ccms-eyebrow" style={{ marginBottom: '10px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
            {language === 'ar' ? 'قائمة منتجات البوفيه والكافيه' : 'Café Product Catalog'}
          </h3>
          <div style={{ marginBottom: '14px' }}>
            <Input
              placeholder={language === 'ar' ? 'ابحث عن منتج (مثال: بيبسي، شيبسي...)' : 'Search products (e.g. Cola, Chips...)'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={loadingProducts}
            />
          </div>

          {loadingProducts ? (
            <LoadingSpinner label={language === 'ar' ? 'جاري تحميل قائمة المنتجات...' : 'Loading catalog…'} />
          ) : filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              {language === 'ar' ? `لا توجد منتجات تطابق "${searchQuery}"` : `No products found matching "${searchQuery}"`}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
              {filteredProducts.map((p) => {
                const stockNum = Number(p.stock ?? 0);
                const isOutOfStock = stockNum <= 0;
                const qty = isOutOfStock ? 0 : Math.min(stockNum, quantities[p.id] || 1);
                const isSubmitting = submittingId === p.id;
                
                return (
                  <div
                    key={p.id}
                    className="inner-glow-cyan"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: 'var(--bg-surface)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-default)',
                      opacity: isOutOfStock ? 0.7 : 1,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {p.name}
                        {isOutOfStock ? (
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(255, 68, 102, 0.15)', color: 'var(--accent-red)', border: '1px solid rgba(255, 68, 102, 0.3)' }}>
                            {language === 'ar' ? 'نفذت الكمية' : 'Out of stock'}
                          </span>
                        ) : stockNum <= 5 ? (
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(255, 170, 0, 0.15)', color: '#ffaa00', border: '1px solid rgba(255, 170, 0, 0.3)' }}>
                            {language === 'ar' ? `متبقي ${stockNum}` : `Only ${stockNum} left`}
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(0, 194, 255, 0.1)', color: 'var(--accent-cyan)', border: '1px solid rgba(0, 194, 255, 0.2)' }}>
                            {language === 'ar' ? `المخزون: ${stockNum}` : `Stock: ${stockNum}`}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--accent-cyan)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
                        {formatCurrency(p.price)} {language === 'ar' ? 'للوحدة' : 'each'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Quantity Selector */}
                      {!isOutOfStock && (
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-default)', borderRadius: '6px', background: 'var(--bg-input)', overflow: 'hidden' }}>
                          <button
                            type="button"
                            onClick={() => handleDecrement(p.id)}
                            style={{ padding: '6px 10px', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-secondary)', transition: 'background 0.2s', border: 'none', background: 'transparent', cursor: 'pointer' }}
                            disabled={isSubmitting || qty <= 1}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={qty}
                            onChange={(e) => handleQuantityChange(p, parseInt(e.target.value, 10) || 1)}
                            style={{
                              width: '40px',
                              textAlign: 'center',
                              border: 'none',
                              background: 'transparent',
                              fontSize: '13px',
                              fontWeight: 600,
                              outline: 'none',
                              MozAppearance: 'textfield',
                              color: '#fff',
                            }}
                            disabled={isSubmitting}
                          />
                          <button
                            type="button"
                            onClick={() => handleIncrement(p)}
                            style={{ padding: '6px 10px', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-secondary)', transition: 'background 0.2s', border: 'none', background: 'transparent', cursor: 'pointer' }}
                            disabled={isSubmitting || qty >= stockNum}
                          >
                            +
                          </button>
                        </div>
                      )}

                      {/* Add Button */}
                      <button
                        type="button"
                        className={`ccms-btn ${isOutOfStock ? 'ccms-btn-ghost' : 'ccms-btn-primary'}`}
                        style={{
                          minHeight: '34px',
                          padding: '6px 16px',
                          fontSize: '11px',
                          borderRadius: '6px',
                          fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
                          cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                        }}
                        onClick={() => handleAddProduct(p)}
                        disabled={isSubmitting || isOutOfStock}
                      >
                        {isSubmitting 
                          ? (language === 'ar' ? 'إضافة...' : 'Adding...') 
                          : isOutOfStock
                            ? (language === 'ar' ? 'غير متوفر' : 'Unavailable')
                            : (language === 'ar' ? 'إضافة' : 'Add')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <hr style={{ border: '0', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />

        {/* Existing Session Orders Section */}
        <div>
          <h3 className="ccms-eyebrow" style={{ marginBottom: '10px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
            {language === 'ar' ? 'طلبات البوفيه المضافة للجلسة الحالية' : 'Active Session Orders'}
          </h3>
          
          {loadingOrders ? (
            <LoadingSpinner label={language === 'ar' ? 'جاري جلب الطلبات...' : 'Fetching session orders…'} />
          ) : !existingOrders || existingOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              {language === 'ar' ? 'لا توجد أي طلبات مضافة لهذه الجلسة بعد.' : 'No orders added to this session yet.'}
            </div>
          ) : (
            <div style={{ background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-default)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {existingOrders.map((ord) => (
                  <div
                    key={ord.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--border-default)',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ord.product?.name ?? 'Unknown item'}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: isRtl ? 0 : '8px', marginRight: isRtl ? '8px' : 0 }}>
                        x{ord.quantity}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)', fontSize: '13px' }}>
                        {formatCurrency(ord.total_price)}
                      </span>
                      {session.status === 'active' && (
                        <button
                          type="button"
                          title={language === 'ar' ? 'إلغاء الطلب واسترجاع المخزون' : 'Void order & restore stock'}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-red)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                          onClick={async () => {
                            if (!window.confirm(language === 'ar' ? 'هل تريد إلغاء هذا الطلب وإرجاع الكمية للمخزون؟' : 'Void order line and restore stock?')) return;
                            try {
                              await dataService.voidSessionOrder(session.id, ord.id);
                              // Refresh products & session orders
                              const [pList, oList] = await Promise.all([
                                dataService.listProducts(),
                                dataService.listSessionOrders(session.id),
                              ]);
                              setProducts(pList);
                              setExistingOrders(oList);
                              onDone();
                            } catch (err: any) {
                              setErrorMsg(apiErrorMessage(err, 'Failed to void order'));
                            }
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {/* Total Row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: 'var(--bg-elevated)',
                    fontWeight: 'bold',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>{language === 'ar' ? 'إجمالي حساب البوفيه' : 'Total Café Cost'}</span>
                  <span style={{ color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {formatCurrency(ordersTotal)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}
