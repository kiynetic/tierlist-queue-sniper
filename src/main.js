const { app, BrowserWindow, Menu, ipcMain, powerMonitor, Tray, nativeImage, dialog, Notification, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');
const DiscordClient = require('./discord/client');
const { findLocalDiscordTokens } = require('./discord/tokenFinder');

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
    migratePlaintextTokensInStore();
    createWindow();
    createTray();
    startIdleMonitor();
  });
}

function getStoreFilePath() {
  const userDataDir = app.getPath('userData');
  return path.join(userDataDir, 'qpilot_store.json');
}

function getFallbackKey() {
  const secret = (os.userInfo().username || '') + '-' + (os.homedir() || '') + '-qPilot-secure-vault-salt';
  return crypto.scryptSync(secret, 'qPilotSalt2026', 32);
}

function encryptToken(plainText) {
  if (!plainText || typeof plainText !== 'string') return plainText;
  if (plainText.startsWith('enc:') || plainText.startsWith('fb:')) return plainText;
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      const buffer = safeStorage.encryptString(plainText);
      return 'enc:' + buffer.toString('base64');
    }
  } catch (err) {}
  try {
    const key = getFallbackKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, tag, encrypted]);
    return 'fb:' + combined.toString('base64');
  } catch (err) {
    return plainText;
  }
}

function decryptToken(cipherText) {
  if (!cipherText || typeof cipherText !== 'string') return cipherText;
  if (!cipherText.startsWith('enc:') && !cipherText.startsWith('fb:')) return cipherText;
  if (cipherText.startsWith('enc:')) {
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const b64 = cipherText.slice(4);
        const buffer = Buffer.from(b64, 'base64');
        return safeStorage.decryptString(buffer);
      }
    } catch (err) {}
  }
  if (cipherText.startsWith('fb:')) {
    try {
      const key = getFallbackKey();
      const combined = Buffer.from(cipherText.slice(3), 'base64');
      const iv = combined.slice(0, 12);
      const tag = combined.slice(12, 28);
      const encrypted = combined.slice(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (err) {}
  }
  return '';
}

function secureAccountsForStorage(accounts) {
  if (!Array.isArray(accounts)) return accounts;
  return accounts.map((acc) => {
    if (acc && acc.token) {
      return Object.assign({}, acc, { token: encryptToken(acc.token) });
    }
    return acc;
  });
}

function revealAccountsFromStorage(accounts) {
  if (!Array.isArray(accounts)) return accounts;
  return accounts.map((acc) => {
    if (acc && acc.token) {
      return Object.assign({}, acc, { token: decryptToken(acc.token) });
    }
    return acc;
  });
}

function migratePlaintextTokensInStore() {
  try {
    const store = readStore();
    let changed = false;
    if (Array.isArray(store.accounts)) {
      for (let i = 0; i < store.accounts.length; i++) {
        const acc = store.accounts[i];
        if (acc && acc.token && !acc.token.startsWith('enc:') && !acc.token.startsWith('fb:')) {
          acc.token = encryptToken(acc.token);
          changed = true;
        }
      }
    }
    if (store.legacyToken && !store.legacyToken.startsWith('enc:') && !store.legacyToken.startsWith('fb:')) {
      store.legacyToken = encryptToken(store.legacyToken);
      changed = true;
    }
    if (changed) {
      writeStore(store);
    }
  } catch (err) {
    console.error('[Store] Failed to migrate store tokens:', err);
  }
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
  if (key === 'accounts') {
    return revealAccountsFromStorage(store.accounts);
  }
  if (key === 'legacyToken') {
    return decryptToken(store.legacyToken);
  }
  if (!key) {
    const copy = Object.assign({}, store);
    if (copy.accounts) {
      copy.accounts = revealAccountsFromStorage(copy.accounts);
    }
    if (copy.legacyToken) {
      copy.legacyToken = decryptToken(copy.legacyToken);
    }
    return copy;
  }
  return store[key];
});

ipcMain.handle('store:set', async (event, { key, value }) => {
  const store = readStore();
  if (key === 'accounts') {
    store[key] = secureAccountsForStorage(value);
  } else if (key === 'legacyToken') {
    store[key] = encryptToken(value);
  } else {
    store[key] = value;
  }
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

    if (currentSettings.desktopNotifications !== false && Notification.isSupported()) {
      try {
        const icoPath = path.join(__dirname, 'assets', 'icon.ico');
        const pngPath = path.join(__dirname, 'assets', 'qPilot-app-logo.png');
        const iconPath = (process.platform === 'win32' && fs.existsSync(icoPath)) ? icoPath : pngPath;
        new Notification({
          title: 'Joined Queue!',
          body: `Successfully entered ${data.guildName || 'Waitlist'} (${data.region || data.channelName || 'Queue'}) in ${data.latencyMs || 0}ms`,
          icon: iconPath,
        }).show();
      } catch (e) {}
    }

    if (currentSettings.webhookUrl && currentSettings.webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      try {
        const url = new URL(currentSettings.webhookUrl);
        const payload = JSON.stringify({
          username: 'qPilot',
          avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
          embeds: [{
            title: '🎯 Successfully Entered Queue!',
            description: `Joined **${data.guildName || 'Waitlist'}** - \`#${data.channelName || 'queue'}\` [${data.region || 'WAITLIST'}]`,
            fields: [
              { name: 'Latency', value: `${data.latencyMs || 0} ms`, inline: true },
              { name: 'Clicks', value: `${data.clicks || 1}`, inline: true },
              { name: 'Account', value: data.accountName || 'Discord', inline: true },
            ],
            color: 3858688,
            timestamp: new Date().toISOString()
          }]
        });
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        });
        req.on('error', () => {});
        req.write(payload);
        req.end();
      } catch (e) {}
    }
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
  launchOnStartup: false,
  desktopNotifications: true,
  soundEnabled: true,
  soundType: 'default',
  soundPath: '',
  soundUrl: '',
  soundVolume: 80,
  webhookUrl: '',
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
  if (typeof settings.launchOnStartup === 'boolean') {
    try {
      app.setLoginItemSettings({
        openAtLogin: settings.launchOnStartup,
        path: process.execPath,
      });
    } catch (e) {}
  }
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

ipcMain.handle('discord:autoFetchTokens', async () => {
  try {
    const accounts = await findLocalDiscordTokens();
    return { success: true, accounts };
  } catch (err) {
    return { success: false, error: err.message, accounts: [] };
  }
});

ipcMain.handle('system:getAutoLaunch', () => {
  try {
    return { enabled: app.getLoginItemSettings().openAtLogin };
  } catch (e) {
    return { enabled: false };
  }
});

ipcMain.handle('system:setAutoLaunch', (event, { enable }) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enable,
      path: process.execPath,
    });
    return { success: true, enabled: !!enable };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('dialog:openAudioFile', async () => {
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Alert Sound File',
      properties: ['openFile'],
      filters: [
        { name: 'Audio Files (*.mp3;*.wav;*.ogg)', extensions: ['mp3', 'wav', 'ogg'] },
        { name: 'All Files (*.*)', extensions: ['*'] }
      ]
    });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return { canceled: true };
    }
    return { canceled: false, filePath: res.filePaths[0] };
  } catch (err) {
    return { canceled: true, error: err.message };
  }
});

ipcMain.handle('system:notify', (event, { title, body }) => {
  try {
    if (Notification.isSupported()) {
      const icoPath = path.join(__dirname, 'assets', 'icon.ico');
      const pngPath = path.join(__dirname, 'assets', 'qPilot-app-logo.png');
      const iconPath = (process.platform === 'win32' && fs.existsSync(icoPath)) ? icoPath : pngPath;
      new Notification({
        title: title || 'qPilot',
        body: body || '',
        icon: iconPath,
      }).show();
      return { success: true };
    }
    return { success: false, error: 'Notifications not supported' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('discord:testWebhook', async (event, { webhookUrl }) => {
  if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    return { success: false, error: 'Invalid Discord webhook URL' };
  }
  try {
    const url = new URL(webhookUrl);
    const payload = JSON.stringify({
      username: 'qPilot Alerts',
      avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
      embeds: [{
        title: '🔔 Test Notification',
        description: 'Your qPilot webhook alert is working properly!',
        color: 3717112,
        timestamp: new Date().toISOString()
      }]
    });
    return new Promise((resolve) => {
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: `Discord returned HTTP ${res.statusCode}` });
        }
      });
      req.on('error', (e) => resolve({ success: false, error: e.message }));
      req.write(payload);
      req.end();
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
});

const GITHUB_REPO = 'kiynetic/tierlist-queue-sniper';

function fetchLatestGithubRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      headers: {
        'User-Agent': 'qPilot-Desktop-App',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`GitHub API returned status ${res.statusCode}`));
          }
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function parseSemver(v) {
  return (v || '').replace(/^[^\d]*/, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
}

function isNewerVersion(remote, local) {
  const r = parseSemver(remote);
  const l = parseSemver(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

ipcMain.handle('updater:check', async () => {
  try {
    const release = await fetchLatestGithubRelease();
    const currentVersion = app.getVersion();
    const latestVersion = (release.tag_name || '').replace(/^v/, '');
    const hasUpdate = isNewerVersion(latestVersion, currentVersion);

    const assets = release.assets || [];
    const installerAsset = assets.find(a => a.name.endsWith('-Setup.exe') || a.name.endsWith('.exe'));
    const zipAsset = assets.find(a => a.name.endsWith('.zip'));

    return {
      success: true,
      hasUpdate,
      currentVersion,
      latestVersion,
      name: release.name || `Release ${latestVersion}`,
      body: release.body || '',
      publishedAt: release.published_at,
      releaseUrl: release.html_url,
      downloadUrl: installerAsset ? installerAsset.browser_download_url : (zipAsset ? zipAsset.browser_download_url : release.html_url),
      assetName: installerAsset ? installerAsset.name : (zipAsset ? zipAsset.name : null),
      assetSize: installerAsset ? installerAsset.size : (zipAsset ? zipAsset.size : 0)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('updater:install', async (event, { downloadUrl, assetName }) => {
  if (!downloadUrl) return { success: false, error: 'No download URL provided' };

  const fileName = assetName || 'qPilot-Update.exe';
  const tempDir = app.getPath('temp');
  const targetPath = path.join(tempDir, fileName);

  try {
    if (fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath); } catch {}
    }

    const downloadFile = (url, dest) => {
      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const req = https.get(url, { headers: { 'User-Agent': 'qPilot-Updater' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            file.close();
            try { fs.unlinkSync(dest); } catch {}
            return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
          }

          if (res.statusCode !== 200) {
            file.close();
            try { fs.unlinkSync(dest); } catch {}
            return reject(new Error(`Failed to download: status ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let downloadedBytes = 0;

          res.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
              const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
              safeSend('updater:progress', { percent, downloadedBytes, totalBytes });
            }
          });

          res.pipe(file);

          file.on('finish', () => {
            file.close(() => resolve(dest));
          });
        });

        req.on('error', (err) => {
          file.close();
          try { fs.unlinkSync(dest); } catch {}
          reject(err);
        });
      });
    };

    const downloadedPath = await downloadFile(downloadUrl, targetPath);

    if (downloadedPath.endsWith('.exe')) {
      spawn(downloadedPath, [], { detached: true, stdio: 'ignore' }).unref();
      setTimeout(() => {
        isQuitting = true;
        app.quit();
      }, 500);
      return { success: true };
    } else {
      const { shell } = require('electron');
      shell.showItemInFolder(downloadedPath);
      return { success: true, openedFolder: true };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
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
