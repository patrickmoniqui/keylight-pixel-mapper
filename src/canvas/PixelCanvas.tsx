import { useEffect, useRef, useCallback, useState } from 'react';
import { Strip, applyChannelOrder } from '../fixtures/types';
import { VERTEX_SHADER, EFFECTS } from './shaders';

interface Props {
  strips: Strip[];
  activeEffect: string;
  outputEnabled: boolean;
  onFps: (fps: number) => void;
  selectedStripId: string | null;
  onSelectStrip: (id: string | null) => void;
  onUpdateStrip: (id: string, updates: Partial<Strip>) => void;
  onStripDrop: (id: string, x: number, y: number) => void;
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
      // WebGL readPixels row-0 = visual bottom; SVG y-0 = visual top → flip Y
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

  // Unit vector along strip axis in SVG space
  const sdx = cos * 960, sdy = sin * 540;
  const slen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
  const sux = sdx / slen, suy = sdy / slen;

  // Perpendicular unit vector in SVG space
  const spx = -suy, spy = sux;

  // Rotation handle: 24px beyond last dot along strip axis
  const rotHandle = { x: lastDot.x + sux * 24, y: lastDot.y + suy * 24 };

  // Spacing handle: at strip midpoint, 18px perpendicular
  const midIdx = Math.max(1, Math.floor(strip.pixelCount / 2));
  const midDot = dots[midIdx] ?? anchor;
  const spacingHandle = { x: midDot.x + spx * 18, y: midDot.y + spy * 18 };

  return { dots, anchor, lastDot, rotHandle, spacingHandle, midDot };
}

// ─── Drag types ───────────────────────────────────────────────────────────────

type DragType = 'move' | 'rotate' | 'spacing';

interface DragState {
  type: DragType;
  stripId: string;
  startSvgX: number;
  startSvgY: number;
  initStrip: Strip;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PixelCanvas({
  strips,
  activeEffect,
  outputEnabled,
  onFps,
  selectedStripId,
  onSelectStrip,
  onUpdateStrip,
  onStripDrop,
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
      const data = new Uint8Array(analyser.frequencyBinCount);
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
  stripsRef.current = strips;
  effectRef.current = activeEffect;
  outputRef.current = outputEnabled;

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

      if (outputRef.current && stripsRef.current.length > 0 && (window as any).electronAPI) {
        const px = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const universes = buildUniverses(stripsRef.current, px, canvas.width, canvas.height);
        (window as any).electronAPI.sendFrame(universes);
      }

      const fps = fpsRef.current;
      fps.frames++;
      const now = performance.now();
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

  const startDrag = useCallback((
    e: React.PointerEvent,
    type: DragType,
    strip: Strip,
  ) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const pos = getSvgPos(e);
    dragRef.current = { type, stripId: strip.id, startSvgX: pos.x, startSvgY: pos.y, initStrip: { ...strip } };
    setDragType(type);
    onSelectStrip(strip.id);
  }, [getSvgPos, onSelectStrip]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pos = getSvgPos(e);
    const { initStrip } = drag;
    const nx = pos.x / 960;
    const ny = pos.y / 540;

    if (drag.type === 'move') {
      onUpdateStrip(drag.stripId, {
        x: Math.max(0, Math.min(1, initStrip.x + (pos.x - drag.startSvgX) / 960)),
        y: Math.max(0, Math.min(1, initStrip.y + (pos.y - drag.startSvgY) / 540)),
      });
    } else if (drag.type === 'rotate') {
      const angle = Math.atan2(ny - initStrip.y, nx - initStrip.x) * (180 / Math.PI);
      onUpdateStrip(drag.stripId, { angle });
    } else if (drag.type === 'spacing') {
      const rad = initStrip.angle * (Math.PI / 180);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const midIdx = Math.max(1, Math.floor(initStrip.pixelCount / 2));
      const projected = (nx - initStrip.x) * cos + (ny - initStrip.y) * sin;
      onUpdateStrip(drag.stripId, {
        spacing: Math.max(0.002, Math.min(0.1, projected / midIdx)),
      });
    }
  }, [getSvgPos, onUpdateStrip]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setDragType(null);
  }, []);

  // ── Cursor ───────────────────────────────────────────────────────────────
  const svgCursor =
    dragType === 'rotate' ? 'grabbing'
    : dragType === 'spacing' ? 'ew-resize'
    : dragType === 'move' ? 'move'
    : 'default';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        width={960}
        height={540}
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
        {/* Click on empty canvas → deselect */}
        <rect
          x={0} y={0} width={960} height={540}
          fill="transparent"
          onPointerDown={() => { if (!dragRef.current) onSelectStrip(null); }}
        />

        {strips.map((strip) => {
          const isSelected = strip.id === selectedStripId;
          const { dots, anchor, lastDot, rotHandle, spacingHandle, midDot } =
            getGizmoGeometry(strip);

          return (
            <g key={strip.id}>
              {/* Strip axis line when selected */}
              {isSelected && (
                <line
                  x1={anchor.x} y1={anchor.y}
                  x2={lastDot.x} y2={lastDot.y}
                  stroke="#0af" strokeWidth={0.8}
                  strokeDasharray="5,4" opacity={0.45}
                  pointerEvents="none"
                />
              )}

              {/* LED dots — draggable to move strip */}
              {dots.map((dot, i) => (
                <circle
                  key={i}
                  cx={dot.x} cy={dot.y}
                  r={isSelected ? 4.5 : 3}
                  fill={isSelected ? '#fff' : '#aaa'}
                  stroke={isSelected ? '#0af' : '#555'}
                  strokeWidth={isSelected ? 1.5 : 0.5}
                  opacity={0.9}
                  style={{ cursor: isSelected ? 'move' : 'pointer' }}
                  onPointerDown={(e) => startDrag(e, 'move', strip)}
                />
              ))}

              {/* ── Gizmo handles (only when selected) ── */}
              {isSelected && strip.pixelCount >= 1 && (
                <>
                  {/* Anchor ring */}
                  <circle
                    cx={anchor.x} cy={anchor.y}
                    r={8} fill="none"
                    stroke="#0af" strokeWidth={1.5}
                    opacity={0.7} pointerEvents="none"
                  />

                  {/* Line to rotation handle */}
                  {strip.pixelCount > 1 && (
                    <line
                      x1={lastDot.x} y1={lastDot.y}
                      x2={rotHandle.x} y2={rotHandle.y}
                      stroke="#0af" strokeWidth={0.8}
                      strokeDasharray="3,3" opacity={0.5}
                      pointerEvents="none"
                    />
                  )}

                  {/* Rotation handle */}
                  {strip.pixelCount > 1 && (
                    <g
                      style={{ cursor: 'grab' }}
                      onPointerDown={(e) => startDrag(e, 'rotate', strip)}
                    >
                      <circle
                        cx={rotHandle.x} cy={rotHandle.y}
                        r={8} fill="#0af" stroke="#fff" strokeWidth={1.5}
                      />
                      <text
                        x={rotHandle.x} y={rotHandle.y + 0.5}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={9} fill="#000"
                        style={{ userSelect: 'none' }}
                        pointerEvents="none"
                      >⟳</text>
                    </g>
                  )}

                  {/* Angle label */}
                  {strip.pixelCount > 1 && (
                    <text
                      x={rotHandle.x + 12} y={rotHandle.y - 5}
                      fontSize={8} fill="#0af" opacity={0.8}
                      pointerEvents="none"
                    >
                      {Math.round(((strip.angle % 360) + 360) % 360)}°
                    </text>
                  )}

                  {/* Line to spacing handle */}
                  {strip.pixelCount > 2 && (
                    <line
                      x1={midDot.x} y1={midDot.y}
                      x2={spacingHandle.x} y2={spacingHandle.y}
                      stroke="#ff0" strokeWidth={0.8}
                      strokeDasharray="3,3" opacity={0.5}
                      pointerEvents="none"
                    />
                  )}

                  {/* Spacing handle (diamond) */}
                  {strip.pixelCount > 2 && (
                    <g
                      style={{ cursor: 'ew-resize' }}
                      onPointerDown={(e) => startDrag(e, 'spacing', strip)}
                    >
                      <rect
                        x={spacingHandle.x - 6} y={spacingHandle.y - 6}
                        width={12} height={12}
                        transform={`rotate(45,${spacingHandle.x},${spacingHandle.y})`}
                        fill="#ff0" stroke="#fff" strokeWidth={1.5}
                      />
                      <text
                        x={spacingHandle.x} y={spacingHandle.y + 0.5}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={7} fill="#000"
                        style={{ userSelect: 'none' }}
                        pointerEvents="none"
                      >↔</text>
                    </g>
                  )}

                  {/* Spacing label */}
                  {strip.pixelCount > 2 && (
                    <text
                      x={spacingHandle.x + 10} y={spacingHandle.y + 4}
                      fontSize={7} fill="#ff0" opacity={0.8}
                      pointerEvents="none"
                    >
                      {(strip.spacing * 1000).toFixed(1)}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
