import { app, BrowserWindow, Tray, Menu } from 'electron';
import * as path from 'path';
import { setupIpcHandlers } from './ipc';

// Replace electron-is-dev with a simple check
const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Correctly resolve path for both dev and production environments
  const iconPath = isDev
    ? path.join(process.cwd(), 'src/assets/icon.png')
    : path.join(__dirname, '../assets/icon.png');
  
  console.log('Tray icon path:', iconPath); // Debug the path
  
  tray = new Tray(iconPath);
  tray.setToolTip('ThinkFan Configuration');
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open ThinkFan Config', click: () => {
      if (mainWindow === null) {
        createWindow();
      } else {
        mainWindow.show();
      }
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Optional: Toggle window visibility when clicking the tray icon
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    } else {
      createWindow();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  setupIpcHandlers();
  createTray();

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
}); 