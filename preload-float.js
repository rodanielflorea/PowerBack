const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('floatApi', {
  toggle: () => ipcRenderer.invoke('float-toggle'),
  onState: (cb) => ipcRenderer.on('float-state', (_e, visible) => cb(visible)),
});
