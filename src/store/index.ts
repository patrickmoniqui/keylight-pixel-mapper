import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Strip, OutputConfig } from '../fixtures/types';
import { Scene, SceneLayer } from '../scene/types';

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
  bpm: number;
  effectShortcuts: Record<string, string>;
  effectParams: Record<string, Record<string, string | number>>;
  showGrid: boolean;
  targetFps: number;
  canvasWidth: number;
  canvasHeight: number;

  addStrip: (strip: Strip) => void;
  updateStrip: (id: string, updates: Partial<Strip>) => void;
  removeStrip: (id: string) => void;
  duplicateStrip: (id: string, newId: string) => void;
  reorderStrips: (fromId: string, toId: string, position: 'before' | 'after') => void;
  snapshotStrips: () => void;
  undo: () => void;
  redo: () => void;
  setSelectedStrips: (ids: string[]) => void;
  toggleStripSelection: (id: string) => void;
  setActiveEffect: (effect: string) => void;
  setOutput: (updates: Partial<OutputConfig>) => void;
  setFps: (fps: number) => void;
  setBpm: (bpm: number) => void;
  setEffectShortcut: (effect: string, key: string | null) => void;
  toggleGrid: () => void;
  setTargetFps: (fps: number) => void;
  setCanvasSize: (w: number, h: number) => void;
  setEffectParam: (effect: string, key: string, value: string | number) => void;
  audioDeviceId: string;
  setAudioDeviceId: (id: string) => void;
  loadStrips: (strips: Strip[]) => void;
  // App mode
  appMode: 'edit' | 'perform';
  setAppMode: (mode: 'edit' | 'perform') => void;
  // Scene mode
  sceneMode: boolean;
  scenes: Scene[];
  activeSceneId: string | null;
  setSceneMode: (enabled: boolean) => void;
  // Fixture preview
  fixturePreviewMode: boolean;
  setFixturePreviewMode: (v: boolean) => void;
  addScene: (scene: Scene) => void;
  removeScene: (id: string) => void;
  renameScene: (id: string, name: string) => void;
  setActiveSceneId: (id: string | null) => void;
  addSceneLayer: (layer: SceneLayer) => void;
  updateSceneLayer: (id: string, updates: Partial<SceneLayer>) => void;
  removeSceneLayer: (id: string) => void;
  moveSceneLayer: (id: string, dir: 'up' | 'down') => void;
  setActiveLayerId: (id: string | null) => void;
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
        artnetMode: 'broadcast',
        dmxEnabled: false,
        dmxUniverse: 0,
        dmxType: 'open' as 'pro' | 'open',
      },
      fps: 0,
      bpm: 0,
      effectShortcuts: DEFAULT_SHORTCUTS,
      effectParams: {} as Record<string, Record<string, string | number>>,
      showGrid: false,
      targetFps: 30,
      canvasWidth: 1280,
      canvasHeight: 720,
      audioDeviceId: '',
      appMode: 'edit' as 'edit' | 'perform',
      sceneMode: false,
      scenes: [] as Scene[],
      activeSceneId: null as string | null,
      fixturePreviewMode: false,

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

      reorderStrips: (fromId, toId, position) =>
        set((s) => {
          const from = s.strips.find((strip) => strip.id === fromId);
          if (!from || fromId === toId) return s;
          const without = s.strips.filter((strip) => strip.id !== fromId);
          const toIdx = without.findIndex((strip) => strip.id === toId);
          if (toIdx < 0) return s;
          const insertAt = position === 'before' ? toIdx : toIdx + 1;
          const next = [...without];
          next.splice(insertAt, 0, from);
          return { past: pushPast(s.past, s.strips), future: [], strips: next };
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
      setBpm: (bpm) => set({ bpm }),

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
      setCanvasSize: (w, h) => set({ canvasWidth: w, canvasHeight: h }),
      setAudioDeviceId: (id) => set({ audioDeviceId: id }),
      setAppMode: (mode) => set({ appMode: mode }),
      setSceneMode: (enabled) => set({ sceneMode: enabled }),
      setFixturePreviewMode: (v) => set({ fixturePreviewMode: v }),

      addScene: (scene) => set((s) => ({ scenes: [...s.scenes, scene], activeSceneId: scene.id })),
      removeScene: (id) =>
        set((s) => {
          const remaining = s.scenes.filter((sc) => sc.id !== id);
          const nextActive = s.activeSceneId === id
            ? (remaining[remaining.length - 1]?.id ?? null)
            : s.activeSceneId;
          return { scenes: remaining, activeSceneId: nextActive };
        }),
      renameScene: (id, name) =>
        set((s) => ({ scenes: s.scenes.map((sc) => sc.id === id ? { ...sc, name } : sc) })),
      setActiveSceneId: (id) => set({ activeSceneId: id }),

      addSceneLayer: (layer) =>
        set((s) => {
          if (!s.activeSceneId) return s;
          return {
            scenes: s.scenes.map((sc) =>
              sc.id === s.activeSceneId
                ? { ...sc, layers: [...sc.layers, layer], activeLayerId: layer.id }
                : sc
            ),
          };
        }),
      updateSceneLayer: (id, updates) =>
        set((s) => {
          if (!s.activeSceneId) return s;
          return {
            scenes: s.scenes.map((sc) =>
              sc.id === s.activeSceneId
                ? { ...sc, layers: sc.layers.map((l) => l.id === id ? { ...l, ...updates } : l) }
                : sc
            ),
          };
        }),
      removeSceneLayer: (id) =>
        set((s) => {
          if (!s.activeSceneId) return s;
          return {
            scenes: s.scenes.map((sc) => {
              if (sc.id !== s.activeSceneId) return sc;
              return {
                ...sc,
                layers: sc.layers.filter((l) => l.id !== id),
                activeLayerId: sc.activeLayerId === id ? null : sc.activeLayerId,
              };
            }),
          };
        }),
      moveSceneLayer: (id, dir) =>
        set((s) => {
          if (!s.activeSceneId) return s;
          return {
            scenes: s.scenes.map((sc) => {
              if (sc.id !== s.activeSceneId) return sc;
              const idx = sc.layers.findIndex((l) => l.id === id);
              if (idx < 0) return sc;
              const newIdx = dir === 'up' ? idx + 1 : idx - 1;
              if (newIdx < 0 || newIdx >= sc.layers.length) return sc;
              const arr = [...sc.layers];
              [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
              return { ...sc, layers: arr };
            }),
          };
        }),
      setActiveLayerId: (id) =>
        set((s) => {
          if (!s.activeSceneId) return s;
          return {
            scenes: s.scenes.map((sc) =>
              sc.id === s.activeSceneId ? { ...sc, activeLayerId: id } : sc
            ),
          };
        }),
      loadStrips: (strips) =>
        set((s) => ({
          past: pushPast(s.past, s.strips),
          future: [],
          strips,
          selectedStripIds: [],
        })),
      setEffectParam: (effect, key, value) =>
        set((s) => ({
          effectParams: {
            ...s.effectParams,
            [effect]: { ...s.effectParams[effect], [key]: value },
          },
        })),
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
        canvasWidth: state.canvasWidth,
        canvasHeight: state.canvasHeight,
        effectParams: state.effectParams,
        audioDeviceId: state.audioDeviceId,
        appMode: state.appMode,
        sceneMode: state.sceneMode,
        scenes: state.scenes,
        activeSceneId: state.activeSceneId,
        // past/future not persisted — history doesn't survive restarts
      }),
    }
  )
);
