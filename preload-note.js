// Preload for a code / diagram note (renderer/note.html).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('note', {
  // What this note shows: { kind: 'code'|'diagram'|'answer', ..., max: {width, height} }
  get: () => ipcRenderer.invoke('note-get'),
  // The size the content needs; main.js places and shows the note.
  fit: (size) => ipcRenderer.invoke('note-fit', size),
  // 'start' while the mouse button is down on a drag area, 'end' when released.
  drag: (phase) => ipcRenderer.send('note-drag', phase),
  close: () => ipcRenderer.invoke('note-close'),
  copy: (text) => ipcRenderer.invoke('copy-text', text),
});
