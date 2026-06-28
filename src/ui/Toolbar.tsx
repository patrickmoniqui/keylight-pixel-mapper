import { useState, useEffect, useRef, useCallback } from 'react';
import type { ArtNode } from '../fixtures/types';
import { useStore } from '../store';
import { EFFECTS } from '../canvas/shaders';
import { ShortcutsModal } from './ShortcutsModal';
import { FixtureLibrary } from './FixtureLibrary';
import { Strip } from '../fixtures/types';

interface ToolbarProps {
  appMode: 'edit' | 'perform';
  setAppMode: (mode: 'edit' | 'perform') => void;
}

export function Toolbar({ appMode, setAppMode }: ToolbarProps) {
  const strips            = useStore((s) => s.strips);
  const loadStrips        = useStore((s) => s.loadStrips);
  const activeEffect      = useStore((s) => s.setActiveEffect);
  const active            = useStore((s) => s.activeEffect);
  const setActiveEffect   = activeEffect;
  const output            = useStore((s) => s.output);
  const setOutput         = useStore((s) => s.setOutput);
  const fps               = useStore((s) => s.fps);
  const bpm               = useStore((s) => s.bpm);
  const showGrid          = useStore((s) => s.showGrid);
  const toggleGrid        = useStore((s) => s.toggleGrid);
  const targetFps         = useStore((s) => s.targetFps);
  const setTargetFps      = useStore((s) => s.setTargetFps);
  const audioDeviceId     = useStore((s) => s.audioDeviceId);
  const setAudioDeviceId  = useStore((s) => s.setAudioDeviceId);
  const canvasWidth       = useStore((s) => s.canvasWidth);
  const canvasHeight      = useStore((s) => s.canvasHeight);
  const setCanvasSize     = useStore((s) => s.setCanvasSize);

  const isReactive = EFFECTS[active]?.category === 'Reactive';

  const PRESETS = [
    { label: '960 × 540', w: 960, h: 540 },
    { label: '1280 × 720', w: 1280, h: 720 },
    { label: '1920 × 1080', w: 1920, h: 1080 },
    { label: '3840 × 2160', w: 3840, h: 2160 },
  ];
  const matchedPreset = PRESETS.find((p) => p.w === canvasWidth && p.h === canvasHeight);
  const [customW, setCustomW] = useState(String(canvasWidth));
  const [customH, setCustomH] = useState(String(canvasHeight));

  const [micDevices, setMicDevices]       = useState<MediaDeviceInfo[]>([]);
  const [showSettings, setShowSettings]   = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showLibrary, setShowLibrary]     = useState(false);
  const [ipInput, setIpInput]             = useState(output.broadcastAddress);
  const [discoveredNodes, setDiscoveredNodes] = useState<ArtNode[]>([]);
  const [dmxConnected, setDmxConnected]   = useState(false);
  const [dmxPortLabel, setDmxPortLabel]   = useState('');
  const [dmxError, setDmxError]           = useState('');
  const [dmxPicking, setDmxPicking]       = useState(false);
  const [serialPortList, setSerialPortList] = useState<{ portId: string; portName: string }[]>([]);
  const [selectedPortId, setSelectedPortId] = useState('');
  const importRef                       = useRef<HTMLInputElement>(null);
  const settingsRef                     = useRef<HTMLDivElement>(null);

  // Sync IP input when store changes externally (e.g. load from file)
  useEffect(() => { setIpInput(output.broadcastAddress); }, [output.broadcastAddress]);

  // Enumerate microphone devices when a Reactive effect is active
  useEffect(() => {
    if (!isReactive) { setMicDevices([]); return; }
    const enumerate = () =>
      navigator.mediaDevices.enumerateDevices()
        .then((devs) => setMicDevices(devs.filter((d) => d.kind === 'audioinput')))
        .catch(() => {});
    enumerate();
    const t = setTimeout(enumerate, 1000);
    return () => clearTimeout(t);
  }, [isReactive]);

  // Close settings popover when clicking outside
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showSettings]);

  // Listen for native menu File > Export / Import
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onMenuExport) return;
    const offExport = api.onMenuExport(() => exportPatch());
    const offImport = api.onMenuImport(() => importRef.current?.click());
    return () => { offExport?.(); offImport?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for Fixtures menu
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onMenuFixtures) return;
    return api.onMenuFixtures(() => setShowLibrary(true));
  }, []);

  // Discovered Art-Net nodes from main process
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onNodesDiscovered) return;
    return api.onNodesDiscovered((nodes: ArtNode[]) => setDiscoveredNodes(nodes));
  }, []);

  // Subscribe to WebSerial DMX connection status
  useEffect(() => {
    import('../output/dmxSerial').then(({ onDmxStatus }) => {
      return onDmxStatus((connected, label) => {
        setDmxConnected(connected);
        setDmxPortLabel(label);
        if (!connected) { setDmxError(''); setDmxPicking(false); }
      });
    });
  }, []);

  // Auto-connect when USB DMX is enabled (uses previously granted port if available)
  useEffect(() => {
    if (!output.dmxEnabled) return;
    import('../output/dmxSerial').then(({ tryAutoConnect }) => {
      tryAutoConnect(output.dmxType).catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output.dmxEnabled]);

  // Receive port list from main process (triggered by requestPort() call)
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onSerialPorts) return;
    return api.onSerialPorts((ports: { portId: string; portName: string }[]) => {
      setSerialPortList(ports);
      setSelectedPortId(ports[0]?.portId ?? '');
      setDmxPicking(true);
    });
  }, []);

  // ? key opens shortcuts modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as Element).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) setShowShortcuts((v) => !v);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleOutput = () => {
    const next = !output.enabled;
    setOutput({ enabled: next });
    (window as any).electronAPI?.setOutputConfig({ ...output, enabled: next });
  };

  const setProtocol = (protocol: 'artnet' | 'sacn' | 'both') => {
    setOutput({ protocol });
    (window as any).electronAPI?.setOutputConfig({ ...output, protocol });
  };

  const commitIp = () => {
    setOutput({ broadcastAddress: ipInput });
    (window as any).electronAPI?.setOutputConfig({ ...output, broadcastAddress: ipInput });
  };

  const setArtnetMode = useCallback((mode: 'broadcast' | 'unicast') => {
    setOutput({ artnetMode: mode });
    (window as any).electronAPI?.setOutputConfig({ ...output, artnetMode: mode });
  }, [output, setOutput]);

  const applyDmxConfig = useCallback((patch: Partial<typeof output>) => {
    const next = { ...output, ...patch };
    setOutput(patch);
    setDmxError('');
    (window as any).electronAPI?.setOutputConfig(next);
    // Disconnect when disabling so re-enable triggers a fresh auto-connect
    if ('dmxEnabled' in patch && !patch.dmxEnabled) {
      import('../output/dmxSerial').then(({ disconnectDmx }) => disconnectDmx());
    }
  }, [output, setOutput]);

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
      <div className="toolbar">
        <span className="logo">KeyLight</span>

        <div className="mode-switch">
          <button
            className={`mode-btn edit${appMode === 'edit' ? ' active' : ''}`}
            onClick={() => setAppMode('edit')}
            title="Edit — patch fixtures and layout"
          >Edit</button>
          <button
            className={`mode-btn perform${appMode === 'perform' ? ' active' : ''}`}
            onClick={() => setAppMode('perform')}
            title="Perform — effects, scenes, live output"
          >Perform</button>
        </div>

        <div className="divider" />

        <button className={`output-btn ${output.enabled ? 'on' : ''}`} onClick={toggleOutput} title="Toggle output (Space)">
          {output.enabled ? '⬤ Live' : '◯ Output Off'}
        </button>

        {/* Settings popover anchor */}
        <div className="settings-anchor" ref={settingsRef}>
          <button
            className={showSettings ? 'active' : ''}
            onClick={() => setShowSettings((v) => !v)}
            title="Output &amp; audio settings"
          >
            ⚙
          </button>

          {showSettings && (
            <div className="settings-popover">
              <div className="settings-group">
                <div className="settings-group-label">Output</div>

                <div className="settings-row">
                  <span className="settings-row-label">Protocol</span>
                  <div className="proto-btns">
                    {(['artnet', 'sacn', 'both'] as const).map((p) => (
                      <button key={p} className={output.protocol === p ? 'active' : ''} onClick={() => setProtocol(p)}>
                        {p === 'artnet' ? 'Art-Net' : p === 'sacn' ? 'sACN' : 'Both'}
                      </button>
                    ))}
                  </div>
                </div>

                {(output.protocol === 'artnet' || output.protocol === 'both') && (<>
                  <div className="settings-row">
                    <span className="settings-row-label">Art-Net Mode</span>
                    <div className="proto-btns">
                      <button className={output.artnetMode === 'broadcast' ? 'active' : ''}
                        onClick={() => setArtnetMode('broadcast')}>Broadcast</button>
                      <button className={output.artnetMode === 'unicast' ? 'active' : ''}
                        onClick={() => setArtnetMode('unicast')}>Unicast</button>
                    </div>
                  </div>

                  {output.artnetMode === 'broadcast' && (
                    <div className="settings-row">
                      <span className="settings-row-label">Art-Net IP</span>
                      <input
                        className="settings-input"
                        value={ipInput}
                        onChange={(e) => setIpInput(e.target.value)}
                        onBlur={commitIp}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitIp(); }}
                        placeholder="255.255.255.255"
                        spellCheck={false}
                      />
                    </div>
                  )}

                  {output.artnetMode === 'unicast' && (
                    <div className="nodes-list">
                      {discoveredNodes.length === 0
                        ? <div className="nodes-empty">Searching for nodes…</div>
                        : discoveredNodes.map((n) => (
                            <div key={n.ip} className="node-item">
                              <span className="node-name">{n.name}</span>
                              <span className="node-ip">{n.ip}</span>
                              <span className="node-universes">U{n.universes.join(', U')}</span>
                            </div>
                          ))
                      }
                    </div>
                  )}
                </>)}

                <div className="settings-row">
                  <span className="settings-row-label">Frame Rate</span>
                  <select
                    className="settings-select"
                    value={targetFps}
                    onChange={(e) => setTargetFps(Number(e.target.value))}
                  >
                    {[10, 15, 20, 25, 30, 40, 44, 60].map((n) => (
                      <option key={n} value={n}>{n} fps</option>
                    ))}
                  </select>
                </div>
              </div>

              {isReactive && (
                <div className="settings-group">
                  <div className="settings-group-label">Audio</div>
                  <div className="settings-row">
                    <span className="settings-row-label">Microphone</span>
                    <select
                      className="settings-select"
                      value={audioDeviceId}
                      onChange={(e) => setAudioDeviceId(e.target.value)}
                    >
                      <option value="">Default</option>
                      {micDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="settings-group">
                <div className="settings-group-label">USB DMX</div>

                <div className="settings-row">
                  <span className="settings-row-label">Enable</span>
                  <button
                    className={output.dmxEnabled ? 'active' : ''}
                    onClick={() => applyDmxConfig({ dmxEnabled: !output.dmxEnabled })}
                  >{output.dmxEnabled ? 'On' : 'Off'}</button>
                </div>

                {output.dmxEnabled && (<>
                  <div className="settings-row">
                    <span className="settings-row-label">Dongle type</span>
                    <div className="proto-btns">
                      <button
                        className={output.dmxType === 'open' ? 'active' : ''}
                        onClick={() => applyDmxConfig({ dmxType: 'open' })}
                      >Open DMX</button>
                      <button
                        className={output.dmxType === 'pro' ? 'active' : ''}
                        onClick={() => applyDmxConfig({ dmxType: 'pro' })}
                      >Pro</button>
                    </div>
                  </div>

                  <div className="settings-row">
                    <span className="settings-row-label">Universe</span>
                    <select
                      className="settings-select"
                      value={output.dmxUniverse}
                      onChange={(e) => applyDmxConfig({ dmxUniverse: Number(e.target.value) })}
                    >
                      {Array.from({ length: 16 }, (_, i) => (
                        <option key={i} value={i}>Universe {i}</option>
                      ))}
                    </select>
                  </div>

                  {!dmxConnected && !dmxPicking && (
                    <div className="settings-row">
                      <span className="settings-row-label">Port</span>
                      <button onClick={() => {
                        setDmxError('');
                        // requestPort() triggers select-serial-port in main → auto-select FTDI or show picker
                        navigator.serial.requestPort({ filters: [{ usbVendorId: 0x0403 }] }).then(async (p) => {
                          const { openDmxPort } = await import('../output/dmxSerial');
                          await openDmxPort(p, output.dmxType);
                          setDmxPicking(false);
                        }).catch((err: unknown) => {
                          setDmxPicking(false);
                          if (err instanceof Error && err.name !== 'NotFoundError') setDmxError(err.message);
                        });
                      }}>Connect…</button>
                    </div>
                  )}

                  {dmxPicking && (
                    <div className="serial-picker">
                      <div className="serial-picker-label">Select port:</div>
                      {serialPortList.map((p) => (
                        <button
                          key={p.portId}
                          className={`serial-port-btn${selectedPortId === p.portId ? ' active' : ''}`}
                          onClick={() => setSelectedPortId(p.portId)}
                        >{p.portName}</button>
                      ))}
                      <div className="serial-picker-actions">
                        <button onClick={() => {
                          setDmxPicking(false);
                          (window as any).electronAPI?.selectSerialPort('');
                        }}>Cancel</button>
                        <button
                          className="active"
                          disabled={!selectedPortId}
                          onClick={() => (window as any).electronAPI?.selectSerialPort(selectedPortId)}
                        >Connect</button>
                      </div>
                    </div>
                  )}

                  {dmxConnected && (
                    <div className="settings-row">
                      <span className="settings-row-label">Port</span>
                      <button className="active" onClick={() => {
                        import('../output/dmxSerial').then(({ disconnectDmx }) => disconnectDmx());
                      }}>● {dmxPortLabel || 'Connected'}</button>
                    </div>
                  )}

                  {dmxError && <div className="dmx-error">{dmxError}</div>}
                  <div className="settings-note">
                    {output.dmxType === 'open'
                      ? 'Open DMX USB · 250 kbaud · BREAK via setSignals'
                      : 'DMX USB Pro · 57600 baud · framed packets'}
                  </div>
                </>)}
              </div>

              <div className="settings-group">
                <div className="settings-group-label">Canvas</div>
                <div className="settings-row">
                  <span className="settings-row-label">Grid</span>
                  <button
                    className={showGrid ? 'active' : ''}
                    onClick={toggleGrid}
                    title="Toggle grid (G)"
                  >
                    {showGrid ? 'On' : 'Off'}
                  </button>
                </div>
                <div className="settings-row">
                  <span className="settings-row-label">Resolution</span>
                  <select
                    className="settings-select"
                    value={matchedPreset ? matchedPreset.label : 'Custom'}
                    onChange={(e) => {
                      const p = PRESETS.find((p) => p.label === e.target.value);
                      if (p) {
                        setCanvasSize(p.w, p.h);
                        setCustomW(String(p.w));
                        setCustomH(String(p.h));
                      }
                    }}
                  >
                    {PRESETS.map((p) => (
                      <option key={p.label} value={p.label}>{p.label}</option>
                    ))}
                    <option value="Custom">Custom</option>
                  </select>
                </div>
                {!matchedPreset && (
                  <div className="settings-row">
                    <span className="settings-row-label">Size</span>
                    <div className="custom-res-inputs">
                      <input
                        className="settings-input res-input"
                        type="number"
                        min={64}
                        max={7680}
                        value={customW}
                        onChange={(e) => setCustomW(e.target.value)}
                        onBlur={() => {
                          const w = Math.max(64, Math.min(7680, parseInt(customW) || canvasWidth));
                          setCustomW(String(w));
                          setCanvasSize(w, canvasHeight);
                        }}
                      />
                      <span className="res-x">×</span>
                      <input
                        className="settings-input res-input"
                        type="number"
                        min={64}
                        max={4320}
                        value={customH}
                        onChange={(e) => setCustomH(e.target.value)}
                        onBlur={() => {
                          const h = Math.max(64, Math.min(4320, parseInt(customH) || canvasHeight));
                          setCustomH(String(h));
                          setCanvasSize(canvasWidth, h);
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="settings-note">{canvasWidth} × {canvasHeight} px</div>
              </div>
            </div>
          )}
        </div>

        <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        {bpm > 0 && <span className="bpm-display">{bpm} BPM</span>}
        <div className="fps">{fps} fps</div>
        <button
          className="shortcuts-trigger"
          onClick={() => setShowShortcuts((v) => !v)}
          title="Keyboard shortcuts (?)"
        >?</button>
      </div>

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showLibrary && <FixtureLibrary onClose={() => setShowLibrary(false)} />}
    </div>
  );
}
