import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { EffectsPanel } from './EffectsPanel';
import { ScenePanel } from './ScenePanel';

interface Props {
  drawingLayerId: string | null;
  setDrawingLayerId: (id: string | null) => void;
}

export function PerformPanel({ drawingLayerId, setDrawingLayerId }: Props) {
  const sceneMode    = useStore((s) => s.sceneMode);
  const setSceneMode = useStore((s) => s.setSceneMode);

  const [tab, setTab] = useState<'effects' | 'scene'>(sceneMode ? 'scene' : 'effects');

  const switchTab = (t: 'effects' | 'scene') => {
    setTab(t);
    setSceneMode(t === 'scene');
  };

  // Keep tab in sync if sceneMode is toggled externally
  useEffect(() => {
    setTab(sceneMode ? 'scene' : 'effects');
  }, [sceneMode]);

  return (
    <div className="panel perform-panel">
      <div className="panel-tabs">
        <button
          className={`tab-btn${tab === 'effects' ? ' active' : ''}`}
          onClick={() => switchTab('effects')}
        >
          Effects
        </button>
        <button
          className={`tab-btn${tab === 'scene' ? ' active' : ''}`}
          onClick={() => switchTab('scene')}
        >
          Scene
        </button>
      </div>

      {tab === 'effects'
        ? <EffectsPanel />
        : <ScenePanel drawingLayerId={drawingLayerId} setDrawingLayerId={setDrawingLayerId} />
      }
    </div>
  );
}
