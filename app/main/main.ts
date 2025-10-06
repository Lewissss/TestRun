import { app, BrowserWindow, nativeTheme } from 'electron';
import { dirname, join } from 'path';
import { format, fileURLToPath } from 'url';
import './ipc';

const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const preload = join(__dirname, '../preload/preload.js');
const distDir = join(__dirname, '../../dist/renderer');

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111827' : '#ffffff',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
    if (isDev) {
      try {
        window.webContents.openDevTools({ mode: 'detach' });
      } catch (error) {
        console.warn('Failed to open devtools', error);
      }
    }
  });

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelMap: Record<number, 'log' | 'warn' | 'error'> = {
      0: 'log',
      1: 'log',
      2: 'warn',
      3: 'error',
    };
    const logLevel = levelMap[level] ?? 'log';
    console[logLevel](`[renderer:${logLevel}] ${message} (${sourceId}:${line})`);
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load', { errorCode, errorDescription, validatedURL });
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexHtml = format({
      pathname: join(distDir, 'index.html'),
      protocol: 'file',
      slashes: true,
    });
    void window.loadURL(indexHtml);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.whenReady().then(() => {
  if (isDev) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  }
  createMainWindow();
});
