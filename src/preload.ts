import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendFrame: (universes: Record<number, number[]>) =>
    ipcRenderer.send('output:frame', universes),

  setOutputConfig: (config: { enabled: boolean; protocol: string; broadcastAddress: string }) =>
    ipcRenderer.send('output:config', config),

  onMenuExport: (cb: () => void) => {
    ipcRenderer.on('menu:export', cb);
    return () => ipcRenderer.off('menu:export', cb);
  },
  onMenuImport: (cb: () => void) => {
    ipcRenderer.on('menu:import', cb);
    return () => ipcRenderer.off('menu:import', cb);
  },
});
