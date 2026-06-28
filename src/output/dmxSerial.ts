// WebSerial-based DMX USB output — renderer process, no native modules.
//
// 'pro'  — ENTTEC DMX USB Pro: 57600 baud, framed packets (0x7E…0xE7).
//          Device generates the DMX BREAK internally.
// 'open' — ENTTEC Open DMX USB / plain FTDI: 250000 baud, raw DMX.
//          Host asserts BREAK via setSignals(). USB RTT (~1 ms) >> 88 µs minimum,
//          satisfying BREAK and MAB requirements without explicit delays.
import { buildEnttecProPacket } from './dmx-usb';

type StatusCb = (connected: boolean, label: string) => void;

let port: SerialPort | null = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
let statusCb: StatusCb | null = null;
let currentType: 'pro' | 'open' = 'open';

// Open DMX: serialise async break+write sequences; latest-frame-wins queuing
let openBusy = false;
let openPending: Uint8Array | null = null;

export function onDmxStatus(cb: StatusCb): () => void {
  statusCb = cb;
  return () => { if (statusCb === cb) statusCb = null; };
}

function portLabel(p: SerialPort): string {
  const info = p.getInfo();
  if (info.usbVendorId !== undefined && info.usbProductId !== undefined) {
    return `${info.usbVendorId.toString(16).padStart(4, '0')}:${info.usbProductId.toString(16).padStart(4, '0')}`;
  }
  return 'Serial port';
}

// Try to connect without any user interaction.
// 1. Uses a previously-granted port if available (same session reconnect).
// 2. Falls through to requestPort() — Electron doesn't enforce user-gesture
//    requirements, so the main process can auto-select the FTDI device silently.
// Returns true if connected, false if no matching device is present.
export async function tryAutoConnect(type: 'pro' | 'open'): Promise<boolean> {
  // Previously granted in this session (e.g. after a disconnect/reconnect)
  try {
    const ports = await navigator.serial.getPorts();
    if (ports.length > 0) {
      await openDmxPort(ports[0], type);
      return true;
    }
  } catch {}

  // Call requestPort() — main process auto-selects if exactly one FTDI device,
  // rejects with NotFoundError if none is plugged in.
  try {
    const p = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x0403 }] });
    await openDmxPort(p, type);
    return true;
  } catch {
    return false;
  }
}

export async function openDmxPort(p: SerialPort, type: 'pro' | 'open'): Promise<void> {
  await cleanupPort();
  const baudRate = type === 'pro' ? 57600 : 250000;
  await p.open({ baudRate });
  port = p;
  writer = p.writable!.getWriter();
  currentType = type;
  openBusy = false;
  openPending = null;
  statusCb?.(true, portLabel(p));
  p.addEventListener('disconnect', () => { void cleanupPort(); });
}

async function cleanupPort(): Promise<void> {
  openBusy = false;
  openPending = null;
  try { writer?.releaseLock(); } catch {}
  writer = null;
  try { await port?.close(); } catch {}
  port = null;
  statusCb?.(false, '');
}

export async function disconnectDmx(): Promise<void> {
  await cleanupPort();
}

export function isDmxConnected(): boolean {
  return port !== null && writer !== null;
}

// Open DMX: assert BREAK, then write raw start-code + data
async function sendOpenFrame(data: Uint8Array): Promise<void> {
  openBusy = true;
  try {
    await port!.setSignals({ break: true });
    await port!.setSignals({ break: false });
    const frame = new Uint8Array(Math.min(data.length, 512) + 1);
    frame[0] = 0x00; // DMX start code
    frame.set(data.subarray(0, 512), 1);
    await writer!.write(frame);
  } catch {
    await cleanupPort();
  } finally {
    openBusy = false;
    if (openPending) {
      const next = openPending;
      openPending = null;
      void sendOpenFrame(next);
    }
  }
}

export function writeDmx(data: Uint8Array): void {
  if (!port || !writer) return;
  if (currentType === 'open') {
    if (openBusy) {
      openPending = data.slice();
    } else {
      void sendOpenFrame(data.slice());
    }
  } else {
    writer.write(buildEnttecProPacket(data)).catch(() => { void cleanupPort(); });
  }
}
