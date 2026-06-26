import { useCallback } from 'react';
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
