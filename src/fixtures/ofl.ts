// Open Fixture Library integration
// Data sourced from https://github.com/OpenLightingProject/open-fixture-library
import type { ChannelOrder } from './types';

const GH_RAW  = 'https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/master/fixtures';
const GH_API  = 'https://api.github.com/repos/OpenLightingProject/open-fixture-library/contents/fixtures';

export interface OflManufacturer { slug: string; name: string; website?: string; }
export interface OflMode {
  name: string;
  channelOrder: ChannelOrder | '';
  pixelCount: number;
  channelCount: number;
}

// ── Module-level caches ───────────────────────────────────────────────────────

let mfrCache: OflManufacturer[] | null = null;
const fixtureKeysCache = new Map<string, string[]>();
const fixtureModesCache = new Map<string, { name: string; modes: OflMode[] }>();

// ── Public API ────────────────────────────────────────────────────────────────

export async function oflManufacturers(): Promise<OflManufacturer[]> {
  if (mfrCache) return mfrCache;
  const res = await fetch(`${GH_RAW}/manufacturers.json`);
  if (!res.ok) throw new Error(`OFL manufacturers fetch failed (${res.status})`);
  const data: Record<string, { name: string; website?: string }> = await res.json();
  mfrCache = Object.entries(data)
    .filter(([slug]) => slug !== '$schema')
    .map(([slug, info]) => ({ slug, name: info.name, website: info.website }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return mfrCache;
}

export async function oflFixtureKeys(mfrSlug: string): Promise<string[]> {
  if (fixtureKeysCache.has(mfrSlug)) return fixtureKeysCache.get(mfrSlug)!;
  const res = await fetch(`${GH_API}/${mfrSlug}`);
  if (!res.ok) throw new Error(`OFL fixture list failed for ${mfrSlug} (${res.status})`);
  const files: { name: string; type: string }[] = await res.json();
  const keys = files
    .filter((f) => f.type === 'file' && f.name.endsWith('.json'))
    .map((f) => f.name.replace(/\.json$/, ''));
  fixtureKeysCache.set(mfrSlug, keys);
  return keys;
}

export async function oflFixtureDetail(
  mfrSlug: string, key: string
): Promise<{ name: string; modes: OflMode[] }> {
  const cacheKey = `${mfrSlug}/${key}`;
  if (fixtureModesCache.has(cacheKey)) return fixtureModesCache.get(cacheKey)!;
  const res = await fetch(`${GH_RAW}/${mfrSlug}/${key}.json`);
  if (!res.ok) throw new Error(`OFL fixture fetch failed (${res.status})`);
  const fx = await res.json();
  const result = { name: fx.name ?? humanize(key), modes: parseModes(fx) };
  fixtureModesCache.set(cacheKey, result);
  return result;
}

// ── OFL fixture JSON parsing ──────────────────────────────────────────────────

function humanize(key: string): string {
  return key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
export { humanize as oflHumanize };

const COLOR_LETTER: Record<string, string> = {
  Red: 'R', Green: 'G', Blue: 'B', White: 'W',
  'Warm White': 'W', 'Cold White': 'W', Amber: 'A', UV: 'U', Lime: 'G',
};

function capColorKey(cap: { type: string; color?: string }): string {
  if (cap.type !== 'ColorIntensity' || !cap.color) return '';
  return COLOR_LETTER[cap.color] ?? '';
}

function channelColorKey(def: any): string {
  if (!def) return '';
  const caps: any[] = def.capability ? [def.capability] : (def.capabilities ?? []);
  for (const cap of caps) {
    const k = capColorKey(cap);
    if (k) return k;
  }
  return '';
}

const VALID_ORDERS = new Set([
  'RGB', 'RBG', 'GRB', 'GBR', 'BRG', 'BGR',
  'RGBW', 'GRBW', 'BGRW', 'RBGW', 'WRGB', 'WGRB',
]);

function toChannelOrder(keys: string[]): ChannelOrder | '' {
  const s = keys.filter((k) => 'RGBW'.includes(k) && k.length === 1).join('');
  return VALID_ORDERS.has(s) ? (s as ChannelOrder) : '';
}

function parseModes(fx: any): OflMode[] {
  const avail: Record<string, any>    = fx.availableChannels ?? {};
  const tmpls: Record<string, any>    = fx.templateChannels ?? {};
  const matrixPixelCount: number =
    fx.matrix?.pixelCount ? fx.matrix.pixelCount[0] * fx.matrix.pixelCount[1] * fx.matrix.pixelCount[2] : 0;

  return (fx.modes ?? []).map((mode: any) => {
    const channels: any[] = mode.channels ?? [];
    const matrixInsert = channels.find(
      (ch: any) => typeof ch === 'object' && ch.insert === 'matrixChannels'
    );

    if (matrixInsert) {
      // Per-pixel matrix mode
      const tmplKeys: string[] = matrixInsert.templateChannels ?? [];
      const colorKeys = tmplKeys.map((t: string) => channelColorKey(tmpls[t]));
      const channelOrder = toChannelOrder(colorKeys);
      const pixelCount   = matrixPixelCount || 1;
      return {
        name: mode.name,
        channelOrder,
        pixelCount,
        channelCount: channels.filter((ch: any) => typeof ch === 'string').length
                    + pixelCount * tmplKeys.length,
      };
    }

    // Simple flat mode
    const colorKeys = channels
      .filter((ch: any): ch is string => typeof ch === 'string')
      .map((ch: string) => channelColorKey(avail[ch]));
    return {
      name: mode.name,
      channelOrder: toChannelOrder(colorKeys),
      pixelCount: 1,
      channelCount: channels.filter((ch: any) => typeof ch === 'string').length,
    };
  });
}
