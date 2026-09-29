const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('watch', {
  sources: () => ipcRenderer.invoke('speaker-watch-sources'),
  observe: (obs) => ipcRenderer.send('speaker-watch-observe', obs),
  log: (line) => ipcRenderer.send('speaker-watch-log', String(line)),
  onGrab: (cb) => ipcRenderer.on('speaker-watch-grab', (_e, req) => cb(req)),
  grabbed: (id, jpeg) => ipcRenderer.send('speaker-watch-grabbed', { id, jpeg }),
});
