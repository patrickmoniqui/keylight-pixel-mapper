import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { EFFECTS, EFFECT_CATEGORIES } from '../canvas/shaders';
import { EffectParams } from './EffectParams';
import { Strip } from '../fixtures/types';

const RESERVED = new Set(['Escape', 'Delete', 'Backspace', ' ', 'Tab',
  'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12']);

function keyLabel(key: string): string {
  const map: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: '↵',
  };
  return map[key] ?? key.toUpperCase();
}

export function Toolbar() {
  const strips        = useStore((s) => s.strips);
  const loadStrips    = useStore((s) => s.loadStrips);
  const activeEffect  = useStore((s) => s.setActiveEffect);
  const active        = useStore((s) => s.activeEffect);
  const setActiveEffect = activeEffect;
  const output        = useStore((s) => s.output);
  const setOutput     = useStore((s) => s.setOutput);
  const fps           = useStore((s) => s.fps);
  const bpm           = useStore((s) => s.bpm);
  const effectShortcuts  = useStore((s) => s.effectShortcuts);
  const setEffectShortcut = useStore((s) => s.setEffectShortcut);
  const showGrid      = useStore((s) => s.showGrid);
  const toggleGrid    = useStore((s) => s.toggleGrid);
  const targetFps     = useStore((s) => s.targetFps);
  const setTargetFps  = useStore((s) => s.setTargetFps);
  const audioDeviceId = useStore((s) => s.audioDeviceId);
  const setAudioDeviceId = useStore((s) => s.setAudioDeviceId);
  const canUndo       = useStore((s) => s.past.length > 0);
  const canRedo       = useStore((s) => s.future.length > 0);
  const undo          = useStore((s) => s.undo);
  const redo          = useStore((s) => s.redo);
  const sceneMode     = useStore((s) => s.sceneMode);
  const setSceneMode  = useStore((s) => s.setSceneMode);

  const [capturing, setCapturing] = useState<string | null>(null);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!fileMenuRef.current?.contains(e.target as Node)) setFileMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fileMenuOpen]);

  const isReactive = EFFECTS[active]?.category === 'Reactive';

  // Enumerate microphone devices when a Reactive effect is active
  useEffect(() => {
    if (!isReactive) { setMicDevices([]); return; }
    const enumerate = () =>
      navigator.mediaDevices.enumerateDevices()
        .then((devs) => setMicDevices(devs.filter((d) => d.kind === 'audioinput')))
        .catch(() => {});
    enumerate();
    // Re-enumerate after 1 s to pick up labels once mic permission is granted
    const t = setTimeout(enumerate, 1000);
    return () => clearTimeout(t);
  }, [isReactive]);

  // Shortcut capture keyboard handler
  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setCapturing(null); return; }
      if (RESERVED.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
      setEffectShortcut(capturing, e.key);
      setCapturing(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [capturing, setEffectShortcut]);

  useEffect(() => {
    if (!capturing) return;
    const handler = () => setCapturing(null);
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [capturing]);

  const toggleOutput = () => {
    const next = !output.enabled;
    setOutput({ enabled: next });
    (window as any).electronAPI?.setOutputConfig({ ...output, enabled: next });
  };

  const setProtocol = (protocol: 'artnet' | 'sacn' | 'both') => {
    setOutput({ protocol });
    (window as any).electronAPI?.setOutputConfig({ ...output, protocol });
  };

  // ── Export patch ─────────────────────────────────────────────────────────
  const exportPatch = () => {
    const json = JSON.stringify(strips, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keylight-patch.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Import patch ─────────────────────────────────────────────────────────
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (Array.isArray(data) && data.length > 0 && 'id' in data[0]) {
          loadStrips(data as Strip[]);
        }
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="header-area">
      {capturing && (
        <div className="capture-banner">
          Press any key to assign to <strong>{EFFECTS[capturing]?.label}</strong>
          {effectShortcuts[capturing] && (
            <>{' · '}<span className="capture-clear" onClick={(e) => {
              e.stopPropagation();
              setEffectShortcut(capturing, null);
              setCapturing(null);
            }}>Clear ({keyLabel(effectShortcuts[capturing])})</span></>
          )}
          <span className="capture-esc">Esc to cancel</span>
        </div>
      )}

      <div className="toolbar">
        <span className="logo">KeyLight Pixel Mapper</span>
        <div className="divider" />
        <div className="section-label">Protocol</div>
        {(['artnet', 'sacn', 'both'] as const).map((p) => (
          <button key={p} className={output.protocol === p ? 'active' : ''} onClick={() => setProtocol(p)}>
            {p === 'artnet' ? 'Art-Net' : p === 'sacn' ? 'sACN' : 'Both'}
          </button>
        ))}
        <div className="divider" />
        <button className={`output-btn ${output.enabled ? 'on' : ''}`} onClick={toggleOutput} title="Toggle output (Space)">
          {output.enabled ? '⬤ Live' : '◯ Output Off'}
        </button>
        <div className="divider" />
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩ Undo</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">↪ Redo</button>
        <div className="divider" />
        <button className={showGrid ? 'active' : ''} onClick={toggleGrid} title="Toggle grid (G)">⊞ Grid</button>
        <button className={sceneMode ? 'active' : ''} onClick={() => setSceneMode(!sceneMode)} title="Scene mode — multi-layer compositing">⧉ Scene</button>
        <div className="divider" />
        <div className="file-menu-wrap" ref={fileMenuRef}>
          <button
            className={fileMenuOpen ? 'active' : ''}
            onClick={() => setFileMenuOpen((v) => !v)}
            title="File menu"
          >
            File ▾
          </button>
          {fileMenuOpen && (
            <div className="file-dropdown">
              <button className="file-menu-item" onClick={() => { exportPatch(); setFileMenuOpen(false); }}>
                Export Patch…
              </button>
              <button className="file-menu-item" onClick={() => { importRef.current?.click(); setFileMenuOpen(false); }}>
                Import Patch…
              </button>
            </div>
          )}
        </div>
        <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        <div className="divider" />
        <label className="fps-label">
          Out
          <select
            className="fps-select"
            value={targetFps}
            onChange={(e) => setTargetFps(Number(e.target.value))}
            title="Output frames per second sent to fixtures"
          >
            {[10, 15, 20, 25, 30, 40, 44, 60].map((n) => (
              <option key={n} value={n}>{n} fps</option>
            ))}
          </select>
        </label>
        {bpm > 0 && <span className="bpm-display">{bpm} BPM</span>}
        <div className="fps">{fps} fps</div>
      </div>

      {isReactive && micDevices.length > 0 && (
        <div className="mic-bar">
          <span className="mic-label">Mic</span>
          <select
            className="mic-select"
            value={audioDeviceId}
            onChange={(e) => setAudioDeviceId(e.target.value)}
          >
            <option value="">Default</option>
            {micDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="effects-bar">
        {EFFECT_CATEGORIES.map((cat) => {
          const catEffects = Object.entries(EFFECTS).filter(([, d]) => d.category === cat);
          return (
            <div key={cat} className="effect-group">
              <span className="effect-cat">{cat}</span>
              {catEffects.map(([id, def]) => {
                const shortcut = effectShortcuts[id];
                const isCapturing = capturing === id;
                return (
                  <button
                    key={id}
                    className={`fx-btn ${active === id ? 'active' : ''} ${isCapturing ? 'capturing' : ''}`}
                    onClick={() => { setCapturing(null); setActiveEffect(id); }}
                    onContextMenu={(e) => { e.preventDefault(); setCapturing((p) => p === id ? null : id); }}
                    title={`${def.label}${shortcut ? ` [${keyLabel(shortcut)}]` : ''}\nRight-click to assign shortcut`}
                  >
                    {def.label}
                    {shortcut && !isCapturing && <kbd className="shortcut-badge">{keyLabel(shortcut)}</kbd>}
                    {isCapturing && <kbd className="shortcut-badge capturing">?</kbd>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <EffectParams />

      <div className="shortcut-legend">
        <span><kbd>Space</kbd> Output</span>
        <span><kbd>Esc</kbd> Deselect</span>
        <span><kbd>Del</kbd> Remove</span>
        <span><kbd>Ctrl+A</kbd> Select all</span>
        <span><kbd>Ctrl+D</kbd> Duplicate</span>
        <span><kbd>↑↓←→</kbd> Nudge <small>(+Shift fine)</small></span>
        <span><kbd>Ctrl+Z</kbd> Undo</span>
        <span><kbd>Ctrl+Y</kbd> Redo</span>
        <span><kbd>G</kbd> Grid</span>
        <span><kbd>Shift+click</kbd> Multi-select</span>
        <span className="legend-hint">Right-click effect to assign key</span>
      </div>
    </div>
  );
}
