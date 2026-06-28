import { useState, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import { useStore } from '../store';
import { Strip, ChannelOrder, CHANNEL_ORDERS, channelCount } from '../fixtures/types';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

type DropPos = 'before' | 'after';

function nextUniverse(strips: Strip[]): number {
  if (strips.length === 0) return 0;
  const last = strips[strips.length - 1];
  const used = last.pixelCount * channelCount(last.channelOrder);
  return last.universe + Math.ceil((last.startChannel + used) / 512);
}

interface CtxState { x: number; y: number; stripId: string; }

export function FixturePanel() {
  const strips = useStore((s) => s.strips);
  const selectedIds = useStore((s) => s.selectedStripIds);
  const addStrip = useStore((s) => s.addStrip);
  const removeStrip = useStore((s) => s.removeStrip);
  const duplicateStrip = useStore((s) => s.duplicateStrip);
  const updateStrip = useStore((s) => s.updateStrip);
  const reorderStrips = useStore((s) => s.reorderStrips);
  const setSelectedStrips = useStore((s) => s.setSelectedStrips);
  const toggleStripSelection = useStore((s) => s.toggleStripSelection);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('Strip');
  const [pixelCount, setPixelCount] = useState(30);
  const [channelOrder, setChannelOrder] = useState<ChannelOrder>('RGB');

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  const [ctx, setCtx] = useState<CtxState | null>(null);

  const draggingId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: DropPos } | null>(null);

  const getDropPos = (e: React.DragEvent, el: HTMLElement): DropPos => {
    const { top, height } = el.getBoundingClientRect();
    return e.clientY < top + height / 2 ? 'before' : 'after';
  };

  const clearDrop = () => setDropTarget(null);

  const handleAdd = () => {
    const strip: Strip = {
      id: uuid(),
      name: `${name} ${strips.length + 1}`,
      pixelCount, channelOrder,
      x: 0.1, y: 0.5, angle: 0, spacing: 0.02,
      universe: nextUniverse(strips), startChannel: 0,
    };
    addStrip(strip);
    setShowForm(false);
  };

  const startRename = (strip: Strip) => {
    setRenamingId(strip.id);
    setRenameVal(strip.name);
    setTimeout(() => renameRef.current?.select(), 30);
  };

  const commitRename = () => {
    if (renamingId && renameVal.trim()) updateStrip(renamingId, { name: renameVal.trim() });
    setRenamingId(null);
  };

  const openCtx = (e: React.MouseEvent, strip: Strip) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, stripId: strip.id });
  };

  const ctxStrip = ctx ? strips.find((s) => s.id === ctx.stripId) : null;

  const ctxItems: ContextMenuItem[] = ctxStrip ? [
    { label: 'Rename', icon: '✏️', onClick: () => startRename(ctxStrip) },
    { label: 'Edit', icon: '⚙️', onClick: () => setSelectedStrips([ctxStrip.id]) },
    { label: 'Duplicate', icon: '⧉', onClick: () => duplicateStrip(ctxStrip.id, uuid()) },
    { separator: true },
    { label: 'Delete', icon: '🗑️', danger: true, onClick: () => removeStrip(ctxStrip.id) },
  ] : [];

  return (
    <div className="panel fixture-panel" onContextMenu={(e) => e.preventDefault()}>
      <div className="panel-header">
        Fixtures
        {strips.length > 0 && <span className="tab-count">{strips.length}</span>}
        <button className="small" onClick={() => setShowForm((v) => !v)}>+</button>
      </div>

      {showForm && (
        <div className="add-form">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Pixels
            <input type="number" min={1} max={512} value={pixelCount}
              onChange={(e) => setPixelCount(parseInt(e.target.value) || 1)} />
          </label>
          <label>Channel Order
            <select value={channelOrder} onChange={(e) => setChannelOrder(e.target.value as ChannelOrder)}>
              {CHANNEL_ORDERS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <div className="form-actions">
            <button onClick={handleAdd}>Add</button>
            <button onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="fixture-list">
        {strips.map((strip) => {
          const isSel = selectedIds.includes(strip.id);
          const isTarget = dropTarget?.id === strip.id;
          const dropClass = isTarget ? ` drop-${dropTarget!.pos}` : '';
          return (
            <div
              key={strip.id}
              className={`fixture-item${isSel ? ' selected' : ''}${dropClass}`}
              onClick={(e) => {
                if (renamingId === strip.id) return;
                if (e.shiftKey) toggleStripSelection(strip.id);
                else setSelectedStrips([strip.id]);
              }}
              onContextMenu={(e) => openCtx(e, strip)}
              draggable={renamingId !== strip.id}
              onDragStart={(e) => {
                if (renamingId === strip.id) { e.preventDefault(); return; }
                draggingId.current = strip.id;
                e.dataTransfer.setData('stripId', strip.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={clearDrop}
              onDragOver={(e) => {
                if (!draggingId.current || draggingId.current === strip.id) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                setDropTarget({ id: strip.id, pos: getDropPos(e, e.currentTarget) });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) clearDrop();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const fromId = draggingId.current;
                if (fromId && fromId !== strip.id) {
                  reorderStrips(fromId, strip.id, getDropPos(e, e.currentTarget));
                }
                draggingId.current = null;
                clearDrop();
              }}
            >
              <span className="dot" />

              {renamingId === strip.id ? (
                <input
                  ref={renameRef}
                  className="rename-input"
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="name">{strip.name}</span>
              )}

              <span className="meta">{strip.pixelCount}px · {strip.channelOrder} · U{strip.universe}</span>

              <button className="delete" title="Delete"
                onClick={(e) => { e.stopPropagation(); removeStrip(strip.id); }}>✕</button>
            </div>
          );
        })}

        {strips.length === 0 && (
          <div className="empty">No fixtures yet.<br />Click + to add a strip.</div>
        )}

        {selectedIds.length > 1 && (
          <div className="multi-sel-hint">{selectedIds.length} selected</div>
        )}
      </div>

      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}
