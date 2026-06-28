import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Toolbar } from './ui/Toolbar';
import { FixturePanel } from './ui/FixturePanel';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { PerformPanel } from './ui/PerformPanel';
import { PixelCanvas } from './canvas/PixelCanvas';
import { useStore } from './store';

export default function App() {
  const strips           = useStore((s) => s.strips);
  const activeEffect     = useStore((s) => s.activeEffect);
  const output           = useStore((s) => s.output);
  const selectedIds      = useStore((s) => s.selectedStripIds);
  const setFps           = useStore((s) => s.setFps);
  const setBpm           = useStore((s) => s.setBpm);
  const updateStrip      = useStore((s) => s.updateStrip);
  const setSelectedStrips = useStore((s) => s.setSelectedStrips);
  const removeStrip      = useStore((s) => s.removeStrip);
  const duplicateStrip   = useStore((s) => s.duplicateStrip);
  const setActiveEffect  = useStore((s) => s.setActiveEffect);
  const setOutput        = useStore((s) => s.setOutput);
  const effectShortcuts  = useStore((s) => s.effectShortcuts);
  const effectParams     = useStore((s) => s.effectParams);
  const audioDeviceId    = useStore((s) => s.audioDeviceId);
  const showGrid         = useStore((s) => s.showGrid);
  const toggleGrid       = useStore((s) => s.toggleGrid);
  const targetFps        = useStore((s) => s.targetFps);
  const snapshotStrips   = useStore((s) => s.snapshotStrips);
  const undo             = useStore((s) => s.undo);
  const redo             = useStore((s) => s.redo);
  const sceneMode        = useStore((s) => s.sceneMode);
  const scenes           = useStore((s) => s.scenes);
  const activeSceneId    = useStore((s) => s.activeSceneId);
  const activeScene      = scenes.find((sc) => sc.id === activeSceneId) ?? null;
  const sceneLayers      = activeScene?.layers ?? [];
  const updateSceneLayer = useStore((s) => s.updateSceneLayer);
  const canvasWidth      = useStore((s) => s.canvasWidth);
  const canvasHeight     = useStore((s) => s.canvasHeight);
  const appMode          = useStore((s) => s.appMode);
  const setAppMode       = useStore((s) => s.setAppMode);

  const [drawingLayerId, setDrawingLayerId] = useState<string | null>(null);

  // Clear selection and drawing mode when switching to Perform
  useEffect(() => {
    if (appMode === 'perform') {
      setSelectedStrips([]);
      setDrawingLayerId(null);
    }
  }, [appMode, setSelectedStrips]);

  // Native Edit menu → undo / redo
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onMenuUndo) return;
    const offUndo = api.onMenuUndo(() => undo());
    const offRedo = api.onMenuRedo(() => redo());
    return () => { offUndo?.(); offRedo?.(); };
  }, [undo, redo]);

  // Clear drawing mode if the layer is deleted
  useEffect(() => {
    if (drawingLayerId && !sceneLayers.find((l) => l.id === drawingLayerId)) {
      setDrawingLayerId(null);
    }
  }, [drawingLayerId, sceneLayers]);

  const handleAddPolygonPoint = useCallback((layerId: string, pt: { x: number; y: number }) => {
    const layer = sceneLayers.find((l) => l.id === layerId);
    if (!layer) return;
    const points = [...(layer.mask.points ?? []), pt];
    updateSceneLayer(layerId, { mask: { ...layer.mask, points } });
  }, [sceneLayers, updateSceneLayer]);

  const stripsRef          = useRef(strips);
  const selectedIdsRef     = useRef(selectedIds);
  const outputRef          = useRef(output);
  const effectShortcutsRef = useRef(effectShortcuts);
  const appModeRef         = useRef(appMode);
  stripsRef.current          = strips;
  selectedIdsRef.current     = selectedIds;
  outputRef.current          = output;
  effectShortcutsRef.current = effectShortcuts;
  appModeRef.current         = appMode;

  const lastNudgeSnapshotRef = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as Element).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      // Effect shortcuts work in both modes
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

        case 'g':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) toggleGrid();
          break;

        case 'z':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
          break;

        case 'y':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); redo(); }
          break;

        // Edit-mode only actions
        case 'Delete':
        case 'Backspace':
          if (appModeRef.current !== 'edit') break;
          for (const id of selectedIdsRef.current) removeStrip(id);
          break;

        case 'd':
          if (appModeRef.current !== 'edit') break;
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            for (const id of selectedIdsRef.current) duplicateStrip(id, uuid());
          }
          break;

        case 'a':
          if (appModeRef.current !== 'edit') break;
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setSelectedStrips(stripsRef.current.map((s) => s.id));
          }
          break;

        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (appModeRef.current !== 'edit') break;
          const ids = selectedIdsRef.current;
          if (!ids.length) break;
          e.preventDefault();
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

  const isEditMode = appMode === 'edit';

  return (
    <div className="app-layout">
      <Toolbar appMode={appMode} setAppMode={setAppMode} />
      <div className="main-area">
        {isEditMode
          ? <FixturePanel />
          : <PerformPanel drawingLayerId={drawingLayerId} setDrawingLayerId={setDrawingLayerId} />
        }
        <div className="canvas-wrap">
          <PixelCanvas
            strips={strips}
            activeEffect={activeEffect}
            effectParams={effectParams}
            outputEnabled={output.enabled}
            dmxEnabled={output.dmxEnabled}
            dmxUniverse={output.dmxUniverse}
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
            sceneMode={sceneMode}
            sceneLayers={sceneLayers}
            drawingLayerId={drawingLayerId}
            onAddPolygonPoint={handleAddPolygonPoint}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            readOnly={!isEditMode}
          />
        </div>
        {isEditMode && <PropertiesPanel />}
      </div>
    </div>
  );
}
