/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    getAppVersion: () => Promise<string>;
    isPackaged: () => Promise<boolean>;
    checkForUpdates?: () => Promise<{ status: string; updateInfo?: any; error?: string; message?: string }>;
    quitAndInstall?: () => Promise<void>;
    onUpdateAvailable?: (callback: (info: any) => void) => () => void;
    onUpdateDownloaded?: (callback: (info: any) => void) => () => void;
    onDownloadProgress?: (callback: (progress: any) => void) => () => void;
  };
}
