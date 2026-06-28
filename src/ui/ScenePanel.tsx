import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useStore } from '../store';
import { EFFECTS } from '../canvas/shaders';
import { Scene, SceneLayer, BlendMode } from '../scene/types';

interface Props {
  drawingLayerId: string | null;
  setDrawingLayerId: (id: string | null) => void;
}

export function ScenePanel({ drawingLayerId, setDrawingLayerId }: Props) {
  const scenes           = useStore((s) => s.scenes);
  const activeSceneId    = useStore((s) => s.activeSceneId);
  const strips           = useStore((s) => s.strips);
  const addScene         = useStore((s) => s.addScene);
  const removeScene      = useStore((s) => s.removeScene);
  const renameScene      = useStore((s) => s.renameScene);
  const setActiveSceneId = useStore((s) => s.setActiveSceneId);
  const addSceneLayer    = useStore((s) => s.addSceneLayer);
  const updateSceneLayer = useStore((s) => s.updateSceneLayer);
  const removeSceneLayer = useStore((s) => s.removeSceneLayer);
  const moveSceneLayer   = useStore((s) => s.moveSceneLayer);
  const setActiveLayerId = useStore((s) => s.setActiveLayerId);

  const activeScene  = scenes.find((sc) => sc.id === activeSceneId) ?? null;
  const sceneLayers  = activeScene?.layers ?? [];
  const activeLayerId = activeScene?.activeLayerId ?? null;
  const activeLayer  = sceneLayers.find((l) => l.id === activeLayerId) ?? null;

  const [renamingSceneId, setRenamingSceneId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  const handleAddScene = () => {
    const scene: Scene = {
      id: uuid(),
      name: `Scene ${scenes.length + 1}`,
      layers: [],
      activeLayerId: null,
    };
    addScene(scene);
    if (drawingLayerId) setDrawingLayerId(null);
  };

  const handleSelectScene = (id: string) => {
    setActiveSceneId(id);
    if (drawingLayerId) setDrawingLayerId(null);
  };

  const startRenameScene = (sc: Scene) => {
    setRenamingSceneId(sc.id);
    setRenameVal(sc.name);
  };

  const commitRenameScene = () => {
    if (renamingSceneId && renameVal.trim()) renameScene(renamingSceneId, renameVal.trim());
    setRenamingSceneId(null);
  };

  const handleAddLayer = () => {
    if (!activeSceneId) return;
    const layer: SceneLayer = {
      id: uuid(),
      name: `Layer ${sceneLayers.length + 1}`,
      effect: 'solid',
      effectParams: {},
      mask: { type: 'full' },
      opacity: 1,
      blendMode: 'normal',
      visible: true,
    };
    addSceneLayer(layer);
  };

  const handleMaskTypeChange = (type: 'full' | 'polygon' | 'fixtures') => {
    if (!activeLayer) return;
    if (type === 'polygon') {
      updateSceneLayer(activeLayer.id, { mask: { type: 'polygon', points: [] } });
    } else if (type === 'fixtures') {
      updateSceneLayer(activeLayer.id, { mask: { type: 'fixtures', fixtureIds: [] } });
    } else {
      updateSceneLayer(activeLayer.id, { mask: { type: 'full' } });
    }
    if (type !== 'polygon') setDrawingLayerId(null);
  };

  const toggleFixture = (stripId: string) => {
    if (!activeLayer || activeLayer.mask.type !== 'fixtures') return;
    const ids = activeLayer.mask.fixtureIds ?? [];
    const next = ids.includes(stripId)
      ? ids.filter((id) => id !== stripId)
      : [...ids, stripId];
    updateSceneLayer(activeLayer.id, { mask: { ...activeLayer.mask, fixtureIds: next } });
  };

  return (
    <div className="panel scene-panel">

      {/* ── Scene selector ─────────────────────────────────────── */}
      <div className="scene-selector">
        <div className="scene-selector-scroll">
          {scenes.map((sc) => (
            <div
              key={sc.id}
              className={`scene-chip${sc.id === activeSceneId ? ' active' : ''}`}
              onClick={() => handleSelectScene(sc.id)}
            >
              {renamingSceneId === sc.id ? (
                <input
                  className="scene-rename-input"
                  value={renameVal}
                  autoFocus
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={commitRenameScene}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRenameScene();
                    if (e.key === 'Escape') setRenamingSceneId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span onDoubleClick={(e) => { e.stopPropagation(); startRenameScene(sc); }}>
                    {sc.name}
                  </span>
                  {sc.id === activeSceneId && scenes.length > 1 && (
                    <button
                      className="scene-chip-del"
                      title="Delete scene"
                      onClick={(e) => { e.stopPropagation(); removeScene(sc.id); }}
                    >✕</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <button className="small scene-add-btn" onClick={handleAddScene} title="Add scene">+</button>
      </div>

      {/* ── No scenes yet ──────────────────────────────────────── */}
      {scenes.length === 0 && (
        <div className="empty">No scenes<br /><span>Click + to add a scene</span></div>
      )}

      {/* ── Layer list ─────────────────────────────────────────── */}
      {activeScene && (
        <>
          <div className="panel-header" style={{ borderTop: '1px solid var(--border)' }}>
            Layers
            <button className="small" onClick={handleAddLayer} title="Add layer">+</button>
          </div>

          <div className="scene-layer-list">
            {sceneLayers.length === 0 && (
              <div className="empty">No layers<br /><span>Click + to add a layer</span></div>
            )}
            {[...sceneLayers].reverse().map((layer) => (
              <div
                key={layer.id}
                className={`scene-layer-item${activeLayerId === layer.id ? ' selected' : ''}`}
                onClick={() => setActiveLayerId(layer.id)}
              >
                <button
                  className="layer-vis"
                  title={layer.visible ? 'Hide' : 'Show'}
                  onClick={(e) => { e.stopPropagation(); updateSceneLayer(layer.id, { visible: !layer.visible }); }}
                >
                  {layer.visible ? '●' : '○'}
                </button>
                <span className="layer-name">{layer.name}</span>
                <span className="layer-fx-badge">{EFFECTS[layer.effect]?.label ?? '?'}</span>
                <button className="layer-move" title="Move up" onClick={(e) => { e.stopPropagation(); moveSceneLayer(layer.id, 'up'); }}>↑</button>
                <button className="layer-move" title="Move down" onClick={(e) => { e.stopPropagation(); moveSceneLayer(layer.id, 'down'); }}>↓</button>
                <button className="layer-del" title="Delete" onClick={(e) => {
                  e.stopPropagation();
                  removeSceneLayer(layer.id);
                  if (drawingLayerId === layer.id) setDrawingLayerId(null);
                }}>✕</button>
              </div>
            ))}
          </div>

          {/* ── Layer properties ─────────────────────────────────── */}
          {activeLayer && (
            <div className="scene-layer-props">
              <div className="sp-section-label">Layer</div>

              <div className="sp-row">
                <span className="sp-label">Name</span>
                <input
                  value={activeLayer.name}
                  onChange={(e) => updateSceneLayer(activeLayer.id, { name: e.target.value })}
                />
              </div>

              <div className="sp-row">
                <span className="sp-label">Effect</span>
                <select
                  value={activeLayer.effect}
                  onChange={(e) => updateSceneLayer(activeLayer.id, { effect: e.target.value })}
                >
                  {Object.entries(EFFECTS).map(([id, def]) => (
                    <option key={id} value={id}>{def.category} · {def.label}</option>
                  ))}
                </select>
              </div>

              <div className="sp-row">
                <span className="sp-label">Blend</span>
                <select
                  value={activeLayer.blendMode}
                  onChange={(e) => updateSceneLayer(activeLayer.id, { blendMode: e.target.value as BlendMode })}
                >
                  <option value="normal">Normal</option>
                  <option value="add">Add</option>
                  <option value="screen">Screen</option>
                  <option value="multiply">Multiply</option>
                </select>
              </div>

              <div className="sp-row">
                <span className="sp-label">Opacity</span>
                <div className="sp-slider-row">
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={activeLayer.opacity}
                    className="ep-range"
                    style={{ flex: 1 }}
                    onChange={(e) => updateSceneLayer(activeLayer.id, { opacity: Number(e.target.value) })}
                  />
                  <span className="ep-value">{Math.round(activeLayer.opacity * 100)}%</span>
                </div>
              </div>

              <div className="sp-section-label" style={{ marginTop: 8 }}>Mask</div>
              <div className="sp-mask-types">
                {(['full', 'polygon', 'fixtures'] as const).map((type) => (
                  <label key={type} className="sp-radio">
                    <input
                      type="radio"
                      name={`mask-${activeLayer.id}`}
                      checked={activeLayer.mask.type === type}
                      onChange={() => handleMaskTypeChange(type)}
                    />
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </label>
                ))}
              </div>

              {activeLayer.mask.type === 'polygon' && (
                <div className="sp-mask-extra">
                  <div className="sp-poly-row">
                    <button
                      className={drawingLayerId === activeLayer.id ? 'active' : ''}
                      onClick={() => setDrawingLayerId(drawingLayerId === activeLayer.id ? null : activeLayer.id)}
                    >
                      {drawingLayerId === activeLayer.id ? '✔ Done' : '✏ Draw'}
                    </button>
                    <button onClick={() => updateSceneLayer(activeLayer.id, { mask: { type: 'polygon', points: [] } })}>
                      Clear
                    </button>
                    <span className="sp-pts-count">{activeLayer.mask.points?.length ?? 0} pts</span>
                  </div>
                  {drawingLayerId === activeLayer.id && (
                    <div className="sp-hint">Click canvas to add vertices</div>
                  )}
                </div>
              )}

              {activeLayer.mask.type === 'fixtures' && (
                <div className="sp-fixture-list">
                  {strips.length === 0 && <div className="sp-hint">No fixtures in patch</div>}
                  {strips.map((s) => (
                    <label key={s.id} className="sp-fixture-check">
                      <input
                        type="checkbox"
                        checked={(activeLayer.mask.fixtureIds ?? []).includes(s.id)}
                        onChange={() => toggleFixture(s.id)}
                      />
                      <span>{s.name}</span>
                      <span className="sp-fix-meta">{s.pixelCount}px</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
