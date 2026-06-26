import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Strip, OutputConfig } from '../fixtures/types';

const DEFAULT_SHORTCUTS: Record<string, string> = {
  solid:   '1',
  rainbow: '2',
  fire:    '3',
  plasma:  '4',
  chase:   '5',
};

interface AppState {
  strips: Strip[];
  selectedStripIds: string[];
  activeEffect: string;
  output: OutputConfig;
  fps: number;
  effectShortcuts: Record<string, string>;
  showGrid: boolean;

  addStrip: (strip: Strip) => void;
  updateStrip: (id: string, updates: Partial<Strip>) => void;
  removeStrip: (id: string) => void;
  duplicateStrip: (id: string, newId: string) => void;
  setSelectedStrips: (ids: string[]) => void;
  toggleStripSelection: (id: string) => void;
  setActiveEffect: (effect: string) => void;
  setOutput: (updates: Partial<OutputConfig>) => void;
  setFps: (fps: number) => void;
  setEffectShortcut: (effect: string, key: string | null) => void;
  toggleGrid: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      strips: [] as Strip[],
      selectedStripIds: [] as string[],
      activeEffect: 'rainbow',
      output: {
        protocol: 'both',
        enabled: false,
        broadcastAddress: '255.255.255.255',
      },
      fps: 0,
      effectShortcuts: DEFAULT_SHORTCUTS,
      showGrid: false,

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
          selectedStripIds: s.selectedStripIds.filter((sid) => sid !== id),
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
          return { strips: [...s.strips, copy], selectedStripIds: [newId] };
        }),

      setSelectedStrips: (ids) => set({ selectedStripIds: ids }),

      toggleStripSelection: (id) =>
        set((s) => ({
          selectedStripIds: s.selectedStripIds.includes(id)
            ? s.selectedStripIds.filter((sid) => sid !== id)
            : [...s.selectedStripIds, id],
        })),

      setActiveEffect: (effect) => set({ activeEffect: effect }),
      setOutput: (updates) => set((s) => ({ output: { ...s.output, ...updates } })),
      setFps: (fps) => set({ fps }),

      setEffectShortcut: (effect, key) =>
        set((s) => {
          const next = Object.fromEntries(
            Object.entries(s.effectShortcuts).filter(
              ([e, k]) => e !== effect && k !== key
            )
          );
          if (key) next[effect] = key;
          return { effectShortcuts: next };
        }),

      toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    }),
    {
      name: 'keylight-pixel-mapper',
      // Only persist data — not runtime state like fps, selectedStripIds, or output.enabled
      partialize: (state) => ({
        strips: state.strips,
        activeEffect: state.activeEffect,
        output: { ...state.output, enabled: false },
        effectShortcuts: state.effectShortcuts,
        showGrid: state.showGrid,
      }),
    }
  )
);
