import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';

export type PlanType = 'monthly_mobile' | 'monthly_full' | 'quarterly_full' | 'yearly_full' | 'trial';
export type StatusType = 'active' | 'trial' | 'suspended';

export interface SubscriptionPlan {
  id: PlanType;
  name: string;
  subtitle: string;
  price: number;
  currency: string;
  periodText: string;
  durationDays: number;
  badgeColor: string;
  icon: string;
  isMobileOnly?: boolean;
  isPopular?: boolean;
  isBestValue?: boolean;
  description: string;
  features: string[];
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'monthly_mobile',
    name: 'باقة الموبايل الشهرية',
    subtitle: 'تطبيق وإدارة الموبايل فقط',
    price: 199,
    currency: 'ج.م',
    periodText: 'شهرياً',
    durationDays: 30,
    isMobileOnly: true,
    badgeColor: 'indigo',
    icon: 'smartphone',
    description: 'متابعة الصالة والإيرادات والجلسات الحية عن بُعد عبر تطبيق الموبايل المخصص.',
    features: [
      'تطبيق الموبايل للمالك',
      'متابعة الإيرادات والشيفتات الحية',
      'مراقبة حالة الأجهزة والجلسات',
      'لوحة إشعارات وتنبيهات فورية',
    ],
  },
  {
    id: 'monthly_full',
    name: 'الباقة الشهرية الشاملة',
    subtitle: 'شامل كافة مميزات النظام',
    price: 299,
    currency: 'ج.م',
    periodText: 'شهرياً',
    durationDays: 30,
    isPopular: true,
    badgeColor: 'cyan',
    icon: 'desktop_windows',
    description: 'تحكم كامل وشامل لكافة الأجهزة، الغرف، المبيعات والكافتيريا والمزامنة السحابية.',
    features: [
      'تطبيق الديسكتوب + الموبايل معاً',
      'إدارة أجهزة الـ PC والبلايستيشن والغرف',
      'نظام الكاشير والمخزن وحسابات الكافتيريا',
      'مزامنة سحابية غير محدودة للبيانات',
    ],
  },
  {
    id: 'quarterly_full',
    name: 'باقة 3 شهور (الربع سنوية)',
    subtitle: 'توفير 100 ج.م مع ترخيص كامل',
    price: 799,
    currency: 'ج.م',
    periodText: 'لكل 3 شهور',
    durationDays: 90,
    badgeColor: 'emerald',
    icon: 'verified_user',
    description: 'استقرار تشغيلي لمدة 3 أشهر متواصلة مع دعم فني مستمر وأولوية في التحديثات.',
    features: [
      'كافة مميزات الباقة الشاملة',
      'توفير 100 ج.م مقارنة بالتجديد الشهري',
      'أولوية في الدعم الفني السريع',
      'نسخ احتياطي سحابي تلقائي دوري',
    ],
  },
  {
    id: 'yearly_full',
    name: 'الباقة السنوية (VIP الأكثر توفيراً)',
    subtitle: 'أعلى قيمة وأقصى توفير (1999 ج.م)',
    price: 1999,
    currency: 'ج.م',
    periodText: 'سنوياً',
    durationDays: 365,
    isBestValue: true,
    badgeColor: 'amber',
    icon: 'workspace_premium',
    description: 'أفضل استثمار لصالتك لمدة عام كامل بدون قلق التجديد الشهري وبخصم هائل.',
    features: [
      'كافة المميزات مفتوحة بلا حدود',
      'توفير أكثر من 1600 ج.م سنوياً',
      'دعم فني VIP مخصص على مدار 24 ساعة',
      'تحديثات وميزات جديدة مجانية طوال العام',
    ],
  },
  {
    id: 'trial',
    name: 'فترة تجريبية (Trial)',
    subtitle: 'تقييم مجاني لمدة يومين',
    price: 0,
    currency: 'ج.م',
    periodText: 'لمدة يومين',
    durationDays: 2, // 2 days
    badgeColor: 'gray',
    icon: 'timer',
    description: 'فترة تقييم مؤقتة وشاملة للمميزات لاختبار وتجربة النظام بالكامل على أجهزة الصالة.',
    features: [
      'تجربة كامل المميزات لمدة يومين',
      'تفعيل فوري بكود التنشيط السحابي',
      'إمكانية الترقية لأي باقة بسهولة دون فقدان البيانات',
    ],
  },
];

export interface Tenant {
  id: string;
  name: string;
  owner_email: string;
  status: StatusType;
  plan?: PlanType;
  expires_at?: string;
  created_at: string;
}

export default function SuperAdminPage() {
  const [adminSecret, setAdminSecret] = useState(sessionStorage.getItem('ccms_super_admin_key') || '');
  const [showSecret, setShowSecret] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'add' | 'plans'>('list');

  // List States
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StatusType | 'expiring'>('all');
  const [planFilter, setPlanFilter] = useState<'all' | PlanType>('all');

  // Copy Feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);

  // Add Form States
  const [tenantName, setTenantName] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('monthly_full');
  const [selectedStatus, setSelectedStatus] = useState<StatusType>('active');
  const [customExpiryDate, setCustomExpiryDate] = useState<string>('');

  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newTenantInfo, setNewTenantInfo] = useState<{
    id: string;
    name: string;
    owner_email: string;
    pass?: string;
    plan?: PlanType;
    expires_at?: string;
  } | null>(null);

  // Manage / Edit Modal States
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editPlan, setEditPlan] = useState<PlanType>('monthly_full');
  const [editStatus, setEditStatus] = useState<StatusType>('active');
  const [editExpiryDate, setEditExpiryDate] = useState<string>('');
  const [editLoading, setEditLoading] = useState(false);

  // Helper to get plan info
  const getPlanInfo = (planKey?: string): SubscriptionPlan => {
    return SUBSCRIPTION_PLANS.find(p => p.id === planKey) || SUBSCRIPTION_PLANS[1]; // default monthly_full
  };

  // Helper to compute default expiry date string (YYYY-MM-DD)
  const computeExpiryDateForPlan = (planKey: PlanType): string => {
    const plan = getPlanInfo(planKey);
    const d = new Date();
    d.setDate(d.getDate() + plan.durationDays);
    return d.toISOString().split('T')[0];
  };

  // Update custom expiry date when plan changes in Add form
  useEffect(() => {
    setCustomExpiryDate(computeExpiryDateForPlan(selectedPlan));
    if (selectedPlan === 'trial') {
      setSelectedStatus('trial');
    } else if (selectedStatus === 'trial') {
      setSelectedStatus('active');
    }
  }, [selectedPlan]);

  // Save admin secret key to sessionStorage
  const handleSecretChange = (val: string) => {
    setAdminSecret(val);
    sessionStorage.setItem('ccms_super_admin_key', val);
  };

  const handleClearSecret = () => {
    setAdminSecret('');
    sessionStorage.removeItem('ccms_super_admin_key');
    setTenants([]);
    setListError(null);
  };

  const fetchTenants = async () => {
    if (!adminSecret.trim()) {
      setListError('يرجى إدخال رمز المطور السري في الأعلى للاتصال بقواعد بيانات المشتركين.');
      setTenants([]);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const res = await dataService.getTenants(adminSecret.trim());
      if (res.success) {
        setTenants(res.tenants || []);
      }
    } catch (err) {
      setListError(apiErrorMessage(err, 'فشل الاتصال أو جلب المشتركين. تأكد من صحة الرمز السري.'));
      setTenants([]);
    } finally {
      setListLoading(false);
    }
  };

  // Fetch automatically on tab change or secret key presence
  useEffect(() => {
    if (adminSecret.trim()) {
      fetchTenants();
    }
  }, [activeTab]);

  // Quick Password Generator
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setOwnerPassword(pass);
    setShowFormPassword(true);
  };

  // Registration handler
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setNewTenantInfo(null);

    if (!adminSecret.trim()) {
      setAddError('رمز المرور السري للمطور مطلوب للاتصال بالسحابة.');
      return;
    }

    if (!tenantName.trim() || !ownerFullName.trim() || !ownerEmail.trim() || !ownerPassword) {
      setAddError('جميع الحقول مطلوبة لتسجيل الصالة.');
      return;
    }

    setAddLoading(true);
    try {
      const computedExpiry = customExpiryDate ? new Date(customExpiryDate).toISOString() : undefined;

      const res = await dataService.registerTenant({
        tenantName: tenantName.trim(),
        ownerFullName: ownerFullName.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerPassword,
        status: selectedStatus,
        plan: selectedPlan,
        expires_at: computedExpiry,
        secretKey: adminSecret.trim(),
      });

      if (res.success) {
        setNewTenantInfo({
          ...res.tenant,
          pass: ownerPassword,
          plan: selectedPlan,
          expires_at: computedExpiry,
        });
        setTenantName('');
        setOwnerFullName('');
        setOwnerEmail('');
        setOwnerPassword('');
        // Refresh list
        fetchTenants();
      }
    } catch (err) {
      setAddError(apiErrorMessage(err, 'فشل تسجيل المشترك الجديد. يرجى التحقق من الرمز السري والبيانات.'));
    } finally {
      setAddLoading(false);
    }
  };

  // Quick status toggle
  const handleQuickStatusChange = async (tenantId: string, newStatus: StatusType) => {
    if (!adminSecret.trim()) return;
    setUpdatingId(tenantId);
    try {
      const res = await dataService.updateTenantStatus(tenantId, { status: newStatus }, adminSecret.trim());
      if (res.success) {
        setTenants(prev =>
          prev.map(t => (t.id === tenantId ? { ...t, status: newStatus } : t))
        );
      }
    } catch (err) {
      alert(apiErrorMessage(err, 'تعذر تحديث حالة الاشتراك.'));
    } finally {
      setUpdatingId(null);
    }
  };

  // Open Edit/Renewal Modal
  const openEditModal = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setEditPlan(tenant.plan || (tenant.status === 'trial' ? 'trial' : 'monthly_full'));
    setEditStatus(tenant.status);
    if (tenant.expires_at) {
      setEditExpiryDate(new Date(tenant.expires_at).toISOString().split('T')[0]);
    } else {
      setEditExpiryDate(computeExpiryDateForPlan(tenant.plan || 'monthly_full'));
    }
  };

  // Quick extend helper inside modal (+30 days, +90 days, +365 days, +2 days)
  const addDaysToEditExpiry = (days: number) => {
    const base = editExpiryDate ? new Date(editExpiryDate) : new Date();
    const start = base.getTime() < Date.now() ? new Date() : base;
    start.setDate(start.getDate() + days);
    setEditExpiryDate(start.toISOString().split('T')[0]);
  };

  // Save Modal Updates
  const handleSaveTenantEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant || !adminSecret.trim()) return;

    setEditLoading(true);
    try {
      const computedExpiry = editExpiryDate ? new Date(editExpiryDate).toISOString() : undefined;
      const res = await dataService.updateTenantStatus(
        editingTenant.id,
        {
          status: editStatus,
          plan: editPlan,
          expires_at: computedExpiry,
        },
        adminSecret.trim()
      );

      if (res.success) {
        setTenants(prev =>
          prev.map(t =>
            t.id === editingTenant.id
              ? {
                ...t,
                status: editStatus,
                plan: editPlan,
                expires_at: computedExpiry,
              }
              : t
          )
        );
        setEditingTenant(null);
      }
    } catch (err) {
      alert(apiErrorMessage(err, 'فشل حفظ تعديلات الاشتراك.'));
    } finally {
      setEditLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Formatted Activation Snippet for Clipboard or WhatsApp
  const generateActivationText = (tenant: Tenant) => {
    const planInfo = getPlanInfo(tenant.plan);
    const dateFormatted = new Date(tenant.created_at).toLocaleDateString('ar-EG');
    const expiryFormatted = tenant.expires_at
      ? new Date(tenant.expires_at).toLocaleDateString('ar-EG')
      : 'غير محدد';
    const statusLabel =
      tenant.status === 'active'
        ? '✅ نشط ومفعّل'
        : tenant.status === 'trial'
          ? '⏳ فترة تجريبية (يومين)'
          : '⛔ معطل';

    return (
      `🌟 *بيانات ترخيص برنامج الصالة (CCMS Cloud)* 🌟\n\n` +
      `🏢 *اسم الصالة:* ${tenant.name}\n` +
      `📦 *نوع الباقة:* ${planInfo.name} (${planInfo.price} ${planInfo.currency} - ${planInfo.subtitle})\n` +
      `🛡️ *حالة الاشتراك:* ${statusLabel}\n` +
      `📅 *تاريخ التسجيل:* ${dateFormatted}\n` +
      `⏳ *تاريخ انتهاء الصلاحية:* ${expiryFormatted}\n\n` +
      `🔑 *كود التنشيط السحابي (Tenant ID):*\n\`${tenant.id}\`\n\n` +
      `👤 *البريد الإلكتروني للحساب:* ${tenant.owner_email}\n\n` +
      `📌 *طريقة التفعيل:* افتح البرنامج واضغط على "تنشيط الصالة"، ثم الصق كود التنشيط (Tenant ID) لتبدأ بالعمل فوراً.`
    );
  };

  const copyActivationSnippet = (tenant: Tenant) => {
    const message = generateActivationText(tenant);
    navigator.clipboard.writeText(message);
    setCopiedSnippetId(tenant.id);
    setTimeout(() => setCopiedSnippetId(null), 2500);
  };

  const shareViaWhatsApp = (tenant: Tenant) => {
    const message = generateActivationText(tenant);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // Helper to calculate days remaining
  const calculateDaysRemaining = (expiresAt?: string) => {
    if (!expiresAt) return null;
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  // Export List to CSV
  const exportToCSV = () => {
    if (tenants.length === 0) return;
    let csv = '\uFEFFاسم الصالة,البريد الإلكتروني,معرف المشترك (Tenant ID),الباقة,السعر,الحالة,تاريخ الانتهاء,تاريخ التسجيل\n';
    tenants.forEach(t => {
      const plan = getPlanInfo(t.plan);
      const statusLabel = t.status === 'active' ? 'نشط' : t.status === 'trial' ? 'تجريبي' : 'معطل';
      const createdDate = new Date(t.created_at).toLocaleDateString('ar-EG');
      const expiryDate = t.expires_at ? new Date(t.expires_at).toLocaleDateString('ar-EG') : 'غير محدد';
      csv += `"${t.name}","${t.owner_email}","${t.id}","${plan.name}","${plan.price} ${plan.currency}","${statusLabel}","${expiryDate}","${createdDate}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `CCMS_Subscribers_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  // Filtered tenants
  const filteredTenants = useMemo(() => {
    return tenants.filter(t => {
      let matchesStatus = true;
      if (statusFilter === 'expiring') {
        const days = calculateDaysRemaining(t.expires_at);
        matchesStatus = days !== null && days <= 5 && days >= 0;
      } else if (statusFilter !== 'all') {
        matchesStatus = t.status === statusFilter;
      }

      const currentPlan = t.plan || (t.status === 'trial' ? 'trial' : 'monthly_full');
      const matchesPlan = planFilter === 'all' || currentPlan === planFilter;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.owner_email.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q);

      return matchesStatus && matchesPlan && matchesSearch;
    });
  }, [tenants, searchQuery, statusFilter, planFilter]);

  // Statistics & KPIs
  const stats = useMemo(() => {
    const total = tenants.length;
    const active = tenants.filter(t => t.status === 'active').length;
    const trial = tenants.filter(t => t.status === 'trial').length;
    const suspended = tenants.filter(t => t.status === 'suspended').length;
    const activePercent = total > 0 ? Math.round((active / total) * 100) : 0;

    let estimatedMRR = 0;
    tenants.forEach(t => {
      if (t.status === 'active') {
        const plan = getPlanInfo(t.plan);
        if (plan.id === 'monthly_mobile') estimatedMRR += 199;
        else if (plan.id === 'monthly_full') estimatedMRR += 299;
        else if (plan.id === 'quarterly_full') estimatedMRR += Math.round(799 / 3);
        else if (plan.id === 'yearly_full') estimatedMRR += Math.round(1999 / 12);
      }
    });

    const planCounts: Record<PlanType, number> = {
      monthly_mobile: 0,
      monthly_full: 0,
      quarterly_full: 0,
      yearly_full: 0,
      trial: 0,
    };

    let expiringSoon = 0;
    tenants.forEach(t => {
      const p = (t.plan || (t.status === 'trial' ? 'trial' : 'monthly_full')) as PlanType;
      if (planCounts[p] !== undefined) {
        planCounts[p]++;
      }
      const days = calculateDaysRemaining(t.expires_at);
      if (days !== null && days <= 5 && days >= 0 && t.status !== 'suspended') {
        expiringSoon++;
      }
    });

    return { total, active, trial, suspended, activePercent, estimatedMRR, planCounts, expiringSoon };
  }, [tenants]);

  return (
    <div className="super-admin-root" dir="rtl">
      <div className="portal-wrapper">
        {/* Header matching main app navbar */}
        <header className="ccms-admin-header">
          <div className="header-brand-side">
            <div className="brand-logo-badge">
              <span className="material-symbols-outlined brand-icon">sports_esports</span>
              <span className="ccms-badge-pill">CCMS</span>
            </div>
            <div className="brand-titles">
              <h1 className="main-brand-title">Italiano <span className="sub-tag">لوحة تحكم المسؤول</span></h1>
              <p className="sub-brand-desc">إدارة بيئات المشتركين وتراخيص السحابة المعتمدة (Supabase Cloud Multi-Tenant)</p>
            </div>
          </div>

          <div className="header-controls-side">
            {tenants.length > 0 && (
              <div className="cloud-live-pill">
                <span className="live-pulse-dot" />
                <span>متصل بالسحابة ({tenants.length} صالة)</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setActiveTab('add');
              }}
              className="ccms-btn-app-primary"
              title="تسجيل صالة جديدة"
            >
              <span className="material-symbols-outlined">add</span>
              + تسجيل صالة جديدة
            </button>

            <button
              type="button"
              onClick={fetchTenants}
              disabled={listLoading || !adminSecret.trim()}
              className="ccms-btn-app-secondary"
              title="تحديث البيانات من السحابة"
            >
              <span className={`material-symbols-outlined ${listLoading ? 'spin-anim' : ''}`}>
                refresh
              </span>
              تحديث
            </button>

            <a href="/login" className="ccms-btn-app-secondary" title="العودة لشاشة تسجيل الدخول">
              <span className="material-symbols-outlined">logout</span>
              العودة للتطبيق
            </a>
          </div>
        </header>

        {/* Developer Secret Key Dock (styled like dashboard alert cards) */}
        <section className="key-dock-card">
          <div className="dock-content-row">
            <div className="dock-label-group">
              <div className="dock-icon-circle">
                <span className="material-symbols-outlined">vpn_key</span>
              </div>
              <div className="dock-text">
                <h3>مفتاح الوصول السري للمطور (Super Admin Secret Key)</h3>
                <p>مفتاح التشفير المصرح به للتحكم في قواعد بيانات الصالات وتنشيط التراخيص السحابية</p>
              </div>
            </div>

            <div className="dock-input-group">
              <div className="secret-field-wrapper">
                <span className="material-symbols-outlined field-icon">lock</span>
                <input
                  type={showSecret ? 'text' : 'password'}
                  placeholder="أدخل مفتاح المطور السري (SUPER_ADMIN_KEY)..."
                  value={adminSecret}
                  onChange={(e) => handleSecretChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchTenants()}
                  className="secret-input"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="btn-toggle-secret"
                  title={showSecret ? 'إخفاء الرمز' : 'إظهار الرمز'}
                >
                  <span className="material-symbols-outlined">
                    {showSecret ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>

              <div className="dock-btns-row">
                <button
                  type="button"
                  onClick={fetchTenants}
                  disabled={listLoading || !adminSecret.trim()}
                  className="ccms-btn-app-primary"
                >
                  <span className={`material-symbols-outlined ${listLoading ? 'spin-anim' : ''}`}>
                    {listLoading ? 'progress_activity' : 'sync'}
                  </span>
                  {listLoading ? 'جاري المزامنة...' : 'ربط وجلب الصالات'}
                </button>

                {adminSecret && (
                  <button
                    type="button"
                    onClick={handleClearSecret}
                    className="ccms-btn-app-secondary"
                    title="مسح المفتاح وفصل الاتصال"
                  >
                    <span className="material-symbols-outlined">link_off</span>
                    قطع الاتصال
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Metric KPI Cards (matching the dashboard StatCard with colored bottom stripes) */}
        {tenants.length > 0 && (
          <section className="metrics-grid">
            {/* 1. Total Tenants */}
            <div className="ccms-stat-box" style={{ borderTop: '1px solid #00c2ff' }}>
              <div className="stat-box-header">
                <span className="stat-box-label">إجمالي الصالات المسجلة</span>
                <span className="material-symbols-outlined stat-icon" style={{ color: '#00c2ff' }}>
                  storefront
                </span>
              </div>
              <div className="stat-box-value-row">
                <span className="stat-box-val">{stats.total}</span>
                <span className="stat-box-unit">صالة مسجلة</span>
              </div>
              <div className="stat-bottom-line" style={{ background: '#00c2ff', width: '100%', boxShadow: '0 0 10px #00c2ff' }} />
            </div>

            {/* 2. Active Subscriptions */}
            <div className="ccms-stat-box" style={{ borderTop: '1px solid #22c55e' }}>
              <div className="stat-box-header">
                <span className="stat-box-label">الاشتراكات النشطة</span>
                <span className="material-symbols-outlined stat-icon" style={{ color: '#22c55e' }}>
                  verified
                </span>
              </div>
              <div className="stat-box-value-row">
                <span className="stat-box-val" style={{ color: '#22c55e' }}>{stats.active}</span>
                <span className="stat-box-unit">({stats.activePercent}% من الإجمالي)</span>
              </div>
              <div className="stat-bottom-line" style={{ background: '#22c55e', width: `${stats.activePercent || 85}%`, boxShadow: '0 0 10px #22c55e' }} />
            </div>

            {/* 3. Estimated MRR */}
            <div className="ccms-stat-box" style={{ borderTop: '1px solid #00c2ff' }}>
              <div className="stat-box-header">
                <span className="stat-box-label">تقدير الدخل الشهري (MRR)</span>
                <span className="material-symbols-outlined stat-icon" style={{ color: '#00c2ff' }}>
                  payments
                </span>
              </div>
              <div className="stat-box-value-row">
                <span className="stat-box-val">{stats.estimatedMRR.toLocaleString('ar-EG')}</span>
                <span className="stat-box-unit">جنيه</span>
              </div>
              <div className="stat-bottom-line" style={{ background: '#00c2ff', width: '75%', boxShadow: '0 0 10px #00c2ff' }} />
            </div>

            {/* 4. Expiring / Alerts */}
            <div className="ccms-stat-box" style={{ borderTop: '1px solid #f59e0b' }}>
              <div className="stat-box-header">
                <span className="stat-box-label">تنبيهات التجديد (خلال 5 أيام)</span>
                <span className="material-symbols-outlined stat-icon" style={{ color: '#f59e0b' }}>
                  hourglass_top
                </span>
              </div>
              <div className="stat-box-value-row">
                <span className="stat-box-val" style={{ color: stats.expiringSoon > 0 ? '#f59e0b' : '#fff' }}>
                  {stats.expiringSoon}
                </span>
                <span className="stat-box-unit">{stats.trial} تجريبي | {stats.suspended} معطل</span>
              </div>
              <div className="stat-bottom-line" style={{ background: '#f59e0b', width: stats.expiringSoon > 0 ? '60%' : '15%', boxShadow: '0 0 10px #f59e0b' }} />
            </div>
          </section>
        )}

        {/* Main Tabs Navigation (matching app nav bar) */}
        <div className="main-tabs-nav">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            <span className="material-symbols-outlined">list_alt</span>
            <span>قائمة الصالات والتراخيص</span>
            {tenants.length > 0 && <span className="tab-count">{tenants.length}</span>}
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => setActiveTab('add')}
          >
            <span className="material-symbols-outlined">add_circle</span>
            <span>تسجيل صالة / مشترك جديد</span>
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === 'plans' ? 'active' : ''}`}
            onClick={() => setActiveTab('plans')}
          >
            <span className="material-symbols-outlined">payments</span>
            <span>باقات وأسعار الاشتراكات</span>
          </button>
        </div>

        {/* TAB 1: TENANTS LIST */}
        {activeTab === 'list' && (
          <main className="tab-content-card animate-fade-in">
            {/* Toolbar */}
            <div className="table-toolbar">
              <div className="search-and-filters">
                <div className="search-box-wrapper">
                  <span className="material-symbols-outlined search-icon">search</span>
                  <input
                    type="text"
                    placeholder="ابحث باسم الصالة، البريد، أو كود التنشيط..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="clear-search-btn"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  )}
                </div>

                <div className="status-filter-pills">
                  <button
                    type="button"
                    className={`filter-btn ${statusFilter === 'all' && planFilter === 'all' ? 'active' : ''}`}
                    onClick={() => {
                      setStatusFilter('all');
                      setPlanFilter('all');
                    }}
                  >
                    الكل ({tenants.length})
                  </button>

                  <button
                    type="button"
                    className={`filter-btn active-filter-btn ${statusFilter === 'active' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('active')}
                  >
                    نشط ({stats.active})
                  </button>

                  <button
                    type="button"
                    className={`filter-btn trial-filter-btn ${statusFilter === 'trial' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('trial')}
                  >
                    تجريبي ({stats.trial})
                  </button>

                  <button
                    type="button"
                    className={`filter-btn expiring-filter-btn ${statusFilter === 'expiring' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('expiring')}
                  >
                    قاربت على الانتهاء ({stats.expiringSoon})
                  </button>

                  <button
                    type="button"
                    className={`filter-btn suspended-filter-btn ${statusFilter === 'suspended' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('suspended')}
                  >
                    معطل ({stats.suspended})
                  </button>
                </div>
              </div>

              <div className="toolbar-actions-group">
                <button
                  type="button"
                  onClick={exportToCSV}
                  disabled={tenants.length === 0}
                  className="ccms-btn-app-secondary"
                  title="تصدير السجلات إلى ملف Excel / CSV"
                >
                  <span className="material-symbols-outlined">download</span>
                  تصدير Excel
                </button>

                <button
                  type="button"
                  onClick={fetchTenants}
                  disabled={listLoading || !adminSecret.trim()}
                  className="ccms-btn-app-secondary"
                  title="تحديث البيانات من السحابة"
                >
                  <span className={`material-symbols-outlined ${listLoading ? 'spin-anim' : ''}`}>
                    refresh
                  </span>
                  تحديث
                </button>
              </div>
            </div>

            {/* Error Message */}
            {listError && (
              <div className="alert-banner error-banner">
                <span className="material-symbols-outlined">error</span>
                <span>{listError}</span>
              </div>
            )}

            {/* States: Loading / Empty / Data Table */}
            {listLoading && tenants.length === 0 ? (
              <div className="empty-state-box">
                <div className="spinner-large" />
                <h4>جاري الاتصال بالسحابة وجلب بيانات المشتركين...</h4>
                <p>يتم الآن التحقق من رمز المطور السري واسترداد التراخيص وقواعد البيانات.</p>
              </div>
            ) : tenants.length === 0 ? (
              <div className="empty-state-box">
                <span className="material-symbols-outlined empty-icon">cloud_off</span>
                <h4>لا توجد بيانات صالات معروضة</h4>
                <p>أدخل رمز مرور المطور السري في الأعلى ثم اضغط على زر "ربط وجلب الصالات".</p>
              </div>
            ) : filteredTenants.length === 0 ? (
              <div className="empty-state-box">
                <span className="material-symbols-outlined empty-icon">search_off</span>
                <h4>لم يتم العثور على أي نتائج مطابقة</h4>
                <p>جرب تعديل كلمة البحث أو إزالة الفلاتر المحددة.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setPlanFilter('all');
                  }}
                  className="ccms-btn-app-secondary"
                  style={{ marginTop: '12px' }}
                >
                  إعادة ضبط الفلاتر
                </button>
              </div>
            ) : (
              <div className="table-responsive-wrapper">
                <table className="tenants-data-table">
                  <thead>
                    <tr>
                      <th>اسم الصالة / الكافيه</th>
                      <th>البريد الإلكتروني</th>
                      <th>كود التنشيط (Tenant ID)</th>
                      <th>باقة الاشتراك</th>
                      <th>الحالة والصلاحية</th>
                      <th>الإجراءات والعمليات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTenants.map(tenant => {
                      const isUpdating = updatingId === tenant.id;
                      const isCopied = copiedId === tenant.id;
                      const isSnippetCopied = copiedSnippetId === tenant.id;
                      const planInfo = getPlanInfo(tenant.plan);
                      const daysRemaining = calculateDaysRemaining(tenant.expires_at);

                      return (
                        <tr key={tenant.id} className={isUpdating ? 'row-updating' : ''}>
                          {/* Café Identity */}
                          <td>
                            <div className="cafe-identity-cell">
                              <div className="cafe-avatar-box">
                                <span className="material-symbols-outlined">sports_esports</span>
                              </div>
                              <div className="cafe-name-group">
                                <strong className="cafe-title">{tenant.name}</strong>
                                <span className="cafe-badge">سحابة معتمدة</span>
                              </div>
                            </div>
                          </td>

                          {/* Owner Email */}
                          <td>
                            <div className="owner-cell-info">
                              <span className="material-symbols-outlined owner-icon">alternate_email</span>
                              <span className="owner-email-text">{tenant.owner_email}</span>
                            </div>
                          </td>

                          {/* Tenant ID Badge */}
                          <td>
                            <div
                              className={`tenant-id-pill ${isCopied ? 'copied' : ''}`}
                              onClick={() => copyToClipboard(tenant.id, tenant.id)}
                              title="انقر لنسخ كود التنشيط كاملاً"
                            >
                              <span className="material-symbols-outlined copy-icon">
                                {isCopied ? 'check' : 'content_copy'}
                              </span>
                              <code>{isCopied ? 'تم النسخ!' : `${tenant.id.slice(0, 8)}...${tenant.id.slice(-4)}`}</code>
                            </div>
                          </td>

                          {/* Subscription Plan Badge */}
                          <td>
                            <div className={`plan-badge-tag ${planInfo.badgeColor}`}>
                              <span className="material-symbols-outlined">{planInfo.icon}</span>
                              <div className="plan-tag-text">
                                <strong>{planInfo.name}</strong>
                                <small>
                                  {planInfo.price > 0
                                    ? `${planInfo.price} ${planInfo.currency} (${planInfo.periodText})`
                                    : 'مجاناً'}
                                </small>
                              </div>
                            </div>
                          </td>

                          {/* Status & Expiry Days */}
                          <td>
                            <div className="status-cell-wrapper">
                              <div className="status-dropdown-wrapper">
                                <select
                                  value={tenant.status}
                                  onChange={(e) => handleQuickStatusChange(tenant.id, e.target.value as StatusType)}
                                  className={`status-select ${tenant.status}`}
                                  disabled={isUpdating}
                                >
                                  <option value="active">● نشط / مدفوع</option>
                                  <option value="trial">● تجريبي (يومين)</option>
                                  <option value="suspended">● معطل / مقفل</option>
                                </select>
                              </div>

                              {/* Days Remaining Pill */}
                              {daysRemaining !== null && (
                                <div
                                  className={`days-pill ${daysRemaining > 7
                                      ? 'green'
                                      : daysRemaining > 0
                                        ? 'amber'
                                        : daysRemaining === 0
                                          ? 'rose-alert'
                                          : 'expired'
                                    }`}
                                >
                                  <span className="material-symbols-outlined">schedule</span>
                                  {daysRemaining > 0
                                    ? `متبقي ${daysRemaining} يوم`
                                    : daysRemaining === 0
                                      ? 'ينتهي اليوم!'
                                      : `منتهي منذ ${Math.abs(daysRemaining)} يوم`}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td>
                            <div className="action-buttons-flex">
                              {/* Edit / Renew Modal */}
                              <button
                                type="button"
                                onClick={() => openEditModal(tenant)}
                                className="action-icon-btn edit"
                                title="تجديد أو ترقية الباقة وتعديل المهلة"
                              >
                                <span className="material-symbols-outlined">edit_calendar</span>
                                <span>تجديد / ترقية</span>
                              </button>

                              {/* WhatsApp Share */}
                              <button
                                type="button"
                                onClick={() => shareViaWhatsApp(tenant)}
                                className="action-icon-btn whatsapp"
                                title="إرسال بيانات التنشيط عبر واتساب"
                              >
                                <span className="material-symbols-outlined">chat</span>
                                <span>واتساب</span>
                              </button>

                              {/* Copy Snippet */}
                              <button
                                type="button"
                                onClick={() => copyActivationSnippet(tenant)}
                                className={`action-icon-btn copy ${isSnippetCopied ? 'done' : ''}`}
                                title="نسخ رسالة التنشيط كاملة"
                              >
                                <span className="material-symbols-outlined">
                                  {isSnippetCopied ? 'done_all' : 'share'}
                                </span>
                                <span>{isSnippetCopied ? 'تم النسخ!' : 'نسخ الرسالة'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </main>
        )}

        {/* TAB 2: ADD NEW TENANT */}
        {activeTab === 'add' && (
          <main className="tab-content-card animate-fade-in">
            <div className="add-tenant-layout">
              {/* Left Column: Form */}
              <div className="add-form-column">
                <div className="form-heading-block">
                  <h2>تسجيل صالة ألعاب ومشترك جديد</h2>
                  <p>اختر الباقة المناسبة وقم بتوليد كود التنشيط وحساب المالك فوراً في خطوة واحدة.</p>
                </div>

                {addError && (
                  <div className="alert-banner error-banner">
                    <span className="material-symbols-outlined">error</span>
                    <span>{addError}</span>
                  </div>
                )}

                <form onSubmit={handleRegister} className="tenant-register-form">
                  {/* Interactive Plan Selector Cards */}
                  <div className="form-section-title">
                    <span className="material-symbols-outlined">loyalty</span>
                    <span>1. اختر باقة الاشتراك المطلوبة:</span>
                  </div>

                  <div className="plans-selector-grid">
                    {SUBSCRIPTION_PLANS.map((plan) => {
                      const isSelected = selectedPlan === plan.id;
                      return (
                        <div
                          key={plan.id}
                          className={`plan-select-card ${isSelected ? 'selected' : ''} ${plan.badgeColor}`}
                          onClick={() => setSelectedPlan(plan.id)}
                        >
                          <div className="card-selection-indicator">
                            <span className="material-symbols-outlined">
                              {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                            </span>
                          </div>

                          <div className="plan-card-icon">
                            <span className="material-symbols-outlined">{plan.icon}</span>
                          </div>

                          <div className="plan-card-info">
                            <h4 className="plan-card-title">{plan.name}</h4>
                            <p className="plan-card-sub">{plan.subtitle}</p>
                            <div className="plan-card-price">
                              <strong>
                                {plan.price > 0 ? `${plan.price} ${plan.currency}` : 'مجاناً'}
                              </strong>
                              <small>/{plan.periodText}</small>
                            </div>
                          </div>

                          {plan.isPopular && <span className="tag-pill-badge popular">الأكثر طلباً</span>}
                          {plan.isBestValue && <span className="tag-pill-badge best">VIP توفير هائل</span>}
                          {plan.isMobileOnly && <span className="tag-pill-badge mobile">📱 موبايل فقط</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Cafe & Owner Information */}
                  <div className="form-section-title" style={{ marginTop: '24px' }}>
                    <span className="material-symbols-outlined">badge</span>
                    <span>2. بيانات الصالة والمالك:</span>
                  </div>

                  <div className="form-grid-2col">
                    <div className="input-group">
                      <label>اسم صالة الألعاب / الكافيه <span className="req">*</span></label>
                      <div className="input-with-icon">
                        <span className="material-symbols-outlined input-affix-icon">store</span>
                        <input
                          type="text"
                          placeholder="مثال: GameZone Cyber Arena"
                          value={tenantName}
                          onChange={(e) => setTenantName(e.target.value)}
                          required
                          className="modern-input"
                        />
                      </div>
                    </div>

                    <div className="input-group">
                      <label>الاسم الكامل للمالك <span className="req">*</span></label>
                      <div className="input-with-icon">
                        <span className="material-symbols-outlined input-affix-icon">person</span>
                        <input
                          type="text"
                          placeholder="مثال: محمد علي"
                          value={ownerFullName}
                          onChange={(e) => setOwnerFullName(e.target.value)}
                          required
                          className="modern-input"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-grid-2col">
                    <div className="input-group">
                      <label>البريد الإلكتروني لتسجيل الدخول <span className="req">*</span></label>
                      <div className="input-with-icon">
                        <span className="material-symbols-outlined input-affix-icon">alternate_email</span>
                        <input
                          type="email"
                          placeholder="owner@cafe.com"
                          value={ownerEmail}
                          onChange={(e) => setOwnerEmail(e.target.value)}
                          required
                          className="modern-input"
                        />
                      </div>
                    </div>

                    <div className="input-group">
                      <div className="label-with-button">
                        <label>كلمة مرور المالك <span className="req">*</span></label>
                        <button
                          type="button"
                          onClick={generateRandomPassword}
                          className="btn-text-gen"
                        >
                          توليد كلمة سر
                        </button>
                      </div>
                      <div className="input-with-icon">
                        <span className="material-symbols-outlined input-affix-icon">lock</span>
                        <input
                          type={showFormPassword ? 'text' : 'password'}
                          placeholder="كلمة مرور الدخول للمالك..."
                          value={ownerPassword}
                          onChange={(e) => setOwnerPassword(e.target.value)}
                          required
                          className="modern-input"
                        />
                        <button
                          type="button"
                          onClick={() => setShowFormPassword(!showFormPassword)}
                          className="btn-toggle-eye"
                        >
                          <span className="material-symbols-outlined">
                            {showFormPassword ? 'visibility_off' : 'visibility'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expiry Date Customization */}
                  <div className="form-grid-2col" style={{ marginTop: '8px' }}>
                    <div className="input-group">
                      <label>تاريخ انتهاء صلاحية الاشتراك المبدئي</label>
                      <div className="input-with-icon">
                        <span className="material-symbols-outlined input-affix-icon">event</span>
                        <input
                          type="date"
                          value={customExpiryDate}
                          onChange={(e) => setCustomExpiryDate(e.target.value)}
                          className="modern-input"
                        />
                      </div>
                      <span className="field-hint">
                        💡 تم ضبطه تلقائياً حسب باقة ({getPlanInfo(selectedPlan).name}) لمدة {getPlanInfo(selectedPlan).durationDays} يوم.
                      </span>
                    </div>

                    <div className="input-group">
                      <label>حالة الاشتراك المبدئية</label>
                      <div className="status-radio-group">
                        <label className={`status-radio-card ${selectedStatus === 'active' ? 'checked active' : ''}`}>
                          <input
                            type="radio"
                            name="init_status"
                            checked={selectedStatus === 'active'}
                            onChange={() => setSelectedStatus('active')}
                          />
                          <span>نشط ومفعّل</span>
                        </label>

                        <label className={`status-radio-card ${selectedStatus === 'trial' ? 'checked trial' : ''}`}>
                          <input
                            type="radio"
                            name="init_status"
                            checked={selectedStatus === 'trial'}
                            onChange={() => setSelectedStatus('trial')}
                          />
                          <span>فترة تجريبية (يومين)</span>
                        </label>

                        <label className={`status-radio-card ${selectedStatus === 'suspended' ? 'checked suspended' : ''}`}>
                          <input
                            type="radio"
                            name="init_status"
                            checked={selectedStatus === 'suspended'}
                            onChange={() => setSelectedStatus('suspended')}
                          />
                          <span>معطل / مقفل</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={addLoading}
                    className="btn-submit-registration"
                  >
                    <span className={`material-symbols-outlined ${addLoading ? 'spin-anim' : ''}`}>
                      {addLoading ? 'progress_activity' : 'cloud_upload'}
                    </span>
                    {addLoading ? 'جاري تهيئة قاعدة البيانات وإنشاء الترخيص...' : 'تسجيل الصالة وإصدار الترخيص السحابي'}
                  </button>
                </form>
              </div>

              {/* Right Column: Live License Preview & Success Kit */}
              <div className="preview-license-column">
                <div className="preview-box-header">
                  <span className="material-symbols-outlined">badge</span>
                  <span>معاينة بطاقة الترخيص الرقمية</span>
                </div>

                {/* Digital Cyber Card */}
                <div className={`digital-license-card ${getPlanInfo(selectedPlan).badgeColor}`}>
                  <div className="card-top-bar">
                    <div className="card-logo-pill">
                      <span className="material-symbols-outlined">sports_esports</span>
                      <span>CCMS CLOUD LICENSE</span>
                    </div>
                    <div className={`card-status-badge ${selectedStatus}`}>
                      {selectedStatus === 'active'
                        ? 'نشط / مدفوع'
                        : selectedStatus === 'trial'
                          ? 'فترة تجريبية (يومين)'
                          : 'معطل'}
                    </div>
                  </div>

                  <div className="card-body-content">
                    <h3 className="card-tenant-name">{tenantName.trim() || 'اسم صالة الألعاب'}</h3>
                    <div className="card-owner-line">
                      <span className="material-symbols-outlined">person</span>
                      <span>{ownerFullName.trim() || 'اسم المالك المسؤول'}</span>
                    </div>
                    <div className="card-email-line">
                      <span className="material-symbols-outlined">mail</span>
                      <span>{ownerEmail.trim() || 'owner@cafe.com'}</span>
                    </div>
                  </div>

                  <div className="card-plan-highlight">
                    <div className="highlight-plan-title">
                      <span className="material-symbols-outlined">{getPlanInfo(selectedPlan).icon}</span>
                      <span>{getPlanInfo(selectedPlan).name}</span>
                    </div>
                    <div className="highlight-plan-price">
                      {getPlanInfo(selectedPlan).price > 0
                        ? `${getPlanInfo(selectedPlan).price} ج.م`
                        : 'مجاناً'}
                    </div>
                  </div>

                  <div className="card-bottom-footer">
                    <div className="card-id-block">
                      <small>TENANT ID</small>
                      <code>{newTenantInfo ? newTenantInfo.id : 'XXXXXXXX-XXXX-XXXX-XXXX'}</code>
                    </div>
                    <div className="card-expiry-block">
                      <small>EXPIRES AT</small>
                      <span>{customExpiryDate || '---'}</span>
                    </div>
                  </div>
                </div>

                {/* Success Card After Registration */}
                {newTenantInfo && (
                  <div className="success-kit-card animate-pop">
                    <div className="success-kit-header">
                      <span className="material-symbols-outlined success-icon">verified</span>
                      <div>
                        <h4>تم إنشاء الصالة وحساب المالك بنجاح!</h4>
                        <p>يمكنك الآن مشاركة كود التنشيط وبيانات الدخول فوراً مع العميل.</p>
                      </div>
                    </div>

                    <div className="credentials-list">
                      <div className="credential-row">
                        <span className="cred-title">كود التنشيط (Tenant ID):</span>
                        <div className="cred-val-box">
                          <code>{newTenantInfo.id}</code>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(newTenantInfo.id, 'new_created')}
                            className="btn-copy-mini"
                          >
                            <span className="material-symbols-outlined">
                              {copiedId === 'new_created' ? 'check' : 'content_copy'}
                            </span>
                            {copiedId === 'new_created' ? 'تم النسخ' : 'نسخ'}
                          </button>
                        </div>
                      </div>

                      <div className="credential-row">
                        <span className="cred-title">البريد الإلكتروني:</span>
                        <strong>{newTenantInfo.owner_email}</strong>
                      </div>

                      {newTenantInfo.pass && (
                        <div className="credential-row">
                          <span className="cred-title">كلمة المرور:</span>
                          <code className="pass-pill">{newTenantInfo.pass}</code>
                        </div>
                      )}

                      <div className="credential-row">
                        <span className="cred-title">الباقة المفعّلة:</span>
                        <span className="plan-name-tag">{getPlanInfo(newTenantInfo.plan).name}</span>
                      </div>
                    </div>

                    <div className="success-actions-row">
                      <button
                        type="button"
                        onClick={() =>
                          shareViaWhatsApp({
                            id: newTenantInfo.id,
                            name: newTenantInfo.name,
                            owner_email: newTenantInfo.owner_email,
                            status: selectedStatus,
                            plan: newTenantInfo.plan,
                            expires_at: newTenantInfo.expires_at,
                            created_at: new Date().toISOString(),
                          })
                        }
                        className="btn-whatsapp-share"
                      >
                        <span className="material-symbols-outlined">chat</span>
                        إرسال للعميل عبر واتساب
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          copyActivationSnippet({
                            id: newTenantInfo.id,
                            name: newTenantInfo.name,
                            owner_email: newTenantInfo.owner_email,
                            status: selectedStatus,
                            plan: newTenantInfo.plan,
                            expires_at: newTenantInfo.expires_at,
                            created_at: new Date().toISOString(),
                          })
                        }
                        className="btn-copy-all"
                      >
                        <span className="material-symbols-outlined">content_copy</span>
                        نسخ رسالة التنشيط
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        )}

        {/* TAB 3: PRICING MATRIX REFERENCE */}
        {activeTab === 'plans' && (
          <main className="tab-content-card animate-fade-in">
            <div className="plans-matrix-header">
              <h2>مصفوفة باقات وخطط اشتراك برنامج الصالات السحابي</h2>
              <p>استعراض شامل لكافة باقات الأسعار المعتمدة ومميزاتها ونطاق صلاحياتها.</p>
            </div>

            <div className="plans-showcase-grid">
              {SUBSCRIPTION_PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`plan-showcase-card ${plan.badgeColor} ${plan.isPopular ? 'popular' : ''} ${plan.isBestValue ? 'best-value' : ''
                    }`}
                >
                  {plan.isPopular && <div className="featured-banner">الباقة الأكثر طلباً ⭐</div>}
                  {plan.isBestValue && <div className="featured-banner gold">أعلى قيمة وأقصى توفير 👑</div>}
                  {plan.isMobileOnly && <div className="featured-banner purple">📱 مخصصة للموبايل فقط</div>}

                  <div className="showcase-card-top">
                    <div className="showcase-icon-box">
                      <span className="material-symbols-outlined">{plan.icon}</span>
                    </div>
                    <h3 className="showcase-title">{plan.name}</h3>
                    <p className="showcase-subtitle">{plan.subtitle}</p>

                    <div className="showcase-price-box">
                      <span className="currency-val">
                        {plan.price > 0 ? plan.price : 'مجاناً'}
                      </span>
                      {plan.price > 0 && <span className="currency-unit">{plan.currency}</span>}
                      <span className="period-unit">/ {plan.periodText}</span>
                    </div>
                  </div>

                  <p className="showcase-desc">{plan.description}</p>

                  <div className="showcase-features-list">
                    <h5>المميزات المشمولة:</h5>
                    <ul>
                      {plan.features.map((feat, idx) => (
                        <li key={idx}>
                          <span className="material-symbols-outlined check-icon">check_circle</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="showcase-footer">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPlan(plan.id);
                        setActiveTab('add');
                      }}
                      className="btn-select-for-add"
                    >
                      تسجيل صالة بهذه الباقة
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </main>
        )}
      </div>

      {/* EDIT / RENEWAL MODAL */}
      {editingTenant && (
        <div className="modal-overlay" onClick={() => setEditingTenant(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-title">
                <span className="material-symbols-outlined modal-header-icon">edit_calendar</span>
                <div>
                  <h3>إدارة وتجديد اشتراك الصالة</h3>
                  <p>{editingTenant.name} ({editingTenant.owner_email})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTenant(null)}
                className="btn-close-modal"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveTenantEdit} className="modal-body-form">
              {/* Plan Picker */}
              <div className="modal-field">
                <label>تغيير / ترقية باقة الاشتراك:</label>
                <div className="modal-plans-grid">
                  {SUBSCRIPTION_PLANS.map((p) => (
                    <div
                      key={p.id}
                      className={`modal-plan-card ${editPlan === p.id ? 'active' : ''} ${p.badgeColor}`}
                      onClick={() => {
                        setEditPlan(p.id);
                        if (p.id === 'trial') {
                          setEditStatus('trial');
                          addDaysToEditExpiry(2);
                        } else {
                          setEditStatus('active');
                          addDaysToEditExpiry(p.durationDays);
                        }
                      }}
                    >
                      <div className="modal-plan-title">
                        <span className="material-symbols-outlined">{p.icon}</span>
                        <strong>{p.name}</strong>
                      </div>
                      <div className="modal-plan-price">
                        {p.price > 0 ? `${p.price} ${p.currency}` : 'مجاناً'} ({p.periodText})
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Picker */}
              <div className="modal-field">
                <label>حالة الاشتراك الحالية:</label>
                <div className="status-radio-group">
                  <label className={`status-radio-card ${editStatus === 'active' ? 'checked active' : ''}`}>
                    <input
                      type="radio"
                      name="edit_status"
                      checked={editStatus === 'active'}
                      onChange={() => setEditStatus('active')}
                    />
                    <span>نشط / مدفوع</span>
                  </label>

                  <label className={`status-radio-card ${editStatus === 'trial' ? 'checked trial' : ''}`}>
                    <input
                      type="radio"
                      name="edit_status"
                      checked={editStatus === 'trial'}
                      onChange={() => setEditStatus('trial')}
                    />
                    <span>فترة تجريبية (يومين)</span>
                  </label>

                  <label className={`status-radio-card ${editStatus === 'suspended' ? 'checked suspended' : ''}`}>
                    <input
                      type="radio"
                      name="edit_status"
                      checked={editStatus === 'suspended'}
                      onChange={() => setEditStatus('suspended')}
                    />
                    <span>معطل / مقفل</span>
                  </label>
                </div>
              </div>

              {/* Quick Extend Buttons */}
              <div className="modal-field">
                <label>تمديد سريع للصلاحية:</label>
                <div className="quick-extend-buttons">
                  <button type="button" onClick={() => addDaysToEditExpiry(2)} className="btn-extend-chip">
                    + يومين (تجريبي)
                  </button>
                  <button type="button" onClick={() => addDaysToEditExpiry(30)} className="btn-extend-chip">
                    + شهر (30 يوم)
                  </button>
                  <button type="button" onClick={() => addDaysToEditExpiry(90)} className="btn-extend-chip">
                    + 3 شهور (90 يوم)
                  </button>
                  <button type="button" onClick={() => addDaysToEditExpiry(365)} className="btn-extend-chip">
                    + سنة (365 يوم)
                  </button>
                </div>
              </div>

              {/* Expiry Date Input */}
              <div className="modal-field">
                <label>تاريخ انتهاء الصلاحية المحدد:</label>
                <input
                  type="date"
                  value={editExpiryDate}
                  onChange={(e) => setEditExpiryDate(e.target.value)}
                  className="modern-input"
                  required
                />
              </div>

              <div className="modal-footer-actions">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="btn-modal-cancel"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={editLoading}
                  className="btn-modal-save"
                >
                  <span className={`material-symbols-outlined ${editLoading ? 'spin-anim' : ''}`}>
                    {editLoading ? 'progress_activity' : 'save'}
                  </span>
                  {editLoading ? 'جاري الحفظ...' : 'حفظ وتحديث الاشتراك'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
         CCMS APPLICATION BRAND IDENTITY & STYLING
      ══════════════════════════════════════════════════════════════════════════ */}
      <style>{`
        /* Root Canvas */
        .super-admin-root {
          min-height: 100vh;
          background-color: var(--bg-base, #0a0a0a);
          color: var(--text-primary, #ffffff);
          font-family: 'Alexandria', 'Cairo', 'Inter', system-ui, -apple-system, sans-serif;
          padding: 24px 32px 80px;
          direction: rtl;
          overflow-x: hidden;
        }

        .portal-wrapper {
          max-width: 1440px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* ─── Top Header (Matching Main Dashboard Navbar) ─── */
        .ccms-admin-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-surface, #111111);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          border-radius: 14px;
          padding: 16px 24px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
          flex-wrap: wrap;
          gap: 16px;
        }

        .header-brand-side {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-logo-badge {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          background: rgba(0, 194, 255, 0.1);
          border: 1px solid rgba(0, 194, 255, 0.3);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--accent-cyan, #00c2ff);
        }
        .brand-logo-badge .brand-icon {
          font-size: 20px;
        }
        .brand-logo-badge .ccms-badge-pill {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.5px;
          line-height: 1;
        }

        .brand-titles .main-brand-title {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .brand-titles .sub-tag {
          font-size: 11px;
          font-weight: 600;
          color: #a1a1aa;
          background: rgba(255, 255, 255, 0.06);
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .brand-titles .sub-brand-desc {
          margin: 3px 0 0;
          font-size: 12px;
          color: var(--text-secondary, #a1a1aa);
        }

        .header-controls-side {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .cloud-live-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #22c55e;
          padding: 8px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
        }
        .live-pulse-dot {
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 50%;
          box-shadow: 0 0 8px #22c55e;
          animation: pulse-dot 2s infinite;
        }

        /* ─── Buttons (Exact match to "+ بدء وردية جديدة" and secondary) ─── */
        .ccms-btn-app-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: #0070f3;
          color: #ffffff !important;
          border: none;
          border-radius: 8px;
          padding: 10px 18px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 0 15px rgba(0, 112, 243, 0.4);
          text-decoration: none;
        }
        .ccms-btn-app-primary:hover:not(:disabled) {
          background: #0060df;
          box-shadow: 0 0 25px rgba(0, 112, 243, 0.6);
          transform: translateY(-1px);
        }
        .ccms-btn-app-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .ccms-btn-app-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: rgba(0, 194, 255, 0.05);
          border: 1px solid rgba(0, 194, 255, 0.25);
          color: #ffffff !important;
          border-radius: 8px;
          padding: 9px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
        }
        .ccms-btn-app-secondary:hover:not(:disabled) {
          background: rgba(0, 194, 255, 0.12);
          border-color: rgba(0, 194, 255, 0.4);
          transform: translateY(-1px);
        }
        .ccms-btn-app-secondary:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* ─── Key Dock Card ─── */
        .key-dock-card {
          background: var(--bg-surface, #111111);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          border-radius: 14px;
          padding: 18px 24px;
        }
        .dock-content-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }
        .dock-label-group {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 300px;
        }
        .dock-icon-circle {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #f59e0b;
        }
        .dock-text h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
        }
        .dock-text p {
          margin: 3px 0 0;
          font-size: 12px;
          color: var(--text-secondary, #a1a1aa);
        }
        .dock-input-group {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          justify-content: flex-end;
          min-width: 320px;
          flex-wrap: wrap;
        }
        .secret-field-wrapper {
          position: relative;
          flex: 1;
          max-width: 420px;
          display: flex;
          align-items: center;
        }
        .field-icon {
          position: absolute;
          right: 12px;
          color: #71717a;
          font-size: 18px;
          pointer-events: none;
        }
        .secret-input {
          width: 100%;
          background: var(--bg-input, #0a0a0a);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
          border-radius: 8px;
          padding: 10px 38px 10px 40px;
          color: #ffffff;
          font-size: 13px;
          outline: none;
          transition: all 0.2s;
        }
        .secret-input:focus {
          border-color: var(--accent-cyan, #00c2ff);
          box-shadow: 0 0 12px rgba(0, 194, 255, 0.2);
        }
        .btn-toggle-secret {
          position: absolute;
          left: 10px;
          background: none;
          border: none;
          color: #a1a1aa;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
        }
        .btn-toggle-secret:hover {
          color: #ffffff;
        }
        .dock-btns-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* ─── Metric KPI Cards (Matching StatCard in screenshot) ─── */
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 18px;
        }
        .ccms-stat-box {
          background: var(--bg-surface, #111111);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          border-radius: 12px;
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          position: relative;
          overflow: hidden;
          transition: border-color 0.2s ease, transform 0.2s ease;
        }
        .ccms-stat-box:hover {
          border-color: var(--border-glow, rgba(0, 194, 255, 0.3));
          transform: translateY(-2px);
        }
        .stat-box-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .stat-box-label {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary, #a1a1aa);
        }
        .stat-icon {
          font-size: 22px;
        }
        .stat-box-value-row {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-top: 4px;
        }
        .stat-box-val {
          font-size: 32px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1.1;
          font-family: 'Space Grotesk', 'JetBrains Mono', sans-serif;
        }
        .stat-box-unit {
          font-size: 13px;
          color: var(--text-secondary, #a1a1aa);
          font-weight: 500;
        }
        .stat-bottom-line {
          height: 4px;
          border-radius: 9999px;
          margin-top: 14px;
          transition: width 0.6s ease;
        }

        /* ─── Plan Breakdown Quick Chips ─── */
        .plan-stats-bar {
          background: var(--bg-surface, #111111);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.08));
          border-radius: 12px;
          padding: 14px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        .plan-stats-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
        }
        .plan-stats-chips {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .plan-stat-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid transparent;
        }
        .plan-stat-chip.indigo {
          background: rgba(99, 102, 241, 0.12);
          color: #a5b4fc;
        }
        .plan-stat-chip.cyan {
          background: rgba(0, 194, 255, 0.12);
          color: #67e8f9;
        }
        .plan-stat-chip.emerald {
          background: rgba(34, 197, 94, 0.12);
          color: #86efac;
        }
        .plan-stat-chip.amber {
          background: rgba(245, 158, 11, 0.12);
          color: #fde047;
        }
        .plan-stat-chip.gray {
          background: rgba(255, 255, 255, 0.06);
          color: #d4d4d8;
        }
        .plan-stat-chip.active-filter {
          border-color: #ffffff;
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
        }

        /* ─── Main Tabs Navigation (Matching Dashboard style) ─── */
        .main-tabs-nav {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--bg-surface, #111111);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          border-radius: 12px;
          padding: 6px;
        }
        .tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: none;
          border: none;
          color: var(--text-secondary, #a1a1aa);
          padding: 12px 18px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tab-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.05);
        }
        .tab-btn.active {
          background: #0070f3;
          color: #ffffff;
          box-shadow: 0 0 15px rgba(0, 112, 243, 0.4);
        }
        .tab-count {
          background: rgba(255, 255, 255, 0.2);
          color: #ffffff;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 800;
        }

        /* ─── Tab Content Card ─── */
        .tab-content-card {
          background: var(--bg-surface, #111111);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          border-radius: 14px;
          padding: 24px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        }

        /* ─── Table Toolbar ─── */
        .table-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .search-and-filters {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          flex-wrap: wrap;
        }
        .search-box-wrapper {
          position: relative;
          flex: 1;
          min-width: 260px;
          max-width: 380px;
          display: flex;
          align-items: center;
        }
        .search-icon {
          position: absolute;
          right: 12px;
          color: #71717a;
          font-size: 20px;
          pointer-events: none;
        }
        .search-input {
          width: 100%;
          background: var(--bg-input, #0a0a0a);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
          border-radius: 8px;
          padding: 9px 38px 9px 34px;
          color: #ffffff;
          font-size: 13px;
          outline: none;
          transition: all 0.2s;
        }
        .search-input:focus {
          border-color: var(--accent-cyan, #00c2ff);
          box-shadow: 0 0 12px rgba(0, 194, 255, 0.2);
        }
        .clear-search-btn {
          position: absolute;
          left: 8px;
          background: none;
          border: none;
          color: #71717a;
          cursor: pointer;
          padding: 2px;
        }
        .clear-search-btn:hover {
          color: #ffffff;
        }
        .status-filter-pills {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .filter-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.08));
          color: var(--text-secondary, #a1a1aa);
          border-radius: 8px;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .filter-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }
        .filter-btn.active {
          background: rgba(0, 194, 255, 0.15);
          border-color: var(--accent-cyan, #00c2ff);
          color: var(--accent-cyan, #00c2ff);
          font-weight: 700;
        }
        .toolbar-actions-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* ─── Table ─── */
        .table-responsive-wrapper {
          width: 100%;
          overflow-x: auto;
        }
        .tenants-data-table {
          width: 100%;
          border-collapse: collapse;
          text-align: right;
        }
        .tenants-data-table th {
          background: rgba(0, 0, 0, 0.35);
          color: var(--text-secondary, #a1a1aa);
          font-size: 12px;
          font-weight: 700;
          padding: 14px 16px;
          border-bottom: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          white-space: nowrap;
        }
        .tenants-data-table td {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          vertical-align: middle;
          color: #ffffff;
        }
        .tenants-data-table tbody tr {
          transition: background 0.15s;
        }
        .tenants-data-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .cafe-identity-cell {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cafe-avatar-box {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: rgba(0, 194, 255, 0.1);
          border: 1px solid rgba(0, 194, 255, 0.25);
          color: var(--accent-cyan, #00c2ff);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cafe-name-group {
          display: flex;
          flex-direction: column;
        }
        .cafe-title {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
        }
        .cafe-badge {
          font-size: 11px;
          color: var(--text-muted, #71717a);
        }

        .owner-cell-info {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #d4d4d8;
          font-size: 13px;
        }
        .owner-icon {
          color: #71717a;
          font-size: 16px;
        }

        .tenant-id-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-input, #0a0a0a);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          padding: 6px 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tenant-id-pill:hover {
          border-color: var(--accent-cyan, #00c2ff);
          background: rgba(0, 194, 255, 0.08);
        }
        .tenant-id-pill.copied {
          background: rgba(34, 197, 94, 0.15);
          border-color: #22c55e;
          color: #86efac;
        }
        .tenant-id-pill code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
        }

        .plan-badge-tag {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid transparent;
        }
        .plan-badge-tag.indigo {
          background: rgba(99, 102, 241, 0.15);
          border-color: rgba(99, 102, 241, 0.3);
          color: #a5b4fc;
        }
        .plan-badge-tag.cyan {
          background: rgba(0, 194, 255, 0.15);
          border-color: rgba(0, 194, 255, 0.3);
          color: #67e8f9;
        }
        .plan-badge-tag.emerald {
          background: rgba(34, 197, 94, 0.15);
          border-color: rgba(34, 197, 94, 0.3);
          color: #86efac;
        }
        .plan-badge-tag.amber {
          background: rgba(245, 158, 11, 0.15);
          border-color: rgba(245, 158, 11, 0.3);
          color: #fde047;
        }
        .plan-badge-tag.gray {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
          color: #d4d4d8;
        }

        .status-cell-wrapper {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .status-select {
          background: var(--bg-input, #0a0a0a);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.15));
          color: #ffffff;
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          outline: none;
          cursor: pointer;
        }
        .status-select.active {
          color: #22c55e;
          border-color: rgba(34, 197, 94, 0.4);
        }
        .status-select.trial {
          color: #f59e0b;
          border-color: rgba(245, 158, 11, 0.4);
        }
        .status-select.suspended {
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.4);
        }

        .days-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 12px;
          width: fit-content;
        }
        .days-pill.green {
          background: rgba(34, 197, 94, 0.12);
          color: #86efac;
        }
        .days-pill.amber {
          background: rgba(245, 158, 11, 0.12);
          color: #fde047;
        }
        .days-pill.rose-alert, .days-pill.expired {
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
        }

        /* ─── Table Action Buttons ─── */
        .table-actions-cell {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .action-icon-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.15s;
        }
        .action-icon-btn.renew {
          background: rgba(0, 112, 243, 0.15);
          border-color: rgba(0, 112, 243, 0.35);
          color: #60a5fa;
        }
        .action-icon-btn.renew:hover {
          background: #0070f3;
          color: #ffffff;
        }
        .action-icon-btn.whatsapp {
          background: rgba(37, 211, 102, 0.12);
          border-color: rgba(37, 211, 102, 0.3);
          color: #4ade80;
        }
        .action-icon-btn.whatsapp:hover {
          background: #25d366;
          color: #ffffff;
        }
        .action-icon-btn.copy {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--border-default, rgba(255, 255, 255, 0.1));
          color: #d4d4d8;
        }
        .action-icon-btn.copy:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }

        /* ─── Form & Add Tenant ─── */
        .add-tenant-layout {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 32px;
        }
        @media (max-width: 1024px) {
          .add-tenant-layout {
            grid-template-columns: 1fr;
          }
        }
        .form-heading-block h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
        }
        .form-heading-block p {
          margin: 4px 0 20px;
          font-size: 13px;
          color: var(--text-secondary, #a1a1aa);
        }
        .form-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: var(--accent-cyan, #00c2ff);
          margin-bottom: 12px;
        }

        .plans-selector-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }
        .plan-select-card {
          background: var(--bg-input, #0a0a0a);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          border-radius: 12px;
          padding: 14px;
          cursor: pointer;
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: all 0.2s;
        }
        .plan-select-card:hover {
          border-color: rgba(255, 255, 255, 0.25);
          transform: translateY(-2px);
        }
        .plan-select-card.selected {
          border-color: #0070f3;
          background: rgba(0, 112, 243, 0.1);
          box-shadow: 0 0 15px rgba(0, 112, 243, 0.2);
        }
        .card-selection-indicator {
          position: absolute;
          top: 12px;
          left: 12px;
          color: #71717a;
        }
        .plan-select-card.selected .card-selection-indicator {
          color: #0070f3;
        }
        .plan-card-title {
          margin: 0;
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
        }
        .plan-card-sub {
          margin: 2px 0 6px;
          font-size: 11px;
          color: var(--text-secondary, #a1a1aa);
        }
        .plan-card-price strong {
          font-size: 16px;
          color: #ffffff;
        }
        .tag-pill-badge {
          position: absolute;
          top: -8px;
          right: 12px;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 8px;
        }
        .tag-pill-badge.popular {
          background: #0070f3;
          color: #ffffff;
        }
        .tag-pill-badge.best {
          background: #f59e0b;
          color: #000000;
        }
        .tag-pill-badge.mobile {
          background: #8b5cf6;
          color: #ffffff;
        }

        .form-grid-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 14px;
        }
        @media (max-width: 640px) {
          .form-grid-2col {
            grid-template-columns: 1fr;
          }
        }
        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .input-group label {
          font-size: 13px;
          font-weight: 600;
          color: #d4d4d8;
        }
        .req { color: #ef4444; }
        .label-with-button {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .btn-text-gen {
          background: none;
          border: none;
          color: var(--accent-cyan, #00c2ff);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-affix-icon {
          position: absolute;
          right: 12px;
          color: #71717a;
          font-size: 18px;
          pointer-events: none;
        }
        .modern-input {
          width: 100%;
          background: var(--bg-input, #0a0a0a);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
          border-radius: 8px;
          padding: 10px 38px 10px 14px;
          color: #ffffff;
          font-size: 13px;
          outline: none;
          transition: all 0.2s;
        }
        .modern-input:focus {
          border-color: var(--accent-cyan, #00c2ff);
          box-shadow: 0 0 12px rgba(0, 194, 255, 0.2);
        }
        .btn-toggle-eye {
          position: absolute;
          left: 10px;
          background: none;
          border: none;
          color: #71717a;
          cursor: pointer;
        }
        .field-hint {
          font-size: 11px;
          color: var(--text-muted, #71717a);
          margin-top: 4px;
        }

        .status-radio-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .status-radio-card {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: var(--bg-input, #0a0a0a);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          border-radius: 8px;
          padding: 9px 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary, #a1a1aa);
          cursor: pointer;
          transition: all 0.2s;
        }
        .status-radio-card input { display: none; }
        .status-radio-card.checked.active {
          background: rgba(34, 197, 94, 0.15);
          border-color: #22c55e;
          color: #86efac;
        }
        .status-radio-card.checked.trial {
          background: rgba(245, 158, 11, 0.15);
          border-color: #f59e0b;
          color: #fde047;
        }
        .status-radio-card.checked.suspended {
          background: rgba(239, 68, 68, 0.15);
          border-color: #ef4444;
          color: #fca5a5;
        }

        .btn-submit-registration {
          margin-top: 20px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: #0070f3;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 14px 20px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 0 20px rgba(0, 112, 243, 0.4);
        }
        .btn-submit-registration:hover:not(:disabled) {
          background: #0060df;
          box-shadow: 0 0 30px rgba(0, 112, 243, 0.6);
        }
        .btn-submit-registration:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* ─── Digital License Card Preview ─── */
        .preview-box-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 14px;
        }
        .digital-license-card {
          background: var(--bg-surface, #111111);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
          border-radius: 16px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
        }
        .card-top-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .card-logo-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 800;
          color: var(--accent-cyan, #00c2ff);
          background: rgba(0, 194, 255, 0.1);
          padding: 4px 10px;
          border-radius: 20px;
        }
        .card-status-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 6px;
        }
        .card-status-badge.active {
          background: rgba(34, 197, 94, 0.15);
          color: #86efac;
        }
        .card-status-badge.trial {
          background: rgba(245, 158, 11, 0.15);
          color: #fde047;
        }
        .card-status-badge.suspended {
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
        }
        .card-tenant-name {
          margin: 0 0 8px;
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
        }
        .card-owner-line, .card-email-line {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--text-secondary, #a1a1aa);
          margin-bottom: 4px;
        }
        .card-plan-highlight {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-input, #0a0a0a);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          border-radius: 8px;
          padding: 10px 14px;
        }
        .highlight-plan-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 700;
          color: var(--accent-cyan, #00c2ff);
        }
        .highlight-plan-price {
          font-size: 15px;
          font-weight: 800;
          color: #ffffff;
        }
        .card-bottom-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          padding-top: 12px;
        }
        .card-id-block small, .card-expiry-block small {
          display: block;
          font-size: 9px;
          color: #71717a;
          margin-bottom: 2px;
        }
        .card-id-block code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: var(--accent-cyan, #00c2ff);
        }
        .card-expiry-block span {
          font-size: 12px;
          font-weight: 700;
          color: #e4e4e7;
        }

        /* Success Kit Card */
        .success-kit-card {
          margin-top: 20px;
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 14px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .success-kit-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .success-icon {
          font-size: 32px;
          color: #22c55e;
        }
        .success-kit-header h4 {
          margin: 0;
          font-size: 15px;
          color: #ffffff;
        }
        .success-kit-header p {
          margin: 2px 0 0;
          font-size: 12px;
          color: var(--text-secondary, #a1a1aa);
        }
        .credentials-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          background: var(--bg-input, #0a0a0a);
          border-radius: 8px;
          padding: 12px;
        }
        .credential-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
        }
        .cred-title { color: #a1a1aa; }
        .cred-val-box {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cred-val-box code {
          font-family: 'JetBrains Mono', monospace;
          color: var(--accent-cyan, #00c2ff);
        }
        .btn-copy-mini {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: #ffffff;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 11px;
          cursor: pointer;
        }
        .pass-pill {
          background: rgba(245, 158, 11, 0.15);
          color: #fde047;
          padding: 2px 8px;
          border-radius: 6px;
          font-family: 'JetBrains Mono', monospace;
        }

        /* ─── Pricing Matrix Tab ─── */
        .plans-matrix-header {
          text-align: center;
          margin-bottom: 32px;
        }
        .plans-matrix-header h2 {
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
        }
        .plans-matrix-header p {
          margin: 6px 0 0;
          font-size: 14px;
          color: var(--text-secondary, #a1a1aa);
        }
        .plans-showcase-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 20px;
        }
        .plan-showcase-card {
          background: var(--bg-surface, #111111);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          border-radius: 14px;
          padding: 24px 20px 20px;
          display: flex;
          flex-direction: column;
          position: relative;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .plan-showcase-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
          border-color: rgba(255, 255, 255, 0.25);
        }
        .plan-showcase-card.popular {
          border-color: #0070f3;
        }
        .plan-showcase-card.best-value {
          border-color: #f59e0b;
        }
        .featured-banner {
          position: absolute;
          top: -12px;
          right: 20px;
          background: #0070f3;
          color: #ffffff;
          font-size: 11px;
          font-weight: 800;
          padding: 4px 12px;
          border-radius: 8px;
        }
        .featured-banner.gold { background: #f59e0b; color: #000; }
        .featured-banner.purple { background: #8b5cf6; }
        .showcase-icon-box {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
        }
        .plan-showcase-card.indigo .showcase-icon-box {
          background: rgba(99, 102, 241, 0.15);
          color: #a5b4fc;
        }
        .plan-showcase-card.cyan .showcase-icon-box {
          background: rgba(0, 194, 255, 0.15);
          color: #67e8f9;
        }
        .plan-showcase-card.emerald .showcase-icon-box {
          background: rgba(34, 197, 94, 0.15);
          color: #86efac;
        }
        .plan-showcase-card.amber .showcase-icon-box {
          background: rgba(245, 158, 11, 0.15);
          color: #fde047;
        }
        .plan-showcase-card.gray .showcase-icon-box {
          background: rgba(255, 255, 255, 0.08);
          color: #d4d4d8;
        }
        .showcase-title {
          margin: 0;
          font-size: 17px;
          font-weight: 800;
          color: #ffffff;
        }
        .showcase-subtitle {
          margin: 2px 0 12px;
          font-size: 12px;
          color: var(--text-secondary, #a1a1aa);
        }
        .showcase-price-box {
          display: flex;
          align-items: baseline;
          gap: 4px;
          margin-bottom: 14px;
        }
        .currency-val {
          font-size: 32px;
          font-weight: 900;
          color: #ffffff;
        }
        .currency-unit {
          font-size: 16px;
          font-weight: 700;
          color: var(--accent-cyan, #00c2ff);
        }
        .period-unit {
          font-size: 12px;
          color: var(--text-muted, #71717a);
        }
        .showcase-desc {
          font-size: 13px;
          color: #d4d4d8;
          line-height: 1.5;
          margin: 0 0 16px;
          min-height: 54px;
        }
        .showcase-features-list {
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          padding-top: 14px;
          margin-bottom: 20px;
          flex: 1;
        }
        .showcase-features-list h5 {
          margin: 0 0 10px;
          font-size: 12px;
          color: var(--text-secondary, #a1a1aa);
        }
        .showcase-features-list ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .showcase-features-list li {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #e4e4e7;
        }
        .check-icon {
          font-size: 16px;
          color: #22c55e;
        }
        .btn-select-for-add {
          width: 100%;
          background: #0070f3;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 10px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-select-for-add:hover {
          background: #0060df;
        }

        /* ─── Modals (Matching CCMS Shift / Expense Modals) ─── */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(6px);
          z-index: 999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .modal-container {
          background: var(--bg-surface, #111111);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.15));
          border-radius: 14px;
          width: 100%;
          max-width: 580px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
          direction: rtl;
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          border-bottom: 1px solid var(--border-default, rgba(255, 255, 255, 0.08));
        }
        .modal-header-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .modal-header-icon {
          font-size: 26px;
          color: var(--accent-cyan, #00c2ff);
        }
        .modal-header-title h3 {
          margin: 0;
          font-size: 16px;
          color: #ffffff;
        }
        .modal-header-title p {
          margin: 2px 0 0;
          font-size: 12px;
          color: var(--text-secondary, #a1a1aa);
        }
        .btn-close-modal {
          background: none;
          border: none;
          color: #a1a1aa;
          cursor: pointer;
        }
        .btn-close-modal:hover {
          color: #ffffff;
        }
        .modal-body-form {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .modal-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .modal-field label {
          font-size: 13px;
          font-weight: 700;
          color: #d4d4d8;
        }
        .modal-plans-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .modal-plan-card {
          background: var(--bg-input, #0a0a0a);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          border-radius: 8px;
          padding: 10px 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .modal-plan-card.active {
          border-color: #0070f3;
          background: rgba(0, 112, 243, 0.12);
        }
        .modal-plan-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #ffffff;
          margin-bottom: 2px;
        }
        .modal-plan-price {
          font-size: 11px;
          color: var(--accent-cyan, #00c2ff);
        }
        .quick-extend-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .btn-extend-chip {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
          color: #d4d4d8;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-extend-chip:hover {
          background: rgba(0, 194, 255, 0.15);
          border-color: var(--accent-cyan, #00c2ff);
          color: var(--accent-cyan, #00c2ff);
        }
        .modal-footer-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 10px;
          border-top: 1px solid var(--border-default, rgba(255, 255, 255, 0.08));
          padding-top: 16px;
        }
        .btn-modal-cancel {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
          color: #d4d4d8;
          padding: 10px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-modal-save {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #0070f3;
          color: #ffffff;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        /* ─── Alerts & Spinners ─── */
        .alert-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .error-banner {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
        }
        .empty-state-box {
          text-align: center;
          padding: 60px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .empty-icon {
          font-size: 48px;
          color: #71717a;
        }
        .empty-state-box h4 {
          margin: 0;
          font-size: 16px;
          color: #ffffff;
        }
        .empty-state-box p {
          margin: 0;
          font-size: 13px;
          color: var(--text-secondary, #a1a1aa);
          max-width: 420px;
        }
        .spin-anim {
          animation: spin 1s linear infinite;
        }
        .spinner-large {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(0, 194, 255, 0.2);
          border-top-color: var(--accent-cyan, #00c2ff);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .animate-fade-in {
          animation: fadeIn 0.25s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
