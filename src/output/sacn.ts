import { v4 as uuidv4 } from 'uuid';

const SOURCE_NAME = 'KeyLight Pixel Mapper';
// Fixed CID for this instance — regenerated each launch is fine for MVP
const CID = Buffer.from(uuidv4().replace(/-/g, ''), 'hex');

let sequence = 0;

export function buildSacnPacket(universe: number, data: Uint8Array): Buffer {
  // E1.31 packet: root layer + framing layer + DMP layer
  const dmxData = Buffer.alloc(513); // start code (0x00) + 512 data bytes
  Buffer.from(data).copy(dmxData, 1, 0, Math.min(data.length, 512));

  const dmpLength = 11 + dmxData.length;           // DMP header (11) + data
  const framingLength = 77 + dmpLength;             // framing header (77) + DMP
  const rootLength = 22 + framingLength;            // root header (22) + framing
  const totalLength = 16 + rootLength;              // preamble (16) + root

  const buf = Buffer.alloc(totalLength);
  let offset = 0;

  // Preamble
  buf.writeUInt16BE(0x0010, offset); offset += 2;   // preamble size
  buf.writeUInt16BE(0x0000, offset); offset += 2;   // postamble size
  // ACN packet identifier
  Buffer.from('ASC-E1.17\0\0\0', 'ascii').copy(buf, offset); offset += 12;

  // Root layer
  buf.writeUInt16BE(0x7000 | rootLength, offset); offset += 2;
  buf.writeUInt32BE(0x00000004, offset); offset += 4; // VECTOR_ROOT_E131_DATA
  CID.copy(buf, offset); offset += 16;

  // Framing layer
  buf.writeUInt16BE(0x7000 | framingLength, offset); offset += 2;
  buf.writeUInt32BE(0x00000002, offset); offset += 4; // VECTOR_E131_DATA_PACKET
  const srcName = Buffer.alloc(64);
  srcName.write(SOURCE_NAME, 'utf8');
  srcName.copy(buf, offset); offset += 64;
  buf[offset++] = 100;                                // priority
  buf.writeUInt16BE(0, offset); offset += 2;          // synchronization address
  buf[offset++] = sequence++ & 0xff;
  buf[offset++] = 0;                                  // options
  buf.writeUInt16BE(universe, offset); offset += 2;

  // DMP layer
  buf.writeUInt16BE(0x7000 | dmpLength, offset); offset += 2;
  buf[offset++] = 0x02;                               // VECTOR_DMP_SET_PROPERTY
  buf[offset++] = 0xa1;                               // address+data type
  buf.writeUInt16BE(0x0000, offset); offset += 2;     // first property address
  buf.writeUInt16BE(0x0001, offset); offset += 2;     // address increment
  buf.writeUInt16BE(dmxData.length, offset); offset += 2; // property count
  dmxData.copy(buf, offset);

  return buf;
}

export function sacnMulticastAddress(universe: number): string {
  return `239.255.${(universe >> 8) & 0xff}.${universe & 0xff}`;
}
