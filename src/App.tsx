import { useCallback, useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import { Toolbar } from './ui/Toolbar';
import { FixturePanel } from './ui/FixturePanel';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { PixelCanvas } from './canvas/PixelCanvas';
import { useStore } from './store';

export default function App() {
  const strips = useStore((s) => s.strips);
  const activeEffect = useStore((s) => s.activeEffect);
  const output = useStore((s) => s.output);
  const selectedIds = useStore((s) => s.selectedStripIds);
  const setFps = useStore((s) => s.setFps);
  const setBpm = useStore((s) => s.setBpm);
  const updateStrip = useStore((s) => s.updateStrip);
  const setSelectedStrips = useStore((s) => s.setSelectedStrips);
  const removeStrip = useStore((s) => s.removeStrip);
  const duplicateStrip = useStore((s) => s.duplicateStrip);
  const setActiveEffect = useStore((s) => s.setActiveEffect);
  const setOutput = useStore((s) => s.setOutput);
  const effectShortcuts = useStore((s) => s.effectShortcuts);
  const effectParams = useStore((s) => s.effectParams);
  const audioDeviceId = useStore((s) => s.audioDeviceId);
  const showGrid = useStore((s) => s.showGrid);
  const toggleGrid = useStore((s) => s.toggleGrid);
  const targetFps = useStore((s) => s.targetFps);
  const snapshotStrips = useStore((s) => s.snapshotStrips);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  const stripsRef = useRef(strips);
  const selectedIdsRef = useRef(selectedIds);
  const outputRef = useRef(output);
  const effectShortcutsRef = useRef(effectShortcuts);
  stripsRef.current = strips;
  selectedIdsRef.current = selectedIds;
  outputRef.current = output;
  effectShortcutsRef.current = effectShortcuts;

  // Debounce snapshot for keyboard nudge so holding arrow doesn't spam history
  const lastNudgeSnapshotRef = useRef(0);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as Element).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      // Effect shortcuts
      const matched = Object.entries(effectShortcutsRef.current).find(([, k]) => k === e.key);
      if (matched && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setActiveEffect(matched[0]);
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          const next = !outputRef.current.enabled;
          setOutput({ enabled: next });
          (window as any).electronAPI?.setOutputConfig({ ...outputRef.current, enabled: next });
          break;

        case 'Escape':
          setSelectedStrips([]);
          break;

        case 'Delete':
        case 'Backspace':
          for (const id of selectedIdsRef.current) removeStrip(id);
          break;

        case 'd':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            for (const id of selectedIdsRef.current) duplicateStrip(id, uuid());
          }
          break;

        case 'z':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
          break;

        case 'y':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); redo(); }
          break;

        case 'g':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) toggleGrid();
          break;

        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setSelectedStrips(stripsRef.current.map((s) => s.id));
          }
          break;

        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          const ids = selectedIdsRef.current;
          if (!ids.length) break;
          e.preventDefault();
          // Snapshot at most once per 600ms so holding arrow makes one undo entry
          const now = Date.now();
          if (now - lastNudgeSnapshotRef.current > 600) {
            snapshotStrips();
            lastNudgeSnapshotRef.current = now;
          }
          const step = e.shiftKey ? 0.001 : 0.005;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          for (const id of ids) {
            const strip = stripsRef.current.find((s) => s.id === id);
            if (strip) updateStrip(id, {
              x: Math.max(0, Math.min(1, strip.x + dx)),
              y: Math.max(0, Math.min(1, strip.y + dy)),
            });
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveEffect, setOutput, setSelectedStrips, removeStrip, duplicateStrip, updateStrip, toggleGrid, undo, redo, snapshotStrips]);

  const handleStripDrop = useCallback(
    (id: string, x: number, y: number) => updateStrip(id, { x, y }),
    [updateStrip]
  );

  return (
    <div className="app-layout">
      <Toolbar />
      <div className="main-area">
        <FixturePanel />
        <div className="canvas-wrap">
          <PixelCanvas
            strips={strips}
            activeEffect={activeEffect}
            effectParams={effectParams}
            outputEnabled={output.enabled}
            onFps={setFps}
            onBpm={setBpm}
            selectedStripIds={selectedIds}
            onSelectStrips={setSelectedStrips}
            onUpdateStrip={updateStrip}
            onStripDrop={handleStripDrop}
            onSnapshot={snapshotStrips}
            showGrid={showGrid}
            targetFps={targetFps}
            audioDeviceId={audioDeviceId}
          />
        </div>
        <PropertiesPanel />
      </div>
    </div>
  );
}
