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
  if (app.isPackaged) {
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
        logError('✓ Embedded server is up and running.', '');
      } else {
        logError('❌ Server entry point not found at: ' + serverPath, '');
      }
    } catch (err) {
      logError('❌ Failed to start embedded server', err);
    }
  }
}

function createWindow() {
  // Clear old logs on start
  try {
    fs.writeFileSync(logPath, `CCMS Log started at ${new Date().toISOString()}\n`);
  } catch (e) {}

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

  // Show window once content is ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // In production, poll the embedded server until it responds, then load.
    const serverUrl = 'http://localhost:5000';
    const maxAttempts = 20; // Up to ~10 seconds
    let attempt = 0;
    let isReady = false;

    function tryLoadServer() {
      if (isReady) return;
      attempt++;
      
      const http = require('http');
      let gotResponse = false;
      
      const req = http.get(`${serverUrl}/health`, (res) => {
        gotResponse = true;
        res.resume(); // Consume response data to free up memory/socket
        
        if (!isReady) {
          isReady = true;
          logError(`✓ Server responded on attempt ${attempt}`, '');
          mainWindow.loadURL(serverUrl).catch((err) => {
            logError('Failed to load server URL after health check passed', err);
            loadFallbackHtml();
          });
        }
        req.destroy();
      });

      req.on('error', () => {
        req.destroy();
        if (isReady) return;
        
        if (attempt < maxAttempts) {
          setTimeout(tryLoadServer, 500);
        } else {
          logError(`❌ Server did not respond after ${maxAttempts} attempts`, '');
          loadFallbackHtml();
        }
      });

      req.setTimeout(2000, () => {
        req.destroy();
        if (isReady || gotResponse) return;
        
        if (attempt < maxAttempts) {
          setTimeout(tryLoadServer, 500);
        } else {
          logError(`❌ Server timed out after ${maxAttempts} attempts`, '');
          loadFallbackHtml();
        }
      });
    }

    // Fallback: load dist/index.html directly from the file system
    function loadFallbackHtml() {
      const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
      logError('Loading fallback HTML from: ' + distIndex, '');
      if (fs.existsSync(distIndex)) {
        mainWindow.loadFile(distIndex).catch((e) => {
          logError('Failed to load fallback HTML', e);
        });
      } else {
        logError('❌ Fallback HTML not found at: ' + distIndex, '');
        // Show a basic error page inline
        mainWindow.loadURL(`data:text/html;charset=utf-8,
          <html><body style="background:#0A0A0A;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">
            <div style="text-align:center">
              <h1 style="color:#ef4444">Server Failed to Start</h1>
              <p>Check the log file at:<br><code>${logPath}</code></p>
            </div>
          </body></html>`);
      }
    }

    // Give the server a brief moment to begin listening, then start polling
    setTimeout(tryLoadServer, 300);
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
