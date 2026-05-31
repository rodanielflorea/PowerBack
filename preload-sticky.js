const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sticky', {
  close: () => ipcRenderer.invoke('sticky-close'),
  clear: () => ipcRenderer.invoke('sticky-clear'),
  send: (text) => ipcRenderer.invoke('sticky-send-text', text),
  sendImage: (dataUrl) => ipcRenderer.invoke('sticky-send-image', dataUrl),
  onHistory: (cb) => ipcRenderer.on('sticky-history', (_e, v) => cb(v)),
  onMessage: (cb) => ipcRenderer.on('sticky-message', (_e, v) => cb(v)),
});
