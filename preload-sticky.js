const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sticky', {
  close: () => ipcRenderer.invoke('sticky-close'),
  clear: () => ipcRenderer.invoke('sticky-clear'),
  send: (text) => ipcRenderer.invoke('sticky-send-text', text),
  sendImage: (dataUrl) => ipcRenderer.invoke('sticky-send-image', dataUrl),
  onHistory: (cb) => ipcRenderer.on('sticky-history', (_e, v) => cb(v)),
  onMessage: (cb) => ipcRenderer.on('sticky-message', (_e, v) => cb(v)),
});

// Typing into Ace without taking focus from the other app (Windows):
// renderer/type-through.js drives it, main.js holds the keys.
contextBridge.exposeInMainWorld('typeThrough', {
  mode: () => ipcRenderer.invoke('type-through-mode'),
  onMode: (cb) => ipcRenderer.on('type-through-mode', (_e, v) => cb(v)),
  engage: () => ipcRenderer.invoke('type-through-engage'),
  release: () => ipcRenderer.invoke('type-through-release'),
  selection: (on) => ipcRenderer.invoke('type-through-selection', !!on),
  realFocus: (on) => ipcRenderer.invoke('type-through-real-focus', !!on),
  readClipboard: () => ipcRenderer.invoke('type-through-clipboard'),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  onKey: (cb) => ipcRenderer.on('type-through-key', (_e, v) => cb(v)),
  onReleased: (cb) => ipcRenderer.on('type-through-released', () => cb()),
  onCopySelection: (cb) => ipcRenderer.on('type-through-copy-selection', () => cb()),
});
