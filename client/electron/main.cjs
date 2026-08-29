const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
const logPath = path.join(app.getPath('userData'), 'ccms-error.log');

// Log errors to a local file so we can read them offline
function logError(message, err) {
  const errMsg = `${new Date().toISOString()} - ${message}: ${err?.stack || err || ''}\n`;
  try {
    fs.appendFileSync(logPath, errMsg);
  } catch (e) {
    // ignore
  }
  console.error(message, err);
}

// Start the embedded Express server in production
function startServer() {
  try {
    const serverPath = path.join(__dirname, 'server', 'index.js');
    if (fs.existsSync(serverPath)) {
      logError('🚀 Starting embedded Express server...', '');
      
      // Set production variables
      process.env.PORT = '5000';
      process.env.NODE_ENV = 'production';
      
      // Ensure the SQLite database uses the app data directory
      process.env.APPDATA = app.getPath('appData');
      
      // Load the server
      require(serverPath);
      logError('✓ Embedded server is up and running on port 5000.', '');
    } else {
      logError('ℹ Embedded server entry point not found (dev mode or separate server process): ' + serverPath, '');
    }
  } catch (err) {
    logError('❌ Failed to start embedded server', err);
  }
}

function createWindow() {
  // Clear old logs on start
  try {
    fs.writeFileSync(logPath, `CCMS Log started at ${new Date().toISOString()}\n`);
  } catch (e) {}

  // Start background API server
  startServer();

  const iconPath = fs.existsSync(path.join(__dirname, 'icon.png'))
    ? path.join(__dirname, 'icon.png')
    : path.join(__dirname, '..', 'build', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'CCMS — Smart Management System',
    icon: iconPath,
    autoHideMenuBar: true,
    show: false, // Don't show until content is ready
    backgroundColor: '#0A0A0A', // Match app dark background to prevent white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false, // Prevent timer throttling when app is minimized/in background
    },
  });

  // Enable F12 / Ctrl+Shift+I to toggle DevTools for diagnostics
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Log renderer console messages to diagnostic log
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) { // warnings and errors
      logError(`[Renderer Console L${level}] ${message} (${sourceId}:${line})`, '');
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logError(`[did-fail-load] code=${errorCode}, desc=${errorDescription}, url=${validatedURL}`, '');
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    logError(`[render-process-gone] reason=${details.reason}, exitCode=${details.exitCode}`, '');
  });

  // Show window once content is ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const prodPath = path.join(__dirname, '..', 'dist', 'index.html');

  if (isDev && !fs.existsSync(prodPath)) {
    logError('Loading dev URL http://localhost:5173', '');
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      logError('Failed to load dev server URL', err);
    });
  } else if (fs.existsSync(prodPath)) {
    logError(`Loading local production bundle: ${prodPath}`, '');
    mainWindow.loadFile(prodPath).catch((err) => {
      logError('Failed to load local HTML file', err);
    });
  } else {
    logError('Fallback: Loading http://localhost:5173', '');
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      logError('Failed to load fallback URL', err);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC communication handlers for desktop-specific native APIs
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('is-packaged', () => app.isPackaged);

// Auto-updater configuration and IPC handlers
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.logger = {
    info: (msg) => logError(`[AutoUpdater INFO] ${msg}`, ''),
    warn: (msg) => logError(`[AutoUpdater WARN] ${msg}`, ''),
    error: (msg) => logError(`[AutoUpdater ERROR] ${msg}`, '')
  };

  autoUpdater.on('checking-for-update', () => {
    logError('Checking for updates...', '');
  });

  autoUpdater.on('update-available', (info) => {
    logError(`Update available: v${info.version}`, '');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    logError(`Update downloaded: v${info.version}`, '');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info);
    }

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'تحديث جديد متوفر — CCMS',
      message: `تم تنزيل التحديث الجديد (v${info.version}) بنجاح!\n\nهل تريد إعادة تشغيل التطبيق وتثبيت التحديث الآن؟`,
      buttons: ['إعادة التشغيل والتحديث الآن', 'لاحقاً عند إغلاق البرنامج'],
      defaultId: 0,
      cancelId: 1
    }).then((res) => {
      if (res.response === 0) {
        autoUpdater.quitAndInstall();
      }
    }).catch(() => {});
  });

  autoUpdater.on('error', (err) => {
    logError('AutoUpdater error', err);
  });

  // Automatically check for updates 6 seconds after start (production build only)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        logError('Automatic check for updates failed', err);
      });
    }, 6000);
  }
}

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return {
      status: 'dev-mode',
      message: 'التحديث التلقائي يعمل في النسخة المثبتة المجمعة فقط (Production Build)'
    };
  }
  try {
    const checkResult = await autoUpdater.checkForUpdates();
    return {
      status: 'success',
      updateInfo: checkResult?.updateInfo
    };
  } catch (err) {
    logError('Manual check for updates failed', err);
    return { status: 'error', error: err?.message || 'فشل فحص التحديثات' };
  }
});

ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});

