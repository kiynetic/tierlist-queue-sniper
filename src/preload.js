const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  connect: (data) => ipcRenderer.invoke('discord:connect', data),
  disconnect: (data) => ipcRenderer.invoke('discord:disconnect', data || {}),
  rescan: (data) => ipcRenderer.invoke('discord:rescan', data || {}),
  armChannel: (info) => ipcRenderer.invoke('discord:armChannel', info),
  disarmChannel: (info) => ipcRenderer.invoke('discord:disarmChannel', info),
  updateSettings: (settings) => ipcRenderer.invoke('discord:updateSettings', settings),
  setQueuePaused: (data) => ipcRenderer.invoke('discord:setQueuePaused', data),

  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', { key, value }),
  storeDelete: (key) => ipcRenderer.invoke('store:delete', key),

  getGuildsAndChannels: (data) => ipcRenderer.invoke('discord:getGuildsAndChannels', data || {}),
  addCustomTarget: (target) => ipcRenderer.invoke('discord:addCustomTarget', target),
  removeCustomTarget: (data) => ipcRenderer.invoke('discord:removeCustomTarget', data),
  getCustomTargets: () => ipcRenderer.invoke('discord:getCustomTargets'),

  onReady: (cb) => ipcRenderer.on('discord:ready', (_, d) => cb(d)),
  onScanning: (cb) => ipcRenderer.on('discord:scanning', (_, d) => cb(d)),
  onServers: (cb) => ipcRenderer.on('discord:servers', (_, d) => cb(d)),
  onChannelArmed: (cb) => ipcRenderer.on('discord:channel-armed', (_, d) => cb(d)),
  onBurstStart: (cb) => ipcRenderer.on('discord:burst-start', (_, d) => cb(d)),
  onQueueJoined: (cb) => ipcRenderer.on('discord:queue-joined', (_, d) => cb(d)),
  onError: (cb) => ipcRenderer.on('discord:error', (_, d) => cb(d)),
  onDisconnected: (cb) => ipcRenderer.on('discord:disconnected', (_, d) => cb(d)),
  onIdleStatus: (cb) => ipcRenderer.on('discord:idle-status', (_, d) => cb(d)),
  onTrayAction: (cb) => ipcRenderer.on('tray:action', (_, d) => cb(d)),
});
