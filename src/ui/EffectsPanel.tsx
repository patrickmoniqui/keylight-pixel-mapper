import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { EFFECTS, EFFECT_CATEGORIES } from '../canvas/shaders';
import { EffectParams } from './EffectParams';

const RESERVED = new Set(['Escape', 'Delete', 'Backspace', ' ', 'Tab',
  'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12']);

function keyLabel(key: string): string {
  const map: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: '↵',
  };
  return map[key] ?? key.toUpperCase();
}

export function EffectsPanel() {
  const active            = useStore((s) => s.activeEffect);
  const setActiveEffect   = useStore((s) => s.setActiveEffect);
  const effectShortcuts   = useStore((s) => s.effectShortcuts);
  const setEffectShortcut = useStore((s) => s.setEffectShortcut);

  const [search, setSearch]       = useState('');
  const [capturing, setCapturing] = useState<string | null>(null);

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
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('.fx-list-item')) setCapturing(null);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [capturing]);

  const q = search.toLowerCase().trim();

  const hasAnyMatch = EFFECT_CATEGORIES.some((cat) =>
    Object.values(EFFECTS).some((d) => d.category === cat && d.label.toLowerCase().includes(q))
  );

  return (
    <div className="effects-panel">
      {capturing && (
        <div className="fx-capture-banner">
          Press key for <strong>{EFFECTS[capturing]?.label}</strong>
          {effectShortcuts[capturing] && (
            <span className="fx-capture-clear" onClick={(e) => {
              e.stopPropagation();
              setEffectShortcut(capturing, null);
              setCapturing(null);
            }}>✕ {keyLabel(effectShortcuts[capturing])}</span>
          )}
          <span className="fx-capture-esc" onClick={() => setCapturing(null)}>Esc</span>
        </div>
      )}

      <div className="effects-search-wrap">
        <input
          className="effects-search"
          placeholder="Search effects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setSearch(''); e.stopPropagation(); }}
        />
        {search && (
          <button className="effects-search-clear" onClick={() => setSearch('')} tabIndex={-1}>✕</button>
        )}
      </div>

      <div className="effects-list">
        {EFFECT_CATEGORIES.map((cat) => {
          const items = Object.entries(EFFECTS).filter(
            ([, d]) => d.category === cat && (!q || d.label.toLowerCase().includes(q))
          );
          if (items.length === 0) return null;
          return (
            <div key={cat} className="fx-group">
              <div className="fx-cat-header">{cat}</div>
              {items.map(([id, def]) => {
                const shortcut   = effectShortcuts[id];
                const isActive   = active === id;
                const isCapturing = capturing === id;
                return (
                  <div
                    key={id}
                    className={`fx-list-item${isActive ? ' active' : ''}${isCapturing ? ' capturing' : ''}`}
                    onClick={() => { setCapturing(null); setActiveEffect(id); }}
                    onContextMenu={(e) => { e.preventDefault(); setCapturing((p) => p === id ? null : id); }}
                    title={`${def.label}${shortcut ? ` [${keyLabel(shortcut)}]` : ''}\nRight-click to assign shortcut`}
                  >
                    <span className="fx-item-dot" />
                    <span className="fx-item-name">{def.label}</span>
                    {shortcut && !isCapturing && (
                      <kbd className="fx-item-kbd">{keyLabel(shortcut)}</kbd>
                    )}
                    {isCapturing && <kbd className="fx-item-kbd capturing">?</kbd>}
                  </div>
                );
              })}
            </div>
          );
        })}

        {q && !hasAnyMatch && (
          <div className="effects-empty">No effects match "{search}"</div>
        )}
      </div>

      <div className="effects-hint">Right-click an effect to assign a shortcut key</div>

      <EffectParams />
    </div>
  );
}
