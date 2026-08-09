import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { StatCard } from '../components/StatCard';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency } from '../utils/format';
import type { Product, ProductSalesReport } from '../types';

export default function ProductsPage() {
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
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button
            onClick={() => setCreating(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
            {language === 'ar' ? 'إضافة منتج جديد' : 'Add Product'}
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
          {language === 'ar' ? 'تقرير مبيعات المنتجات' : 'Sales Report'}
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
                    gridTemplateColumns: 'repeat(auto-fill, minmax(min(270px, 100%), 1fr))',
                    gap: '20px',
                  }}
                >
                  {filtered.map((product, i) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      index={i}
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
        /* ─── Sales Report Tab ─── */
        <div>
          {loadingReport ? (
            <LoadingSpinner label={language === 'ar' ? 'جاري تجميع تقرير المبيعات...' : 'Generating sales report…'} />
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
                  label={language === 'ar' ? 'إجمالي إيراد المنتجات' : 'Total Café Revenue'}
                  value={formatCurrency(salesReport?.summary.total_revenue ?? 0)}
                  icon="payments"
                  accent="var(--accent-green)"
                  index={0}
                />
                <StatCard
                  label={language === 'ar' ? 'إجمالي القطع المباعة' : 'Total Items Sold'}
                  value={`${salesReport?.summary.total_items_sold ?? 0} ${language === 'ar' ? 'قطعة' : 'items'}`}
                  icon="shopping_bag"
                  accent="var(--accent-cyan)"
                  index={1}
                />
                <StatCard
                  label={language === 'ar' ? 'المنتج الأكثر مبيعاً' : 'Top Selling Item'}
                  value={salesReport?.summary.top_selling_product || (language === 'ar' ? 'لا يوجد مبيعات' : 'None')}
                  icon="stars"
                  accent="#ffaa00"
                  index={2}
                />
                <StatCard
                  label={language === 'ar' ? 'تنبيهات المخزون' : 'Stock Alerts'}
                  value={
                    language === 'ar'
                      ? `${salesReport?.summary.out_of_stock_count ?? 0} نافذ / ${salesReport?.summary.low_stock_count ?? 0} منخفض`
                      : `${salesReport?.summary.out_of_stock_count ?? 0} Out / ${salesReport?.summary.low_stock_count ?? 0} Low`
                  }
                  icon="warning"
                  accent="var(--accent-red)"
                  index={3}
                />
              </div>

              {/* Table Card */}
              <div className="ccms-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                  <h3 className="ccms-eyebrow" style={{ fontSize: '14px', margin: 0, fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}>
                    {language === 'ar' ? 'تفاصيل أداء ومبيعات كل منتج' : 'Product Sales & Stock Breakdown'}
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
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'السعر الفردي' : 'Unit Price'}</th>
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'المخزون المتبقي' : 'Current Stock'}</th>
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'الكمية المباعة' : 'Units Sold'}</th>
                          <th style={{ padding: '12px 16px' }}>{language === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue'}</th>
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
                              <td style={{ padding: '14px 16px' }}>
                                {isOut ? (
                                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '12px', background: 'rgba(255, 68, 102, 0.15)', color: 'var(--accent-red)', border: '1px solid rgba(255, 68, 102, 0.3)' }}>
                                    {language === 'ar' ? 'نفذت الكمية (0)' : 'Out of Stock (0)'}
                                  </span>
                                ) : isLow ? (
                                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '12px', background: 'rgba(255, 170, 0, 0.15)', color: '#ffaa00', border: '1px solid rgba(255, 170, 0, 0.3)' }}>
                                    {language === 'ar' ? `كمية منخفضة (${item.stock})` : `Low Stock (${item.stock})`}
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
                              <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace' }}>
                                {formatCurrency(item.total_revenue)}
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
  onEdit,
  onDelete,
}: {
  product: Product;
  index: number;
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
      {/* Decorative gradient blob */}
      <div
        style={{
          position: 'absolute',
          top: '-30px',
          right: isRtl ? 'auto' : '-30px',
          left: isRtl ? '-30px' : 'auto',
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          background: isOutOfStock
            ? 'radial-gradient(circle, rgba(255,68,102,0.1) 0%, transparent 70%)'
            : isLowStock
              ? 'radial-gradient(circle, rgba(255,170,0,0.1) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(0,194,255,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

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
            {language === 'ar' ? 'تمت الإضافة في ' : 'Added '} {new Date(product.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Stock Status Badge */}
      <div style={{ textAlign: isRtl ? 'right' : 'left' }}>
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
            {language === 'ar' ? 'نفذت الكمية بالكامل' : 'Out of Stock'}
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
            {language === 'ar' ? `كمية منخفضة (${stockNum} قطعة متبقية)` : `Low Stock (${stockNum} left)`}
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
            {language === 'ar' ? `متوفر في المخزون (${stockNum})` : `In Stock (${stockNum})`}
          </span>
        )}
      </div>

      {/* Price & Stock info */}
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
        <span className="ccms-eyebrow">{language === 'ar' ? 'السعر' : 'Price'}</span>
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
      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        <Button
          variant="ghost"
          onClick={onEdit}
          style={{ flex: 1, padding: '8px 12px', fontSize: '11px', minHeight: '34px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px', marginRight: isRtl ? 0 : '6px', marginLeft: isRtl ? '6px' : 0, verticalAlign: 'middle' }}>edit</span>
          {language === 'ar' ? 'تعديل المخزون' : 'Edit Stock'}
        </Button>
        <Button
          variant="danger"
          onClick={onDelete}
          style={{ flex: 1, padding: '8px 12px', fontSize: '11px', minHeight: '34px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px', marginRight: isRtl ? 0 : '6px', marginLeft: isRtl ? '6px' : 0, verticalAlign: 'middle' }}>delete</span>
          {language === 'ar' ? 'حذف' : 'Remove'}
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
  onDone: (payload: { name: string; price: number; stock: number }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
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
