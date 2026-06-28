import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'node:path';
import dgram from 'node:dgram';
import started from 'electron-squirrel-startup';
import { buildArtDmx } from './output/artnet';
import { buildSacnPacket, sacnMulticastAddress } from './output/sacn';

if (started) app.quit();

let mainWindow: BrowserWindow | null = null;

interface OutputConfig {
  enabled: boolean;
  protocol: 'artnet' | 'sacn' | 'both';
  broadcastAddress: string;
}

let outputConfig: OutputConfig = {
  enabled: false,
  protocol: 'both',
  broadcastAddress: '255.255.255.255',
};

const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
udp.bind(() => {
  udp.setBroadcast(true);
});

function sendArtNet(universes: Record<number, number[]>) {
  for (const [uStr, data] of Object.entries(universes)) {
    const universe = parseInt(uStr, 10);
    const packet = buildArtDmx(universe, new Uint8Array(data));
    udp.send(packet, 6454, outputConfig.broadcastAddress);
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
});

ipcMain.on('output:config', (_event, config: OutputConfig) => {
  outputConfig = config;
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
