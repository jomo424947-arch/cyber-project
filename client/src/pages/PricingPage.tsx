import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { dataService } from '../services';
import { formatCurrency } from '../utils/format';
import { apiErrorMessage } from '../services/http';
import type { PricingTier } from '../types';

const TYPE_META: Record<string, { label: string; labelAr: string; icon: string; color: string; gradient: string; description: string; descriptionAr: string }> = {
  pc: {
    label: 'PC Stations',
    labelAr: 'أجهزة الكمبيوتر',
    icon: 'desktop_windows',
    color: 'var(--accent-cyan)',
    gradient: 'linear-gradient(135deg, rgba(0, 194, 255, 0.12) 0%, rgba(0, 112, 255, 0.06) 100%)',
    description: 'PC stations for individual or team play',
    descriptionAr: 'أجهزة الكمبيوتر المكتبية الفردية والجماعية للعب والتصفح',
  },
  console: {
    label: 'Console Stations',
    labelAr: 'أجهزة الكونسول (PS/Xbox)',
    icon: 'sports_esports',
    color: 'var(--accent-purple)',
    gradient: 'linear-gradient(135deg, rgba(54, 38, 206, 0.15) 0%, rgba(139, 92, 246, 0.06) 100%)',
    description: 'Console rooms for single or local multiplayer',
    descriptionAr: 'منصات البلايستيشن والإكس بوكس للعب الفردي والمحلي المشترك',
  },
  vr: {
    label: 'VR Experience',
    labelAr: 'أجهزة الواقع الافتراضي',
    icon: 'vrpano',
    color: 'var(--accent-green)',
    gradient: 'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(16, 185, 129, 0.06) 100%)',
    description: 'Virtual reality pods and immersive gaming',
    descriptionAr: 'مقصورات الواقع الافتراضي والألعاب الانغماسية ثلاثية الأبعاد',
  },
  table: {
    label: 'Table Games',
    labelAr: 'طربيزات الألعاب',
    icon: 'sports_tennis',
    color: 'var(--accent-yellow)',
    gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.06) 100%)',
    description: 'Billiard, ping-pong, and other table games',
    descriptionAr: 'طرابيزات البلياردو والتنس وغيرها من ألعاب الطاولة',
  },
};

export default function PricingPage() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { t, language, isRtl } = useLanguage();
  const [tiers, setTiers] = useState<PricingTier[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTier, setEditingTier] = useState<{ type: string; field: 'hourly_rate' | 'hourly_rate_multi' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Per-device editing
  const [editingDevice, setEditingDevice] = useState<{ id: string; field: 'hourly_rate' | 'hourly_rate_multi' } | null>(null);
  const [deviceEditValue, setDeviceEditValue] = useState('');

  // Expanded per-device sections
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  const fetchPricing = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dataService.getPricing();
      setTiers(data);
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to load pricing'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);

  const handleBulkSave = async (type: string, field: 'hourly_rate' | 'hourly_rate_multi') => {
    const rate = parseFloat(editValue);
    if (isNaN(rate) || rate < 0) {
      toast(language === 'ar' ? 'يرجى إدخال سعر صحيح' : 'Please enter a valid price', 'error');
      return;
    }
    setSaving(true);
    try {
      await dataService.updateBulkPricing(type, { [field]: rate });
      const label = field === 'hourly_rate' 
        ? (language === 'ar' ? 'فردي' : 'Single Player') 
        : (language === 'ar' ? 'جماعي' : 'Multiplayer');
      toast(
        language === 'ar'
          ? `تم تحديث أسعار ${TYPE_META[type]?.labelAr ?? type} (${label}) لتصبح ${formatCurrency(rate)}/ساعة`
          : `Updated all ${TYPE_META[type]?.label ?? type} (${label}) rates to ${formatCurrency(rate)}/hr`, 
        'success'
      );
      setEditingTier(null);
      await fetchPricing();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to update pricing'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeviceSave = async (deviceId: string, field: 'hourly_rate' | 'hourly_rate_multi') => {
    const rate = parseFloat(deviceEditValue);
    if (isNaN(rate) || rate < 0) {
      toast(language === 'ar' ? 'يرجى إدخال سعر صحيح' : 'Please enter a valid price', 'error');
      return;
    }
    setSaving(true);
    try {
      await dataService.updateDevicePricing(deviceId, { [field]: rate });
      toast(language === 'ar' ? 'تم تحديث سعر الجهاز بنجاح' : 'Device price updated', 'success');
      setEditingDevice(null);
      await fetchPricing();
    } catch (err) {
      toast(apiErrorMessage(err, 'Failed to update device pricing'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <Layout title={t('pricing')} subtitle={language === 'ar' ? 'تهيئة أسعار الساعة للأجهزة والأقسام المختلفة.' : 'Configure hourly rates for all device types'}>
        <LoadingSpinner label={t('loading')} />
      </Layout>
    );
  }

  const orderedTypes = ['pc', 'console', 'vr', 'table'];
  const sortedTiers = (tiers ?? []).sort(
    (a, b) => orderedTypes.indexOf(a.type) - orderedTypes.indexOf(b.type)
  );

  return (
    <Layout
      title={t('pricing')}
      subtitle={language === 'ar' ? 'تهيئة أسعار الساعة الفردية والمتعددة لكافة الأجهزة' : 'Configure hourly rates for single & multiplayer'}
      actions={
        <button
          className="ccms-btn ccms-btn-ghost"
          onClick={fetchPricing}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>sync</span>
          {language === 'ar' ? 'تحديث' : 'Refresh'}
        </button>
      }
    >
      {sortedTiers.length === 0 ? (
        <div className="ccms-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'var(--text-muted)', display: 'block', marginBottom: '16px' }}>
            devices
          </span>
          <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            {language === 'ar' ? 'لم يتم العثور على أجهزة' : 'No devices found'}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            {language === 'ar' ? 'أضف أجهزة من صفحة أسطول الأجهزة لتهيئة أسعارها هنا.' : 'Add devices from the Device Fleet page to configure pricing.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {sortedTiers.map((tier, tierIndex) => {
            const meta = TYPE_META[tier.type] ?? {
              label: tier.type.toUpperCase(),
              labelAr: tier.type,
              icon: 'devices',
              color: 'var(--accent-cyan)',
              gradient: 'linear-gradient(135deg, rgba(0, 194, 255, 0.1), transparent)',
              description: '',
              descriptionAr: '',
            };
            const isExpanded = expandedTypes.has(tier.type);

            return (
              <div
                key={tier.type}
                className="ccms-card ccms-stagger"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  animationDelay: `${tierIndex * 100}ms`,
                  borderLeft: isRtl ? 'none' : `3px solid ${meta.color}`,
                  borderRight: isRtl ? `3px solid ${meta.color}` : 'none',
                }}
              >
                {/* Tier Info Header */}
                <div
                  style={{
                    background: meta.gradient,
                    padding: '24px 32px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '14px',
                        background: `${meta.color}15`,
                        border: `1px solid ${meta.color}40`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 0 20px ${meta.color}15`,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '24px', color: meta.color }}>
                        {meta.icon}
                      </span>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                          {language === 'ar' ? meta.labelAr : meta.label}
                        </h2>
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        {language === 'ar' ? meta.descriptionAr : meta.description}
                      </p>
                    </div>
                  </div>

                  <span style={{
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    padding: '4px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}>
                    {tier.device_count} {language === 'ar' ? 'أجهزة مسجلة' : `device${tier.device_count !== 1 ? 's' : ''}`}
                  </span>
                </div>

                {/* Rates Configurations Area */}
                <div style={{ padding: '0 32px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Single Player Row */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid rgba(255,255,255,0.03)',
                    borderRadius: '10px',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--accent-cyan)' }}>person</span>
                        {language === 'ar' ? 'سعر الساعة الفردي (Single)' : 'Single Player Rate'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {language === 'ar' ? 'سعر الساعة المحتسب عند بدء جلسة لعب بنمط فردي' : 'Hourly rate charged when starting a session in Single mode'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {editingTier?.type === tier.type && editingTier?.field === 'hourly_rate' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: isRtl ? 'auto' : '12px', right: isRtl ? '12px' : 'auto', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>$</span>
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleBulkSave(tier.type, 'hourly_rate');
                                if (e.key === 'Escape') setEditingTier(null);
                              }}
                              autoFocus
                              step="0.5"
                              min="0"
                              style={{
                                width: '120px',
                                padding: isRtl ? '10px 24px 10px 12px' : '10px 12px 10px 24px',
                                fontSize: '16px',
                                fontWeight: 700,
                                fontFamily: 'JetBrains Mono, monospace',
                                background: 'var(--bg-input)',
                                border: `2px solid var(--accent-cyan)`,
                                borderRadius: '10px',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                textAlign: isRtl ? 'left' : 'right'
                              }}
                            />
                          </div>
                          <button className="ccms-btn ccms-btn-primary" style={{ minHeight: '40px', padding: '8px 16px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }} onClick={() => handleBulkSave(tier.type, 'hourly_rate')} disabled={saving}>{t('save')}</button>
                          <button className="ccms-btn ccms-btn-ghost" style={{ minHeight: '40px', padding: '8px 12px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }} onClick={() => setEditingTier(null)}>{t('cancel')}</button>
                        </div>
                      ) : (
                        <>
                          <div style={{ textAlign: isRtl ? 'left' : 'right' }}>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {formatCurrency(tier.hourly_rate)}<span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/{language === 'ar' ? 'ساعة' : 'hr'}</span>
                            </div>
                            {!tier.all_same && <span style={{ fontSize: '10px', color: 'var(--accent-yellow)', fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace' }}>{language === 'ar' ? 'أسعار متفاوتة' : 'mixed rates'}</span>}
                          </div>
                          {isAdmin && (
                            <button
                              className="ccms-btn ccms-btn-ghost"
                              style={{ minHeight: '36px', padding: '6px 12px', fontSize: '11px', borderColor: 'rgba(255,255,255,0.08)', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
                              onClick={() => {
                                setEditingTier({ type: tier.type, field: 'hourly_rate' });
                                setEditValue(String(tier.hourly_rate));
                              }}
                            >
                              {t('edit')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Multiplayer Row */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid rgba(255,255,255,0.03)',
                    borderRadius: '10px',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--accent-purple)' }}>group</span>
                        {language === 'ar' ? 'سعر الساعة الجماعي (Multi)' : 'Multiplayer Rate'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {language === 'ar' ? 'سعر الساعة المحتسب عند بدء جلسة لعب بنمط متعدد' : 'Hourly rate charged when starting a session in Multi mode'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {editingTier?.type === tier.type && editingTier?.field === 'hourly_rate_multi' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: isRtl ? 'auto' : '12px', right: isRtl ? '12px' : 'auto', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>$</span>
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleBulkSave(tier.type, 'hourly_rate_multi');
                                if (e.key === 'Escape') setEditingTier(null);
                              }}
                              autoFocus
                              step="0.5"
                              min="0"
                              style={{
                                width: '120px',
                                padding: isRtl ? '10px 24px 10px 12px' : '10px 12px 10px 24px',
                                fontSize: '16px',
                                fontWeight: 700,
                                fontFamily: 'JetBrains Mono, monospace',
                                background: 'var(--bg-input)',
                                border: `2px solid var(--accent-purple)`,
                                borderRadius: '10px',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                textAlign: isRtl ? 'left' : 'right'
                              }}
                            />
                          </div>
                          <button className="ccms-btn ccms-btn-primary" style={{ minHeight: '40px', padding: '8px 16px', background: 'var(--accent-purple)', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }} onClick={() => handleBulkSave(tier.type, 'hourly_rate_multi')} disabled={saving}>{t('save')}</button>
                          <button className="ccms-btn ccms-btn-ghost" style={{ minHeight: '40px', padding: '8px 12px', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }} onClick={() => setEditingTier(null)}>{t('cancel')}</button>
                        </div>
                      ) : (
                        <>
                          <div style={{ textAlign: isRtl ? 'left' : 'right' }}>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '22px', fontWeight: 700, color: 'var(--accent-purple)' }}>
                              {formatCurrency(tier.hourly_rate_multi)}<span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/{language === 'ar' ? 'ساعة' : 'hr'}</span>
                            </div>
                            {!tier.all_same_multi && <span style={{ fontSize: '10px', color: 'var(--accent-yellow)', fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace' }}>{language === 'ar' ? 'أسعار متفاوتة' : 'mixed rates'}</span>}
                          </div>
                          {isAdmin && (
                            <button
                              className="ccms-btn ccms-btn-ghost"
                              style={{ minHeight: '36px', padding: '6px 12px', fontSize: '11px', borderColor: 'rgba(255,255,255,0.08)', fontFamily: isRtl ? 'Cairo, sans-serif' : 'inherit' }}
                              onClick={() => {
                                setEditingTier({ type: tier.type, field: 'hourly_rate_multi' });
                                setEditValue(String(tier.hourly_rate_multi));
                              }}
                            >
                              {t('edit')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expand/Collapse for individual devices */}
                <div style={{ padding: '0', borderBottom: isExpanded ? '1px solid var(--border-default)' : 'none' }}>
                  <button
                    onClick={() => toggleExpand(tier.type)}
                    style={{
                      width: '100%',
                      padding: '12px 32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                      fontFamily: isRtl ? 'Cairo, sans-serif' : 'JetBrains Mono, monospace',
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      transition: 'all 0.2s ease',
                      textAlign: isRtl ? 'right' : 'left',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                        {isExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                      {language === 'ar' ? 'أسعار الأجهزة الفردية التفصيلية' : 'Individual Device Pricing'}
                    </span>
                    <span style={{ fontSize: '10px', opacity: 0.6 }}>
                      {tier.device_count} {language === 'ar' ? 'أجهزة' : `device${tier.device_count !== 1 ? 's' : ''}`}
                    </span>
                  </button>
                </div>

                {/* Per-Device Pricing List */}
                {isExpanded && (
                  <div style={{ padding: '16px 32px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {tier.devices.map((device) => (
                      <div
                        key={device.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          flexWrap: 'wrap',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: meta.color, opacity: 0.6 }}>{meta.icon}</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{device.name}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                          {/* Device Single Rate */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{language === 'ar' ? 'فردي:' : 'Single:'}</span>
                            {editingDevice?.id === device.id && editingDevice?.field === 'hourly_rate' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="number"
                                  value={deviceEditValue}
                                  onChange={(e) => setDeviceEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleDeviceSave(device.id, 'hourly_rate');
                                    if (e.key === 'Escape') setEditingDevice(null);
                                  }}
                                  autoFocus
                                  step="0.5"
                                  min="0"
                                  style={{ width: '80px', padding: '4px 6px', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', background: 'var(--bg-input)', border: '1px solid var(--accent-cyan)', borderRadius: '4px', color: 'var(--text-primary)', textAlign: isRtl ? 'left' : 'right' }}
                                />
                                <button onClick={() => handleDeviceSave(device.id, 'hourly_rate')} style={{ padding: '3px 6px', color: 'var(--accent-green)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check</span>
                                </button>
                                <button onClick={() => setEditingDevice(null)} style={{ padding: '3px 6px', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                                </button>
                              </div>
                            ) : (
                              <>
                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(device.hourly_rate)}/{language === 'ar' ? 'ساعة' : 'hr'}</span>
                                {isAdmin && (
                                  <button
                                    onClick={() => {
                                      setEditingDevice({ id: device.id, field: 'hourly_rate' });
                                      setDeviceEditValue(String(device.hourly_rate));
                                    }}
                                    style={{ padding: '2px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>

                          {/* Device Multi Rate */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{language === 'ar' ? 'جماعي:' : 'Multi:'}</span>
                            {editingDevice?.id === device.id && editingDevice?.field === 'hourly_rate_multi' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="number"
                                  value={deviceEditValue}
                                  onChange={(e) => setDeviceEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleDeviceSave(device.id, 'hourly_rate_multi');
                                    if (e.key === 'Escape') setEditingDevice(null);
                                  }}
                                  autoFocus
                                  step="0.5"
                                  min="0"
                                  style={{ width: '80px', padding: '4px 6px', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', background: 'var(--bg-input)', border: '1px solid var(--accent-purple)', borderRadius: '4px', color: 'var(--text-primary)', textAlign: isRtl ? 'left' : 'right' }}
                                />
                                <button onClick={() => handleDeviceSave(device.id, 'hourly_rate_multi')} style={{ padding: '3px 6px', color: 'var(--accent-green)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check</span>
                                </button>
                                <button onClick={() => setEditingDevice(null)} style={{ padding: '3px 6px', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                                </button>
                              </div>
                            ) : (
                              <>
                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 600, color: 'var(--accent-purple)' }}>{formatCurrency(device.hourly_rate_multi)}/{language === 'ar' ? 'ساعة' : 'hr'}</span>
                                {isAdmin && (
                                  <button
                                    onClick={() => {
                                      setEditingDevice({ id: device.id, field: 'hourly_rate_multi' });
                                      setDeviceEditValue(String(device.hourly_rate_multi));
                                    }}
                                    style={{ padding: '2px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
