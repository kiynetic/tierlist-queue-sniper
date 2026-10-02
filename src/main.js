const { app, BrowserWindow, Menu, ipcMain, powerMonitor, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const DiscordClient = require('./discord/client');

Menu.setApplicationMenu(null);

app.commandLine.appendSwitch('disable-spell-checking');
app.commandLine.appendSwitch('disable-speech-api');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-print-preview');

let isQuitting = false;
let tray = null;
let mainWindow = null;
const clients = new Map();

if (process.platform === 'win32') {
  app.setAppUserModelId('com.qpilot.app');
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
    startIdleMonitor();
  });
}

function getStoreFilePath() {
  const userDataDir = app.getPath('userData');
  return path.join(userDataDir, 'qpilot_store.json');
}

function readStore() {
  try {
    const p = getStoreFilePath();
    if (fs.existsSync(p)) {
      const data = fs.readFileSync(p, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Store] Failed to read store file:', err);
  }
  return {};
}

function writeStore(data) {
  try {
    const p = getStoreFilePath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Store] Failed to write store file:', err);
    return false;
  }
}

ipcMain.handle('store:get', async (event, key) => {
  const store = readStore();
  return key ? store[key] : store;
});

ipcMain.handle('store:set', async (event, { key, value }) => {
  const store = readStore();
  store[key] = value;
  return writeStore(store);
});

ipcMain.handle('store:delete', async (event, key) => {
  const store = readStore();
  delete store[key];
  return writeStore(store);
});

function safeSend(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function bindClientEvents(client) {
  client.on('ready', (data) => {
    safeSend('discord:ready', data);
  });

  client.on('scanning', (data) => {
    safeSend('discord:scanning', data);
  });

  client.on('servers', (data) => {
    safeSend('discord:servers', data);
  });

  client.on('channel-armed', (data) => {
    safeSend('discord:channel-armed', data);
  });

  client.on('burst-start', (data) => {
    safeSend('discord:burst-start', data);
  });

  client.on('queue-joined', (data) => {
    safeSend('discord:queue-joined', data);
  });

  client.on('error', (data) => {
    safeSend('discord:error', data);
  });

  client.on('disconnected', (data) => {
    safeSend('discord:disconnected', data);
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const isPaused = isIdlePaused || (queuePauseUntil > Date.now());
  const connectedCount = clients.size;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open qPilot',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: `Accounts Connected: ${connectedCount}`,
      enabled: false,
    },
    {
      label: isPaused ? '▶ Resume Sniping' : '⏸ Pause Sniping',
      click: () => {
        if (isPaused) {
          queuePauseUntil = 0;
          for (const client of clients.values()) {
            client.setQueuePaused(false, 0);
          }
          safeSend('tray:action', { action: 'resume' });
        } else {
          queuePauseUntil = Date.now() + (currentSettings.pauseDurationMinutes || 60) * 60000;
          for (const client of clients.values()) {
            client.setQueuePaused(true, queuePauseUntil);
          }
          safeSend('tray:action', { action: 'pause', pauseUntil: queuePauseUntil });
        }
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit qPilot',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`qPilot - ${connectedCount} Account${connectedCount === 1 ? '' : 's'} Connected${isPaused ? ' (Paused)' : ''}`);
}

function createTray() {
  try {
    const icoPath = path.join(__dirname, 'assets', 'icon.ico');
    const pngPath = path.join(__dirname, 'assets', 'qPilot-app-logo.png');
    const iconPath = (process.platform === 'win32' && fs.existsSync(icoPath)) ? icoPath : pngPath;
    tray = new Tray(iconPath);
    tray.setToolTip('qPilot - Discord Queue Sniper');

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.focus();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });

    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    updateTrayMenu();
  } catch (err) {
    console.error('Failed to create tray:', err);
  }
}

function createWindow() {
  const icoPath = path.join(__dirname, 'assets', 'icon.ico');
  const pngPath = path.join(__dirname, 'assets', 'qPilot-app-logo.png');
  const appIconPath = (process.platform === 'win32' && fs.existsSync(icoPath))
    ? icoPath
    : pngPath;
  const appIcon = nativeImage.createFromPath(appIconPath);

  mainWindow = new BrowserWindow({
    title: 'qPilot',
    icon: appIcon,
    width: 1280,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    center: true,
    frame: false,
    backgroundColor: '#070709',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: false,
      backgroundThrottling: false,
    },
    show: true,
  });

  if (process.platform === 'win32' && !appIcon.isEmpty()) {
    try {
      mainWindow.setIcon(appIcon);
    } catch (e) {
      console.warn('Could not set window icon:', e);
    }
  }

  const indexPath = path.join(__dirname, 'renderer', 'index.html');
  mainWindow.loadFile(indexPath).catch((err) => {
    console.error('Failed to load file:', err);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && currentSettings.minimizeToTray !== false) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    for (const client of clients.values()) {
      client.destroy();
    }
    clients.clear();
  });
}

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => {
  if (currentSettings.minimizeToTray !== false) {
    mainWindow?.hide();
  } else {
    isQuitting = true;
    mainWindow?.close();
  }
});

let currentSettings = {
  cps: 100,
  burstLength: 3.0,
  cooldown: 60,
  pauseAfterJoin: true,
  pauseDurationMinutes: 60,
  pauseOnIdle: true,
  idleThresholdMinutes: 5,
  minimizeToTray: true,
};
let isIdlePaused = false;
let queuePauseUntil = 0;

ipcMain.handle('discord:connect', async (event, { token, settings, accountId }) => {
  try {
    const tempKey = accountId || `temp_${Date.now()}`;
    if (clients.has(tempKey)) {
      clients.get(tempKey).destroy();
      clients.delete(tempKey);
    }

    const mergedSettings = Object.assign({}, currentSettings, settings);
    const client = new DiscordClient(token, mergedSettings, accountId);
    client.setIdlePaused(isIdlePaused);
    if (queuePauseUntil > Date.now()) {
      client.setQueuePaused(true, queuePauseUntil);
    }
    bindClientEvents(client);

    await client.connect();

    const finalId = client.id || (client.user ? client.user.id : tempKey);
    client.id = finalId;

    if (finalId !== tempKey && clients.has(tempKey)) {
      clients.delete(tempKey);
    }
    clients.set(finalId, client);

    const store = readStore();
    if (Array.isArray(store.customTargets)) {
      for (const target of store.customTargets) {
        client.addCustomTarget(target);
      }
    }
    updateTrayMenu();

    return {
      success: true,
      accountId: finalId,
      user: client.user,
    };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('discord:disconnect', async (event, data = {}) => {
  const { accountId } = data;
  if (accountId && clients.has(accountId)) {
    clients.get(accountId).destroy();
    clients.delete(accountId);
  } else if (!accountId) {
    for (const client of clients.values()) {
      client.destroy();
    }
    clients.clear();
  }
  updateTrayMenu();
  return { success: true };
});

ipcMain.handle('discord:rescan', async (event, data = {}) => {
  const { accountId } = data;
  if (accountId && clients.has(accountId)) {
    return clients.get(accountId).scanServers();
  }
  const results = [];
  for (const client of clients.values()) {
    results.push(await client.scanServers());
  }
  return results.flat();
});

ipcMain.handle('discord:armChannel', async (event, { accountId, channelId, guildName, channelName, region }) => {
  if (accountId && clients.has(accountId)) {
    clients.get(accountId).armChannel(channelId, guildName, channelName, region);
  } else {

    for (const client of clients.values()) {
      client.armChannel(channelId, guildName, channelName, region);
    }
  }
  return { success: true };
});

ipcMain.handle('discord:disarmChannel', async (event, { accountId, channelId }) => {
  if (accountId && clients.has(accountId)) {
    clients.get(accountId).disarmChannel(channelId);
  } else {
    for (const client of clients.values()) {
      client.disarmChannel(channelId);
    }
  }
  return { success: true };
});

ipcMain.handle('discord:updateSettings', async (event, payload) => {
  const settings = payload?.settings || payload;
  currentSettings = Object.assign(currentSettings, settings);
  const accountId = payload?.accountId;
  if (accountId && clients.has(accountId)) {
    clients.get(accountId).updateSettings(settings);
  } else {
    for (const client of clients.values()) {
      client.updateSettings(settings);
    }
  }
  updateTrayMenu();
  return { success: true };
});

ipcMain.handle('discord:setQueuePaused', async (event, { paused, pauseUntil }) => {
  queuePauseUntil = paused ? (pauseUntil || 0) : 0;
  for (const client of clients.values()) {
    client.setQueuePaused(paused, queuePauseUntil);
  }
  updateTrayMenu();
  return { success: true };
});

ipcMain.handle('discord:getGuildsAndChannels', async (event, data = {}) => {
  const { accountId } = data;
  let client = accountId ? clients.get(accountId) : null;
  if (!client && clients.size > 0) {
    client = clients.values().next().value;
  }
  if (client) {
    return client.getAllGuildsAndChannels();
  }
  return [];
});

ipcMain.handle('discord:addCustomTarget', async (event, target) => {
  const store = readStore();
  const customTargets = store.customTargets || [];
  const existingIdx = customTargets.findIndex(t => t.channelId === target.channelId);
  if (existingIdx >= 0) {
    customTargets[existingIdx] = target;
  } else {
    customTargets.push(target);
  }
  store.customTargets = customTargets;
  writeStore(store);

  for (const client of clients.values()) {
    client.addCustomTarget(target);
  }
  return { success: true };
});

ipcMain.handle('discord:removeCustomTarget', async (event, { channelId }) => {
  const store = readStore();
  let customTargets = store.customTargets || [];
  customTargets = customTargets.filter(t => t.channelId !== channelId);
  store.customTargets = customTargets;
  writeStore(store);

  for (const client of clients.values()) {
    client.removeCustomTarget(channelId);
  }
  return { success: true };
});

ipcMain.handle('discord:getCustomTargets', async () => {
  const store = readStore();
  return store.customTargets || [];
});

function startIdleMonitor() {
  setInterval(() => {
    if (!currentSettings.pauseOnIdle) {
      if (isIdlePaused) {
        isIdlePaused = false;
        for (const client of clients.values()) {
          client.setIdlePaused(false);
        }
        safeSend('discord:idle-status', { isIdle: false });
      }
      return;
    }

    try {
      const idleSec = powerMonitor.getSystemIdleTime();
      const thresholdSec = Math.max(10, (currentSettings.idleThresholdMinutes || 5) * 60);

      if (idleSec >= thresholdSec) {
        if (!isIdlePaused) {
          isIdlePaused = true;
          for (const client of clients.values()) {
            client.setIdlePaused(true);
          }
          safeSend('discord:idle-status', { isIdle: true, idleSec });
        }
      } else if (isIdlePaused && idleSec < 5) {
        isIdlePaused = false;
        for (const client of clients.values()) {
          client.setIdlePaused(false);
        }
        safeSend('discord:idle-status', { isIdle: false, idleSec });
      }
    } catch (err) {

    }
  }, 2000);
}

app.on('window-all-closed', () => {
  for (const client of clients.values()) {
    client.destroy();
  }
  clients.clear();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
