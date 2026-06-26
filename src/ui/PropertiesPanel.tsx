import { useStore } from '../store';
import { CHANNEL_ORDERS, ChannelOrder } from '../fixtures/types';

export function PropertiesPanel() {
  const strips = useStore((s) => s.strips);
  const selectedIds = useStore((s) => s.selectedStripIds);
  const updateStrip = useStore((s) => s.updateStrip);

  const primaryId = selectedIds[0] ?? null;
  const strip = strips.find((s) => s.id === primaryId);

  // Nothing selected
  if (selectedIds.length === 0) {
    return (
      <div className="panel properties-panel">
        <div className="panel-header">Properties</div>
        <div className="empty">Select a fixture to edit its properties.</div>
      </div>
    );
  }

  // Multiple selected — show summary
  if (selectedIds.length > 1) {
    const totalPixels = strips
      .filter((s) => selectedIds.includes(s.id))
      .reduce((sum, s) => sum + s.pixelCount, 0);
    return (
      <div className="panel properties-panel">
        <div className="panel-header">Properties</div>
        <div className="multi-sel-info">
          <div className="multi-sel-count">{selectedIds.length}</div>
          <div className="multi-sel-label">fixtures selected</div>
          <div className="multi-sel-pixels">{totalPixels} total pixels</div>
          <div className="multi-sel-tips">
            <div>Drag dots → move all</div>
            <div>⟳ handle → rotate group</div>
            <div>⤡ handle → scale group</div>
            <div>Arrow keys → nudge all</div>
            <div>Ctrl+D → duplicate all</div>
            <div>Del → remove all</div>
          </div>
        </div>
      </div>
    );
  }

  // Single selected
  if (!strip) return null;

  const set = (field: string, value: string | number) =>
    updateStrip(strip.id, { [field]: value } as any);

  return (
    <div className="panel properties-panel">
      <div className="panel-header">{strip.name}</div>

      <div className="prop-group">
        <div className="prop-label">Placement</div>
        <label>X (0–1)
          <input type="number" step={0.005} min={0} max={1}
            value={strip.x.toFixed(4)}
            onChange={(e) => set('x', parseFloat(e.target.value))} />
        </label>
        <label>Y (0–1)
          <input type="number" step={0.005} min={0} max={1}
            value={strip.y.toFixed(4)}
            onChange={(e) => set('y', parseFloat(e.target.value))} />
        </label>
        <label>Angle (°)
          <input type="number" step={0.5} min={-360} max={360}
            value={strip.angle.toFixed(1)}
            onChange={(e) => set('angle', parseFloat(e.target.value))} />
        </label>
        <label>Spacing
          <input type="number" step={0.001} min={0.001} max={0.1}
            value={strip.spacing.toFixed(4)}
            onChange={(e) => set('spacing', parseFloat(e.target.value))} />
        </label>
      </div>

      <div className="prop-group">
        <div className="prop-label">Fixture</div>
        <label>Name
          <input value={strip.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label>Pixel Count
          <input type="number" min={1} max={512} value={strip.pixelCount}
            onChange={(e) => set('pixelCount', parseInt(e.target.value))} />
        </label>
        <label>Channel Order
          <select value={strip.channelOrder}
            onChange={(e) => set('channelOrder', e.target.value as ChannelOrder)}>
            {CHANNEL_ORDERS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      </div>

      <div className="prop-group">
        <div className="prop-label">DMX</div>
        <label>Universe
          <input type="number" min={0} max={32767} value={strip.universe}
            onChange={(e) => set('universe', parseInt(e.target.value))} />
        </label>
        <label>Start Channel (0–511)
          <input type="number" min={0} max={511} value={strip.startChannel}
            onChange={(e) => set('startChannel', parseInt(e.target.value))} />
        </label>
      </div>
    </div>
  );
}
