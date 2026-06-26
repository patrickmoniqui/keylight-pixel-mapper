import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label?: string;
  icon?: string;
  danger?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleDown, true);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleDown, true);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Keep menu inside viewport
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = el.getBoundingClientRect();
    if (rect.right > vw) el.style.left = `${vw - rect.width - 4}px`;
    if (rect.bottom > vh) el.style.top = `${vh - rect.height - 4}px`;
  });

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.separator) return <div key={i} className="ctx-sep" />;
        return (
          <div
            key={i}
            className={`ctx-item ${item.danger ? 'danger' : ''}`}
            onClick={() => { item.onClick?.(); onClose(); }}
          >
            {item.icon && <span className="ctx-icon">{item.icon}</span>}
            {item.label}
          </div>
        );
      })}
    </div>
  );
}
