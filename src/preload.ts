import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendFrame: (universes: Record<number, number[]>) =>
    ipcRenderer.send('output:frame', universes),

  setOutputConfig: (config: { enabled: boolean; protocol: string; broadcastAddress: string }) =>
    ipcRenderer.send('output:config', config),
});
