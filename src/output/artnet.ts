const ART_NET_ID = Buffer.from('Art-Net\0', 'ascii');
const OP_OUTPUT  = 0x5000;
const OP_POLL   = 0x2000;
const OP_REPLY  = 0x2100;
const PROT_VER  = 14;

export interface ArtNode { ip: string; name: string; universes: number[]; }

export function buildArtPoll(): Buffer {
  const buf = Buffer.alloc(14);
  ART_NET_ID.copy(buf, 0);
  buf.writeUInt16LE(OP_POLL, 8);
  buf.writeUInt16BE(PROT_VER, 10);
  buf[12] = 0x02; // TalkToMe: send reply on change
  buf[13] = 0x00; // priority
  return buf;
}

export function parseArtPollReply(buf: Buffer, ip: string): ArtNode | null {
  if (buf.length < 194) return null;
  if (buf.slice(0, 7).toString('ascii') !== 'Art-Net') return null;
  if (buf.readUInt16LE(8) !== OP_REPLY) return null;

  const net    = buf[18] & 0x7f;
  const subnet = buf[19] & 0x0f;
  const numPorts = Math.min(buf[173], 4);

  const universes: number[] = [];
  for (let i = 0; i < numPorts; i++) {
    universes.push((net << 8) | (subnet << 4) | (buf[190 + i] & 0x0f));
  }

  const raw = buf.slice(26, 44);
  const end = raw.indexOf(0);
  const name = raw.slice(0, end >= 0 ? end : 18).toString('ascii').trim() || ip;

  return { ip, name, universes };
}

let sequence = 0;

export function buildArtDmx(universe: number, data: Uint8Array): Buffer {
  const length = 512;
  const buf = Buffer.alloc(18 + length);

  ART_NET_ID.copy(buf, 0);
  buf.writeUInt16LE(OP_OUTPUT, 8);
  buf.writeUInt16BE(PROT_VER, 10);
  buf[12] = sequence++ & 0xff;
  buf[13] = 0; // physical
  buf.writeUInt16LE(universe & 0x7fff, 14);
  buf.writeUInt16BE(length, 16);

  const dmx = Buffer.alloc(length);
  Buffer.from(data).copy(dmx, 0, 0, Math.min(data.length, length));
  dmx.copy(buf, 18);

  return buf;
}
