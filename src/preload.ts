import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendFrame: (universes: Record<number, number[]>) =>
    ipcRenderer.send('output:frame', universes),

  setOutputConfig: (config: { enabled: boolean; protocol: string; broadcastAddress: string }) =>
    ipcRenderer.send('output:config', config),

  onMenuUndo: (cb: () => void) => {
    ipcRenderer.on('menu:undo', cb);
    return () => ipcRenderer.off('menu:undo', cb);
  },
  onMenuRedo: (cb: () => void) => {
    ipcRenderer.on('menu:redo', cb);
    return () => ipcRenderer.off('menu:redo', cb);
  },
  onMenuExport: (cb: () => void) => {
    ipcRenderer.on('menu:export', cb);
    return () => ipcRenderer.off('menu:export', cb);
  },
  onMenuImport: (cb: () => void) => {
    ipcRenderer.on('menu:import', cb);
    return () => ipcRenderer.off('menu:import', cb);
  },
});
