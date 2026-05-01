const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('selector', {
  done: (rect) => ipcRenderer.send('selector-done', rect),
  cancel: () => ipcRenderer.send('selector-cancel'),
});
