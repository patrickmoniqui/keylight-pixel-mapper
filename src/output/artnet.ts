const ART_NET_ID = Buffer.from('Art-Net\0', 'ascii');
const OP_OUTPUT = 0x5000;
const PROT_VER = 14;

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
