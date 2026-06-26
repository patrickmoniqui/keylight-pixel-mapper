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

const MAX_HISTORY = 50;

function snapshot(strips: Strip[]): Strip[] {
  return [...strips]; // Strip objects are replaced on update, never mutated — shallow copy is safe
}

function pushPast(past: Strip[][], strips: Strip[]): Strip[][] {
  return [...past.slice(-(MAX_HISTORY - 1)), snapshot(strips)];
}

interface AppState {
  strips: Strip[];
  past: Strip[][];
  future: Strip[][];
  selectedStripIds: string[];
  activeEffect: string;
  output: OutputConfig;
  fps: number;
  effectShortcuts: Record<string, string>;
  showGrid: boolean;
  targetFps: number;

  addStrip: (strip: Strip) => void;
  updateStrip: (id: string, updates: Partial<Strip>) => void;
  removeStrip: (id: string) => void;
  duplicateStrip: (id: string, newId: string) => void;
  snapshotStrips: () => void;
  undo: () => void;
  redo: () => void;
  setSelectedStrips: (ids: string[]) => void;
  toggleStripSelection: (id: string) => void;
  setActiveEffect: (effect: string) => void;
  setOutput: (updates: Partial<OutputConfig>) => void;
  setFps: (fps: number) => void;
  setEffectShortcut: (effect: string, key: string | null) => void;
  toggleGrid: () => void;
  setTargetFps: (fps: number) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      strips: [] as Strip[],
      past: [] as Strip[][],
      future: [] as Strip[][],
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
      targetFps: 30,

      addStrip: (strip) =>
        set((s) => ({
          past: pushPast(s.past, s.strips),
          future: [],
          strips: [...s.strips, strip],
        })),

      // updateStrip does NOT push history — callers use snapshotStrips() before drag/nudge
      updateStrip: (id, updates) =>
        set((s) => ({
          strips: s.strips.map((strip) =>
            strip.id === id ? { ...strip, ...updates } : strip
          ),
        })),

      removeStrip: (id) =>
        set((s) => ({
          past: pushPast(s.past, s.strips),
          future: [],
          strips: s.strips.filter((strip) => strip.id !== id),
          selectedStripIds: s.selectedStripIds.filter((sid) => sid !== id),
        })),

      duplicateStrip: (id, newId) =>
        set((s) => {
          const src = s.strips.find((strip) => strip.id === id);
          if (!src) return s;
          const copy: Strip = {
            ...src, id: newId,
            name: `${src.name} (copy)`,
            x: Math.min(1, src.x + 0.02),
            y: Math.min(1, src.y + 0.02),
          };
          return {
            past: pushPast(s.past, s.strips),
            future: [],
            strips: [...s.strips, copy],
            selectedStripIds: [newId],
          };
        }),

      // Call before any drag or nudge begins — records current strips into history
      snapshotStrips: () =>
        set((s) => ({
          past: pushPast(s.past, s.strips),
          future: [],
        })),

      undo: () =>
        set((s) => {
          if (s.past.length === 0) return s;
          const prev = s.past[s.past.length - 1];
          return {
            past: s.past.slice(0, -1),
            future: [snapshot(s.strips), ...s.future.slice(0, MAX_HISTORY - 1)],
            strips: prev,
          };
        }),

      redo: () =>
        set((s) => {
          if (s.future.length === 0) return s;
          const next = s.future[0];
          return {
            past: pushPast(s.past, s.strips),
            future: s.future.slice(1),
            strips: next,
          };
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
            Object.entries(s.effectShortcuts).filter(([e, k]) => e !== effect && k !== key)
          );
          if (key) next[effect] = key;
          return { effectShortcuts: next };
        }),

      toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
      setTargetFps: (fps) => set({ targetFps: fps }),
    }),
    {
      name: 'keylight-pixel-mapper',
      partialize: (state) => ({
        strips: state.strips,
        activeEffect: state.activeEffect,
        output: { ...state.output, enabled: false },
        effectShortcuts: state.effectShortcuts,
        showGrid: state.showGrid,
        targetFps: state.targetFps,
        // past/future not persisted — history doesn't survive restarts
      }),
    }
  )
);
