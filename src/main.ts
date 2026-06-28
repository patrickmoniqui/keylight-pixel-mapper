import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'node:path';
import dgram from 'node:dgram';
import os from 'node:os';
import started from 'electron-squirrel-startup';
import { buildArtDmx, buildArtPoll, parseArtPollReply, ArtNode } from './output/artnet';
import { buildSacnPacket, sacnMulticastAddress } from './output/sacn';

if (started) app.quit();

let mainWindow: BrowserWindow | null = null;
let pendingSerialCallback: ((portId: string) => void) | null = null;

interface OutputConfig {
  enabled: boolean;
  protocol: 'artnet' | 'sacn' | 'both';
  broadcastAddress: string;
  artnetMode: 'broadcast' | 'unicast';
  dmxEnabled: boolean;
  dmxUniverse: number;
}

let outputConfig: OutputConfig = {
  enabled: false,
  protocol: 'both',
  broadcastAddress: '255.255.255.255',
  artnetMode: 'broadcast',
  dmxEnabled: false,
  dmxUniverse: 0,
};

// universe → IP (fast lookup for unicast output)
const universeToIp = new Map<number, string>();
// IP → node info (for UI display)
const nodeInfoMap = new Map<string, ArtNode>();

let artPollTimer: ReturnType<typeof setInterval> | null = null;

// Returns broadcast addresses for every non-loopback IPv4 interface,
// plus the global broadcast as a fallback.
function subnetBroadcasts(): string[] {
  const addrs = new Set<string>(['255.255.255.255']);
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const a of iface ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip   = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      const bc   = ip.map((b, i) => b | (~mask[i] & 0xff)).join('.');
      addrs.add(bc);
    }
  }
  return [...addrs];
}

const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });

udp.on('error', (err) => console.error('[ArtNet] UDP error:', err.message));

udp.bind(6454, () => {
  udp.setBroadcast(true);

  udp.on('message', (msg, rinfo) => {
    const node = parseArtPollReply(msg, rinfo.address);
    if (!node) return;
    nodeInfoMap.set(node.ip, node);
    for (const u of node.universes) universeToIp.set(u, node.ip);
    mainWindow?.webContents.send('nodes:discovered', Array.from(nodeInfoMap.values()));
  });
});

function sendArtPoll() {
  const packet = buildArtPoll();
  for (const addr of subnetBroadcasts()) {
    udp.send(packet, 6454, addr);
  }
}

function startArtPoll() {
  if (artPollTimer) return;
  sendArtPoll();
  artPollTimer = setInterval(sendArtPoll, 3000);
}

function stopArtPoll() {
  if (artPollTimer) { clearInterval(artPollTimer); artPollTimer = null; }
  universeToIp.clear();
  nodeInfoMap.clear();
  mainWindow?.webContents.send('nodes:discovered', []);
}

function sendArtNet(universes: Record<number, number[]>) {
  for (const [uStr, data] of Object.entries(universes)) {
    const universe = parseInt(uStr, 10);
    const packet = buildArtDmx(universe, new Uint8Array(data));
    const dest = outputConfig.artnetMode === 'unicast' && universeToIp.has(universe)
      ? universeToIp.get(universe)!
      : outputConfig.broadcastAddress;
    udp.send(packet, 6454, dest);
  }
}

function sendSacn(universes: Record<number, number[]>) {
  for (const [uStr, data] of Object.entries(universes)) {
    const universe = parseInt(uStr, 10);
    const packet = buildSacnPacket(universe, new Uint8Array(data));
    const multicast = sacnMulticastAddress(universe);
    udp.send(packet, 5568, multicast);
  }
}

ipcMain.on('output:frame', (_event, universes: Record<number, number[]>) => {
  if (!outputConfig.enabled) return;
  if (outputConfig.protocol === 'artnet' || outputConfig.protocol === 'both') {
    sendArtNet(universes);
  }
  if (outputConfig.protocol === 'sacn' || outputConfig.protocol === 'both') {
    sendSacn(universes);
  }
  // USB DMX (dmxEnabled) is handled in the renderer via WebSerial — no main-process work needed
});

ipcMain.on('serial:select', (_e, portId: string) => {
  pendingSerialCallback?.(portId);
  pendingSerialCallback = null;
});

ipcMain.on('output:config', (_event, config: OutputConfig) => {
  outputConfig = config;
  const wantsUnicast =
    (config.protocol === 'artnet' || config.protocol === 'both') &&
    config.artnetMode === 'unicast';
  if (wantsUnicast) startArtPoll(); else stopArtPoll();
});

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  // Web Serial API — Electron doesn't show a picker UI automatically;
  // we forward the port list to the renderer and await its selection.
  mainWindow.webContents.session.setPermissionCheckHandler((_wc, permission) =>
    permission === 'serial'
  );
  mainWindow.webContents.session.setDevicePermissionHandler((details) =>
    details.deviceType === 'serial'
  );
  mainWindow.webContents.session.on('select-serial-port', (event, portList, _wc, callback) => {
    event.preventDefault();
    if (portList.length === 0) { callback(''); return; }
    // Auto-select when only one port matches (or only one FTDI device present)
    const ftdiPorts = portList.filter((p) => (p as any).usbVendorId === '0403' || (p as any).vendorId === '0403');
    const autoPort = ftdiPorts.length === 1 ? ftdiPorts[0]
      : portList.length === 1 ? portList[0]
      : null;
    if (autoPort) { callback(autoPort.portId); return; }
    // Multiple candidates — send list to renderer for manual selection
    pendingSerialCallback = callback;
    mainWindow?.webContents.send('serial:ports',
      portList.map((p) => ({ portId: p.portId, portName: p.portName }))
    );
  });

  // Application menu
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Export Patch…',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:export'),
        },
        {
          label: 'Import Patch…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:import'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow?.webContents.send('menu:undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', click: () => mainWindow?.webContents.send('menu:redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Fixtures',
      submenu: [
        {
          label: 'Fixture Library…',
          accelerator: 'CmdOrCtrl+L',
          click: () => mainWindow?.webContents.send('menu:fixtures'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({ role: 'appMenu' });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
