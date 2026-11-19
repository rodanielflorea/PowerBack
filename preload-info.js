const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('info', {
  close: () => ipcRenderer.invoke('info-close'),
  refresh: () => ipcRenderer.invoke('info-refresh'),
  ready: () => ipcRenderer.invoke('info-ready'),
  // Main pushes { profile, weather, holidays, events }.
  onData: (cb) => ipcRenderer.on('info-data', (_e, v) => cb(v)),
});

// No drags out of the page: see preload.js (a drag that does not end leaves the page deaf to the mouse).
window.addEventListener('dragstart', (e) => e.preventDefault(), true);
