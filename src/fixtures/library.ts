import type { ChannelOrder } from './types';

export interface FixturePreset {
  id: string;
  name: string;
  category: string;
  pixelCount: number;
  channelOrder: ChannelOrder;
  spacing: number; // normalized canvas units between LED centers
  description?: string;
}

export const FIXTURE_LIBRARY: FixturePreset[] = [
  // ── KeyLight ──────────────────────────────────────────────────────────────
  { id: 'kl-pt120',    name: 'PT-120',           category: 'KeyLight',  pixelCount: 120, channelOrder: 'RGBW', spacing: 0.008,  description: 'KeyLight PT-120 — 120px RGBW, 480ch/universe' },
  { id: 'kl-strip30',  name: 'KeyLight Strip 30', category: 'KeyLight',  pixelCount: 30,  channelOrder: 'RGBW', spacing: 0.033 },
  { id: 'kl-strip60',  name: 'KeyLight Strip 60', category: 'KeyLight',  pixelCount: 60,  channelOrder: 'RGBW', spacing: 0.016 },

  // ── PAR LEDs ──────────────────────────────────────────────────────────────
  { id: 'par-rgb',     name: 'PAR RGB',           category: 'PAR LED',   pixelCount: 1,   channelOrder: 'RGB',  spacing: 0.04,   description: '3-channel RGB' },
  { id: 'par-grb',     name: 'PAR GRB',           category: 'PAR LED',   pixelCount: 1,   channelOrder: 'GRB',  spacing: 0.04 },
  { id: 'par-bgr',     name: 'PAR BGR',           category: 'PAR LED',   pixelCount: 1,   channelOrder: 'BGR',  spacing: 0.04 },
  { id: 'par-rgbw',    name: 'PAR RGBW',          category: 'PAR LED',   pixelCount: 1,   channelOrder: 'RGBW', spacing: 0.04,   description: '4-channel RGBW' },
  { id: 'par-grbw',    name: 'PAR GRBW',          category: 'PAR LED',   pixelCount: 1,   channelOrder: 'GRBW', spacing: 0.04 },

  // ── LED Strips ────────────────────────────────────────────────────────────
  { id: 'ws2812b-30',  name: 'WS2812B 30px',      category: 'LED Strip', pixelCount: 30,  channelOrder: 'GRB',  spacing: 0.033,  description: '30 LEDs/m' },
  { id: 'ws2812b-60',  name: 'WS2812B 60px',      category: 'LED Strip', pixelCount: 60,  channelOrder: 'GRB',  spacing: 0.016,  description: '60 LEDs/m' },
  { id: 'ws2812b-144', name: 'WS2812B 144px',     category: 'LED Strip', pixelCount: 144, channelOrder: 'GRB',  spacing: 0.007,  description: '144 LEDs/m' },
  { id: 'sk6812-30',   name: 'SK6812 RGBW 30px',  category: 'LED Strip', pixelCount: 30,  channelOrder: 'GRBW', spacing: 0.033,  description: '30 LEDs/m, white channel' },
  { id: 'sk6812-60',   name: 'SK6812 RGBW 60px',  category: 'LED Strip', pixelCount: 60,  channelOrder: 'GRBW', spacing: 0.016,  description: '60 LEDs/m, white channel' },
  { id: 'apa102-60',   name: 'APA102 60px',        category: 'LED Strip', pixelCount: 60,  channelOrder: 'BGR',  spacing: 0.016,  description: '60 LEDs/m, SPI' },

  // ── LED Bars ──────────────────────────────────────────────────────────────
  { id: 'bar-8',       name: 'LED Bar 8px',        category: 'LED Bar',   pixelCount: 8,   channelOrder: 'RGB',  spacing: 0.025 },
  { id: 'bar-12',      name: 'LED Bar 12px',       category: 'LED Bar',   pixelCount: 12,  channelOrder: 'RGB',  spacing: 0.016 },
  { id: 'bar-24',      name: 'LED Bar 24px',       category: 'LED Bar',   pixelCount: 24,  channelOrder: 'RGB',  spacing: 0.012 },
  { id: 'bar-48',      name: 'LED Bar 48px',       category: 'LED Bar',   pixelCount: 48,  channelOrder: 'RGB',  spacing: 0.008 },
];

export const FIXTURE_CATEGORIES = [
  'All',
  ...Array.from(new Set(FIXTURE_LIBRARY.map((f) => f.category))),
];
