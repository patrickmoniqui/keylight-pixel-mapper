import { useEffect, useRef, useCallback, useState } from 'react';
import { Strip, applyChannelOrder } from '../fixtures/types';
import { VERTEX_SHADER, EFFECTS } from './shaders';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  strips: Strip[];
  activeEffect: string;
  outputEnabled: boolean;
  onFps: (fps: number) => void;
  selectedStripIds: string[];
  onSelectStrips: (ids: string[]) => void;
  onUpdateStrip: (id: string, updates: Partial<Strip>) => void;
  onStripDrop: (id: string, x: number, y: number) => void;
  onSnapshot: () => void;
  showGrid: boolean;
  targetFps: number;
}

// ─── WebGL helpers ────────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
  return s;
}

function createProgram(gl: WebGL2RenderingContext, vert: string, frag: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
  return p;
}

// ─── Universe packing ─────────────────────────────────────────────────────────

function buildUniverses(
  strips: Strip[],
  pixelData: Uint8Array<ArrayBufferLike>,
  canvasW: number,
  canvasH: number,
) {
  const universes: Record<number, number[]> = {};
  for (const strip of strips) {
    const rad = (strip.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let channel = strip.startChannel;
    let universe = strip.universe;
    for (let i = 0; i < strip.pixelCount; i++) {
      const nx = strip.x + cos * i * strip.spacing;
      const ny = strip.y + sin * i * strip.spacing;
      const px = Math.round(nx * canvasW);
      const py = canvasH - 1 - Math.round(ny * canvasH);
      let bytes: number[];
      if (px < 0 || px >= canvasW || py < 0 || py >= canvasH) {
        bytes = new Array(strip.channelOrder.length).fill(0);
      } else {
        const idx = (py * canvasW + px) * 4;
        bytes = applyChannelOrder(pixelData[idx], pixelData[idx + 1], pixelData[idx + 2], strip.channelOrder);
      }
      for (const byte of bytes) {
        if (!universes[universe]) universes[universe] = new Array(512).fill(0);
        if (channel >= 512) { channel = 0; universe++; if (!universes[universe]) universes[universe] = new Array(512).fill(0); }
        universes[universe][channel++] = byte;
      }
    }
  }
  return universes;
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

const GRID_COLS = 16;
const GRID_ROWS = 9;

function GridOverlay() {
  const cols = Array.from({ length: GRID_COLS - 1 }, (_, i) => (i + 1) * (960 / GRID_COLS));
  const rows = Array.from({ length: GRID_ROWS - 1 }, (_, i) => (i + 1) * (540 / GRID_ROWS));
  const cx = 960 / 2;
  const cy = 540 / 2;
  return (
    <g pointerEvents="none">
      {cols.map((x) => (
        <line key={`v${x}`} x1={x} y1={0} x2={x} y2={540}
          stroke="white" strokeWidth={x === cx ? 0.8 : 0.4}
          opacity={x === cx ? 0.3 : 0.12} />
      ))}
      {rows.map((y) => (
        <line key={`h${y}`} x1={0} y1={y} x2={960} y2={y}
          stroke="white" strokeWidth={y === cy ? 0.8 : 0.4}
          opacity={y === cy ? 0.3 : 0.12} />
      ))}
    </g>
  );
}

// ─── Gizmo geometry ───────────────────────────────────────────────────────────

function getGizmoGeometry(strip: Strip) {
  const rad = (strip.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dots = Array.from({ length: strip.pixelCount }, (_, i) => ({
    x: (strip.x + cos * i * strip.spacing) * 960,
    y: (strip.y + sin * i * strip.spacing) * 540,
  }));
  const anchor = dots[0] ?? { x: strip.x * 960, y: strip.y * 540 };
  const lastDot = dots[strip.pixelCount - 1] ?? anchor;
  const sdx = cos * 960, sdy = sin * 540;
  const slen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
  const sux = sdx / slen, suy = sdy / slen;
  const spx = -suy, spy = sux;
  const rotHandle = { x: lastDot.x + sux * 24, y: lastDot.y + suy * 24 };
  const midIdx = Math.max(1, Math.floor(strip.pixelCount / 2));
  const midDot = dots[midIdx] ?? anchor;
  const spacingHandle = { x: midDot.x + spx * 18, y: midDot.y + spy * 18 };
  return { dots, anchor, lastDot, rotHandle, spacingHandle, midDot };
}

function getMultiGizmoGeometry(selectedStrips: Strip[]) {
  if (selectedStrips.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let sumAX = 0, sumAY = 0;
  for (const strip of selectedStrips) {
    const { dots, anchor } = getGizmoGeometry(strip);
    sumAX += anchor.x;
    sumAY += anchor.y;
    for (const dot of dots) {
      minX = Math.min(minX, dot.x); maxX = Math.max(maxX, dot.x);
      minY = Math.min(minY, dot.y); maxY = Math.max(maxY, dot.y);
    }
  }
  const cx = sumAX / selectedStrips.length;
  const cy = sumAY / selectedStrips.length;
  const pad = 18;
  const bx = minX - pad, by = minY - pad;
  const bw = (maxX - minX) + 2 * pad;
  const bh = (maxY - minY) + 2 * pad;
  return {
    centroidNX: cx / 960, centroidNY: cy / 540,
    centroidSX: cx, centroidSY: cy,
    bx, by, bw, bh,
    rotHandle: { x: cx, y: by - 28 },
    scaleHandle: { x: bx + bw, y: by + bh },
  };
}

// ─── Drag types ───────────────────────────────────────────────────────────────

type DragType = 'move' | 'rotate' | 'spacing' | 'move-multi' | 'rotate-multi' | 'scale-multi';

interface DragState {
  type: DragType;
  startSvgX: number;
  startSvgY: number;
  // Single-strip
  stripId: string;
  initStrip: Strip;
  // Multi-strip
  initStrips: Strip[];
  centroidNX: number;
  centroidNY: number;
  initAngle: number;
  initDist: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PixelCanvas({
  strips,
  activeEffect,
  outputEnabled,
  onFps,
  selectedStripIds,
  onSelectStrips,
  onUpdateStrip,
  onStripDrop,
  onSnapshot,
  showGrid,
  targetFps,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programsRef = useRef<Record<string, WebGLProgram>>({});
  const audioRef = useRef<{ analyser: AnalyserNode; data: Uint8Array<ArrayBuffer>; texture: WebGLTexture } | null>(null);
  const rafRef = useRef<number>(0);
  const fpsRef = useRef({ frames: 0, last: performance.now() });
  const dragRef = useRef<DragState | null>(null);
  const [dragType, setDragType] = useState<DragType | null>(null);

  // ── Audio ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeEffect !== 'audio') return;
    let ctx: AudioContext;
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      const gl = glRef.current;
      if (!gl) return;
      const texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      audioRef.current = { analyser, data, texture };
    }).catch(() => {});
    return () => { audioRef.current = null; ctx?.close(); };
  }, [activeEffect]);

  // ── WebGL init ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2');
    if (!gl) return;
    glRef.current = gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const [name, def] of Object.entries(EFFECTS)) {
      try { programsRef.current[name] = createProgram(gl, VERTEX_SHADER, def.frag); }
      catch (e) { console.error(`Shader ${name}:`, e); }
    }
  }, []);

  // ── Render loop ──────────────────────────────────────────────────────────
  const stripsRef = useRef(strips);
  const effectRef = useRef(activeEffect);
  const outputRef = useRef(outputEnabled);
  const targetFpsRef = useRef(targetFps);
  const lastOutputTimeRef = useRef(0);
  stripsRef.current = strips;
  effectRef.current = activeEffect;
  outputRef.current = outputEnabled;
  targetFpsRef.current = targetFps;

  const startLoop = useCallback(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    if (!gl || !canvas) return;
    const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      const eff = effectRef.current;
      const prog = programsRef.current[eff];
      if (!prog) { rafRef.current = requestAnimationFrame(loop); return; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      const posLoc = gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
      const timeLoc = gl.getUniformLocation(prog, 'u_time');
      if (timeLoc) gl.uniform1f(timeLoc, t);
      if (eff === 'audio' && audioRef.current) {
        const { analyser, data, texture } = audioRef.current;
        analyser.getByteFrequencyData(data);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, data.length, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
        const loc = gl.getUniformLocation(prog, 'u_audio');
        if (loc) gl.uniform1i(loc, 0);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const now = performance.now();
      // Throttle DMX output to targetFps; canvas always renders at native 60fps
      const outputInterval = 1000 / targetFpsRef.current;
      if (
        outputRef.current &&
        stripsRef.current.length > 0 &&
        (window as any).electronAPI &&
        now - lastOutputTimeRef.current >= outputInterval
      ) {
        lastOutputTimeRef.current = now;
        const px = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const universes = buildUniverses(stripsRef.current, px, canvas.width, canvas.height);
        (window as any).electronAPI.sendFrame(universes);
      }
      const fps = fpsRef.current;
      fps.frames++;
      if (now - fps.last >= 1000) { onFps(fps.frames); fps.frames = 0; fps.last = now; }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [onFps]);

  useEffect(() => { const cancel = startLoop(); return cancel; }, [startLoop]);

  // ── Drop from fixture list ────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('stripId');
    if (!id) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    onStripDrop(id, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  }, [onStripDrop]);

  // ── Pointer helpers ───────────────────────────────────────────────────────
  const getSvgPos = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (960 / r.width),
      y: (e.clientY - r.top) * (540 / r.height),
    };
  }, []);

  const startDrag = useCallback((e: React.PointerEvent, type: 'move' | 'rotate' | 'spacing', strip: Strip) => {
    onSnapshot();
    (e.target as Element).setPointerCapture(e.pointerId);
    const pos = getSvgPos(e);
    dragRef.current = {
      type, stripId: strip.id, initStrip: { ...strip },
      startSvgX: pos.x, startSvgY: pos.y,
      initStrips: [], centroidNX: 0, centroidNY: 0, initAngle: 0, initDist: 0,
    };
    setDragType(type);
    onSelectStrips([strip.id]);
  }, [getSvgPos, onSelectStrips, onSnapshot]);

  const startMultiDrag = useCallback((
    e: React.PointerEvent,
    type: 'move-multi' | 'rotate-multi' | 'scale-multi',
    selectedStrips: Strip[],
    centroidNX: number,
    centroidNY: number,
  ) => {
    onSnapshot();
    (e.target as Element).setPointerCapture(e.pointerId);
    const pos = getSvgPos(e);
    const nx = pos.x / 960, ny = pos.y / 540;
    dragRef.current = {
      type,
      stripId: selectedStrips[0]?.id ?? '',
      initStrip: selectedStrips[0] ?? ({} as Strip),
      startSvgX: pos.x, startSvgY: pos.y,
      initStrips: selectedStrips.map((s) => ({ ...s })),
      centroidNX, centroidNY,
      initAngle: Math.atan2(ny - centroidNY, nx - centroidNX),
      initDist: Math.sqrt((nx - centroidNX) ** 2 + (ny - centroidNY) ** 2),
    };
    setDragType(type);
  }, [getSvgPos, onSnapshot]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pos = getSvgPos(e);
    const nx = pos.x / 960, ny = pos.y / 540;
    const { initStrip, initStrips, centroidNX, centroidNY } = drag;

    if (drag.type === 'move') {
      onUpdateStrip(drag.stripId, {
        x: Math.max(0, Math.min(1, initStrip.x + (pos.x - drag.startSvgX) / 960)),
        y: Math.max(0, Math.min(1, initStrip.y + (pos.y - drag.startSvgY) / 540)),
      });
    } else if (drag.type === 'rotate') {
      onUpdateStrip(drag.stripId, {
        angle: Math.atan2(ny - initStrip.y, nx - initStrip.x) * (180 / Math.PI),
      });
    } else if (drag.type === 'spacing') {
      const rad = initStrip.angle * (Math.PI / 180);
      const midIdx = Math.max(1, Math.floor(initStrip.pixelCount / 2));
      const projected = (nx - initStrip.x) * Math.cos(rad) + (ny - initStrip.y) * Math.sin(rad);
      onUpdateStrip(drag.stripId, { spacing: Math.max(0.002, Math.min(0.1, projected / midIdx)) });
    } else if (drag.type === 'move-multi') {
      const dx = (pos.x - drag.startSvgX) / 960;
      const dy = (pos.y - drag.startSvgY) / 540;
      for (const s of initStrips) {
        onUpdateStrip(s.id, {
          x: Math.max(0, Math.min(1, s.x + dx)),
          y: Math.max(0, Math.min(1, s.y + dy)),
        });
      }
    } else if (drag.type === 'rotate-multi') {
      const angle = Math.atan2(ny - centroidNY, nx - centroidNX);
      const delta = angle - drag.initAngle;
      const cos = Math.cos(delta), sin = Math.sin(delta);
      for (const s of initStrips) {
        const dx = s.x - centroidNX, dy = s.y - centroidNY;
        onUpdateStrip(s.id, {
          x: centroidNX + dx * cos - dy * sin,
          y: centroidNY + dx * sin + dy * cos,
          angle: s.angle + delta * (180 / Math.PI),
        });
      }
    } else if (drag.type === 'scale-multi') {
      const dist = Math.sqrt((nx - centroidNX) ** 2 + (ny - centroidNY) ** 2);
      if (drag.initDist < 0.001) return;
      const scale = dist / drag.initDist;
      for (const s of initStrips) {
        const dx = s.x - centroidNX, dy = s.y - centroidNY;
        onUpdateStrip(s.id, {
          x: centroidNX + dx * scale,
          y: centroidNY + dy * scale,
          spacing: Math.max(0.002, s.spacing * scale),
        });
      }
    }
  }, [getSvgPos, onUpdateStrip]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setDragType(null);
  }, []);

  // ── Cursor ───────────────────────────────────────────────────────────────
  const svgCursor =
    dragType === 'rotate' || dragType === 'rotate-multi' ? 'grabbing'
    : dragType === 'spacing' ? 'ew-resize'
    : dragType === 'scale-multi' ? 'nwse-resize'
    : dragType === 'move' || dragType === 'move-multi' ? 'move'
    : 'default';

  // ── Derived gizmo data ────────────────────────────────────────────────────
  const isMulti = selectedStripIds.length > 1;
  const selectedStrips = strips.filter((s) => selectedStripIds.includes(s.id));
  const multiGizmo = isMulti ? getMultiGizmoGeometry(selectedStrips) : null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        width={960} height={540}
        style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
      />

      <svg
        ref={svgRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: svgCursor }}
        viewBox="0 0 960 540"
        preserveAspectRatio="none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Deselect on empty canvas click */}
        <rect x={0} y={0} width={960} height={540} fill="transparent"
          onPointerDown={() => { if (!dragRef.current) onSelectStrips([]); }} />

        {/* Grid overlay */}
        {showGrid && <GridOverlay />}

        {/* Per-strip rendering */}
        {strips.map((strip) => {
          const isSel = selectedStripIds.includes(strip.id);
          const { dots, anchor, lastDot, rotHandle, spacingHandle, midDot } = getGizmoGeometry(strip);

          const dotFill = isSel && !isMulti ? '#fff' : isSel ? '#c0e8ff' : '#aaa';
          const dotStroke = isSel ? '#0af' : '#555';
          const dotR = isSel && !isMulti ? 4.5 : isSel ? 4 : 3;

          return (
            <g key={strip.id}>
              {/* Axis line (single-select only) */}
              {isSel && !isMulti && (
                <line x1={anchor.x} y1={anchor.y} x2={lastDot.x} y2={lastDot.y}
                  stroke="#0af" strokeWidth={0.8} strokeDasharray="5,4" opacity={0.45}
                  pointerEvents="none" />
              )}

              {/* LED dots */}
              {dots.map((dot, i) => (
                <circle key={i} cx={dot.x} cy={dot.y} r={dotR}
                  fill={dotFill} stroke={dotStroke}
                  strokeWidth={isSel ? 1.5 : 0.5} opacity={0.9}
                  style={{ cursor: isSel && isMulti ? 'move' : isSel ? 'move' : 'pointer' }}
                  onPointerDown={(e) => {
                    if (e.shiftKey) {
                      // Shift+click: toggle this strip in selection
                      const newIds = selectedStripIds.includes(strip.id)
                        ? selectedStripIds.filter((id) => id !== strip.id)
                        : [...selectedStripIds, strip.id];
                      onSelectStrips(newIds);
                      return;
                    }
                    if (isSel && isMulti && multiGizmo) {
                      // Already part of multi-selection: drag all together
                      startMultiDrag(e, 'move-multi', selectedStrips, multiGizmo.centroidNX, multiGizmo.centroidNY);
                    } else {
                      startDrag(e, 'move', strip);
                    }
                  }}
                />
              ))}

              {/* ── Single-select gizmos ── */}
              {isSel && !isMulti && strip.pixelCount >= 1 && (
                <>
                  <circle cx={anchor.x} cy={anchor.y} r={8}
                    fill="none" stroke="#0af" strokeWidth={1.5} opacity={0.7} pointerEvents="none" />

                  {strip.pixelCount > 1 && (
                    <line x1={lastDot.x} y1={lastDot.y} x2={rotHandle.x} y2={rotHandle.y}
                      stroke="#0af" strokeWidth={0.8} strokeDasharray="3,3" opacity={0.5} pointerEvents="none" />
                  )}

                  {strip.pixelCount > 1 && (
                    <g style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag(e, 'rotate', strip)}>
                      <circle cx={rotHandle.x} cy={rotHandle.y} r={8}
                        fill="#0af" stroke="#fff" strokeWidth={1.5} />
                      <text x={rotHandle.x} y={rotHandle.y + 0.5}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={9} fill="#000" style={{ userSelect: 'none' }} pointerEvents="none">⟳</text>
                    </g>
                  )}

                  {strip.pixelCount > 1 && (
                    <text x={rotHandle.x + 12} y={rotHandle.y - 5}
                      fontSize={8} fill="#0af" opacity={0.8} pointerEvents="none">
                      {Math.round(((strip.angle % 360) + 360) % 360)}°
                    </text>
                  )}

                  {strip.pixelCount > 2 && (
                    <line x1={midDot.x} y1={midDot.y} x2={spacingHandle.x} y2={spacingHandle.y}
                      stroke="#ff0" strokeWidth={0.8} strokeDasharray="3,3" opacity={0.5} pointerEvents="none" />
                  )}

                  {strip.pixelCount > 2 && (
                    <g style={{ cursor: 'ew-resize' }} onPointerDown={(e) => startDrag(e, 'spacing', strip)}>
                      <rect x={spacingHandle.x - 6} y={spacingHandle.y - 6} width={12} height={12}
                        transform={`rotate(45,${spacingHandle.x},${spacingHandle.y})`}
                        fill="#ff0" stroke="#fff" strokeWidth={1.5} />
                      <text x={spacingHandle.x} y={spacingHandle.y + 0.5}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={7} fill="#000" style={{ userSelect: 'none' }} pointerEvents="none">↔</text>
                    </g>
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* ── Multi-select gizmo ── */}
        {isMulti && multiGizmo && (() => {
          const { bx, by, bw, bh, centroidNX, centroidNY, centroidSX, centroidSY, rotHandle, scaleHandle } = multiGizmo;
          return (
            <g>
              {/* Bounding box */}
              <rect x={bx} y={by} width={bw} height={bh}
                fill="none" stroke="#0af" strokeWidth={1}
                strokeDasharray="6,4" opacity={0.5} pointerEvents="none" />

              {/* Center move handle */}
              <g style={{ cursor: 'move' }}
                onPointerDown={(e) => startMultiDrag(e, 'move-multi', selectedStrips, centroidNX, centroidNY)}>
                <circle cx={centroidSX} cy={centroidSY} r={10} fill="#0af" opacity={0.15} />
                <line x1={centroidSX - 8} y1={centroidSY} x2={centroidSX + 8} y2={centroidSY}
                  stroke="#0af" strokeWidth={1.5} />
                <line x1={centroidSX} y1={centroidSY - 8} x2={centroidSX} y2={centroidSY + 8}
                  stroke="#0af" strokeWidth={1.5} />
                <circle cx={centroidSX} cy={centroidSY} r={3} fill="#0af" />
              </g>

              {/* Line to rotation handle */}
              <line x1={centroidSX} y1={by} x2={rotHandle.x} y2={rotHandle.y}
                stroke="#0af" strokeWidth={0.8} strokeDasharray="3,3" opacity={0.4} pointerEvents="none" />

              {/* Rotation handle */}
              <g style={{ cursor: 'grab' }}
                onPointerDown={(e) => startMultiDrag(e, 'rotate-multi', selectedStrips, centroidNX, centroidNY)}>
                <circle cx={rotHandle.x} cy={rotHandle.y} r={9} fill="#0af" stroke="#fff" strokeWidth={1.5} />
                <text x={rotHandle.x} y={rotHandle.y + 0.5}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={10} fill="#000" style={{ userSelect: 'none' }} pointerEvents="none">⟳</text>
              </g>

              {/* Scale handle (bottom-right corner) */}
              <g style={{ cursor: 'nwse-resize' }}
                onPointerDown={(e) => startMultiDrag(e, 'scale-multi', selectedStrips, centroidNX, centroidNY)}>
                <rect x={scaleHandle.x - 7} y={scaleHandle.y - 7} width={14} height={14}
                  fill="#0f8" stroke="#fff" strokeWidth={1.5} rx={2} />
                <text x={scaleHandle.x} y={scaleHandle.y + 0.5}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fill="#000" style={{ userSelect: 'none' }} pointerEvents="none">⤡</text>
              </g>

              {/* Selection count label */}
              <text x={bx + 4} y={by - 6} fontSize={9} fill="#0af" opacity={0.7} pointerEvents="none">
                {selectedStripIds.length} fixtures
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
