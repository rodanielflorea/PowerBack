const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('selector', {
  done: (rect) => ipcRenderer.send('selector-done', rect),
  cancel: () => ipcRenderer.send('selector-cancel'),
  // The screen as it was when the snip started (a data URL), shown frozen.
  onShot: (cb) => ipcRenderer.on('selector-shot', (_e, url) => cb(url)),
  ready: () => ipcRenderer.send('selector-ready'),
});
