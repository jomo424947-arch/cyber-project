import { useState, useEffect } from 'react';

interface UpdateInfo {
  version: string;
  releaseDate?: string;
}

interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubAvailable = window.electronAPI.onUpdateAvailable?.((info: UpdateInfo) => {
      setUpdateAvailable(info);
      setDismissed(false);
    });

    const unsubProgress = window.electronAPI.onDownloadProgress?.((progress: DownloadProgress) => {
      if (progress && typeof progress.percent === 'number') {
        setDownloadProgress(Math.round(progress.percent));
      }
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded?.((info: UpdateInfo) => {
      setUpdateDownloaded(info);
      setDownloadProgress(null);
      setDismissed(false);
    });

    return () => {
      if (unsubAvailable) unsubAvailable();
      if (unsubProgress) unsubProgress();
      if (unsubDownloaded) unsubDownloaded();
    };
  }, []);

  if (dismissed || (!updateAvailable && !updateDownloaded)) {
    return null;
  }

  const handleRestart = () => {
    if (window.electronAPI?.quitAndInstall) {
      window.electronAPI.quitAndInstall();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 99999,
        maxWidth: '420px',
        backgroundColor: '#161618',
        border: '1px solid var(--accent-cyan, #06b6d4)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6), 0 0 15px rgba(6, 182, 212, 0.25)',
        borderRadius: '12px',
        padding: '16px',
        color: '#ffffff',
        direction: 'rtl',
        fontFamily: 'inherit',
        animation: 'fadeInUp 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: updateDownloaded ? 'rgba(34, 197, 94, 0.15)' : 'rgba(6, 182, 212, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: updateDownloaded ? '#22c55e' : '#06b6d4',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
            {updateDownloaded ? 'system_update_alt' : 'cloud_download'}
          </span>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>
            {updateDownloaded ? 'التحديث جاهز للتثبيت! 🎉' : 'تحديث جديد متوفر 🚀'}
          </div>

          <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.4, marginBottom: '10px' }}>
            {updateDownloaded ? (
              <span>
                تم تنزيل الإصدار <strong>v{updateDownloaded.version}</strong> بنجاح. أعد تشغيل التطبيق لتطبيق التحديث.
              </span>
            ) : (
              <span>
                يتم الآن تنزيل الإصدار <strong>v{updateAvailable?.version}</strong> في الخلفية...
                {downloadProgress !== null && ` (${downloadProgress}%)`}
              </span>
            )}
          </div>

          {/* Progress bar if downloading */}
          {downloadProgress !== null && !updateDownloaded && (
            <div
              style={{
                width: '100%',
                height: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '3px',
                overflow: 'hidden',
                marginBottom: '12px',
              }}
            >
              <div
                style={{
                  width: `${downloadProgress}%`,
                  height: '100%',
                  backgroundColor: 'var(--accent-cyan, #06b6d4)',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {updateDownloaded && (
              <button
                type="button"
                onClick={handleRestart}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#22c55e',
                  color: '#000000',
                  fontWeight: 600,
                  fontSize: '13px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>restart_alt</span>
                إعادة التشغيل الآن
              </button>
            )}

            <button
              type="button"
              onClick={() => setDismissed(true)}
              style={{
                padding: '6px 12px',
                backgroundColor: 'transparent',
                color: '#9ca3af',
                fontSize: '13px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                cursor: 'pointer',
              }}
            >
              {updateDownloaded ? 'لاحقاً' : 'إخفاء'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
