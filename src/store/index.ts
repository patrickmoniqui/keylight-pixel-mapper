import { create } from 'zustand';
import { Strip, OutputConfig } from '../fixtures/types';

// Default effect shortcuts (key string → effect id)
const DEFAULT_SHORTCUTS: Record<string, string> = {
  solid:   '1',
  rainbow: '2',
  fire:    '3',
  plasma:  '4',
  chase:   '5',
};

function loadShortcuts(): Record<string, string> {
  try {
    const saved = JSON.parse(localStorage.getItem('effectShortcuts') ?? 'null');
    return saved ?? DEFAULT_SHORTCUTS;
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

function saveShortcuts(shortcuts: Record<string, string>) {
  try { localStorage.setItem('effectShortcuts', JSON.stringify(shortcuts)); } catch {}
}

interface AppState {
  strips: Strip[];
  selectedStripId: string | null;
  activeEffect: string;
  output: OutputConfig;
  fps: number;
  effectShortcuts: Record<string, string>;

  addStrip: (strip: Strip) => void;
  updateStrip: (id: string, updates: Partial<Strip>) => void;
  removeStrip: (id: string) => void;
  duplicateStrip: (id: string, newId: string) => void;
  setSelectedStrip: (id: string | null) => void;
  setActiveEffect: (effect: string) => void;
  setOutput: (updates: Partial<OutputConfig>) => void;
  setFps: (fps: number) => void;
  setEffectShortcut: (effect: string, key: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  strips: [],
  selectedStripId: null,
  activeEffect: 'rainbow',
  output: {
    protocol: 'both',
    enabled: false,
    broadcastAddress: '255.255.255.255',
  },
  fps: 0,
  effectShortcuts: loadShortcuts(),

  addStrip: (strip) => set((s) => ({ strips: [...s.strips, strip] })),

  updateStrip: (id, updates) =>
    set((s) => ({
      strips: s.strips.map((strip) =>
        strip.id === id ? { ...strip, ...updates } : strip
      ),
    })),

  removeStrip: (id) =>
    set((s) => ({
      strips: s.strips.filter((strip) => strip.id !== id),
      selectedStripId: s.selectedStripId === id ? null : s.selectedStripId,
    })),

  duplicateStrip: (id, newId) =>
    set((s) => {
      const src = s.strips.find((strip) => strip.id === id);
      if (!src) return s;
      const copy: Strip = {
        ...src,
        id: newId,
        name: `${src.name} (copy)`,
        x: Math.min(1, src.x + 0.02),
        y: Math.min(1, src.y + 0.02),
      };
      return { strips: [...s.strips, copy], selectedStripId: newId };
    }),

  setSelectedStrip: (id) => set({ selectedStripId: id }),
  setActiveEffect: (effect) => set({ activeEffect: effect }),
  setOutput: (updates) =>
    set((s) => ({ output: { ...s.output, ...updates } })),
  setFps: (fps) => set({ fps }),

  setEffectShortcut: (effect, key) =>
    set((s) => {
      // One key per effect; also remove the same key from any other effect
      const next = Object.fromEntries(
        Object.entries(s.effectShortcuts).filter(
          ([e, k]) => e !== effect && k !== key
        )
      );
      if (key) next[effect] = key;
      saveShortcuts(next);
      return { effectShortcuts: next };
    }),
}));
