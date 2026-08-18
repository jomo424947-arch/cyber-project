import { useState, useEffect } from 'react';
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
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');

  // List Tab States
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Add Form States
  const [tenantName, setTenantName] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [status, setStatus] = useState('active');

  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [newTenantInfo, setNewTenantInfo] = useState<{ id: string; name: string; owner_email: string } | null>(null);

  // Save admin secret key to sessionStorage
  const handleSecretChange = (val: string) => {
    setAdminSecret(val);
    sessionStorage.setItem('ccms_super_admin_key', val);
  };

  const fetchTenants = async () => {
    if (!adminSecret.trim()) {
      setListError('يرجى إدخال رمز الوصول السري للمطور في الأعلى لجلب المشتركين. / Please enter the Super Admin Secret Key.');
      setTenants([]);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const res = await dataService.getTenants(adminSecret.trim());
      if (res.success) {
        setTenants(res.tenants);
      }
    } catch (err) {
      setListError(apiErrorMessage(err, 'فشل جلب المشتركين. تأكد من صحة الرمز السري. / Failed to fetch subscribers.'));
      setTenants([]);
    } finally {
      setListLoading(false);
    }
  };

  // Fetch automatically on tab change or secret key input completion
  useEffect(() => {
    if (activeTab === 'list' && adminSecret.trim()) {
      fetchTenants();
    }
  }, [activeTab, adminSecret]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(null);
    setNewTenantInfo(null);

    if (!adminSecret.trim()) {
      setAddError('الرمز السري للمطور مطلوب. / Secret Key is required.');
      return;
    }

    if (!tenantName.trim() || !ownerFullName.trim() || !ownerEmail.trim() || !ownerPassword) {
      setAddError('جميع الحقول مطلوبة. / All fields are required.');
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
        setAddSuccess('تم تسجيل صالة الألعاب الجديدة بنجاح وإنشاء حساب المالك السحابي! / Café registered successfully.');
        setNewTenantInfo(res.tenant);
        setTenantName('');
        setOwnerFullName('');
        setOwnerEmail('');
        setOwnerPassword('');
        // Refresh the list in the background
        fetchTenants();
      }
    } catch (err) {
      setAddError(apiErrorMessage(err, 'فشل تسجيل المشترك الجديد. تأكد من رمز الوصول السري. / Registration failed.'));
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
      alert(apiErrorMessage(err, 'Failed to update subscription status.'));
    } finally {
      setUpdatingId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="super-admin-page">
      <div className="admin-container">
        <header className="admin-header">
          <div className="admin-brand">
            <span className="admin-logo">⬡</span>
            <h1>لوحة المطورين والشخص المفوض (Super Admin)</h1>
          </div>
          <p className="admin-subtitle">تسجيل وإدارة بيئات وقواعد بيانات المشتركين الجدد على السحابة (Supabase Cloud)</p>
        </header>

        {/* Global Credentials Bar */}
        <div className="credentials-card">
          <div className="form-group">
            <label>رمز مرور المطور السري (Super Admin Key)</label>
            <div className="input-with-button">
              <input
                type="password"
                placeholder="أدخل رمز مرور المطور السري"
                value={adminSecret}
                onChange={(e) => handleSecretChange(e.target.value)}
                className="admin-input secret-input"
              />
              <button 
                onClick={fetchTenants} 
                className="admin-btn-secondary" 
                disabled={listLoading || !adminSecret.trim()}
              >
                {listLoading ? 'جاري الاتصال...' : 'ربط وجلب المشتركين'}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="tabs-bar">
          <button 
            className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>list_alt</span>
            قائمة الصالات المشتركة ({tenants.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => setActiveTab('add')}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_business</span>
            إضافة صالة/مشترك جديد
          </button>
        </div>

        {/* Tab Contents */}
        <main className="admin-card">
          {activeTab === 'list' && (
            <div className="tab-content">
              <div className="list-header">
                <div>
                  <h2 className="card-title">الصالات والنوادي المسجلة</h2>
                  <p className="card-desc">إدارة صلاحيات الاشتراكات السحابية، وحالات تنشيط تراخيص الاستخدام الفعالة.</p>
                </div>
                <button onClick={fetchTenants} className="refresh-btn" disabled={listLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>refresh</span>
                  تحديث القائمة
                </button>
              </div>

              {listError && <div className="admin-alert error">{listError}</div>}

              {listLoading && tenants.length === 0 ? (
                <div className="loader-box">
                  <div className="spinner"></div>
                  <p>جاري جلب المشتركين من السحابة...</p>
                </div>
              ) : tenants.length === 0 ? (
                <div className="empty-box">
                  <p>لا يوجد مشتركون حالياً. أدخل الرمز السري للمطور ثم انقر على "ربط وجلب المشتركين".</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="subscribers-table">
                    <thead>
                      <tr>
                        <th>اسم الكافيه / الصالة</th>
                        <th>البريد الإلكتروني للمالك</th>
                        <th>رقم تعريف المشترك (Tenant ID)</th>
                        <th>حالة الاشتراك</th>
                        <th>تاريخ التسجيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map(tenant => (
                        <tr key={tenant.id} className={updatingId === tenant.id ? 'row-updating' : ''}>
                          <td className="cafe-name-cell">
                            <strong>{tenant.name}</strong>
                          </td>
                          <td>{tenant.owner_email}</td>
                          <td>
                            <div className="copy-id-box" onClick={() => copyToClipboard(tenant.id)} title="انقر لنسخ المعرّف">
                              <code>{tenant.id.slice(0, 8)}...</code>
                              <span className="material-symbols-outlined" style={{ fontSize: '14px', opacity: 0.8 }}>content_copy</span>
                            </div>
                          </td>
                          <td>
                            <select
                              value={tenant.status}
                              onChange={(e) => handleStatusChange(tenant.id, e.target.value)}
                              className={`status-select ${tenant.status}`}
                              disabled={updatingId !== null}
                            >
                              <option value="active">نشط / مدفوع</option>
                              <option value="trial">فترة تجريبية</option>
                              <option value="suspended">معطل / مقفل</option>
                            </select>
                          </td>
                          <td className="date-cell">
                            {new Date(tenant.created_at).toLocaleDateString('ar-EG', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'add' && (
            <div className="tab-content">
              <h2 className="card-title">تسجيل صالة ألعاب جديدة في النظام</h2>
              <p className="card-desc">يقوم بإنشاء جزء مخصص في قاعدة البيانات وحساب المدير المالك في خطوة واحدة سحابياً.</p>

              <form onSubmit={handleRegister} className="admin-form">
                <div className="form-group">
                  <label>اسم صالة الألعاب / الكافيه</label>
                  <input
                    type="text"
                    placeholder="مثال: صالة ألعاب وسط البلد"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    className="admin-input"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>الاسم الكامل للمالك</label>
                  <input
                    type="text"
                    placeholder="مثال: محمد علي"
                    value={ownerFullName}
                    onChange={(e) => setOwnerFullName(e.target.value)}
                    className="admin-input"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>البريد الإلكتروني للمالك</label>
                  <input
                    type="email"
                    placeholder="owner@cafe.com"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="admin-input"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>كلمة مرور تسجيل الدخول السحابي</label>
                  <input
                    type="password"
                    placeholder="لا تقل عن 6 خانات"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    className="admin-input"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>حالة رخصة الاشتراك المبدئية</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="admin-select"
                  >
                    <option value="active">نشط (مدفوع بالكامل)</option>
                    <option value="trial">تجريبي (فترة تقييم مجانية)</option>
                    <option value="suspended">معطل / متوقف عن الدفع</option>
                  </select>
                </div>

                {addError && <div className="admin-alert error">{addError}</div>}
                {addSuccess && <div className="admin-alert success">{addSuccess}</div>}

                {newTenantInfo && (
                  <div className="tenant-details">
                    <h3>بيانات الاشتراك المنشأ حديثاً:</h3>
                    <ul style={{ direction: 'rtl', paddingRight: '20px' }}>
                      <li><strong>رقم تعريف المشترك (Tenant ID):</strong> <code>{newTenantInfo.id}</code> <button type="button" onClick={() => copyToClipboard(newTenantInfo.id)} className="copy-inline-btn">نسخ المعرف</button></li>
                      <li><strong>اسم الكافيه:</strong> {newTenantInfo.name}</li>
                      <li><strong>البريد الإلكتروني:</strong> {newTenantInfo.owner_email}</li>
                    </ul>
                    <p className="details-hint">يمكن للعميل الآن استخدام هذه البيانات لتنشيط نسخته المحلية من برنامج الصالة.</p>
                  </div>
                )}

                <button type="submit" className="admin-btn" disabled={addLoading}>
                  {addLoading ? 'جاري التسجيل والتهيئة...' : 'تسجيل وتجهيز الاشتراك السحابي'}
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      <style>{`
        .super-admin-page {
          min-height: 100vh;
          background: #070913;
          color: #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }
        .admin-container {
          width: 100%;
          max-width: 900px;
        }
        .admin-header {
          text-align: center;
          margin-bottom: 24px;
        }
        .admin-brand {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 8px;
        }
        .admin-logo {
          font-size: 32px;
          color: #00d4ff;
          text-shadow: 0 0 10px rgba(0, 212, 255, 0.4);
        }
        .admin-header h1 {
          font-size: 24px;
          font-weight: 800;
          margin: 0;
          letter-spacing: -0.02em;
        }
        .admin-subtitle {
          font-size: 13px;
          color: #94a3b8;
          margin: 0;
        }
        .credentials-card {
          background: #0d1224;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 20px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        .input-with-button {
          display: flex;
          gap: 10px;
        }
        .input-with-button .admin-input {
          flex: 1;
        }
        .admin-btn-secondary {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #f1f5f9;
          padding: 10px 16px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .admin-btn-secondary:hover:not(:disabled) {
          background: #334155;
        }
        .admin-btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .tabs-bar {
          display: flex;
          gap: 10px;
          margin-bottom: 12px;
        }
        .tab-btn {
          flex: 1;
          background: #0d1224;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-bottom: none;
          color: #94a3b8;
          padding: 12px;
          border-radius: 8px 8px 0 0;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tab-btn:hover {
          color: #f1f5f9;
          background: #161c33;
        }
        .tab-btn.active {
          background: #111827;
          color: #00d4ff;
          border-color: rgba(0, 212, 255, 0.2);
          border-bottom: 2px solid #00d4ff;
        }
        .admin-card {
          background: #111827;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 0 0 16px 16px;
          padding: 30px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }
        .tab-content {
          animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .card-title {
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 6px 0;
        }
        .card-desc {
          font-size: 13px;
          color: #94a3b8;
          margin: 0 0 24px 0;
        }
        .list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          gap: 16px;
        }
        .refresh-btn {
          background: #1f2937;
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: #94a3b8;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .refresh-btn:hover {
          color: #f1f5f9;
          background: #374151;
        }
        .admin-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          font-weight: 600;
        }
        .admin-input, .admin-select {
          background: #1f2937;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 10px 12px;
          color: #f8fafc;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }
        .admin-input:focus, .admin-select:focus {
          border-color: #00d4ff;
        }
        .secret-input {
          border-color: rgba(0, 212, 255, 0.3);
        }
        .admin-alert {
          border-radius: 8px;
          padding: 12px;
          font-size: 13px;
          line-height: 1.5;
          margin-bottom: 14px;
        }
        .admin-alert.error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #fca5a5;
        }
        .admin-alert.success {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.2);
          color: #86efac;
        }
        .loader-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          gap: 16px;
          color: #94a3b8;
        }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(0, 212, 255, 0.1);
          border-top-color: #00d4ff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .empty-box {
          text-align: center;
          padding: 60px 20px;
          color: #64748b;
          font-size: 14px;
          line-height: 1.6;
          border: 1px dashed rgba(255, 255, 255, 0.05);
          border-radius: 8px;
        }
        .table-responsive {
          overflow-x: auto;
          background: #0f172a;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .subscribers-table {
          width: 100%;
          min-width: 750px;
          border-collapse: collapse;
          text-align: left;
          font-size: 13px;
        }
        .subscribers-table th, .subscribers-table td {
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .subscribers-table th {
          background: #1e293b;
          color: #94a3b8;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.05em;
        }
        .subscribers-table tr:last-child td {
          border-bottom: none;
        }
        .cafe-name-cell {
          color: #f8fafc;
        }
        .copy-id-box {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #1e293b;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .copy-id-box:hover {
          background: #334155;
          color: #00d4ff;
        }
        .copy-id-box code {
          color: #38bdf8;
          font-family: Consolas, Monaco, monospace;
          font-size: 11px;
        }
        .copy-icon {
          font-size: 11px;
          opacity: 0.7;
        }
        .status-select {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #f1f5f9;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 8px;
          outline: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        .status-select.active {
          border-color: rgba(34, 197, 94, 0.4);
          color: #4ade80;
        }
        .status-select.trial {
          border-color: rgba(234, 179, 8, 0.4);
          color: #facc15;
        }
        .status-select.suspended {
          border-color: rgba(239, 68, 68, 0.4);
          color: #f87171;
        }
        .row-updating {
          opacity: 0.5;
          pointer-events: none;
        }
        .tenant-details {
          background: #1e293b;
          border-radius: 8px;
          padding: 16px;
          font-size: 13px;
        }
        .tenant-details h3 {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: #86efac;
        }
        .tenant-details ul {
          list-style: none;
          padding: 0;
          margin: 0 0 12px 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tenant-details code {
          background: #0f172a;
          padding: 2px 6px;
          border-radius: 4px;
          color: #00d4ff;
        }
        .copy-inline-btn {
          background: #111827;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
          margin-left: 6px;
        }
        .copy-inline-btn:hover {
          color: #f1f5f9;
          background: #1f2937;
        }
        .details-hint {
          margin: 0;
          color: #94a3b8;
          font-size: 11px;
        }
        .admin-btn {
          background: linear-gradient(135deg, #00d4ff 0%, #0077ff 100%);
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 12px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: filter 0.2s;
        }
        .admin-btn:hover {
          filter: brightness(1.15);
        }
        .admin-btn:disabled {
          filter: grayscale(1);
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
