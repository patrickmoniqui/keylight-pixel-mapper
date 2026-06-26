// Channel order describes both pixel layout (RGB vs RGBW) and wire order per strip type
export type ChannelOrder =
  | 'RGB' | 'RBG' | 'GRB' | 'GBR' | 'BRG' | 'BGR'
  | 'RGBW' | 'GRBW' | 'BGRW' | 'RBGW' | 'WRGB' | 'WGRB';

export const CHANNEL_ORDERS: ChannelOrder[] = [
  'RGB', 'RBG', 'GRB', 'GBR', 'BRG', 'BGR',
  'RGBW', 'GRBW', 'BGRW', 'RBGW', 'WRGB', 'WGRB',
];

export function channelCount(order: ChannelOrder): number {
  return order.length; // 3 or 4
}

// Map sampled (r,g,b) to DMX bytes in the strip's physical channel order
// W channel uses perceived-brightness white extraction
export function applyChannelOrder(r: number, g: number, b: number, order: ChannelOrder): number[] {
  const w = Math.round(0.299 * r + 0.587 * g + 0.114 * b); // luminance-based white
  const src: Record<string, number> = { R: r, G: g, B: b, W: w };
  return order.split('').map((ch) => src[ch] ?? 0);
}

export interface Strip {
  id: string;
  name: string;
  pixelCount: number;
  channelOrder: ChannelOrder;
  // canvas placement (normalized 0-1)
  x: number;
  y: number;
  angle: number;   // degrees
  spacing: number; // gap between LEDs in normalized canvas units
  // Art-Net / sACN
  universe: number;
  startChannel: number; // 0-based, 0–511
}

export interface OutputConfig {
  protocol: 'artnet' | 'sacn' | 'both';
  enabled: boolean;
  broadcastAddress: string;
}
