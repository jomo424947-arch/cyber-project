import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { StatCard } from '../components/StatCard';
import { useAsync } from '../hooks/useAsync';
import { useIsMobile } from '../hooks/useIsMobile';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency, formatDateTime } from '../utils/format';
import type { Product, ProductSalesReport, PaymentMethod } from '../types';

export default function ProductsPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { t, language, isRtl } = useLanguage();

  const [activeTab, setActiveTab] = useState<'catalog' | 'report'>('catalog');

  const { data: products, loading, refetch } = useAsync(() => dataService.listProducts(), []);
  const { data: salesReport, loading: loadingReport, refetch: refetchReport } = useAsync<ProductSalesReport>(
    () => dataService.getProductSalesReport(),
    []
  );

  const [search, setSearch] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [restocking, setRestocking] = useState<Product | null>(null);
  const [viewingHistory, setViewingHistory] = useState<Product | null>(null);
  const [standaloneSale, setStandaloneSale] = useState(false);

  const allProducts = products ?? [];
  const filtered = search.trim()
    ? allProducts.filter((p) => p.name.toLowerCase().includes(search.toLowerCase().trim()))
    : allProducts;

  const reportItems = salesReport?.items ?? [];
  const filteredReportItems = reportSearch.trim()
    ? reportItems.filter((item) => item.name.toLowerCase().includes(reportSearch.toLowerCase().trim()))
    : reportItems;

  const handleRefreshAll = () => {
    refetch();
    refetchReport();
  };

  return (
    <Layout
      title={language === 'ar' ? 'دليل ومخزون المنتجات' : 'Products & Inventory'}
      subtitle={
        language === 'ar'
          ? `${allProducts.length} منتج كافيه متاح بالمخزون حالياً`
          : `${allProducts.length} café product${allProducts.length === 1 ? '' : 's'} in inventory`
      }
      actions={
        <div style={{ display: 'flex', gap: isMobile ? '8px' : '10px', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
          <Button
            variant="ghost"
            onClick={() => setStandaloneSale(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              borderColor: 'var(--accent-green)',
              color: 'var(--accent-green)',
              flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
              minHeight: '38px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>point_of_sale</span>
            <span>{language === 'ar' ? 'بيع مباشر' : 'Walk-in Sale'}</span>
          </Button>
          <Button
            onClick={() => setCreating(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
              minHeight: '38px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
            <span>{language === 'ar' ? 'إضافة منتج' : 'Add Product'}</span>
          </Button>
        </div>
      }
    >
      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border-default)',
          paddingBottom: '12px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: activeTab === 'catalog' ? '1px solid var(--accent-cyan)' : '1px solid transparent',
            background: activeTab === 'catalog' ? 'rgba(0, 194, 255, 0.1)' : 'transparent',
            color: activeTab === 'catalog' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>inventory_2</span>
          {language === 'ar' ? 'دليل المنتجات والمخزون' : 'Catalog & Inventory'}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('report');
            refetchReport();
          }}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: activeTab === 'report' ? '1px solid var(--accent-green)' : '1px solid transparent',
            background: activeTab === 'report' ? 'rgba(0, 230, 153, 0.1)' : 'transparent',
            color: activeTab === 'report' ? 'var(--accent-green)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>analytics</span>
          {language === 'ar' ? 'تقرير مبيعات وأرباح الكافيه' : 'Sales & Profit Report'}
        </button>
      </div>

      {activeTab === 'catalog' ? (
        <>
          {loading ? (
            <LoadingSpinner label={t('loading')} />
          ) : allProducts.length === 0 ? (
            <div className="ccms-card">
              <EmptyState
                icon="local_cafe"
                title={language === 'ar' ? 'لا توجد منتجات' : 'No products yet'}
                description={language === 'ar' ? 'أضف أول منتج كافيه لبدء البيع ومتابعة المخزون.' : 'Add your first café product to track stock and sell.'}
                action={<Button onClick={() => setCreating(true)}>{language === 'ar' ? 'إضافة منتج' : 'Add Product'}</Button>}
              />
            </div>
          ) : (
            <>
              {/* Search bar */}
              <div style={{ marginBottom: '24px', maxWidth: '400px' }}>
                <Input
                  placeholder={language === 'ar' ? 'بحث عن منتجات...' : 'Search products…'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {filtered.length === 0 ? (
                <div className="ccms-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  {language === 'ar' ? `لا توجد منتجات تطابق "${search}"` : `No products matching "${search}"`}
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(min(290px, 100%), 1fr))',
                    gap: '20px',
                  }}
                >
                  {filtered.map((product, i) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      index={i}
                      onRestock={() => setRestocking(product)}
                      onViewHistory={() => setViewingHistory(product)}
                      onEdit={() => setEditing(product)}
                      onDelete={() => setDeleting(product)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        /* ─── Sales & Profit Report Tab ─── */
        <div>
          {loadingReport ? (
            <LoadingSpinner label={language === 'ar' ? 'جاري تجميع تقرير المبيعات والأرباح...' : 'Generating sales & profit report…'} />
          ) : (
            <>
              {/* Summary Stat Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '16px',
                  marginBottom: '28px',
                }}
              >
                <StatCard
                  label={language === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue'}
                  value={formatCurrency(salesReport?.summary.total_revenue ?? 0)}
                  icon="payments"
                  accent="var(--accent-cyan)"
                  index={0}
                />
                <StatCard
                  label={language === 'ar' ? 'إجمالي التكلفة' : 'Total Cost'}
                  value={salesReport?.summary.total_cost !== null && salesReport?.summary.total_cost !== undefined ? formatCurrency(salesReport.summary.total_cost) : (language === 'ar' ? 'غير محدد' : 'N/A')}
                  icon="inventory_2"
                  accent="var(--text-secondary)"
                  index={1}
                />
                <StatCard
                  label={language === 'ar' ? 'صافي الأرباح' : 'Net Profit'}
                  value={salesReport?.summary.total_profit !== null && salesReport?.summary.total_profit !== undefined ? formatCurrency(salesReport.summary.total_profit) : (language === 'ar' ? 'غير محدد' : 'N/A')}
                  icon="trending_up"
                  accent="var(--accent-green)"
                  index={2}
                />
                <StatCard
                  label={language === 'ar' ? 'القطع المباعة' : 'Items Sold'}
                  value={`${salesReport?.summary.total_items_sold ?? 0} ${language === 'ar' ? 'قطعة' : 'items'}`}
                  icon="shopping_bag"
                  accent="#8b5cf6"
                  index={3}
                />
                <StatCard
                  label={language === 'ar' ? 'المنتج الأكثر مبيعاً' : 'Top Selling Item'}
                  value={salesReport?.summary.top_selling_product || (language === 'ar' ? 'لا يوجد مبيعات' : 'None')}
                  icon="stars"
                  accent="#ffaa00"
                  index={4}
                />
              </div>

              {/* Table Card */}
              <div className="ccms-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                  <h3 className="ccms-eyebrow" style={{ fontSize: '14px', margin: 0, fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
                    {language === 'ar' ? 'تفاصيل أداء ومبيعات وأرباح كل منتج' : 'Product Sales, Cost & Profit Breakdown'}
                  </h3>
                  <div style={{ maxWidth: '300px', width: '100%' }}>
                    <Input
                      placeholder={language === 'ar' ? 'فلترة التقرير باسم المنتج...' : 'Filter report by item…'}
                      value={reportSearch}
                      onChange={(e) => setReportSearch(e.target.value)}
                    />
                  </div>
                </div>

                {filteredReportItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                    {language === 'ar' ? 'لا توجد بيانات مبيعات مطابقة' : 'No matching sales records'}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="ccms-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: isRtl ? 'right' : 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: '12px' }}>
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'اسم المنتج' : 'Product'}</th>
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'سعر البيع' : 'Sell Price'}</th>
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'سعر التكلفة' : 'Cost Price'}</th>
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'المخزون المتبقي' : 'Stock'}</th>
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'الكمية المباعة' : 'Units Sold'}</th>
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue'}</th>
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'إجمالي التكلفة' : 'Total Cost'}</th>
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'صافي الربح' : 'Net Profit'}</th>
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'هامش الربح' : 'Margin %'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReportItems.map((item) => {
                          const isOut = item.stock <= 0;
                          const isLow = item.stock > 0 && item.stock <= 5;

                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                              <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {item.name}
                              </td>
                              <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace' }}>
                                {formatCurrency(item.price)}
                              </td>
                              <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>
                                {item.cost_price !== null && item.cost_price !== undefined ? formatCurrency(item.cost_price) : '—'}
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                {isOut ? (
                                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '12px', background: 'rgba(255, 68, 102, 0.15)', color: 'var(--accent-red)', border: '1px solid rgba(255, 68, 102, 0.3)' }}>
                                    {language === 'ar' ? 'نفذت الكمية (0)' : 'Out (0)'}
                                  </span>
                                ) : isLow ? (
                                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '12px', background: 'rgba(255, 170, 0, 0.15)', color: '#ffaa00', border: '1px solid rgba(255, 170, 0, 0.3)' }}>
                                    {language === 'ar' ? `منخفض (${item.stock})` : `Low (${item.stock})`}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '12px', background: 'rgba(0, 194, 255, 0.1)', color: 'var(--accent-cyan)', border: '1px solid rgba(0, 194, 255, 0.2)' }}>
                                    {language === 'ar' ? `متوفر (${item.stock})` : `In Stock (${item.stock})`}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '14px 16px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                                {item.sold_quantity} {language === 'ar' ? 'قطعة' : 'units'}
                              </td>
                              <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'JetBrains Mono, monospace' }}>
                                {formatCurrency(item.total_revenue)}
                              </td>
                              <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>
                                {item.total_cost !== null && item.total_cost !== undefined ? formatCurrency(item.total_cost) : '—'}
                              </td>
                              <td style={{ padding: '14px 16px', fontWeight: 700, color: item.profit !== null && item.profit !== undefined ? (item.profit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                                {item.profit !== null && item.profit !== undefined ? formatCurrency(item.profit) : '—'}
                              </td>
                              <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace' }}>
                                {item.margin_pct !== null && item.margin_pct !== undefined ? (
                                  <span style={{ fontWeight: 600, color: item.margin_pct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                    {item.margin_pct}%
                                  </span>
                                ) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Standalone Walk-in Sale Modal */}
      {standaloneSale && (
        <StandaloneSaleModal
          products={allProducts}
          onClose={() => setStandaloneSale(false)}
          onDone={() => {
            handleRefreshAll();
            setStandaloneSale(false);
          }}
        />
      )}

      {/* Restock / Adjust Stock Modal */}
      {restocking && (
        <RestockModal
          product={restocking}
          onClose={() => setRestocking(null)}
          onDone={() => {
            handleRefreshAll();
            setRestocking(null);
          }}
        />
      )}

      {/* View Stock Log History Modal */}
      {viewingHistory && (
        <StockHistoryModal
          product={viewingHistory}
          onClose={() => setViewingHistory(null)}
        />
      )}

      {/* Create modal */}
      {creating && (
        <ProductFormModal
          title={language === 'ar' ? 'إضافة منتج جديد وتحديد المخزون' : 'Add New Product & Stock'}
          initial={null}
          onClose={() => setCreating(false)}
          onDone={async (payload) => {
            try {
              await dataService.createProduct(payload);
              toast(language === 'ar' ? 'تم إضافة المنتج وإعداد المخزون' : 'Product & stock added', 'success');
              handleRefreshAll();
              setCreating(false);
            } catch (err) {
              toast(apiErrorMessage(err, 'Could not create product'), 'error');
            }
          }}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <ProductFormModal
          title={language === 'ar' ? `تعديل البيانات والمخزون · ${editing.name}` : `Edit Item & Stock · ${editing.name}`}
          initial={editing}
          onClose={() => setEditing(null)}
          onDone={async (payload) => {
            try {
              await dataService.updateProduct(editing.id, payload);
              toast(language === 'ar' ? 'تم تحديث المنتج والمخزون' : 'Product & stock updated', 'success');
              handleRefreshAll();
              setEditing(null);
            } catch (err) {
              toast(apiErrorMessage(err, 'Could not update product'), 'error');
            }
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleting && (
        <Modal
          open
          title={language === 'ar' ? 'إزالة منتج' : 'Remove Product'}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>{t('cancel')}</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await dataService.deleteProduct(deleting.id);
                    toast(language === 'ar' ? 'تم إزالة المنتج' : 'Product removed', 'success');
                    handleRefreshAll();
                    setDeleting(null);
                  } catch (err) {
                    toast(apiErrorMessage(err, 'Could not delete product'), 'error');
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            {language === 'ar'
              ? `هل أنت متأكد من حذف المنتج ${deleting.name} نهائياً؟`
              : `Are you sure you want to remove ${deleting.name}? This product will be permanently deleted.`}
          </p>
        </Modal>
      )}
    </Layout>
  );
}

/* ─── Product Card ────────────────────────────────────────────────────── */

const PRODUCT_ICONS: Record<string, string> = {
  pepsi: 'local_drink',
  cola: 'local_drink',
  coca: 'local_drink',
  sprite: 'local_drink',
  water: 'water_drop',
  mineral: 'water_drop',
  tea: 'emoji_food_beverage',
  coffee: 'coffee',
  chips: 'fastfood',
  chipsy: 'fastfood',
  energy: 'bolt',
  fury: 'bolt',
};

function getProductIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [keyword, icon] of Object.entries(PRODUCT_ICONS)) {
    if (lower.includes(keyword)) return icon;
  }
  return 'local_cafe';
}

function ProductCard({
  product,
  index,
  onRestock,
  onViewHistory,
  onEdit,
  onDelete,
}: {
  product: Product;
  index: number;
  onRestock: () => void;
  onViewHistory: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const icon = getProductIcon(product.name);
  const { language, isRtl } = useLanguage();

  const stockNum = Number(product.stock ?? 0);
  const isOutOfStock = stockNum <= 0;
  const isLowStock = stockNum > 0 && stockNum <= 5;

  return (
    <div
      className="ccms-card ccms-card-hover ccms-stagger"
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        animationDelay: `${index * 50}ms`,
        position: 'relative',
        overflow: 'hidden',
        border: isOutOfStock ? '1px solid rgba(255, 68, 102, 0.3)' : isLowStock ? '1px solid rgba(255, 170, 0, 0.3)' : '1px solid var(--border-default)',
      }}
    >
      {/* Icon + Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: isOutOfStock ? 'rgba(255, 68, 102, 0.1)' : 'rgba(0, 194, 255, 0.08)',
            border: isOutOfStock ? '1px solid rgba(255, 68, 102, 0.2)' : '1px solid rgba(0, 194, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '22px', color: isOutOfStock ? 'var(--accent-red)' : 'var(--accent-cyan)' }}
          >
            {icon}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: isRtl ? 'right' : 'left',
            }}
          >
            {product.name}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              fontFamily: 'JetBrains Mono, monospace',
              marginTop: '2px',
              textAlign: isRtl ? 'right' : 'left',
            }}
          >
            {language === 'ar' ? 'التكلفة: ' : 'Cost: '}
            {product.cost_price !== null && product.cost_price !== undefined ? formatCurrency(product.cost_price) : '—'}
          </div>
        </div>
      </div>

      {/* Stock Status Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {isOutOfStock ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(255, 68, 102, 0.12)',
              color: 'var(--accent-red)',
              border: '1px solid rgba(255, 68, 102, 0.25)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>error</span>
            {language === 'ar' ? 'نفذت الكمية' : 'Out of Stock'}
          </span>
        ) : isLowStock ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(255, 170, 0, 0.12)',
              color: '#ffaa00',
              border: '1px solid rgba(255, 170, 0, 0.25)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>warning</span>
            {language === 'ar' ? `متبقي ${stockNum}` : `Low (${stockNum} left)`}
          </span>
        ) : (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(0, 194, 255, 0.1)',
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(0, 194, 255, 0.2)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span>
            {language === 'ar' ? `المخزون: ${stockNum}` : `In Stock (${stockNum})`}
          </span>
        )}

        <button
          type="button"
          onClick={onViewHistory}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--accent-cyan)',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>history</span>
          {language === 'ar' ? 'السجل' : 'Logs'}
        </button>
      </div>

      {/* Price info */}
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--bg-elevated)',
          borderRadius: '8px',
          border: '1px solid var(--border-default)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span className="ccms-eyebrow">{language === 'ar' ? 'سعر البيع' : 'Selling Price'}</span>
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--accent-green)',
          }}
        >
          {formatCurrency(product.price)}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', flexWrap: 'wrap' }}>
        <Button
          onClick={onRestock}
          style={{ flex: 1, padding: '6px 10px', fontSize: '11px', minHeight: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add_shopping_cart</span>
          {language === 'ar' ? 'تزويد المخزون' : '+ Restock'}
        </Button>
        <Button
          variant="ghost"
          onClick={onEdit}
          style={{ padding: '6px 10px', fontSize: '11px', minHeight: '32px' }}
          title={language === 'ar' ? 'تعديل البيانات' : 'Edit details'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span>
        </Button>
        <Button
          variant="danger"
          onClick={onDelete}
          style={{ padding: '6px 10px', fontSize: '11px', minHeight: '32px' }}
          title={language === 'ar' ? 'حذف المنتج' : 'Delete product'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
        </Button>
      </div>
    </div>
  );
}

/* ─── Product Form Modal ──────────────────────────────────────────────── */

function ProductFormModal({
  title,
  initial,
  onClose,
  onDone,
}: {
  title: string;
  initial: Product | null;
  onClose: () => void;
  onDone: (payload: { name: string; price: number; cost_price?: number | null; stock: number }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [costPrice, setCostPrice] = useState(initial && initial.cost_price !== null && initial.cost_price !== undefined ? String(initial.cost_price) : '');
  const [stock, setStock] = useState(initial ? String(initial.stock ?? 0) : '0');
  const [loading, setLoading] = useState(false);
  const { t, language } = useLanguage();

  const isValid =
    name.trim() &&
    price.trim() &&
    !Number.isNaN(parseFloat(price)) &&
    parseFloat(price) >= 0 &&
    stock.trim() &&
    !Number.isNaN(parseInt(stock, 10)) &&
    parseInt(stock, 10) >= 0;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onDone({
        name: name.trim(),
        price: parseFloat(price),
        cost_price: costPrice.trim() !== '' ? parseFloat(costPrice) : null,
        stock: parseInt(stock, 10),
      });
    } catch {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button loading={loading} disabled={!isValid} onClick={handleSubmit}>
            {initial ? t('save') : (language === 'ar' ? 'حفظ وإضافة للمخزون' : 'Save & Add Stock')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input
          label={language === 'ar' ? 'اسم المنتج' : 'Product Name'}
          placeholder={language === 'ar' ? 'مثال: بيبسي كانز / قهوة تركي' : 'e.g. Cola Can / Coffee'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label={language === 'ar' ? 'سعر البيع' : 'Selling Price'}
            type="number"
            step="0.5"
            min="0"
            placeholder="e.g. 15.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <Input
            label={language === 'ar' ? 'سعر التكلفة (اختياري)' : 'Cost Price (Optional)'}
            type="number"
            step="0.5"
            min="0"
            placeholder="e.g. 8.00"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
          />
        </div>
        {costPrice !== '' && price !== '' && Number(costPrice) >= Number(price) && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(234, 179, 8, 0.12)',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              color: 'var(--accent-yellow)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>warning</span>
            <span>
              {language === 'ar'
                ? 'تنبيه: سعر التكلفة أعلى من أو مساوي لسعر البيع! يرجى التأكد من الأرقام لتفادي الخسارة.'
                : 'Warning: Cost price is greater than or equal to selling price!'}
            </span>
          </div>
        )}
        <Input
          label={language === 'ar' ? 'الكمية المتاحة في المخزون (القطع)' : 'Available Stock Quantity (Units)'}
          type="number"
          step="1"
          min="0"
          placeholder="e.g. 50"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />
      </div>
    </Modal>
  );
}

/* ─── Restock / Adjust Stock Modal ────────────────────────────────────── */

function RestockModal({
  product,
  onClose,
  onDone,
}: {
  product: Product;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { language, isRtl } = useLanguage();
  const [delta, setDelta] = useState('10');
  const [category, setCategory] = useState<'restock' | 'manual_adjustment' | 'shrinkage'>('restock');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const deltaNum = parseInt(delta, 10);
  const currentStock = Number(product.stock ?? 0);
  const resultingBalance = currentStock + (isNaN(deltaNum) ? 0 : deltaNum);
  const isValid = !isNaN(deltaNum) && deltaNum !== 0 && resultingBalance >= 0;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await dataService.adjustStock(product.id, deltaNum, reason.trim() || undefined, category);
      toast(language === 'ar' ? 'تم تحديث رصيد المخزون وتسجيل الحركة' : 'Stock balance updated & logged', 'success');
      onDone();
    } catch (err: any) {
      toast(apiErrorMessage(err, 'Failed to adjust stock'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={language === 'ar' ? `تزويد / تعديل مخزون · ${product.name}` : `Restock / Adjust Stock · ${product.name}`}
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{language === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
          <Button loading={submitting} disabled={!isValid} onClick={handleSubmit}>
            {language === 'ar' ? 'تأكيد التعديل وتسجيل الحركة' : 'Confirm Stock Adjustment'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: isRtl ? 'right' : 'left' }}>
        <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{language === 'ar' ? 'الرصيد الحالي بالمخزون' : 'Current Stock Balance'}</span>
          <span style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-cyan)', fontSize: '16px' }}>{currentStock}</span>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            {language === 'ar' ? 'نوع الحركة' : 'Adjustment Type'}
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as any)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
              fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
            }}
          >
            <option value="restock">{language === 'ar' ? 'توريد كمية جديدة (+ Restock)' : 'Inventory Restock (+)'}</option>
            <option value="manual_adjustment">{language === 'ar' ? 'تعديل يدوِي (تصحيح)' : 'Manual Correction'}</option>
            <option value="shrinkage">{language === 'ar' ? 'تالف / هالك (- Shrinkage)' : 'Damaged / Shrinkage (-)'}</option>
          </select>
        </div>

        <Input
          label={language === 'ar' ? 'الكمية المضافة/المخصومة (موجب لإضافة، سالب للخصم)' : 'Quantity Delta (+ to add, - to subtract)'}
          type="number"
          step="1"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
        />

        <div style={{ padding: '10px 14px', background: resultingBalance >= 0 ? 'rgba(0, 194, 255, 0.08)' : 'rgba(255, 68, 102, 0.1)', borderRadius: '8px', border: resultingBalance >= 0 ? '1px solid rgba(0, 194, 255, 0.2)' : '1px solid rgba(255, 68, 102, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{language === 'ar' ? 'الرصيد المتوقع بعد التعديل' : 'Resulting Balance'}</span>
          <span style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: resultingBalance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: '15px' }}>{resultingBalance}</span>
        </div>

        <Input
          label={language === 'ar' ? 'سبب التعديل / ملاحظات (اختياري)' : 'Reason / Notes (Optional)'}
          placeholder={language === 'ar' ? 'مثال: شحنة فواتير رقم #102 / عجز مخزون' : 'e.g. Invoice delivery #102'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}

/* ─── View Stock Log History Modal ────────────────────────────────────── */

function StockHistoryModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const { language, isRtl } = useLanguage();
  const { data: logs, loading } = useAsync(() => dataService.listStockLogs(product.id), [product.id]);

  const getCategoryBadge = (type: string) => {
    switch (type) {
      case 'restock':
        return { label: language === 'ar' ? 'توريد' : 'Restock', bg: 'rgba(0, 230, 153, 0.15)', color: 'var(--accent-green)' };
      case 'sale':
        return { label: language === 'ar' ? 'بيع جلسة' : 'Session Sale', bg: 'rgba(0, 194, 255, 0.15)', color: 'var(--accent-cyan)' };
      case 'standalone_sale':
        return { label: language === 'ar' ? 'بيع مباشر' : 'Walk-in Sale', bg: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' };
      case 'void_order':
        return { label: language === 'ar' ? 'إلغاء طلب' : 'Void Order', bg: 'rgba(255, 170, 0, 0.15)', color: '#ffaa00' };
      case 'shrinkage':
        return { label: language === 'ar' ? 'تالف/هالك' : 'Shrinkage', bg: 'rgba(255, 68, 102, 0.15)', color: 'var(--accent-red)' };
      default:
        return { label: language === 'ar' ? 'تعديل' : 'Adjustment', bg: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-secondary)' };
    }
  };

  return (
    <Modal
      open
      title={language === 'ar' ? `سجل حركة المخزون · ${product.name}` : `Stock Audit History · ${product.name}`}
      onClose={onClose}
      width={600}
      footer={<Button onClick={onClose}>{language === 'ar' ? 'إغلاق' : 'Close'}</Button>}
    >
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {loading ? (
          <LoadingSpinner label={language === 'ar' ? 'جاري تحميل سجل حركة المخزون...' : 'Loading stock history…'} />
        ) : !logs || logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
            {language === 'ar' ? 'لا توجد حرّكات مسجلة لهذا المنتج بعد.' : 'No stock history logs recorded for this product yet.'}
          </div>
        ) : (
          <table className="ccms-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: isRtl ? 'right' : 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: '11px' }}>
                <th style={{ padding: '10px' }}>{language === 'ar' ? 'التاريخ والوقت' : 'Date & Time'}</th>
                <th style={{ padding: '10px' }}>{language === 'ar' ? 'نوع الحركة' : 'Type'}</th>
                <th style={{ padding: '10px' }}>{language === 'ar' ? 'التغير (Delta)' : 'Delta'}</th>
                <th style={{ padding: '10px' }}>{language === 'ar' ? 'الرصيد المتبقي' : 'Balance'}</th>
                <th style={{ padding: '10px' }}>{language === 'ar' ? 'المستخدم / السبب' : 'Actor / Reason'}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const badge = getCategoryBadge(log.change_type);
                return (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-default)', fontSize: '12px' }}>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>
                      {formatDateTime(log.created_at)}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: badge.bg, color: badge.color, fontWeight: 600 }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: log.delta > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {log.delta > 0 ? `+${log.delta}` : log.delta}
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {log.balance_after}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{log.actor?.full_name ?? 'System/Staff'}</div>
                      {log.reason && <div style={{ fontSize: '11px', opacity: 0.8 }}>{log.reason}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

/* ─── Standalone Walk-in Café Sale Modal ──────────────────────────────── */

function StandaloneSaleModal({
  products,
  onClose,
  onDone,
}: {
  products: Product[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { language, isRtl } = useLanguage();
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [submitting, setSubmitting] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedId);
  const stockNum = Number(selectedProduct?.stock ?? 0);
  const qtyNum = parseInt(quantity, 10) || 1;
  const totalPrice = selectedProduct ? Math.round(Number(selectedProduct.price) * qtyNum * 100) / 100 : 0;

  const isValid = selectedProduct && stockNum >= qtyNum && qtyNum > 0;

  const handleSubmit = async () => {
    if (!selectedProduct) return;
    setSubmitting(true);
    try {
      await dataService.createStandaloneSale(selectedProduct.id, qtyNum, paymentMethod);
      toast(language === 'ar' ? 'تم تسجيل البيع المباشر وخصم المخزون' : 'Walk-in sale completed & stock updated', 'success');
      onDone();
    } catch (err: any) {
      toast(apiErrorMessage(err, 'Failed to complete sale'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={language === 'ar' ? 'بيع كافيه مباشر (بدون جلسة)' : 'Walk-in Café Sale (Standalone)'}
      onClose={onClose}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{language === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
          <Button loading={submitting} disabled={!isValid} onClick={handleSubmit}>
            {language === 'ar' ? `تأكيد البيع (${formatCurrency(totalPrice)})` : `Complete Sale (${formatCurrency(totalPrice)})`}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: isRtl ? 'right' : 'left' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            {language === 'ar' ? 'اختر المنتج' : 'Select Product'}
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
              fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
            }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                {p.name} — {formatCurrency(p.price)} ({p.stock <= 0 ? (language === 'ar' ? 'نفذت الكمية' : 'Out of stock') : (language === 'ar' ? `المخزون: ${p.stock}` : `Stock: ${p.stock}`)})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label={language === 'ar' ? 'الكمية' : 'Quantity'}
            type="number"
            min="1"
            max={stockNum}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              {language === 'ar' ? 'طريقة الدفع' : 'Payment Method'}
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
                fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit',
              }}
            >
              <option value="cash">{language === 'ar' ? 'نقداً (كاش)' : 'Cash'}</option>
              <option value="card">{language === 'ar' ? 'بطاقة (كارت)' : 'Card'}</option>
              <option value="transfer">{language === 'ar' ? 'تحويل بانكي' : 'Transfer'}</option>
              <option value="wallet">{language === 'ar' ? 'محفظة إلكترونية' : 'Digital Wallet'}</option>
            </select>
          </div>
        </div>

        {selectedProduct && (
          <div style={{ padding: '14px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{language === 'ar' ? 'إجمالي الحساب' : 'Total Amount'}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {formatCurrency(selectedProduct.price)} × {qtyNum}
              </div>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-green)' }}>
              {formatCurrency(totalPrice)}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
