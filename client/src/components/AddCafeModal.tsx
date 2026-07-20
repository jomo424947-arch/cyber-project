import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { LoadingSpinner } from './ui/LoadingSpinner';
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

  const handleIncrement = (productId: string) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: (prev[productId] || 1) + 1,
    }));
  };

  const handleDecrement = (productId: string) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(1, (prev[productId] || 1) - 1),
    }));
  };

  const handleQuantityChange = (productId: string, val: number) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(1, val),
    }));
  };

  const handleAddProduct = async (product: Product) => {
    const qty = quantities[product.id] || 1;
    setSubmittingId(product.id);
    setErrorMsg('');
    try {
      await dataService.addSessionOrder(session.id, product.id, qty);
      
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

  return (
    <Modal
      open
      title={`Add Café · ${session.device?.name ?? 'Device'} (${session.customer?.name ?? 'Walk-in'})`}
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '75vh', overflowY: 'auto', paddingRight: '4px' }}>
        
        {/* Error alert */}
        {errorMsg && (
          <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '10px', background: 'rgba(255, 68, 102, 0.1)', borderRadius: '8px', border: '1px solid rgba(255, 68, 102, 0.3)' }}>
            {errorMsg}
          </div>
        )}

        {/* Catalog Section */}
        <div>
          <h3 className="ccms-eyebrow" style={{ marginBottom: '10px' }}>Café Product Catalog</h3>
          <div style={{ marginBottom: '14px' }}>
            <Input
              placeholder="Search products (e.g. Cola, Chips...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={loadingProducts}
            />
          </div>

          {loadingProducts ? (
            <LoadingSpinner label="Loading catalog…" />
          ) : filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              No products found matching "{searchQuery}"
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
              {filteredProducts.map((p) => {
                const qty = quantities[p.id] || 1;
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
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--accent-cyan)', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
                        {formatCurrency(p.price)} each
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Quantity Selector */}
                      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-default)', borderRadius: '6px', background: 'var(--bg-input)', overflow: 'hidden' }}>
                        <button
                          type="button"
                          onClick={() => handleDecrement(p.id)}
                          style={{ padding: '6px 10px', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-secondary)', transition: 'background 0.2s' }}
                          disabled={isSubmitting}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={qty}
                          onChange={(e) => handleQuantityChange(p.id, parseInt(e.target.value, 10) || 1)}
                          style={{
                            width: '40px',
                            textAlign: 'center',
                            border: 'none',
                            background: 'transparent',
                            fontSize: '13px',
                            fontWeight: 600,
                            outline: 'none',
                            MozAppearance: 'textfield',
                          }}
                          disabled={isSubmitting}
                        />
                        <button
                          type="button"
                          onClick={() => handleIncrement(p.id)}
                          style={{ padding: '6px 10px', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-secondary)', transition: 'background 0.2s' }}
                          disabled={isSubmitting}
                        >
                          +
                        </button>
                      </div>

                      {/* Add Button */}
                      <button
                        type="button"
                        className="ccms-btn ccms-btn-primary"
                        style={{
                          minHeight: '34px',
                          padding: '6px 16px',
                          fontSize: '11px',
                          borderRadius: '6px',
                        }}
                        onClick={() => handleAddProduct(p)}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Adding...' : 'Add'}
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
          <h3 className="ccms-eyebrow" style={{ marginBottom: '10px' }}>Active Session Orders</h3>
          
          {loadingOrders ? (
            <LoadingSpinner label="Fetching session orders…" />
          ) : !existingOrders || existingOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              No orders added to this session yet.
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
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                        x{ord.quantity}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)', fontSize: '13px' }}>
                      {formatCurrency(ord.total_price)}
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
                  <span style={{ color: 'var(--text-secondary)' }}>Total Café Cost</span>
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
