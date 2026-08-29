import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../services';
import { apiErrorMessage } from '../services/http';

interface Tenant {
  id: string;
  name: string;
  owner_email: string;
  status: 'active' | 'trial' | 'suspended';
  created_at: string;
}

export default function SuperAdminPage() {
  const [adminSecret, setAdminSecret] = useState(sessionStorage.getItem('ccms_super_admin_key') || '');
  const [showSecret, setShowSecret] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');

  // List States
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'suspended'>('all');

  // Copy Feedback state (id of the tenant currently copied)
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);

  // Add Form States
  const [tenantName, setTenantName] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [status, setStatus] = useState<'active' | 'trial' | 'suspended'>('active');

  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newTenantInfo, setNewTenantInfo] = useState<{ id: string; name: string; owner_email: string; pass?: string } | null>(null);

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
    if (activeTab === 'list' && adminSecret.trim()) {
      fetchTenants();
    }
  }, [activeTab]);

  // Quick Password Generator for adding new tenants
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setOwnerPassword(pass);
    setShowFormPassword(true);
  };

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
      const res = await dataService.registerTenant({
        tenantName: tenantName.trim(),
        ownerFullName: ownerFullName.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerPassword,
        status,
        secretKey: adminSecret.trim(),
      });

      if (res.success) {
        setNewTenantInfo({
          ...res.tenant,
          pass: ownerPassword,
        });
        setTenantName('');
        setOwnerFullName('');
        setOwnerEmail('');
        setOwnerPassword('');
        // Refresh the list in the background
        fetchTenants();
      }
    } catch (err) {
      setAddError(apiErrorMessage(err, 'فشل تسجيل المشترك الجديد. يرجى التحقق من الرمز السري والبيانات.'));
    } finally {
      setAddLoading(false);
    }
  };

  const handleStatusChange = async (tenantId: string, newStatus: string) => {
    if (!adminSecret.trim()) return;
    setUpdatingId(tenantId);
    try {
      const res = await dataService.updateTenantStatus(tenantId, newStatus, adminSecret.trim());
      if (res.success) {
        setTenants(prev =>
          prev.map(t => (t.id === tenantId ? { ...t, status: newStatus as any } : t))
        );
      }
    } catch (err) {
      alert(apiErrorMessage(err, 'تعذر تحديث حالة الاشتراك.'));
    } finally {
      setUpdatingId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyActivationSnippet = (tenant: Tenant) => {
    const message = `🌟 *بيانات ترخيص برنامج الصالة (CCMS Cloud)* 🌟\n\n` +
      `🏢 اسم الصالة: ${tenant.name}\n` +
      `🔑 كود التنشيط السحابي (Tenant ID):\n${tenant.id}\n\n` +
      `👤 حساب المالك: ${tenant.owner_email}\n` +
      `📅 تاريخ التسجيل: ${new Date(tenant.created_at).toLocaleDateString('ar-EG')}\n` +
      `🛡️ الحالة: ${tenant.status === 'active' ? 'نشط / مفعل' : tenant.status === 'trial' ? 'فترة تجريبية' : 'معطل'}\n\n` +
      `انسخ كود التنشيط وضعه في صفحة التنشيط لتشغيل النظام فوراً.`;
    navigator.clipboard.writeText(message);
    setCopiedSnippetId(tenant.id);
    setTimeout(() => setCopiedSnippetId(null), 2500);
  };

  // Export List to CSV
  const exportToCSV = () => {
    if (tenants.length === 0) return;
    let csv = '\uFEFFاسم الصالة,البريد الإلكتروني,معرف المشترك (Tenant ID),الحالة,تاريخ التسجيل\n';
    tenants.forEach(t => {
      const statusLabel = t.status === 'active' ? 'نشط' : t.status === 'trial' ? 'تجريبي' : 'معطل';
      const date = new Date(t.created_at).toLocaleDateString('ar-EG');
      csv += `"${t.name}","${t.owner_email}","${t.id}","${statusLabel}","${date}"\n`;
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
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.owner_email.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [tenants, searchQuery, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = tenants.length;
    const active = tenants.filter(t => t.status === 'active').length;
    const trial = tenants.filter(t => t.status === 'trial').length;
    const suspended = tenants.filter(t => t.status === 'suspended').length;
    const activePercent = total > 0 ? Math.round((active / total) * 100) : 0;
    return { total, active, trial, suspended, activePercent };
  }, [tenants]);

  return (
    <div className="super-admin-portal" dir="rtl">
      {/* Background Cyber Ambient Glows */}
      <div className="ambient-glow cyan-glow" />
      <div className="ambient-glow purple-glow" />

      <div className="portal-container">
        {/* Top Brand & Header Bar */}
        <header className="portal-header">
          <div className="header-main">
            <div className="brand-badge">
              <span className="material-symbols-outlined brand-icon">admin_panel_settings</span>
            </div>
            <div className="header-titles">
              <div className="title-row">
                <h1>لوحة المطورين والإشراف السحابي</h1>
                <span className="version-pill">SUPER ADMIN HUB</span>
              </div>
              <p>إدارة بيئات وقواعد بيانات المشتركين وتراخيص السحابة المعتمدة (Supabase Cloud Multi-Tenant)</p>
            </div>
          </div>

          <div className="header-actions">
            <a href="/login" className="return-login-btn">
              <span className="material-symbols-outlined">exit_to_app</span>
              العودة لشاشة الدخول
            </a>
          </div>
        </header>

        {/* Master Credentials Hub */}
        <section className="credentials-dock">
          <div className="dock-header">
            <div className="dock-title">
              <span className="material-symbols-outlined dock-icon">vpn_key</span>
              <div>
                <h3>مفتاح الوصول السري للمطور (SUPER ADMIN SECRET KEY)</h3>
                <p>مفتاح التشفير السحابي المصرح به للتحكم في قواعد بيانات الصالات وتنشيط التراخيص</p>
              </div>
            </div>
            {tenants.length > 0 && (
              <div className="connection-status-pill connected">
                <span className="status-dot" />
                متصل بالسحابة ({tenants.length} صالة)
              </div>
            )}
          </div>

          <div className="dock-form">
            <div className="secret-input-wrapper">
              <span className="material-symbols-outlined input-icon">key</span>
              <input
                type={showSecret ? 'text' : 'password'}
                placeholder="أدخل رمز مرور المطور السري هنا..."
                value={adminSecret}
                onChange={(e) => handleSecretChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchTenants()}
                className="secret-field"
              />
              <button
                type="button"
                className="reveal-secret-btn"
                onClick={() => setShowSecret(!showSecret)}
                title={showSecret ? 'إخفاء الرمز' : 'إظهار الرمز'}
              >
                <span className="material-symbols-outlined">
                  {showSecret ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>

            <div className="dock-actions">
              <button
                type="button"
                onClick={fetchTenants}
                className="btn-connect"
                disabled={listLoading || !adminSecret.trim()}
              >
                <span className={`material-symbols-outlined ${listLoading ? 'spinning' : ''}`}>
                  {listLoading ? 'progress_activity' : 'cloud_sync'}
                </span>
                {listLoading ? 'جاري الاتصال بالسحابة...' : 'ربط وجلب الصالات'}
              </button>

              {adminSecret && (
                <button
                  type="button"
                  onClick={handleClearSecret}
                  className="btn-clear-key"
                  title="مسح المفتاح من المتصفح"
                >
                  <span className="material-symbols-outlined">logout</span>
                  قطع الاتصال
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Metric KPI Cards */}
        {tenants.length > 0 && (
          <section className="kpi-grid">
            <div className="kpi-card total-card">
              <div className="kpi-header">
                <span className="kpi-label">إجمالي الصالات المسجلة</span>
                <span className="material-symbols-outlined kpi-icon">storefront</span>
              </div>
              <div className="kpi-value">{stats.total}</div>
              <div className="kpi-sub">صالـة / كافيه مشترك</div>
            </div>

            <div className="kpi-card active-card">
              <div className="kpi-header">
                <span className="kpi-label">الاشتراكات النشطة</span>
                <span className="material-symbols-outlined kpi-icon">verified</span>
              </div>
              <div className="kpi-value">{stats.active}</div>
              <div className="kpi-sub text-emerald">
                {stats.activePercent}% من إجمالي المشتركين
              </div>
            </div>

            <div className="kpi-card trial-card">
              <div className="kpi-header">
                <span className="kpi-label">فترات تجريبية (Trial)</span>
                <span className="material-symbols-outlined kpi-icon">hourglass_top</span>
              </div>
              <div className="kpi-value">{stats.trial}</div>
              <div className="kpi-sub text-amber">تحت التقييم المؤقت</div>
            </div>

            <div className="kpi-card suspended-card">
              <div className="kpi-header">
                <span className="kpi-label">معطلة أو منتهية</span>
                <span className="material-symbols-outlined kpi-icon">block</span>
              </div>
              <div className="kpi-value">{stats.suspended}</div>
              <div className="kpi-sub text-rose">تحتاج تجديد اشتراك</div>
            </div>
          </section>
        )}

        {/* Segmented Tab Controls */}
        <div className="tabs-container">
          <div className="tabs-pill-bar">
            <button
              type="button"
              className={`tab-item ${activeTab === 'list' ? 'active' : ''}`}
              onClick={() => setActiveTab('list')}
            >
              <span className="material-symbols-outlined">list_alt</span>
              قائمة الصالات المشتركة
              {tenants.length > 0 && <span className="tab-count-badge">{tenants.length}</span>}
            </button>

            <button
              type="button"
              className={`tab-item ${activeTab === 'add' ? 'active' : ''}`}
              onClick={() => setActiveTab('add')}
            >
              <span className="material-symbols-outlined">add_business</span>
              تسجيل صالة / مشترك جديد
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <main className="content-surface">
          {/* TAB 1: SUBSCRIBERS LIST */}
          {activeTab === 'list' && (
            <div className="tab-view animate-fade-in">
              <div className="list-toolbar">
                <div className="search-filter-group">
                  <div className="search-box">
                    <span className="material-symbols-outlined search-icon">search</span>
                    <input
                      type="text"
                      placeholder="بحث باسم الصالة، البريد، أو معرّف المشترك..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="search-input"
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => setSearchQuery('')} className="clear-search-btn">
                        <span className="material-symbols-outlined">close</span>
                      </button>
                    )}
                  </div>

                  <div className="filter-chips">
                    <button
                      type="button"
                      className={`filter-chip ${statusFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setStatusFilter('all')}
                    >
                      الكل ({tenants.length})
                    </button>
                    <button
                      type="button"
                      className={`filter-chip active-chip ${statusFilter === 'active' ? 'active' : ''}`}
                      onClick={() => setStatusFilter('active')}
                    >
                      نشط ({stats.active})
                    </button>
                    <button
                      type="button"
                      className={`filter-chip trial-chip ${statusFilter === 'trial' ? 'active' : ''}`}
                      onClick={() => setStatusFilter('trial')}
                    >
                      تجريبي ({stats.trial})
                    </button>
                    <button
                      type="button"
                      className={`filter-chip suspended-chip ${statusFilter === 'suspended' ? 'active' : ''}`}
                      onClick={() => setStatusFilter('suspended')}
                    >
                      معطل ({stats.suspended})
                    </button>
                  </div>
                </div>

                <div className="toolbar-actions">
                  <button
                    type="button"
                    onClick={exportToCSV}
                    className="btn-export"
                    disabled={tenants.length === 0}
                    title="تصدير إلى ملف إكسيل"
                  >
                    <span className="material-symbols-outlined">download</span>
                    تصدير Excel
                  </button>

                  <button
                    type="button"
                    onClick={fetchTenants}
                    className="btn-refresh"
                    disabled={listLoading || !adminSecret.trim()}
                    title="تحديث البيانات من السحابة"
                  >
                    <span className={`material-symbols-outlined ${listLoading ? 'spinning' : ''}`}>
                      refresh
                    </span>
                    تحديث
                  </button>
                </div>
              </div>

              {listError && (
                <div className="alert-box error">
                  <span className="material-symbols-outlined">error</span>
                  <div>{listError}</div>
                </div>
              )}

              {listLoading && tenants.length === 0 ? (
                <div className="empty-state-card">
                  <div className="spinner-large" />
                  <h4>جاري جلب بيانات الصالات من السحابة...</h4>
                  <p>يتم الآن التحقق من مفتاح المطور واسترداد سجلات المشتركين وتراخيصهم.</p>
                </div>
              ) : tenants.length === 0 ? (
                <div className="empty-state-card">
                  <span className="material-symbols-outlined empty-icon">cloud_off</span>
                  <h4>لا توجد بيانات صالات معروضة</h4>
                  <p>أدخل رمز مرور المطور السري في الأعلى ثم اضغط على زر "ربط وجلب الصالات".</p>
                </div>
              ) : filteredTenants.length === 0 ? (
                <div className="empty-state-card">
                  <span className="material-symbols-outlined empty-icon">search_off</span>
                  <h4>لم يتم العثور على نتائج</h4>
                  <p>لا توجد صالات تطابق معايير البحث أو التصفية الحالية.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th>اسم الكافيه / الصالة</th>
                        <th>البريد الإلكتروني للمالك</th>
                        <th>معرّف المشترك (TENANT ID)</th>
                        <th>حالة الاشتراك والترخيص</th>
                        <th>تاريخ التسجيل</th>
                        <th style={{ textAlign: 'center' }}>إجراءات التنشيط</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTenants.map(tenant => {
                        const isUpdating = updatingId === tenant.id;
                        const isCopied = copiedId === tenant.id;
                        const isSnippetCopied = copiedSnippetId === tenant.id;

                        return (
                          <tr key={tenant.id} className={isUpdating ? 'row-busy' : ''}>
                            {/* Café Name */}
                            <td>
                              <div className="cafe-identity">
                                <div className="cafe-avatar">
                                  <span className="material-symbols-outlined">sports_esports</span>
                                </div>
                                <div className="cafe-info">
                                  <strong className="cafe-name">{tenant.name}</strong>
                                  <span className="cafe-id-sub">معرف سحابي آمن</span>
                                </div>
                              </div>
                            </td>

                            {/* Owner Email */}
                            <td>
                              <div className="owner-cell">
                                <span className="material-symbols-outlined owner-icon">alternate_email</span>
                                <span className="owner-email">{tenant.owner_email}</span>
                              </div>
                            </td>

                            {/* Tenant ID with Copy */}
                            <td>
                              <div
                                className={`tenant-id-badge ${isCopied ? 'copied' : ''}`}
                                onClick={() => copyToClipboard(tenant.id, tenant.id)}
                                title="انقر لنسخ المعرّف بالكامل"
                              >
                                <span className="material-symbols-outlined copy-icon">
                                  {isCopied ? 'check' : 'content_copy'}
                                </span>
                                <code>{isCopied ? 'تم النسخ!' : `${tenant.id.slice(0, 10)}...`}</code>
                              </div>
                            </td>

                            {/* Subscription Status Selector */}
                            <td>
                              <div className="status-selector-box">
                                <select
                                  value={tenant.status}
                                  onChange={(e) => handleStatusChange(tenant.id, e.target.value)}
                                  className={`status-dropdown ${tenant.status}`}
                                  disabled={isUpdating}
                                >
                                  <option value="active">● نشط / مدفوع</option>
                                  <option value="trial">● فترة تجريبية</option>
                                  <option value="suspended">● معطل / مقفل</option>
                                </select>
                                {isUpdating && <div className="spinner-mini" />}
                              </div>
                            </td>

                            {/* Registration Date */}
                            <td>
                              <div className="date-cell">
                                <span className="material-symbols-outlined date-icon">calendar_today</span>
                                <span>
                                  {new Date(tenant.created_at).toLocaleDateString('ar-EG', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              </div>
                            </td>

                            {/* Quick Actions */}
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => copyActivationSnippet(tenant)}
                                className={`btn-snippet ${isSnippetCopied ? 'snippet-copied' : ''}`}
                                title="نسخ رسالة التنشيط المكتملة لإرسالها للعميل"
                              >
                                <span className="material-symbols-outlined">
                                  {isSnippetCopied ? 'done_all' : 'share'}
                                </span>
                                {isSnippetCopied ? 'تم نسخ الرسالة!' : 'بيانات التنشيط'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ADD NEW SUBSCRIBER */}
          {activeTab === 'add' && (
            <div className="tab-view animate-fade-in">
              <div className="add-grid">
                {/* Form Section */}
                <div className="form-column">
                  <div className="form-title-block">
                    <h2 className="section-title">تسجيل صالة ألعاب جديدة في النظام السحابي</h2>
                    <p className="section-subtitle">
                      يتم فوراً تخصيص معرّف سحابي فريد (Tenant ID)، وإنشاء حساب المالك، وتفعيل رخصة التشغيل في خطوة واحدة.
                    </p>
                  </div>

                  {addError && (
                    <div className="alert-box error">
                      <span className="material-symbols-outlined">error</span>
                      <div>{addError}</div>
                    </div>
                  )}

                  <form onSubmit={handleRegister} className="modern-form">
                    <div className="form-row-2">
                      <div className="field-group">
                        <label className="field-label">
                          اسم صالة الألعاب / الكافيه <span className="req">*</span>
                        </label>
                        <div className="input-affix">
                          <span className="material-symbols-outlined affix-icon">store</span>
                          <input
                            type="text"
                            placeholder="مثال: GameZone Arena"
                            value={tenantName}
                            onChange={(e) => setTenantName(e.target.value)}
                            required
                            className="text-input"
                          />
                        </div>
                      </div>

                      <div className="field-group">
                        <label className="field-label">
                          الاسم الكامل للمالك <span className="req">*</span>
                        </label>
                        <div className="input-affix">
                          <span className="material-symbols-outlined affix-icon">person</span>
                          <input
                            type="text"
                            placeholder="مثال: محمد علي"
                            value={ownerFullName}
                            onChange={(e) => setOwnerFullName(e.target.value)}
                            required
                            className="text-input"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="form-row-2">
                      <div className="field-group">
                        <label className="field-label">
                          البريد الإلكتروني لتسجيل الدخول <span className="req">*</span>
                        </label>
                        <div className="input-affix">
                          <span className="material-symbols-outlined affix-icon">mail</span>
                          <input
                            type="email"
                            placeholder="owner@cafe.com"
                            value={ownerEmail}
                            onChange={(e) => setOwnerEmail(e.target.value)}
                            required
                            className="text-input"
                          />
                        </div>
                      </div>

                      <div className="field-group">
                        <div className="label-with-action">
                          <label className="field-label">
                            كلمة مرور المالك السحابية <span className="req">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={generateRandomPassword}
                            className="btn-quick-gen"
                          >
                            توليد كلمة سر
                          </button>
                        </div>
                        <div className="input-affix">
                          <span className="material-symbols-outlined affix-icon">lock</span>
                          <input
                            type={showFormPassword ? 'text' : 'password'}
                            placeholder="لا تقل عن 6 خانات..."
                            value={ownerPassword}
                            onChange={(e) => setOwnerPassword(e.target.value)}
                            required
                            className="text-input"
                          />
                          <button
                            type="button"
                            className="btn-toggle-eye"
                            onClick={() => setShowFormPassword(!showFormPassword)}
                          >
                            <span className="material-symbols-outlined">
                              {showFormPassword ? 'visibility_off' : 'visibility'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="field-group">
                      <label className="field-label">حالة رخصة الاشتراك المبدئية</label>
                      <div className="radio-cards-group">
                        <label className={`radio-card ${status === 'active' ? 'selected active-choice' : ''}`}>
                          <input
                            type="radio"
                            name="tenant_status"
                            value="active"
                            checked={status === 'active'}
                            onChange={() => setStatus('active')}
                          />
                          <div className="radio-card-content">
                            <div className="radio-card-title">
                              <span className="status-dot green" />
                              نشط (مدفوع بالكامل)
                            </div>
                            <div className="radio-card-desc">صلاحيات كاملة وغير محدودة للنظام</div>
                          </div>
                        </label>

                        <label className={`radio-card ${status === 'trial' ? 'selected trial-choice' : ''}`}>
                          <input
                            type="radio"
                            name="tenant_status"
                            value="trial"
                            checked={status === 'trial'}
                            onChange={() => setStatus('trial')}
                          />
                          <div className="radio-card-content">
                            <div className="radio-card-title">
                              <span className="status-dot amber" />
                              فترة تجريبية (Trial)
                            </div>
                            <div className="radio-card-desc">فترة تقييم مجانية مؤقتة للصالة</div>
                          </div>
                        </label>

                        <label className={`radio-card ${status === 'suspended' ? 'selected suspended-choice' : ''}`}>
                          <input
                            type="radio"
                            name="tenant_status"
                            value="suspended"
                            checked={status === 'suspended'}
                            onChange={() => setStatus('suspended')}
                          />
                          <div className="radio-card-content">
                            <div className="radio-card-title">
                              <span className="status-dot red" />
                              معطل / مقفل
                            </div>
                            <div className="radio-card-desc">حساب موقوف بانتظار السداد</div>
                          </div>
                        </label>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="btn-submit-register"
                      disabled={addLoading}
                    >
                      <span className={`material-symbols-outlined ${addLoading ? 'spinning' : ''}`}>
                        {addLoading ? 'progress_activity' : 'cloud_upload'}
                      </span>
                      {addLoading ? 'جاري تهيئة قاعدة البيانات والتسجيل...' : 'تسجيل وتجهيز الاشتراك السحابي'}
                    </button>
                  </form>
                </div>

                {/* Live Preview Card Section */}
                <div className="preview-column">
                  <div className="preview-header">
                    <span className="material-symbols-outlined">preview</span>
                    <span>معاينة بطاقة الترخيص السحابية</span>
                  </div>

                  <div className="cyber-license-card">
                    <div className="card-top-row">
                      <div className="card-chip">
                        <span className="material-symbols-outlined chip-icon">sim_card</span>
                        <span>CCMS CLOUD LICENSE</span>
                      </div>
                      <div className={`preview-status-tag ${status}`}>
                        {status === 'active' ? 'نشط / مدفوع' : status === 'trial' ? 'فترة تجريبية' : 'معطل'}
                      </div>
                    </div>

                    <div className="card-body-section">
                      <div className="preview-cafe-name">
                        {tenantName.trim() || 'اسم صالة الألعاب'}
                      </div>
                      <div className="preview-owner-name">
                        {ownerFullName.trim() || 'المالك المسؤول'}
                      </div>
                      <div className="preview-email">
                        {ownerEmail.trim() || 'owner@example.com'}
                      </div>
                    </div>

                    <div className="card-bottom-row">
                      <div className="preview-id-block">
                        <span className="id-label">TENANT IDENTIFIER:</span>
                        <code className="id-placeholder">
                          {newTenantInfo ? newTenantInfo.id : 'XXXX-XXXX-XXXX-XXXX'}
                        </code>
                      </div>
                      <div className="card-logo-watermark">
                        <span className="material-symbols-outlined">sports_esports</span>
                      </div>
                    </div>
                  </div>

                  {/* Post-Registration Success Card */}
                  {newTenantInfo && (
                    <div className="success-credential-box animate-pop">
                      <div className="success-badge">
                        <span className="material-symbols-outlined">task_alt</span>
                        <span>تم إنشاء الصالة وحساب المالك بنجاح!</span>
                      </div>

                      <div className="credentials-summary">
                        <div className="cred-item">
                          <span className="cred-label">معرف المشترك (Tenant ID):</span>
                          <div className="cred-val-copy">
                            <code>{newTenantInfo.id}</code>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(newTenantInfo.id, 'new_created')}
                              className="btn-mini-copy"
                            >
                              <span className="material-symbols-outlined">
                                {copiedId === 'new_created' ? 'check' : 'content_copy'}
                              </span>
                              {copiedId === 'new_created' ? 'تم النسخ!' : 'نسخ'}
                            </button>
                          </div>
                        </div>

                        <div className="cred-item">
                          <span className="cred-label">اسم الصالة:</span>
                          <strong>{newTenantInfo.name}</strong>
                        </div>

                        <div className="cred-item">
                          <span className="cred-label">البريد الإلكتروني:</span>
                          <strong>{newTenantInfo.owner_email}</strong>
                        </div>

                        {newTenantInfo.pass && (
                          <div className="cred-item">
                            <span className="cred-label">كلمة المرور:</span>
                            <code className="pass-code">{newTenantInfo.pass}</code>
                          </div>
                        )}
                      </div>

                      <p className="success-hint">
                        💡 انسخ كود الـ Tenant ID وأعطه لمالك الصالة لإدخاله في شاشة التنشيط لتشغيل نسخته فوراً.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <style>{`
        /* ══════════════════════════════════════════════════════════════════════
           SUPER ADMIN PORTAL STYLES (ENTERPRISE GRADE)
        ══════════════════════════════════════════════════════════════════════ */
        .super-admin-portal {
          position: relative;
          min-height: 100vh;
          background: #070a12;
          color: #f1f5f9;
          font-family: 'Cairo', 'Alexandria', system-ui, -apple-system, sans-serif;
          padding: 32px 20px 80px;
          overflow-x: hidden;
        }

        /* Ambient Glows */
        .ambient-glow {
          position: fixed;
          border-radius: 50%;
          filter: blur(140px);
          pointer-events: none;
          z-index: 0;
          opacity: 0.25;
        }
        .cyan-glow {
          top: -100px;
          right: 20%;
          width: 500px;
          height: 400px;
          background: #00c2ff;
        }
        .purple-glow {
          bottom: 10%;
          left: 10%;
          width: 450px;
          height: 450px;
          background: #3b82f6;
        }

        .portal-container {
          position: relative;
          z-index: 1;
          max-width: 1200px;
          margin: 0 auto;
        }

        /* 1. Header */
        .portal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 24px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .header-main {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .brand-badge {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(0, 194, 255, 0.2), rgba(0, 100, 255, 0.1));
          border: 1px solid rgba(0, 194, 255, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 20px rgba(0, 194, 255, 0.25);
        }
        .brand-icon {
          font-size: 30px;
          color: #00c2ff;
        }
        .header-titles h1 {
          font-size: 22px;
          font-weight: 800;
          margin: 0;
          color: #ffffff;
          letter-spacing: -0.01em;
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .version-pill {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          background: rgba(0, 194, 255, 0.15);
          color: #00c2ff;
          border: 1px solid rgba(0, 194, 255, 0.35);
          padding: 2px 8px;
          border-radius: 12px;
          font-family: 'JetBrains Mono', monospace;
        }
        .header-titles p {
          font-size: 13px;
          color: #94a3b8;
          margin: 4px 0 0 0;
        }
        .return-login-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          padding: 10px 18px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
        }
        .return-login-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.25);
        }

        /* 2. Credentials Dock */
        .credentials-dock {
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(0, 194, 255, 0.25);
          border-radius: 16px;
          padding: 20px 24px;
          margin-bottom: 24px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        .dock-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 14px;
        }
        .dock-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .dock-icon {
          font-size: 24px;
          color: #00c2ff;
        }
        .dock-title h3 {
          font-size: 14px;
          font-weight: 700;
          margin: 0;
          color: #f8fafc;
        }
        .dock-title p {
          font-size: 12px;
          color: #94a3b8;
          margin: 2px 0 0;
        }
        .connection-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
        }
        .connection-status-pill.connected {
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.35);
          color: #34d399;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #34d399;
          box-shadow: 0 0 8px #34d399;
        }
        .dock-form {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .secret-input-wrapper {
          flex: 1;
          min-width: 280px;
          position: relative;
          display: flex;
          align-items: center;
        }
        .secret-input-wrapper .input-icon {
          position: absolute;
          right: 14px;
          color: #64748b;
          font-size: 18px;
          pointer-events: none;
        }
        .secret-field {
          width: 100%;
          background: #0b1120;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          padding: 12px 42px 12px 42px;
          color: #00c2ff;
          font-size: 14px;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 600;
          outline: none;
          transition: all 0.2s;
        }
        .secret-field:focus {
          border-color: #00c2ff;
          box-shadow: 0 0 0 3px rgba(0, 194, 255, 0.15);
        }
        .reveal-secret-btn {
          position: absolute;
          left: 12px;
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 6px;
          transition: color 0.2s;
        }
        .reveal-secret-btn:hover {
          color: #f1f5f9;
        }
        .dock-actions {
          display: flex;
          gap: 10px;
        }
        .btn-connect {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #00c2ff, #0077ff);
          color: #ffffff;
          border: none;
          border-radius: 10px;
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(0, 194, 255, 0.3);
        }
        .btn-connect:hover:not(:disabled) {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        .btn-connect:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          filter: grayscale(0.5);
        }
        .btn-clear-key {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #fca5a5;
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-clear-key:hover {
          background: rgba(239, 68, 68, 0.2);
          color: #ffffff;
        }

        /* 3. KPI Metric Cards */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        .kpi-card {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 14px;
          padding: 18px 20px;
          position: relative;
          overflow: hidden;
          transition: all 0.2s;
        }
        .kpi-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.15);
        }
        .kpi-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .kpi-label {
          font-size: 13px;
          color: #94a3b8;
          font-weight: 600;
        }
        .kpi-icon {
          font-size: 22px;
          opacity: 0.8;
        }
        .total-card .kpi-icon { color: #00c2ff; }
        .active-card .kpi-icon { color: #34d399; }
        .trial-card .kpi-icon { color: #fbbf24; }
        .suspended-card .kpi-icon { color: #f87171; }
        .kpi-value {
          font-size: 32px;
          font-weight: 900;
          font-family: 'JetBrains Mono', monospace;
          line-height: 1.1;
          color: #ffffff;
          margin-bottom: 4px;
        }
        .kpi-sub {
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
        }
        .text-emerald { color: #34d399 !important; }
        .text-amber { color: #fbbf24 !important; }
        .text-rose { color: #f87171 !important; }

        /* 4. Tabs Container */
        .tabs-container {
          margin-bottom: 16px;
        }
        .tabs-pill-bar {
          display: flex;
          gap: 10px;
          background: rgba(15, 23, 42, 0.6);
          padding: 6px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          max-width: 500px;
        }
        .tab-item {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: transparent;
          border: none;
          color: #94a3b8;
          padding: 10px 18px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tab-item:hover {
          color: #ffffff;
        }
        .tab-item.active {
          background: linear-gradient(135deg, rgba(0, 194, 255, 0.2), rgba(0, 100, 255, 0.15));
          color: #00c2ff;
          border: 1px solid rgba(0, 194, 255, 0.35);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }
        .tab-count-badge {
          background: rgba(0, 194, 255, 0.25);
          color: #ffffff;
          padding: 1px 7px;
          border-radius: 10px;
          font-size: 11px;
          font-family: 'JetBrains Mono', monospace;
        }

        /* 5. Content Surface */
        .content-surface {
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }

        /* 6. List Toolbar */
        .list-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 20px;
        }
        .search-filter-group {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          flex: 1;
        }
        .search-box {
          position: relative;
          min-width: 260px;
          display: flex;
          align-items: center;
        }
        .search-icon {
          position: absolute;
          right: 12px;
          color: #64748b;
          font-size: 18px;
          pointer-events: none;
        }
        .search-input {
          width: 100%;
          background: #0b1120;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 9px 36px 9px 32px;
          color: #f1f5f9;
          font-size: 13px;
          outline: none;
          transition: border-color 0.2s;
        }
        .search-input:focus {
          border-color: #00c2ff;
        }
        .clear-search-btn {
          position: absolute;
          left: 10px;
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .filter-chips {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .filter-chip {
          background: #0b1120;
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .filter-chip:hover {
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.2);
        }
        .filter-chip.active {
          background: rgba(0, 194, 255, 0.15);
          border-color: rgba(0, 194, 255, 0.4);
          color: #00c2ff;
        }
        .toolbar-actions {
          display: flex;
          gap: 8px;
        }
        .btn-export, .btn-refresh {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #0b1120;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-export:hover:not(:disabled), .btn-refresh:hover:not(:disabled) {
          background: #1e293b;
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.25);
        }
        .btn-export:disabled, .btn-refresh:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* 7. Enterprise Table */
        .table-wrapper {
          overflow-x: auto;
          background: #090e1a;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .enterprise-table {
          width: 100%;
          min-width: 850px;
          border-collapse: collapse;
          text-align: right;
          font-size: 13px;
        }
        .enterprise-table th {
          background: #0f172a;
          color: #94a3b8;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.04em;
          padding: 14px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          white-space: nowrap;
        }
        .enterprise-table td {
          padding: 14px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          vertical-align: middle;
        }
        .enterprise-table tr:hover td {
          background: rgba(255, 255, 255, 0.02);
        }
        .enterprise-table tr:last-child td {
          border-bottom: none;
        }
        .row-busy {
          opacity: 0.5;
          pointer-events: none;
        }

        /* Table Cells */
        .cafe-identity {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cafe-avatar {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(0, 194, 255, 0.1);
          border: 1px solid rgba(0, 194, 255, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #00c2ff;
        }
        .cafe-name {
          display: block;
          font-size: 14px;
          font-weight: 700;
          color: #f8fafc;
        }
        .cafe-id-sub {
          font-size: 11px;
          color: #64748b;
        }
        .owner-cell {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .owner-icon {
          font-size: 16px;
          color: #64748b;
        }
        .owner-email {
          color: #cbd5e1;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
        }
        .tenant-id-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #0f172a;
          border: 1px solid rgba(0, 194, 255, 0.25);
          padding: 5px 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tenant-id-badge:hover {
          background: rgba(0, 194, 255, 0.12);
          border-color: #00c2ff;
        }
        .tenant-id-badge code {
          color: #38bdf8;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 600;
        }
        .tenant-id-badge.copied {
          background: rgba(16, 185, 129, 0.15);
          border-color: rgba(16, 185, 129, 0.4);
        }
        .tenant-id-badge.copied code {
          color: #34d399;
        }
        .copy-icon {
          font-size: 15px;
          opacity: 0.8;
        }

        /* Status Dropdown */
        .status-selector-box {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .status-dropdown {
          appearance: none;
          -webkit-appearance: none;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          outline: none;
          transition: all 0.2s;
        }
        .status-dropdown.active {
          border-color: rgba(16, 185, 129, 0.4);
          background: rgba(16, 185, 129, 0.1);
          color: #34d399;
        }
        .status-dropdown.trial {
          border-color: rgba(245, 158, 11, 0.4);
          background: rgba(245, 158, 11, 0.1);
          color: #fbbf24;
        }
        .status-dropdown.suspended {
          border-color: rgba(239, 68, 68, 0.4);
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
        }
        .date-cell {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #94a3b8;
          font-size: 12px;
        }
        .date-icon {
          font-size: 15px;
          color: #64748b;
        }
        .btn-snippet {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 194, 255, 0.1);
          border: 1px solid rgba(0, 194, 255, 0.25);
          color: #00c2ff;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-snippet:hover {
          background: rgba(0, 194, 255, 0.2);
          border-color: #00c2ff;
        }
        .btn-snippet.snippet-copied {
          background: rgba(16, 185, 129, 0.15);
          border-color: #34d399;
          color: #34d399;
        }

        /* 8. Add Form Grid */
        .add-grid {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 32px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .add-grid {
            grid-template-columns: 1fr;
          }
        }
        .section-title {
          font-size: 18px;
          font-weight: 800;
          margin: 0 0 6px 0;
          color: #ffffff;
        }
        .section-subtitle {
          font-size: 13px;
          color: #94a3b8;
          margin: 0 0 20px 0;
          line-height: 1.5;
        }
        .modern-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .form-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 600px) {
          .form-row-2 {
            grid-template-columns: 1fr;
          }
        }
        .field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-label {
          font-size: 12px;
          font-weight: 700;
          color: #cbd5e1;
        }
        .req { color: #f87171; }
        .label-with-action {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .btn-quick-gen {
          background: transparent;
          border: none;
          color: #00c2ff;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }
        .input-affix {
          position: relative;
          display: flex;
          align-items: center;
        }
        .affix-icon {
          position: absolute;
          right: 12px;
          color: #64748b;
          font-size: 18px;
          pointer-events: none;
        }
        .text-input {
          width: 100%;
          background: #0b1120;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          padding: 11px 40px 11px 36px;
          color: #f1f5f9;
          font-size: 13px;
          outline: none;
          transition: all 0.2s;
        }
        .text-input:focus {
          border-color: #00c2ff;
          box-shadow: 0 0 0 3px rgba(0, 194, 255, 0.12);
        }
        .btn-toggle-eye {
          position: absolute;
          left: 10px;
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .radio-cards-group {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        @media (max-width: 600px) {
          .radio-cards-group {
            grid-template-columns: 1fr;
          }
        }
        .radio-card {
          position: relative;
          display: flex;
          background: #0b1120;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .radio-card input {
          position: absolute;
          opacity: 0;
        }
        .radio-card-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .radio-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
          color: #cbd5e1;
        }
        .radio-card-desc {
          font-size: 11px;
          color: #64748b;
          line-height: 1.3;
        }
        .status-dot.green { background: #34d399; box-shadow: 0 0 6px #34d399; }
        .status-dot.amber { background: #fbbf24; box-shadow: 0 0 6px #fbbf24; }
        .status-dot.red { background: #f87171; box-shadow: 0 0 6px #f87171; }
        .radio-card.selected.active-choice {
          border-color: #34d399;
          background: rgba(16, 185, 129, 0.08);
        }
        .radio-card.selected.trial-choice {
          border-color: #fbbf24;
          background: rgba(245, 158, 11, 0.08);
        }
        .radio-card.selected.suspended-choice {
          border-color: #f87171;
          background: rgba(239, 68, 68, 0.08);
        }
        .btn-submit-register {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: linear-gradient(135deg, #00c2ff, #0077ff);
          color: #ffffff;
          border: none;
          border-radius: 10px;
          padding: 13px 24px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 16px rgba(0, 194, 255, 0.3);
          margin-top: 6px;
        }
        .btn-submit-register:hover:not(:disabled) {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        .btn-submit-register:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* 9. Live Preview Card */
        .preview-column {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .preview-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
        }
        .cyber-license-card {
          background: linear-gradient(135deg, #111827 0%, #0b1120 100%);
          border: 1px solid rgba(0, 194, 255, 0.3);
          border-radius: 16px;
          padding: 20px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 194, 255, 0.15);
        }
        .card-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .card-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-family: 'JetBrains Mono', monospace;
          color: #00c2ff;
          font-weight: 800;
          letter-spacing: 0.05em;
        }
        .chip-icon {
          font-size: 18px;
          color: #00c2ff;
        }
        .preview-status-tag {
          font-size: 11px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 6px;
        }
        .preview-status-tag.active {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .preview-status-tag.trial {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .preview-status-tag.suspended {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .card-body-section {
          margin-bottom: 24px;
        }
        .preview-cafe-name {
          font-size: 18px;
          font-weight: 800;
          color: #ffffff;
          margin-bottom: 4px;
        }
        .preview-owner-name {
          font-size: 13px;
          font-weight: 600;
          color: #cbd5e1;
          margin-bottom: 2px;
        }
        .preview-email {
          font-size: 12px;
          color: #64748b;
          font-family: 'JetBrains Mono', monospace;
        }
        .card-bottom-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          padding-top: 14px;
        }
        .preview-id-block {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .id-label {
          font-size: 9px;
          color: #64748b;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.05em;
        }
        .id-placeholder {
          font-size: 11px;
          font-family: 'JetBrains Mono', monospace;
          color: #00c2ff;
          letter-spacing: 0.02em;
        }
        .card-logo-watermark span {
          font-size: 32px;
          color: rgba(255, 255, 255, 0.05);
        }

        /* Success Box */
        .success-credential-box {
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 14px;
          padding: 16px;
        }
        .success-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #34d399;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 12px;
        }
        .credentials-summary {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 12px;
          margin-bottom: 12px;
        }
        .cred-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .cred-label { color: #94a3b8; }
        .cred-val-copy {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .cred-val-copy code {
          background: #090e1a;
          padding: 2px 6px;
          border-radius: 4px;
          color: #00c2ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
        }
        .pass-code {
          background: #090e1a;
          padding: 2px 6px;
          border-radius: 4px;
          color: #fbbf24;
          font-family: 'JetBrains Mono', monospace;
        }
        .btn-mini-copy {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 11px;
          cursor: pointer;
        }
        .btn-mini-copy:hover {
          border-color: #00c2ff;
          color: #00c2ff;
        }
        .success-hint {
          font-size: 11px;
          color: #94a3b8;
          margin: 0;
          line-height: 1.4;
        }

        /* 10. Alerts & Empty States */
        .alert-box {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 10px;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .alert-box.error {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
        }
        .empty-state-card {
          text-align: center;
          padding: 60px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .empty-icon {
          font-size: 48px;
          color: #475569;
        }
        .empty-state-card h4 {
          font-size: 16px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0;
        }
        .empty-state-card p {
          font-size: 13px;
          color: #64748b;
          max-width: 420px;
          margin: 0;
        }

        /* Spinners & Animations */
        .spinning {
          animation: spin 1s linear infinite;
        }
        .spinner-large {
          width: 36px;
          height: 36px;
          border: 3px solid rgba(0, 194, 255, 0.15);
          border-top-color: #00c2ff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .spinner-mini {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(0, 194, 255, 0.2);
          border-top-color: #00c2ff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-fade-in {
          animation: fadeIn 0.25s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-pop {
          animation: pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes pop {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
