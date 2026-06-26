import { useStore } from '../store';
import { EFFECTS, EFFECT_CATEGORIES } from '../canvas/shaders';

export function Toolbar() {
  const activeEffect = useStore((s) => s.activeEffect);
  const setActiveEffect = useStore((s) => s.setActiveEffect);
  const output = useStore((s) => s.output);
  const setOutput = useStore((s) => s.setOutput);
  const fps = useStore((s) => s.fps);

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
              {catEffects.map(([id, def]) => (
                <button
                  key={id}
                  className={`fx-btn ${activeEffect === id ? 'active' : ''}`}
                  onClick={() => setActiveEffect(id)}
                  title={def.label}
                >
                  {def.label}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
