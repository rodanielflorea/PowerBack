const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('licenseApi', {
  getInfo: () => ipcRenderer.invoke('license-info'),
  submit: (code) => ipcRenderer.invoke('license-submit', code),
  copyMac: () => ipcRenderer.invoke('license-copy-mac'),
  quit: () => ipcRenderer.invoke('license-quit'),
});
