const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adminApi', {
  keyStatus: () => ipcRenderer.invoke('key-status'),
  gen: (mac, days) => ipcRenderer.invoke('gen', { mac, days }),
  copy: (text) => ipcRenderer.invoke('copy', text),
});
