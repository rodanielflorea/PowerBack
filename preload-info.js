const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('info', {
  close: () => ipcRenderer.invoke('info-close'),
  refresh: () => ipcRenderer.invoke('info-refresh'),
  // Main pushes { profile, weather, holidays, fetchedAt, errors }.
  onData: (cb) => ipcRenderer.on('info-data', (_e, v) => cb(v)),
});
