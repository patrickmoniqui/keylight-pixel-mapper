import { useStore } from '../store';
import { EFFECTS } from '../canvas/shaders';

export function EffectParams() {
  const activeEffect = useStore((s) => s.activeEffect);
  const effectParams = useStore((s) => s.effectParams);
  const setEffectParam = useStore((s) => s.setEffectParam);

  const def = EFFECTS[activeEffect];
  if (!def?.params) return null;

  const params = effectParams[activeEffect] ?? {};

  return (
    <div className="effect-params-bar">
      <span className="ep-effect-name">{def.label}</span>
      {Object.entries(def.params).map(([key, paramDef]) => {
        const value = key in params ? params[key] : paramDef.default;
        if (paramDef.type === 'color') {
          return (
            <label key={key} className="ep-item">
              <span className="ep-label">{paramDef.label}</span>
              <input
                type="color"
                className="ep-color"
                value={value as string}
                onChange={(e) => setEffectParam(activeEffect, key, e.target.value)}
              />
            </label>
          );
        }
        return (
          <label key={key} className="ep-item">
            <span className="ep-label">{paramDef.label}</span>
            <input
              type="range"
              className="ep-range"
              min={paramDef.min}
              max={paramDef.max}
              step={paramDef.step}
              value={value as number}
              onChange={(e) => setEffectParam(activeEffect, key, Number(e.target.value))}
            />
            <span className="ep-value">
              {(paramDef.step ?? 1) < 1
                ? Number(value).toFixed(1)
                : Math.round(value as number)}
            </span>
          </label>
        );
      })}
    </div>
  );
}
