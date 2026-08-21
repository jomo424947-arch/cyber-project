const { app, BrowserWindow, ipcMain } = require('electron');
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

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'CCMS — Cyber Café & Gaming Lounge System',
    autoHideMenuBar: true,
    show: false, // Don't show until content is ready
    backgroundColor: '#0A0A0A', // Match app dark background to prevent white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
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
