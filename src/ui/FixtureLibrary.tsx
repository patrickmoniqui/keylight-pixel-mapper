import { useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useStore } from '../store';
import { Strip, ChannelOrder, channelCount } from '../fixtures/types';
import { FIXTURE_LIBRARY, FIXTURE_CATEGORIES, FixturePreset } from '../fixtures/library';
import {
  oflManufacturers, oflFixtureKeys, oflFixtureDetail,
  oflHumanize, OflManufacturer, OflMode,
} from '../fixtures/ofl';

interface Props { onClose: () => void; }

// ── helpers ───────────────────────────────────────────────────────────────────

function nextSlot(strips: Strip[]): { universe: number; startChannel: number } {
  if (strips.length === 0) return { universe: 0, startChannel: 0 };
  const last = strips[strips.length - 1];
  const used = last.startChannel + last.pixelCount * channelCount(last.channelOrder);
  if (used >= 512) return { universe: last.universe + 1, startChannel: 0 };
  return { universe: last.universe, startChannel: used };
}

function countCategory(category: string): number {
  return category === 'All'
    ? FIXTURE_LIBRARY.length
    : FIXTURE_LIBRARY.filter((f) => f.category === category).length;
}

// ── sub-components ────────────────────────────────────────────────────────────

function DotPreview({ pixelCount }: { pixelCount: number }) {
  if (pixelCount === 1) return <div className="fixture-dot-single" />;
  return (
    <div className="fixture-dot-strip">
      {Array.from({ length: Math.min(pixelCount, 20) }, (_, i) => (
        <div key={i} className="fixture-dot-px" />
      ))}
      {pixelCount > 20 && <span className="fixture-dot-more">…</span>}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function FixtureLibrary({ onClose }: Props) {
  const strips     = useStore((s) => s.strips);
  const addStrip   = useStore((s) => s.addStrip);

  const [tab, setTab] = useState<'library' | 'browse'>('library');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleAddFromPreset = (preset: FixturePreset, flashId: (id: string) => void) => {
    const { universe, startChannel } = nextSlot(strips);
    const sameType = strips.filter((s) => s.name.startsWith(preset.name)).length;
    addStrip({
      id: uuid(),
      name: sameType === 0 ? preset.name : `${preset.name} ${sameType + 1}`,
      pixelCount: preset.pixelCount,
      channelOrder: preset.channelOrder,
      x: 0.1 + (strips.length % 5) * 0.01, y: 0.5,
      angle: 0, spacing: preset.spacing,
      universe, startChannel,
    });
    flashId(preset.id);
  };

  const handleAddFromOfl = (
    name: string, pixelCount: number, channelOrder: ChannelOrder, flashId: (id: string) => void, id: string
  ) => {
    const { universe, startChannel } = nextSlot(strips);
    const sameType = strips.filter((s) => s.name.startsWith(name)).length;
    addStrip({
      id: uuid(),
      name: sameType === 0 ? name : `${name} ${sameType + 1}`,
      pixelCount, channelOrder,
      x: 0.1 + (strips.length % 5) * 0.01, y: 0.5,
      angle: 0, spacing: pixelCount === 1 ? 0.04 : 0.008,
      universe, startChannel,
    });
    flashId(id);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="fixture-library-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="fixture-library-header">
          <div className="fixture-library-tabs">
            <button
              className={`lib-tab${tab === 'library' ? ' active' : ''}`}
              onClick={() => setTab('library')}
            >Library</button>
            <button
              className={`lib-tab${tab === 'browse' ? ' active' : ''}`}
              onClick={() => setTab('browse')}
            >Browse Manufacturers</button>
          </div>
          <button className="shortcuts-modal-close" onClick={onClose}>✕</button>
        </div>

        {tab === 'library' ? (
          <LibraryTab onAdd={handleAddFromPreset} />
        ) : (
          <BrowseTab onAdd={handleAddFromOfl} />
        )}
      </div>
    </div>
  );
}

// ── Library tab (existing presets) ────────────────────────────────────────────

function LibraryTab({ onAdd }: {
  onAdd: (preset: FixturePreset, flashId: (id: string) => void) => void;
}) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [added, setAdded] = useState<string | null>(null);

  const flash = (id: string) => {
    setAdded(id);
    setTimeout(() => setAdded((v) => (v === id ? null : v)), 1200);
  };

  const visible = activeCategory === 'All'
    ? FIXTURE_LIBRARY
    : FIXTURE_LIBRARY.filter((f) => f.category === activeCategory);

  return (
    <div className="fixture-library-body">
      <div className="fixture-library-sidebar">
        {FIXTURE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`lib-cat-btn${activeCategory === cat ? ' active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            <span>{cat}</span>
            <span className="lib-cat-count">{countCategory(cat)}</span>
          </button>
        ))}
      </div>
      <div className="fixture-library-grid">
        {visible.map((preset) => {
          const isAdded = added === preset.id;
          return (
            <div key={preset.id} className="fixture-card">
              <div className="fixture-card-preview">
                <DotPreview pixelCount={preset.pixelCount} />
              </div>
              <div className="fixture-card-info">
                <div className="fixture-card-name">{preset.name}</div>
                <div className="fixture-card-meta">
                  {preset.pixelCount}px · {preset.channelOrder}
                  {preset.description && <> · {preset.description}</>}
                </div>
              </div>
              <button
                className={`fixture-card-add${isAdded ? ' added' : ''}`}
                onClick={() => onAdd(preset, flash)}
              >
                {isAdded ? '✓' : '+'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Browse tab (Open Fixture Library) ────────────────────────────────────────

interface OflFixtureRow {
  key: string;
  displayName: string;
  loading: boolean;
  modes: OflMode[];
  realName?: string;
}

function BrowseTab({ onAdd }: {
  onAdd: (
    name: string, pixelCount: number, order: ChannelOrder,
    flashId: (id: string) => void, id: string
  ) => void;
}) {
  const [mfrList, setMfrList]           = useState<OflManufacturer[]>([]);
  const [mfrError, setMfrError]         = useState('');
  const [mfrLoading, setMfrLoading]     = useState(false);
  const [search, setSearch]             = useState('');
  const [selectedMfr, setSelectedMfr]   = useState<OflManufacturer | null>(null);
  const [fixtures, setFixtures]         = useState<OflFixtureRow[]>([]);
  const [fixLoading, setFixLoading]     = useState(false);
  const [fixError, setFixError]         = useState('');
  const [expandedKey, setExpandedKey]   = useState<string | null>(null);
  const [added, setAdded]               = useState<string | null>(null);
  const loadedRef                        = useRef(false);

  // Fetch manufacturer list once
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setMfrLoading(true);
    oflManufacturers()
      .then(setMfrList)
      .catch((e) => setMfrError(String(e)))
      .finally(() => setMfrLoading(false));
  }, []);

  // Fetch fixture keys when manufacturer changes
  useEffect(() => {
    if (!selectedMfr) return;
    setFixtures([]);
    setExpandedKey(null);
    setFixError('');
    setFixLoading(true);
    oflFixtureKeys(selectedMfr.slug)
      .then((keys) =>
        setFixtures(keys.map((key): OflFixtureRow => ({
          key, displayName: oflHumanize(key), loading: false, modes: [],
        })))
      )
      .catch((e) => setFixError(String(e)))
      .finally(() => setFixLoading(false));
  }, [selectedMfr]);

  const flash = (id: string) => {
    setAdded(id);
    setTimeout(() => setAdded((v) => (v === id ? null : v)), 1200);
  };

  const handleExpandFixture = async (row: OflFixtureRow) => {
    if (expandedKey === row.key) { setExpandedKey(null); return; }
    setExpandedKey(row.key);
    if (row.modes.length > 0 || row.loading) return;

    // Mark loading
    setFixtures((prev) =>
      prev.map((f) => f.key === row.key ? { ...f, loading: true } : f)
    );
    try {
      const detail = await oflFixtureDetail(selectedMfr!.slug, row.key);
      setFixtures((prev) =>
        prev.map((f) =>
          f.key === row.key
            ? { ...f, loading: false, modes: detail.modes, realName: detail.name }
            : f
        )
      );
    } catch {
      setFixtures((prev) =>
        prev.map((f) => f.key === row.key ? { ...f, loading: false } : f)
      );
    }
  };

  const filteredMfrs = search.trim()
    ? mfrList.filter((m) => m.name.toLowerCase().includes(search.toLowerCase().trim()))
    : mfrList;

  return (
    <div className="fixture-library-body">
      {/* Manufacturer panel */}
      <div className="ofl-mfr-panel">
        <input
          className="ofl-search"
          placeholder="Search manufacturers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {mfrLoading && <div className="ofl-status">Loading manufacturers…</div>}
        {mfrError  && <div className="ofl-status ofl-error">{mfrError}</div>}
        <div className="ofl-mfr-list">
          {filteredMfrs.map((mfr) => (
            <button
              key={mfr.slug}
              className={`ofl-mfr-btn${selectedMfr?.slug === mfr.slug ? ' active' : ''}`}
              onClick={() => setSelectedMfr(mfr)}
            >
              {mfr.name}
            </button>
          ))}
        </div>
      </div>

      {/* Fixture panel */}
      <div className="ofl-fixture-panel">
        {!selectedMfr && (
          <div className="ofl-placeholder">Select a manufacturer to browse their fixtures</div>
        )}
        {selectedMfr && (
          <>
            <div className="ofl-fixture-panel-title">{selectedMfr.name}</div>
            {fixLoading && <div className="ofl-status">Loading fixtures…</div>}
            {fixError   && <div className="ofl-status ofl-error">{fixError}</div>}
            <div className="ofl-fixture-list">
              {fixtures.map((row) => {
                const isExpanded = expandedKey === row.key;
                const mappableModes = row.modes.filter((m) => m.channelOrder !== '');
                return (
                  <div key={row.key} className="ofl-fixture-row">
                    <button
                      className={`ofl-fixture-btn${isExpanded ? ' expanded' : ''}`}
                      onClick={() => handleExpandFixture(row)}
                    >
                      <span className="ofl-fixture-name">{row.realName ?? row.displayName}</span>
                      <span className="ofl-fixture-arrow">{isExpanded ? '▾' : '›'}</span>
                    </button>

                    {isExpanded && (
                      <div className="ofl-modes">
                        {row.loading && <div className="ofl-status">Loading…</div>}
                        {!row.loading && mappableModes.length === 0 && (
                          <div className="ofl-status ofl-muted">No mappable RGB modes found</div>
                        )}
                        {mappableModes.map((mode) => {
                          const modeId = `${row.key}:${mode.name}`;
                          const isAdded = added === modeId;
                          const name = row.realName ?? row.displayName;
                          return (
                            <div key={mode.name} className="ofl-mode-row">
                              <div className="ofl-mode-info">
                                <span className="ofl-mode-name">{mode.name}</span>
                                <span className="ofl-mode-meta">
                                  {mode.pixelCount}px · {mode.channelOrder} · {mode.channelCount}ch
                                </span>
                              </div>
                              <button
                                className={`fixture-card-add${isAdded ? ' added' : ''}`}
                                onClick={() =>
                                  onAdd(
                                    `${name} (${mode.name})`,
                                    mode.pixelCount,
                                    mode.channelOrder as ChannelOrder,
                                    flash, modeId
                                  )
                                }
                              >
                                {isAdded ? '✓' : '+'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
