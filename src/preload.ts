import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendFrame: (universes: Record<number, number[]>) =>
    ipcRenderer.send('output:frame', universes),

  setOutputConfig: (config: {
    enabled: boolean; protocol: string; broadcastAddress: string; artnetMode: string;
    dmxEnabled: boolean; dmxUniverse: number;
  }) => ipcRenderer.send('output:config', config),

  onSerialPorts: (cb: (ports: { portId: string; portName: string }[]) => void) => {
    ipcRenderer.on('serial:ports', (_e, ports) => cb(ports));
    return () => ipcRenderer.removeAllListeners('serial:ports');
  },
  selectSerialPort: (portId: string) => ipcRenderer.send('serial:select', portId),

  onNodesDiscovered: (cb: (nodes: { ip: string; name: string; universes: number[] }[]) => void) => {
    ipcRenderer.on('nodes:discovered', (_e, nodes) => cb(nodes));
    return () => ipcRenderer.removeAllListeners('nodes:discovered');
  },

  onMenuUndo: (cb: () => void) => {
    ipcRenderer.on('menu:undo', cb);
    return () => ipcRenderer.off('menu:undo', cb);
  },
  onMenuRedo: (cb: () => void) => {
    ipcRenderer.on('menu:redo', cb);
    return () => ipcRenderer.off('menu:redo', cb);
  },
  onMenuFixtures: (cb: () => void) => {
    ipcRenderer.on('menu:fixtures', cb);
    return () => ipcRenderer.off('menu:fixtures', cb);
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
