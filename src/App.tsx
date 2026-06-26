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
  const selectedId = useStore((s) => s.selectedStripId);
  const setFps = useStore((s) => s.setFps);
  const updateStrip = useStore((s) => s.updateStrip);
  const setSelectedStrip = useStore((s) => s.setSelectedStrip);
  const removeStrip = useStore((s) => s.removeStrip);
  const duplicateStrip = useStore((s) => s.duplicateStrip);
  const setActiveEffect = useStore((s) => s.setActiveEffect);
  const setOutput = useStore((s) => s.setOutput);
  const effectShortcuts = useStore((s) => s.effectShortcuts);

  // Use refs so keydown handler always sees current values without re-subscribing
  const stripsRef = useRef(strips);
  const selectedIdRef = useRef(selectedId);
  const outputRef = useRef(output);
  const effectShortcutsRef = useRef(effectShortcuts);
  stripsRef.current = strips;
  selectedIdRef.current = selectedId;
  outputRef.current = output;
  effectShortcutsRef.current = effectShortcuts;

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as Element).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      // User-assigned effect shortcuts
      const shortcuts = effectShortcutsRef.current;
      const matchedEffect = Object.entries(shortcuts).find(([, k]) => k === e.key);
      if (matchedEffect && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setActiveEffect(matchedEffect[0]);
        return;
      }

      // Built-in shortcuts
      switch (e.key) {
        case ' ':
          e.preventDefault();
          const next = !outputRef.current.enabled;
          setOutput({ enabled: next });
          (window as any).electronAPI?.setOutputConfig({ ...outputRef.current, enabled: next });
          break;

        case 'Escape':
          setSelectedStrip(null);
          break;

        case 'Delete':
        case 'Backspace': {
          const id = selectedIdRef.current;
          if (id) removeStrip(id);
          break;
        }

        case 'd':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const id = selectedIdRef.current;
            if (id) duplicateStrip(id, uuid());
          }
          break;

        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          const id = selectedIdRef.current;
          if (!id) break;
          e.preventDefault();
          const strip = stripsRef.current.find((s) => s.id === id);
          if (!strip) break;
          const step = e.shiftKey ? 0.001 : 0.005;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          updateStrip(id, {
            x: Math.max(0, Math.min(1, strip.x + dx)),
            y: Math.max(0, Math.min(1, strip.y + dy)),
          });
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveEffect, setOutput, setSelectedStrip, removeStrip, duplicateStrip, updateStrip]);

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
            outputEnabled={output.enabled}
            onFps={setFps}
            selectedStripId={selectedId}
            onSelectStrip={setSelectedStrip}
            onUpdateStrip={updateStrip}
            onStripDrop={handleStripDrop}
          />
        </div>
        <PropertiesPanel />
      </div>
    </div>
  );
}
