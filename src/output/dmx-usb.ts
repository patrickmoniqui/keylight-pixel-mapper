// ENTTEC DMX USB Pro packet builder (pure — no I/O)
const ENTTEC_START = 0x7e;
const ENTTEC_END   = 0xe7;
const LABEL_DMX    = 0x06;

export function buildEnttecProPacket(data: Uint8Array): Uint8Array {
  const dmxLen     = Math.min(data.length, 512);
  const payloadLen = dmxLen + 1; // start code + data
  const out = new Uint8Array(5 + payloadLen + 1);
  let i = 0;
  out[i++] = ENTTEC_START;
  out[i++] = LABEL_DMX;
  out[i++] = payloadLen & 0xff;
  out[i++] = (payloadLen >> 8) & 0xff;
  out[i++] = 0x00; // DMX start code
  out.set(data.subarray(0, dmxLen), i);
  i += dmxLen;
  out[i] = ENTTEC_END;
  return out;
}
