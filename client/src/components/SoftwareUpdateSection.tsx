import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';

export function SoftwareUpdateSection() {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [version, setVersion] = useState<string>('1.0.0');
  const [checking, setChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'info' | 'error' | null>(null);
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then((v) => {
        if (v) setVersion(v);
      }).catch(() => {});
    }
  }, []);

  const handleCheckUpdates = async () => {
    if (!window.electronAPI?.checkForUpdates) {
      setStatusType('info');
      setStatusMessage(isAr ? 'أنت تستخدم تطبيق الويب؛ النظام محدث باستمرار عبر السيرفر.' : 'You are running on the web browser. The system is auto-updated from the server.');
      return;
    }

    setChecking(true);
    setStatusMessage(null);

    try {
      const res = await window.electronAPI.checkForUpdates();
      if (res?.status === 'dev-mode') {
        setStatusType('info');
        setStatusMessage(res.message || (isAr ? 'وضع التطوير (Development Mode)' : 'Development Mode'));
      } else if (res?.status === 'success') {
        setStatusType('success');
        setStatusMessage(isAr ? 'تم بدء فحص التحديثات! سيظهر إشعار تلقائي إذا وجد تحديث جديد.' : 'Checking completed. A notification will appear if an update is available.');
      } else {
        setStatusType('error');
        setStatusMessage(res?.error || (isAr ? 'حدث خطأ أثناء فحص التحديثات' : 'Error checking updates'));
      }
    } catch (err: any) {
      setStatusType('error');
      setStatusMessage(err?.message || (isAr ? 'تعذر الاتصال بخدمة التحديثات' : 'Failed to connect to update service'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card style={{ marginBottom: '24px', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'rgba(6, 182, 212, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-cyan, #06b6d4)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>update</span>
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {isAr ? 'تحديثات البرنامج (Auto-Update)' : 'Software Updates'}
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>
                {isAr
                  ? `الإصدار الحالي مثبت: v${version} ${isElectron ? '(تطبيق سطح المكتب)' : '(نسخة السيرفر)'}`
                  : `Current version: v${version} ${isElectron ? '(Desktop App)' : '(Web / Server)'}`}
              </p>
            </div>
          </div>

          <Button
            onClick={handleCheckUpdates}
            disabled={checking}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span className={`material-symbols-outlined ${checking ? 'animate-spin' : ''}`} style={{ fontSize: '18px' }}>
              sync
            </span>
            {checking
              ? (isAr ? 'جاري الفحص...' : 'Checking...')
              : (isAr ? 'التحقق من التحديثات' : 'Check for Updates')}
          </Button>
        </div>

        {statusMessage && (
          <div
            style={{
              marginTop: '14px',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor:
                statusType === 'success'
                  ? 'rgba(34, 197, 94, 0.12)'
                  : statusType === 'error'
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'rgba(6, 182, 212, 0.12)',
              color:
                statusType === 'success'
                  ? '#22c55e'
                  : statusType === 'error'
                  ? '#ef4444'
                  : '#06b6d4',
              border: `1px solid ${
                statusType === 'success'
                  ? 'rgba(34, 197, 94, 0.3)'
                  : statusType === 'error'
                  ? 'rgba(239, 68, 68, 0.3)'
                  : 'rgba(6, 182, 212, 0.3)'
              }`,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              {statusType === 'success' ? 'check_circle' : statusType === 'error' ? 'error' : 'info'}
            </span>
            <span>{statusMessage}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
