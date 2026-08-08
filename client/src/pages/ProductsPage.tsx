import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { formatCurrency } from '../utils/format';
import type { Product } from '../types';

export default function ProductsPage() {
  const { toast } = useToast();
  const { t, language } = useLanguage();

  const { data: products, loading, refetch } = useAsync(() => dataService.listProducts(), []);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const allProducts = products ?? [];
  const filtered = search.trim()
    ? allProducts.filter((p) => p.name.toLowerCase().includes(search.toLowerCase().trim()))
    : allProducts;

  return (
    <Layout
      title={t('products')}
      subtitle={
        language === 'ar'
          ? `${allProducts.length} منتجات بوفيه متاحة حالياً`
          : `${allProducts.length} café product${allProducts.length === 1 ? '' : 's'} available`
      }
      actions={
        <Button
          onClick={() => setCreating(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          {language === 'ar' ? 'إضافة منتج' : 'Add Product'}
        </Button>
      }
    >
      {loading ? (
        <LoadingSpinner label={t('loading')} />
      ) : allProducts.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon="local_cafe"
            title={language === 'ar' ? 'لا توجد منتجات' : 'No products yet'}
            description={language === 'ar' ? 'أضف أول منتج كافيه لبدء البيع.' : 'Add your first café product to start selling.'}
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
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

      {/* Create modal */}
      {creating && (
        <ProductFormModal
          title={language === 'ar' ? 'إضافة منتج جديد' : 'Add New Product'}
          initial={null}
          onClose={() => setCreating(false)}
          onDone={async (payload) => {
            try {
              await dataService.createProduct(payload as { name: string; price: number });
              toast(language === 'ar' ? 'تم إضافة المنتج' : 'Product added', 'success');
              refetch();
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
          title={language === 'ar' ? `تعديل · ${editing.name}` : `Edit · ${editing.name}`}
          initial={editing}
          onClose={() => setEditing(null)}
          onDone={async (payload) => {
            try {
              await dataService.updateProduct(editing.id, payload);
              toast(language === 'ar' ? 'تم تحديث المنتج' : 'Product updated', 'success');
              refetch();
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
                    refetch();
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
          background: 'radial-gradient(circle, rgba(0,194,255,0.08) 0%, transparent 70%)',
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
            background: 'rgba(0, 194, 255, 0.08)',
            border: '1px solid rgba(0, 194, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '22px', color: 'var(--accent-cyan)' }}
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

      {/* Price */}
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
          {language === 'ar' ? 'تعديل' : 'Edit'}
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
  onDone: (payload: { name: string; price: number }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [loading, setLoading] = useState(false);
  const { t, language } = useLanguage();

  const isValid = name.trim() && price.trim() && !Number.isNaN(parseFloat(price)) && parseFloat(price) >= 0;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onDone({
        name: name.trim(),
        price: parseFloat(price),
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
            {initial ? t('save') : (language === 'ar' ? 'إضافة منتج' : 'Add Product')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input
          label={language === 'ar' ? 'اسم المنتج' : 'Product Name'}
          placeholder={language === 'ar' ? 'مثال: قهوة تركي' : 'e.g. Turkish Coffee'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Input
          label={language === 'ar' ? 'السعر ($)' : 'Price ($)'}
          type="number"
          step="0.01"
          min="0"
          placeholder="e.g. 2.50"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
    </Modal>
  );
}
