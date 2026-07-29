import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useSystemSettings } from '../context/SystemSettingsContext';
import { useTheme } from '../context/ThemeContext';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';
import { DEVICE_TYPE_META } from '../utils/constants';
import { formatCurrency } from '../utils/format';
import type { Device, DeviceType } from '../types';

export default function SettingsPage() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
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
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          {language === 'ar' ? 'إضافة جهاز' : 'Add Device'}
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
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-default)' }}>
              <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {language === 'ar' ? 'سجل الأجهزة المفصل' : 'Node Registry'}
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
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
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
                        {d.type === 'pc' ? 'desktop_windows' : d.type === 'console' ? 'sports_esports' : 'smart_display'}
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
                      {d.status !== 'in_use' && (
                        <Button
                          variant="danger"
                          onClick={() => setDeleting(d)}
                          style={{ padding: '6px 14px', fontSize: '11px', minHeight: '32px' }}
                        >
                          {t('delete')}
                        </Button>
                      )}
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
              ? `هل أنت متأكد من رغبتك في حذف الجهاز ${deleting.name} نهائياً؟ سيتم حذفه من قاعدة البيانات بالكامل.`
              : `Are you sure you want to remove node ${deleting.name}? This device will be permanently deleted from the database.`}
          </p>
        </Modal>
      )}
    </Layout>
  );
}

function DeviceFormModal({
  title,
  initial,
  onClose,
  onDone,
}: {
  title: string;
  initial: Device | null;
  onClose: () => void;
  onDone: (patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<DeviceType>(initial?.type ?? 'pc');
  const [hourlyRate, setHourlyRate] = useState(String(initial?.hourly_rate ?? '5'));
  const [hourlyRateMulti, setHourlyRateMulti] = useState(String(initial?.hourly_rate_multi ?? '5'));
  const [specsCpu, setSpecsCpu] = useState((initial?.specs as Record<string, string>)?.CPU ?? '');
  const [specsGpu, setSpecsGpu] = useState((initial?.specs as Record<string, string>)?.GPU ?? '');
  const [specsRam, setSpecsRam] = useState((initial?.specs as Record<string, string>)?.RAM ?? '');
  const [loading, setLoading] = useState(false);
  const { t, language } = useLanguage();

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const specs: Record<string, string> = {};
      if (specsCpu) specs.CPU = specsCpu;
      if (specsGpu) specs.GPU = specsGpu;
      if (specsRam) specs.RAM = specsRam;
      const rate = parseFloat(hourlyRate);
      const rateMulti = parseFloat(hourlyRateMulti);
      if (Number.isNaN(rate) || rate < 0 || Number.isNaN(rateMulti) || rateMulti < 0) {
        throw new Error('Invalid hourly rate');
      }
      const patch: Record<string, unknown> = {
        name,
        type,
        hourly_rate: rate,
        hourly_rate_multi: rateMulti,
        specs: Object.keys(specs).length > 0 ? specs : null,
      };
      await onDone(patch);
    } catch (err) {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const isValid = name.trim() && !Number.isNaN(parseFloat(hourlyRate)) && !Number.isNaN(parseFloat(hourlyRateMulti));

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button loading={loading} disabled={!isValid} onClick={handleSubmit}>
            {initial ? t('save') : (language === 'ar' ? 'تسجيل الجهاز' : 'Add Node')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input label={language === 'ar' ? 'معرّف الجهاز (الاسم)' : 'Node Identifier'} placeholder="e.g. PC-05" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Select label={language === 'ar' ? 'القسم / النوع' : 'Category'} value={type} onChange={(e) => setType(e.target.value as DeviceType)}>
          <option value="pc">{language === 'ar' ? 'كمبيوتر مكتبى (PC)' : 'PC'}</option>
          <option value="console">{language === 'ar' ? 'منصة ألعاب (Console)' : 'Console'}</option>
          <option value="vr">{language === 'ar' ? 'واقع افتراضي (VR)' : 'VR'}</option>
        </Select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label={language === 'ar' ? 'سعر الساعة فردي ($)' : 'Single Rate ($/hr)'}
            type="number"
            step="0.5"
            min="0"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
          />
          <Input
            label={language === 'ar' ? 'سعر الساعة جماعي ($)' : 'Multi Rate ($/hr)'}
            type="number"
            step="0.5"
            min="0"
            value={hourlyRateMulti}
            onChange={(e) => setHourlyRateMulti(e.target.value)}
          />
        </div>
        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '14px' }}>
          <span className="ccms-eyebrow">{language === 'ar' ? 'مواصفات العتاد والقطع (اختياري)' : 'Hardware Specifications (optional)'}</span>
        </div>
        <Input label={language === 'ar' ? 'المعالج (CPU)' : 'CPU'} placeholder="e.g. i5-12400F" value={specsCpu} onChange={(e) => setSpecsCpu(e.target.value)} />
        <Input label={language === 'ar' ? 'كرت الشاشة (GPU)' : 'GPU'} placeholder="e.g. RTX 3060" value={specsGpu} onChange={(e) => setSpecsGpu(e.target.value)} />
        <Input label={language === 'ar' ? 'الذاكرة (RAM)' : 'RAM'} placeholder="e.g. 16GB" value={specsRam} onChange={(e) => setSpecsRam(e.target.value)} />
      </div>
    </Modal>
  );
}

function SystemBrandingSection() {
  const { systemName, systemLogoUrl, updateSystemSettings } = useSystemSettings();
  const { toast } = useToast();
  const { language } = useLanguage();
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
    <Card style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border-default)', paddingBottom: '16px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '24px', color: 'var(--accent-cyan)' }}>
          badge
        </span>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {isAr ? 'إعدادات هوية النظام وصورة المحل' : 'System Identity & Cyber Logo'}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            {isAr ? 'تحديد اسم المحل/السايبر وشعار الواجهة الرسمي ليظهر في كافة شاشات ولوحات التحكم.' : 'Customize your cafe name and brand logo across all system terminals.'}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px', alignItems: 'start' }}>
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
            <div style={{ display: 'flex', gap: '12px' }}>
              <Input
                placeholder="https://example.com/logo.png or upload image"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                style={{ flex: 1 }}
              />
              <label className="ccms-btn ccms-btn-ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>
                {isAr ? 'رفع صورة' : 'Upload'}
                <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '8px' }}>
            <Button onClick={handleSave} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>save</span>
              {isAr ? 'حفظ إعدادات الهوية' : 'Save Identity Settings'}
            </Button>
          </div>
        </div>

        {/* Live Brand Preview Card */}
        <div
          style={{
            padding: '20px',
            borderRadius: '12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: '12px',
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
              <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'var(--accent-cyan)' }}>
                storefront
              </span>
            )}
          </div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '20px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
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
    <Card style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border-default)', paddingBottom: '16px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '24px', color: 'var(--accent-green)' }}>
          qr_code_2
        </span>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {isAr ? 'إعدادات المحفظة الإلكترونية وطرق الدفع' : 'E-Wallet & Digital Payment Settings'}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            {isAr 
              ? 'تخصيص صورة QR كود فودافون كاش / المحفظة ورقم التحويل وتفاصيل البنك التي تظهر للعميل والكاشير أثناء السداد.' 
              : 'Configure Vodafone Cash / E-Wallet QR code, wallet phone number, and bank transfer details.'}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* QR Image Input */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isAr ? 'صورة QR كود المحفظة (فودافون كاش / اتصالات / أورانج / وي)' : 'E-Wallet QR Code Image'}
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Input
                placeholder={isAr ? 'رابط الصورة أو ارفع صورة من الجهاز (الديفولت فارغة)' : 'Image URL or upload image (default is empty)'}
                value={qrUrl}
                onChange={(e) => setQrUrl(e.target.value)}
                style={{ flex: 1, minWidth: '220px' }}
              />
              <label className="ccms-btn ccms-btn-ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>
                {isAr ? 'رفع صورة QR' : 'Upload QR'}
                <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
            
            {/* Quick Helper buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                className="ccms-btn ccms-btn-ghost"
                onClick={handleLoadSample}
                style={{ fontSize: '11px', padding: '4px 10px', color: 'var(--accent-cyan)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>qr_code_scanner</span>
                {isAr ? 'استخدام صورة فودافون كاش المرفقة' : 'Use Attached Vodafone QR'}
              </button>
              {qrUrl && (
                <button
                  type="button"
                  className="ccms-btn ccms-btn-ghost"
                  onClick={handleClearQr}
                  style={{ fontSize: '11px', padding: '4px 10px', color: 'var(--accent-red)' }}
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
            <Button onClick={handleSave} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>save</span>
              {isAr ? 'حفظ إعدادات الدفع' : 'Save Payment Settings'}
            </Button>
          </div>
        </div>

        {/* Live Wallet QR Preview Card */}
        <div
          style={{
            padding: '20px',
            borderRadius: '12px',
            background: 'var(--bg-elevated)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '12px',
            boxShadow: '0 0 20px rgba(34, 197, 94, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>account_balance_wallet</span>
            {isAr ? 'معاينة شاشة السداد للمحفظة' : 'Wallet Checkout Preview'}
          </div>

          <div
            style={{
              width: '180px',
              height: '180px',
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
                <span className="material-symbols-outlined" style={{ fontSize: '48px', color: '#888' }}>
                  qr_code_2_add
                </span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#444' }}>
                  {isAr ? 'الديفولت فارغة\n(قم برفع صورة الـ QR)' : 'Default Empty\n(Upload QR Code)'}
                </span>
              </div>
            )}
          </div>

          {phone && (
            <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, color: 'var(--accent-green)', fontFamily: 'JetBrains Mono, monospace' }}>
              📱 {phone}
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
  const { theme, setTheme } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';

  return (
    <Card style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border-default)', paddingBottom: '16px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '24px', color: 'var(--accent-cyan)' }}>
          palette
        </span>
        <div>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {isAr ? 'إعدادات مظهر الواجهة والوضع (أسود / أبيض)' : 'UI Theme & Visual Mode'}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            {isAr ? 'التبديل الفوري بين الوضع الداكن والوضع الفاتح للنظام بالكامل مع حفظ اختيارك تلقائياً.' : 'Switch between Dark Mode and Light Mode seamlessly across all system screens.'}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div
          onClick={() => setTheme('dark')}
          style={{
            padding: '20px',
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
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: 'rgba(0, 194, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>dark_mode</span>
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
            padding: '20px',
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
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: 'var(--accent-cyan-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>light_mode</span>
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
    </Card>
  );
}
