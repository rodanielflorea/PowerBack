const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('info', {
  close: () => ipcRenderer.invoke('info-close'),
  refresh: () => ipcRenderer.invoke('info-refresh'),
  ready: () => ipcRenderer.invoke('info-ready'),
  // Main pushes { profile, weather, holidays, events }.
  onData: (cb) => ipcRenderer.on('info-data', (_e, v) => cb(v)),
});
