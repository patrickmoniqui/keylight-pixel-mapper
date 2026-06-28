import { useEffect } from 'react';

interface Props {
  onClose: () => void;
}

const SHORTCUTS: { category: string; items: { keys: string[]; label: string; mode?: 'edit' | 'both' }[] }[] = [
  {
    category: 'General',
    items: [
      { keys: ['Space'], label: 'Toggle output' },
      { keys: ['G'], label: 'Toggle grid' },
      { keys: ['Ctrl', 'Z'], label: 'Undo' },
      { keys: ['Ctrl', 'Y'], label: 'Redo' },
      { keys: ['?'], label: 'Show shortcuts' },
    ],
  },
  {
    category: 'Selection (Edit mode)',
    items: [
      { keys: ['Click'], label: 'Select fixture' },
      { keys: ['Shift', 'Click'], label: 'Multi-select' },
      { keys: ['Ctrl', 'A'], label: 'Select all' },
      { keys: ['Esc'], label: 'Deselect' },
    ],
  },
  {
    category: 'Fixtures (Edit mode)',
    items: [
      { keys: ['Del'], label: 'Remove selected' },
      { keys: ['Ctrl', 'D'], label: 'Duplicate selected' },
      { keys: ['↑ ↓ ← →'], label: 'Nudge position' },
      { keys: ['Shift', '↑ ↓ ← →'], label: 'Fine nudge' },
    ],
  },
  {
    category: 'Effects',
    items: [
      { keys: ['0–9 / a–z'], label: 'Trigger assigned effect shortcut' },
    ],
  },
];

export function ShortcutsModal({ onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="shortcuts-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <span>Keyboard Shortcuts</span>
          <button className="shortcuts-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="shortcuts-modal-body">
          {SHORTCUTS.map((group) => (
            <div key={group.category} className="shortcuts-group">
              <div className="shortcuts-category">{group.category}</div>
              {group.items.map((item) => (
                <div key={item.label} className="shortcuts-row">
                  <div className="shortcuts-keys">
                    {item.keys.map((k, i) => (
                      <span key={i}>
                        <kbd>{k}</kbd>
                        {i < item.keys.length - 1 && <span className="shortcuts-plus">+</span>}
                      </span>
                    ))}
                  </div>
                  <span className="shortcuts-label">{item.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
