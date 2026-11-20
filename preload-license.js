const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('licenseApi', {
  getInfo: () => ipcRenderer.invoke('license-info'),
  check: () => ipcRenderer.invoke('license-check'),
  copyMac: () => ipcRenderer.invoke('license-copy-mac'),
  quit: () => ipcRenderer.invoke('license-quit'),
  onState: (cb) => ipcRenderer.on('license-state', (_e, s) => cb(s)),
});
