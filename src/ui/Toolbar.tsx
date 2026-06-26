import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { EFFECTS, EFFECT_CATEGORIES } from '../canvas/shaders';

// Keys that can't be assigned as effect shortcuts
const RESERVED = new Set(['Escape', 'Delete', 'Backspace', ' ', 'Tab',
  'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12']);

function keyLabel(key: string): string {
  const map: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Enter: '↵', ' ': '·',
  };
  return map[key] ?? key.toUpperCase();
}

export function Toolbar() {
  const activeEffect = useStore((s) => s.activeEffect);
  const setActiveEffect = useStore((s) => s.setActiveEffect);
  const output = useStore((s) => s.output);
  const setOutput = useStore((s) => s.setOutput);
  const fps = useStore((s) => s.fps);
  const effectShortcuts = useStore((s) => s.effectShortcuts);
  const setEffectShortcut = useStore((s) => s.setEffectShortcut);

  // Which effect is waiting for a key press
  const [capturing, setCapturing] = useState<string | null>(null);

  // Reverse map: key → effect, for display
  const keyToEffect = Object.fromEntries(
    Object.entries(effectShortcuts).map(([e, k]) => [k, e])
  );

  // Capture key press when in capture mode
  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(null);
        return;
      }
      if (RESERVED.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
      setEffectShortcut(capturing, e.key);
      setCapturing(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [capturing, setEffectShortcut]);

  // Click outside cancels capture
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

  return (
    <div className="header-area">
      {/* Capture banner */}
      {capturing && (
        <div className="capture-banner">
          Press any key to assign to <strong>{EFFECTS[capturing]?.label}</strong>
          {effectShortcuts[capturing] && (
            <>
              {' '}·{' '}
              <span
                className="capture-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  setEffectShortcut(capturing, null);
                  setCapturing(null);
                }}
              >
                Clear current ({keyLabel(effectShortcuts[capturing])})
              </span>
            </>
          )}
          <span className="capture-esc">Esc to cancel</span>
        </div>
      )}

      {/* Main toolbar row */}
      <div className="toolbar">
        <span className="logo">KeyLight Pixel Mapper</span>

        <div className="divider" />

        <div className="section-label">Protocol</div>
        {(['artnet', 'sacn', 'both'] as const).map((p) => (
          <button
            key={p}
            className={output.protocol === p ? 'active' : ''}
            onClick={() => setProtocol(p)}
          >
            {p === 'artnet' ? 'Art-Net' : p === 'sacn' ? 'sACN' : 'Both'}
          </button>
        ))}

        <div className="divider" />

        <button
          className={`output-btn ${output.enabled ? 'on' : ''}`}
          onClick={toggleOutput}
          title="Toggle output (Space)"
        >
          {output.enabled ? '⬤ Live' : '◯ Output Off'}
        </button>

        <div className="fps">{fps} fps</div>
      </div>

      {/* Effects strip */}
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
                    className={`fx-btn ${activeEffect === id ? 'active' : ''} ${isCapturing ? 'capturing' : ''}`}
                    onClick={() => { setCapturing(null); setActiveEffect(id); }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCapturing((prev) => (prev === id ? null : id));
                    }}
                    title={`${def.label}${shortcut ? ` [${keyLabel(shortcut)}]` : ''}\nRight-click to assign shortcut`}
                  >
                    {def.label}
                    {shortcut && !isCapturing && (
                      <kbd className="shortcut-badge">{keyLabel(shortcut)}</kbd>
                    )}
                    {isCapturing && <kbd className="shortcut-badge capturing">?</kbd>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Shortcut legend */}
      <div className="shortcut-legend">
        <span><kbd>Space</kbd> Output</span>
        <span><kbd>Esc</kbd> Deselect</span>
        <span><kbd>Del</kbd> Remove fixture</span>
        <span><kbd>Ctrl+D</kbd> Duplicate</span>
        <span><kbd>↑↓←→</kbd> Nudge <small>(+Shift fine)</small></span>
        <span className="legend-hint">Right-click effect to assign key</span>
      </div>
    </div>
  );
}
