import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useSystemSettings } from '../context/SystemSettingsContext';
import { useTheme } from '../context/ThemeContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { DEVICE_TYPE_META } from '../utils/constants';
import { formatCurrency } from '../utils/format';
import { DeviceFormModal } from '../components/DeviceFormModal';
import type { Device, DeviceType } from '../types';

export default function SettingsPage() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const { data: devices, loading, refetch } = useAsync(() => dataService.listDevices(), []);
  const [editing, setEditing] = useState<Device | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Device | null>(null);

  const allDevices = devices ?? [];

  return (
    <Layout
      title={t('settings')}
      subtitle={language === 'ar' ? 'لوحة التحكم الأمنية للمدير — إدارة الأجهزة، الأسعار، وإعدادات النظام.' : 'Admin control console — manage terminal nodes, rates, and fleet permissions'}
      actions={
        <Button
          onClick={() => setCreating(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            width: isMobile ? '100%' : 'auto',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          {language === 'ar' ? 'إضافة جهاز جديد' : 'Add Device'}
        </Button>
      }
    >
      <ThemeSettingsSection />
      <SystemBrandingSection />
      <PaymentSettingsSection />

      {loading ? (
        <LoadingSpinner label={t('loading')} />
      ) : allDevices.length === 0 ? (
        <div className="ccms-card">
          <EmptyState
            icon="settings"
            title={language === 'ar' ? 'لا توجد أجهزة مضافة' : 'No devices configured'}
            description={language === 'ar' ? 'أضف أول جهاز بالشبكة لبدء إدارته والتحكم به.' : 'Add your first device to start managing the café.'}
            action={<Button onClick={() => setCreating(true)}>{language === 'ar' ? 'إضافة جهاز' : 'Add Device'}</Button>}
          />
        </div>
      ) : (
        <>
          <Card style={{ overflow: 'hidden', marginBottom: '24px' }}>
            <div style={{ padding: isMobile ? '16px' : '20px 24px', borderBottom: '1px solid var(--border-default)' }}>
              <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: isMobile ? '16px' : '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {language === 'ar' ? 'سجل الأجهزة المفصل' : 'Node Registry'}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                {allDevices.length} {language === 'ar' ? 'أجهزة مسجلة في أسطول الصالة النشط' : `node${allDevices.length === 1 ? '' : 's'} registered in the active fleet`}
              </p>
            </div>
            <Table
              columns={[
                {
                  key: 'name',
                  header: language === 'ar' ? 'معرّف الجهاز' : 'Node Identifier',
                  render: (d: Device) => (
                    <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent-cyan)' }}>
                        {d.type === 'pc' ? 'desktop_windows' : d.type === 'console' ? 'sports_esports' : d.type === 'vr' ? 'smart_display' : 'sports_tennis'}
                      </span>
                      {d.name}
                    </strong>
                  ),
                },
                {
                  key: 'type',
                  header: language === 'ar' ? 'النوع' : 'Category',
                  render: (d: Device) => {
                    if (language === 'ar') {
                      if (d.type === 'pc') return 'كمبيوتر مكتبى';
                      if (d.type === 'console') return 'جهاز كونسول';
                      if (d.type === 'table') return 'طربيزة';
                      return 'شاشة ذكية';
                    }
                    return DEVICE_TYPE_META[d.type].label;
                  },
                },
                {
                  key: 'status',
                  header: language === 'ar' ? 'حالة الاتصال' : 'Encryption Link',
                  render: (d: Device) => <StatusBadge status={d.status} />,
                },
                {
                  key: 'rate',
                  header: language === 'ar' ? 'سعر الساعة الأساسي' : 'Base Rate ($/hr)',
                  align: 'right',
                  render: (d: Device) => (
                    <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {formatCurrency(d.hourly_rate)}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (d: Device) => (
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Button
                        variant="ghost"
                        onClick={() => setEditing(d)}
                        style={{ padding: '6px 14px', fontSize: '11px', minHeight: '32px' }}
                      >
                        {t('edit')}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => setDeleting(d)}
                        style={{ padding: '6px 14px', fontSize: '11px', minHeight: '32px' }}
                      >
                        {t('delete')}
                      </Button>
                    </div>
                  ),
                },
              ]}
              data={allDevices}
              rowKey={(d) => d.id}
            />
          </Card>
        </>
      )}

      {/* Edit modal */}
      {editing && (
        <DeviceFormModal
          title={language === 'ar' ? `تعديل الجهاز · ${editing.name}` : `Edit Node · ${editing.name}`}
          initial={editing}
          onClose={() => setEditing(null)}
          onDone={async (patch) => {
            try {
              await dataService.updateDevice(editing.id, patch);
              toast(language === 'ar' ? 'تم تحديث بيانات الجهاز بنجاح' : 'Device updated', 'success');
              refetch();
              setEditing(null);
            } catch (err) {
              toast(apiErrorMessage(err, 'Could not update'), 'error');
            }
          }}
        />
      )}

      {/* Create modal */}
      {creating && (
        <DeviceFormModal
          title={language === 'ar' ? 'تسجيل جهاز جديد' : 'Register Node'}
          initial={null}
          onClose={() => setCreating(false)}
          onDone={async (patch) => {
            try {
              await dataService.createDevice(patch as { name: string; type: DeviceType; hourly_rate: number; specs?: Record<string, string> });
              toast(language === 'ar' ? 'تم إضافة الجهاز بنجاح' : 'Device added', 'success');
              refetch();
              setCreating(false);
            } catch (err) {
              toast(apiErrorMessage(err, 'Could not create device'), 'error');
            }
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleting && (
        <Modal
          open
          title={language === 'ar' ? 'إزالة الجهاز' : 'Remove Node'}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>{t('cancel')}</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await dataService.deleteDevice(deleting.id);
                    toast(language === 'ar' ? 'تمت إزالة الجهاز بنجاح' : 'Device removed', 'success');
                    refetch();
                    setDeleting(null);
                  } catch (err) {
                    toast(apiErrorMessage(err, 'Could not delete'), 'error');
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
              ? `هل أنت متأكد من رغبتك في إزالة الجهاز (${deleting.name}) من النظام؟`
              : `Are you sure you want to remove device (${deleting.name}) from the system?`}
          </p>
        </Modal>
      )}
    </Layout>
  );
}

function SystemBrandingSection() {
  const { systemName, systemLogoUrl, updateSystemSettings } = useSystemSettings();
  const { toast } = useToast();
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const isAr = language === 'ar';

  const [name, setName] = useState(systemName);
  const [logoUrl, setLogoUrl] = useState(systemLogoUrl);

  const handleSave = () => {
    updateSystemSettings(name, logoUrl);
    toast(isAr ? 'تم حفظ إعدادات اسم النظام وشعار المحل بنجاح' : 'System identity & cyber logo updated successfully', 'success');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast(isAr ? 'حجم الصورة كبير جداً (الحد الأقصى 2 ميجابايت)' : 'Image too large (max 2MB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <Card style={{ padding: isMobile ? '16px' : '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border-default)', paddingBottom: '16px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '22px', color: 'var(--accent-cyan)', marginTop: '2px' }}>
          badge
        </span>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: isMobile ? '16px' : '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {isAr ? 'إعدادات هوية النظام وصورة المحل' : 'System Identity & Cyber Logo'}
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0, lineHeight: 1.5 }}>
            {isAr ? 'تحديد اسم المحل/السايبر وشعار الواجهة الرسمي ليظهر في كافة شاشات ولوحات التحكم.' : 'Customize your cafe name and brand logo across all system terminals.'}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 280px', gap: isMobile ? '20px' : '24px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label={isAr ? 'اسم النظام / المحل' : 'System / Cafe Name'}
            placeholder="e.g. Cyber Zone, Pro Gaming Cafe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isAr ? 'صورة / شعار المحل' : 'Cyber Logo Image'}
            </label>
            <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
              <Input
                placeholder="https://example.com/logo.png or upload image"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                style={{ flex: 1, minWidth: 0, width: '100%' }}
              />
              <label
                className="ccms-btn ccms-btn-ghost"
                style={{
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  minHeight: '42px',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload_file</span>
                {isAr ? 'رفع صورة' : 'Upload'}
                <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '8px' }}>
            <Button
              onClick={handleSave}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
              {isAr ? 'حفظ إعدادات الهوية' : 'Save Identity Settings'}
            </Button>
          </div>
        </div>

        {/* Live Brand Preview Card */}
        <div
          style={{
            padding: isMobile ? '16px' : '20px',
            borderRadius: '12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: '12px',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {isAr ? 'معاينة الشعار المباشرة' : 'Live Brand Preview'}
          </span>
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '16px',
              background: 'var(--bg-surface)',
              border: '1px solid rgba(0, 194, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: '0 0 16px rgba(0, 194, 255, 0.15)',
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: '34px', color: 'var(--accent-cyan)' }}>
                storefront
              </span>
            )}
          </div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 700, color: 'var(--accent-cyan)', wordBreak: 'break-word', maxWidth: '100%' }}>
            {name || 'CCMS'}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PaymentSettingsSection() {
  const { walletQrUrl, walletPhoneNumber, bankDetails, updatePaymentSettings } = useSystemSettings();
  const { toast } = useToast();
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const isAr = language === 'ar';

  const [qrUrl, setQrUrl] = useState(walletQrUrl);
  const [phone, setPhone] = useState(walletPhoneNumber);
  const [bank, setBank] = useState(bankDetails);

  const handleSave = () => {
    updatePaymentSettings(qrUrl, phone, bank);
    toast(
      isAr 
        ? 'تم حفظ إعدادات الدفع الإلكتروني والمحفظة بنجاح' 
        : 'Payment & e-wallet settings saved successfully', 
      'success'
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast(isAr ? 'حجم الصورة كبير جداً (الحد الأقصى 3 ميجابايت)' : 'Image too large (max 3MB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setQrUrl(reader.result);
        toast(isAr ? 'تم تحميل صورة QR بنجاح' : 'QR code image loaded', 'info');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLoadSample = () => {
    setQrUrl('/vodafone-qr-sample.jpg');
    toast(isAr ? 'تم تحميل صورة QR فودافون كاش النموذجية' : 'Sample Vodafone QR loaded', 'info');
  };

  const handleClearQr = () => {
    setQrUrl('');
    toast(isAr ? 'تم إزالة صورة QR (الديفولت فارغة)' : 'Cleared QR image (default empty)', 'info');
  };

  return (
    <Card style={{ padding: isMobile ? '16px' : '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border-default)', paddingBottom: '16px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '22px', color: 'var(--accent-green)', marginTop: '2px' }}>
          qr_code_2
        </span>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: isMobile ? '16px' : '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {isAr ? 'إعدادات المحفظة الإلكترونية وطرق الدفع' : 'E-Wallet & Digital Payment Settings'}
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0, lineHeight: 1.5 }}>
            {isAr 
              ? 'تخصيص صورة QR كود فودافون كاش / المحفظة ورقم التحويل وتفاصيل البنك التي تظهر للعميل والكاشير أثناء السداد.' 
              : 'Configure Vodafone Cash / E-Wallet QR code, wallet phone number, and bank transfer details.'}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: isMobile ? '20px' : '24px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* QR Image Input */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isAr ? 'صورة QR كود المحفظة (فودافون كاش / اتصالات / أورانج / وي)' : 'E-Wallet QR Code Image'}
            </label>
            <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
              <Input
                placeholder={isAr ? 'رابط الصورة أو ارفع صورة من الجهاز (الديفولت فارغة)' : 'Image URL or upload image (default is empty)'}
                value={qrUrl}
                onChange={(e) => setQrUrl(e.target.value)}
                style={{ flex: 1, minWidth: 0, width: '100%' }}
              />
              <label
                className="ccms-btn ccms-btn-ghost"
                style={{
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  minHeight: '42px',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload_file</span>
                {isAr ? 'رفع صورة QR' : 'Upload QR'}
                <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
            
            {/* Quick Helper buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ccms-btn ccms-btn-ghost"
                onClick={handleLoadSample}
                style={{
                  fontSize: '11px',
                  padding: '6px 12px',
                  color: 'var(--accent-cyan)',
                  flex: isMobile ? '1 1 auto' : 'initial',
                  justifyContent: 'center',
                  minHeight: '34px',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>qr_code_scanner</span>
                {isAr ? 'استخدام صورة فودافون كاش المرفقة' : 'Use Attached Vodafone QR'}
              </button>
              {qrUrl && (
                <button
                  type="button"
                  className="ccms-btn ccms-btn-ghost"
                  onClick={handleClearQr}
                  style={{
                    fontSize: '11px',
                    padding: '6px 12px',
                    color: 'var(--accent-red)',
                    flex: isMobile ? '1 1 auto' : 'initial',
                    justifyContent: 'center',
                    minHeight: '34px',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
                  {isAr ? 'تعيين فارغة (الديفولت)' : 'Clear (Default Empty)'}
                </button>
              )}
            </div>
          </div>

          {/* Wallet Phone Number */}
          <Input
            label={isAr ? 'رقم محفظة فودافون كاش / الهاتف' : 'Wallet Phone Number'}
            placeholder={isAr ? 'مثال: 01012345678' : 'e.g. 01012345678'}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          {/* Bank Transfer / InstaPay details */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isAr ? 'تفاصيل التحويل البنكي / InstaPay' : 'Bank Transfer & InstaPay Details'}
            </label>
            <textarea
              className="ccms-input"
              rows={3}
              placeholder={isAr ? 'مثال: البنك الأهلي المصري | InstaPay: cyber@instapay | حساب رقم: 12345678' : 'Bank name, IBAN, InstaPay handle...'}
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              style={{ width: '100%', resize: 'vertical', fontFamily: isAr ? 'Cairo, sans-serif' : 'inherit' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '8px' }}>
            <Button
              onClick={handleSave}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
              {isAr ? 'حفظ إعدادات الدفع' : 'Save Payment Settings'}
            </Button>
          </div>
        </div>

        {/* Live Wallet QR Preview Card */}
        <div
          style={{
            padding: isMobile ? '16px' : '20px',
            borderRadius: '12px',
            background: 'var(--bg-elevated)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '12px',
            width: '100%',
            maxWidth: '100%',
            boxShadow: '0 0 20px rgba(34, 197, 94, 0.08)',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>account_balance_wallet</span>
            {isAr ? 'معاينة شاشة السداد للمحفظة' : 'Wallet Checkout Preview'}
          </div>

          <div
            style={{
              width: isMobile ? '160px' : '180px',
              height: isMobile ? '160px' : '180px',
              borderRadius: '12px',
              background: '#FFFFFF',
              border: '2px solid var(--accent-green)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
          >
            {qrUrl ? (
              <img src={qrUrl} alt="Wallet QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#666', gap: '6px', textAlign: 'center', padding: '10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '40px', color: '#888' }}>
                  qr_code_2_add
                </span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#444', whiteSpace: 'pre-line' }}>
                  {isAr ? 'الديفولت فارغة\n(قم برفع صورة الـ QR)' : 'Default Empty\n(Upload QR Code)'}
                </span>
              </div>
            )}
          </div>

          {phone && (
            <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace', maxWidth: '100%', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>phone_iphone</span>
              {phone}
            </div>
          )}

          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
            {isAr 
              ? 'هكذا ستظهر للعميل أو الكاشير عند تحديد طريقة الدفع: محفظة إلكترونية.' 
              : 'This QR will be displayed to customers when paying via E-Wallet.'}
          </span>
        </div>
      </div>
    </Card>
  );
}

function ThemeSettingsSection() {
  const { theme, setTheme, fontScale, iconScale, setFontScale, setIconScale, resetVisualScale } = useTheme();
  const { language, t } = useLanguage();
  const isMobile = useIsMobile();
  const isAr = language === 'ar';

  const fontPresets = [
    { label: isAr ? 'صغير' : 'Compact', value: 85 },
    { label: isAr ? 'افتراضي' : 'Default', value: 100 },
    { label: isAr ? 'كبير' : 'Large', value: 115 },
    { label: isAr ? 'كبير جداً' : 'X-Large', value: 130 },
  ];

  const iconPresets = [
    { label: isAr ? 'مصغر' : 'Small', value: 85 },
    { label: isAr ? 'افتراضي' : 'Default', value: 100 },
    { label: isAr ? 'مكبر' : 'Large', value: 115 },
    { label: isAr ? 'بارز' : 'X-Large', value: 130 },
  ];

  return (
    <Card style={{ padding: isMobile ? '16px' : '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border-default)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '22px', color: 'var(--accent-cyan)' }}>
            palette
          </span>
          <div>
            <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: isMobile ? '16px' : '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {t('visual_scaling_title')}
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
              {t('visual_scaling_desc')}
            </p>
          </div>
        </div>
        {(fontScale !== 100 || iconScale !== 100) && (
          <button
            onClick={resetVisualScale}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--accent-red)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              width: isMobile ? '100%' : 'auto',
              minHeight: '36px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>restart_alt</span>
            {t('reset_scaling')}
          </button>
        )}
      </div>

      {/* Dark / Light Theme Mode Selectors */}
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
        {isAr ? 'نمط الواجهة (أسود / أبيض)' : 'Visual Mode (Dark / Light)'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: isMobile ? '24px' : '32px' }}>
        <div
          onClick={() => setTheme('dark')}
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            background: 'var(--bg-base)',
            border: theme === 'dark' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-default)',
            boxShadow: theme === 'dark' ? 'var(--shadow-glow)' : 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            transition: 'all 0.2s ease',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'rgba(0, 194, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>dark_mode</span>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isAr ? 'الوضع الداكن (أسود)' : 'Dark Mode'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {isAr ? 'النمط السايبر الداكن المميز' : 'Default Cyberpunk Aesthetic'}
            </div>
          </div>
        </div>

        <div
          onClick={() => setTheme('light')}
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            background: 'var(--bg-base)',
            border: theme === 'light' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-default)',
            boxShadow: theme === 'light' ? 'var(--shadow-glow)' : 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            transition: 'all 0.2s ease',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--accent-cyan-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>light_mode</span>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isAr ? 'الوضع الفاتح (أبيض)' : 'Light Mode'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {isAr ? 'نمط النهار الفاتح والنقي' : 'Clean & Crisp Daytime Mode'}
            </div>
          </div>
        </div>
      </div>

      {/* Visual Precision Controls Section */}
      <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: isMobile ? '16px' : '28px' }}>

          {/* Font Scale Precision Control */}
          <div style={{ background: 'var(--bg-base)', padding: isMobile ? '16px' : '20px', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--accent-cyan)' }}>format_size</span>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{t('font_scale')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="number"
                  min={70}
                  max={160}
                  value={fontScale}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setFontScale(val);
                  }}
                  style={{
                    width: '60px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-glow)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>%</span>
              </div>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={75}
              max={150}
              step={1}
              value={fontScale}
              onChange={(e) => setFontScale(Number(e.target.value))}
              style={{
                width: '100%',
                accentColor: 'var(--accent-cyan)',
                cursor: 'pointer',
                marginBottom: '14px',
              }}
            />

            {/* Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {fontPresets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setFontScale(preset.value)}
                  style={{
                    padding: '6px 4px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: fontScale === preset.value ? 700 : 500,
                    background: fontScale === preset.value ? 'var(--accent-cyan)' : 'var(--bg-surface)',
                    color: fontScale === preset.value ? '#000' : 'var(--text-secondary)',
                    border: fontScale === preset.value ? 'none' : '1px solid var(--border-default)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Icon Scale Precision Control */}
          <div style={{ background: 'var(--bg-base)', padding: isMobile ? '16px' : '20px', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--accent-cyan)' }}>grid_view</span>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{t('icon_scale')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="number"
                  min={70}
                  max={160}
                  value={iconScale}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setIconScale(val);
                  }}
                  style={{
                    width: '60px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-glow)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>%</span>
              </div>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={75}
              max={150}
              step={1}
              value={iconScale}
              onChange={(e) => setIconScale(Number(e.target.value))}
              style={{
                width: '100%',
                accentColor: 'var(--accent-cyan)',
                cursor: 'pointer',
                marginBottom: '14px',
              }}
            />

            {/* Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {iconPresets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setIconScale(preset.value)}
                  style={{
                    padding: '6px 4px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: iconScale === preset.value ? 700 : 500,
                    background: iconScale === preset.value ? 'var(--accent-cyan)' : 'var(--bg-surface)',
                    color: iconScale === preset.value ? '#000' : 'var(--text-secondary)',
                    border: iconScale === preset.value ? 'none' : '1px solid var(--border-default)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Live Interactive Preview Box */}
        <div style={{ marginTop: '20px', background: 'var(--bg-surface)', borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: '1px dashed var(--border-glow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>preview</span>
              {t('live_preview')}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
              {isAr ? `الخط: ${fontScale}% | الأيقونات: ${iconScale}%` : `Font: ${fontScale}% | Icons: ${iconScale}%`}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '16px', flexWrap: 'wrap', background: 'var(--bg-base)', padding: isMobile ? '12px' : '16px', borderRadius: '10px', transition: 'all 0.15s ease' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent-cyan)', fontSize: `${24 * (iconScale / 100)}px`, flexShrink: 0 }}>
              sports_esports
            </span>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: `${14 * (fontScale / 100)}px`, wordBreak: 'break-word' }}>
                {isAr ? 'جهاز VIP-01 (PlayStation 5)' : 'Device VIP-01 (PlayStation 5)'}
              </div>
              <div style={{ color: 'var(--text-secondary)', marginTop: '2px', fontSize: `${12 * (fontScale / 100)}px` }}>
                {isAr ? 'الجلسة نشطة — الوقت المتبقي: 01:45:00' : 'Session Active — Time Remaining: 01:45:00'}
              </div>
            </div>
            <div style={{ marginLeft: isAr ? 'none' : 'auto', marginRight: isAr ? 'auto' : 'none', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ padding: '4px 8px', borderRadius: '20px', background: 'rgba(34, 197, 94, 0.15)', color: 'var(--accent-green)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: `${11 * (fontScale / 100)}px` }}>
                <span className="material-symbols-outlined" style={{ fontSize: `${14 * (iconScale / 100)}px` }}>check_circle</span>
                {isAr ? 'متاح' : 'Available'}
              </span>
              <span style={{ padding: '4px 8px', borderRadius: '20px', background: 'rgba(0, 194, 255, 0.15)', color: 'var(--accent-cyan)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: `${11 * (fontScale / 100)}px` }}>
                <span className="material-symbols-outlined" style={{ fontSize: `${14 * (iconScale / 100)}px` }}>tune</span>
                {isAr ? 'إجبار الحجم' : 'Scaled'}
              </span>
            </div>
          </div>
        </div>

      </div>
    </Card>
  );
}
