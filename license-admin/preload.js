const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adminApi', {
  gen: (mac, days, date) => ipcRenderer.invoke('gen', { mac, days, date }),
  copy: (text) => ipcRenderer.invoke('copy', text),
});
