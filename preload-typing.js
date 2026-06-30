const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('typingCtl', {
  pauseToggle: () => ipcRenderer.invoke('typing-ctl-toggle'),
  stop: () => ipcRenderer.invoke('typing-ctl-stop'),
  // Main pushes { paused, active } so the bar can reflect state.
  onState: (cb) => ipcRenderer.on('ide-typing-state', (_e, s) => cb(s)),
});
