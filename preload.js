const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  setOpacity: (v) => ipcRenderer.invoke('set-opacity', v),
  getOpacity: () => ipcRenderer.invoke('get-opacity'),
  setStealth: (v) => ipcRenderer.invoke('set-stealth', v),
  getStealth: () => ipcRenderer.invoke('get-stealth'),
  hide: () => ipcRenderer.invoke('hide'),
  quit: () => ipcRenderer.invoke('quit'),
  getUrls: () => ipcRenderer.invoke('get-urls'),
  setUrls: (urls) => ipcRenderer.invoke('set-urls', urls),
  showUrlMenu: () => ipcRenderer.invoke('show-url-menu'),
  setWebviewVisible: (v) => ipcRenderer.invoke('set-webview-visible', v),
  getTranscriptionConfig: () => ipcRenderer.invoke('get-transcription-config'),
  setTranscriptionConfig: (cfg) => ipcRenderer.invoke('set-transcription-config', cfg),
  transcribe: (wav) => ipcRenderer.invoke('transcribe', wav),
  pasteText: (text) => ipcRenderer.invoke('paste-text', text),
  pickFile: (kind) => ipcRenderer.invoke('pick-file', kind),
  onOpacityChanged: (cb) => ipcRenderer.on('opacity-changed', (_e, v) => cb(v)),
  onStealthChanged: (cb) => ipcRenderer.on('stealth-changed', (_e, v) => cb(v)),
});
