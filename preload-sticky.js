const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sticky', {
  close: () => ipcRenderer.invoke('sticky-close'),
  clear: () => ipcRenderer.invoke('sticky-clear'),
  onHistory: (cb) => ipcRenderer.on('sticky-history', (_e, v) => cb(v)),
  onMessage: (cb) => ipcRenderer.on('sticky-message', (_e, v) => cb(v)),
});
