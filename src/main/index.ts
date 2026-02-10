/**
 * @fileoverview Electron main process entry point. Creates the application
 * window, initializes the SQLite store, and registers IPC handlers. The
 * renderer is loaded from the Vite dev server in development or from the
 * built `dist/` directory in production.
 */

import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc-handlers';
import { initStore } from './store';

let mainWindow: BrowserWindow | null = null;

const DIST_ELECTRON = path.join(__dirname, '..');
const DIST = path.join(DIST_ELECTRON, '../dist');
const PRELOAD = path.join(DIST_ELECTRON, 'preload/index.js');

/** Creates and configures the main BrowserWindow with security-hardened web preferences. */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open external links in default browser instead of navigating Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow dev server reloads, block everything else and open externally
    if (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)) {
      return;
    }
    event.preventDefault();
    shell.openExternal(url);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(DIST, 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  initStore();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

/** Returns the main window instance, or `null` if it has been closed. */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
