const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('floatApi', {
  toggle: () => ipcRenderer.invoke('float-toggle'),
  dragStart: () => ipcRenderer.invoke('float-drag-start'),
  dragEnd: () => ipcRenderer.invoke('float-drag-end'),
  onState: (cb) => ipcRenderer.on('float-state', (_e, visible) => cb(visible)),
});
