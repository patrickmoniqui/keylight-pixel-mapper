import { useEffect, useRef, useCallback, useState } from 'react';
import { Strip, applyChannelOrder } from '../fixtures/types';
import { VERTEX_SHADER, EFFECTS, COMPOSITE_FRAG, BLIT_FRAG } from './shaders';
import { SceneLayer, LayerMask } from '../scene/types';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

function rasterizeMask(mask: LayerMask, strips: Strip[], W: number, H: number): Uint8Array {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;

  if (mask.type === 'full') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
  } else if (mask.type === 'polygon') {
    const pts = mask.points ?? [];
    if (pts.length >= 3) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(pts[0].x * W, pts[0].y * H);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * W, pts[i].y * H);
      ctx.closePath();
      ctx.fill();
    }
  } else if (mask.type === 'fixtures') {
    const ids = new Set(mask.fixtureIds ?? []);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 20;
    for (const strip of strips) {
      if (!ids.has(strip.id)) continue;
      const rad = (strip.angle * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      ctx.beginPath();
      for (let i = 0; i < strip.pixelCount; i++) {
        const px = (strip.x + cos * i * strip.spacing) * W;
        const py = (strip.y + sin * i * strip.spacing) * H;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  const d = ctx.getImageData(0, 0, W, H).data;
  const result = new Uint8Array(W * H);
  for (let i = 0; i < result.length; i++) result[i] = d[i * 4];
  return result;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  strips: Strip[];
  activeEffect: string;
  effectParams: Record<string, Record<string, string | number>>;
  outputEnabled: boolean;
  onFps: (fps: number) => void;
  onBpm: (bpm: number) => void;
  selectedStripIds: string[];
  onSelectStrips: (ids: string[]) => void;
  onUpdateStrip: (id: string, updates: Partial<Strip>) => void;
  onStripDrop: (id: string, x: number, y: number) => void;
  onSnapshot: () => void;
  showGrid: boolean;
  targetFps: number;
  audioDeviceId: string;
  sceneMode: boolean;
  sceneLayers: SceneLayer[];
  drawingLayerId: string | null;
  onAddPolygonPoint: (layerId: string, pt: { x: number; y: number }) => void;
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
  stripId: string;
  initStrip: Strip;
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
  effectParams,
  outputEnabled,
  onFps,
  onBpm,
  selectedStripIds,
  onSelectStrips,
  onUpdateStrip,
  onStripDrop,
  onSnapshot,
  showGrid,
  targetFps,
  audioDeviceId,
  sceneMode,
  sceneLayers,
  drawingLayerId,
  onAddPolygonPoint,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programsRef = useRef<Record<string, WebGLProgram>>({});
  const audioRef = useRef<{ analyser: AnalyserNode; data: Uint8Array<ArrayBuffer>; texture: WebGLTexture } | null>(null);
  const rafRef = useRef<number>(0);
  const fpsRef = useRef({ frames: 0, last: performance.now() });
  const bpmRef = useRef({
    energyHistory: new Float32Array(43),
    histIdx: 0,
    lastBeatTime: 0,
    beatIntervals: [] as number[],
    beat: 0,
    bpm: 0,
  });
  const onBpmRef = useRef(onBpm);
  onBpmRef.current = onBpm;
  const dragRef = useRef<DragState | null>(null);
  const [dragType, setDragType] = useState<DragType | null>(null);

  // Scene rendering resources
  const sceneFBORef = useRef<{
    layerFBO: WebGLFramebuffer; layerTex: WebGLTexture;
    accumTexA: WebGLTexture; accumFBO_A: WebGLFramebuffer;
    accumTexB: WebGLTexture; accumFBO_B: WebGLFramebuffer;
    maskTex: WebGLTexture;
    compositeProgram: WebGLProgram; blitProgram: WebGLProgram;
  } | null>(null);
  const maskCacheRef = useRef(new Map<string, { data: Uint8Array; hash: string }>());

  // Polygon drawing state
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const drawingLayerIdRef = useRef(drawingLayerId);
  drawingLayerIdRef.current = drawingLayerId;

  useEffect(() => { if (!drawingLayerId) setPreviewPoint(null); }, [drawingLayerId]);

  // ── Audio ────────────────────────────────────────────────────────────────
  const isReactiveScene = sceneMode && sceneLayers.some((l) => l.visible && EFFECTS[l.effect]?.category === 'Reactive');
  const isReactiveEffect = (!sceneMode && EFFECTS[activeEffect]?.category === 'Reactive') || isReactiveScene;

  useEffect(() => {
    if (!isReactiveEffect) return;
    let ctx: AudioContext;
    const constraints: MediaStreamConstraints = audioDeviceId
      ? { audio: { deviceId: { exact: audioDeviceId } } }
      : { audio: true };
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
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
  }, [isReactiveEffect, audioDeviceId]);

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

    // Scene compositing FBOs
    const W = canvas.width, H = canvas.height;
    const mkTex = (): WebGLTexture => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    const mkFBO = (tex: WebGLTexture): WebGLFramebuffer => {
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return fbo;
    };
    const layerTex = mkTex();
    const accumTexA = mkTex();
    const accumTexB = mkTex();
    const maskTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    try {
      sceneFBORef.current = {
        layerFBO: mkFBO(layerTex), layerTex,
        accumTexA, accumFBO_A: mkFBO(accumTexA),
        accumTexB, accumFBO_B: mkFBO(accumTexB),
        maskTex,
        compositeProgram: createProgram(gl, VERTEX_SHADER, COMPOSITE_FRAG),
        blitProgram: createProgram(gl, VERTEX_SHADER, BLIT_FRAG),
      };
    } catch (e) { console.error('Scene shaders:', e); }
  }, []);

  // ── Render loop ──────────────────────────────────────────────────────────
  const stripsRef = useRef(strips);
  const effectRef = useRef(activeEffect);
  const effectParamsRef = useRef(effectParams);
  const outputRef = useRef(outputEnabled);
  const targetFpsRef = useRef(targetFps);
  const sceneModeRef = useRef(sceneMode);
  const sceneLayersRef = useRef(sceneLayers);
  const lastOutputTimeRef = useRef(0);
  stripsRef.current = strips;
  effectRef.current = activeEffect;
  effectParamsRef.current = effectParams;
  outputRef.current = outputEnabled;
  targetFpsRef.current = targetFps;
  sceneModeRef.current = sceneMode;
  sceneLayersRef.current = sceneLayers;

  const startLoop = useCallback(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    if (!gl || !canvas) return;
    const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;

      // ── Scene rendering ────────────────────────────────────────────────
      if (sceneModeRef.current && sceneFBORef.current) {
        const scene = sceneFBORef.current;
        const W = canvas.width, H = canvas.height;
        const layers = sceneLayersRef.current.filter((l) => l.visible);

        // Upload audio once per frame for all reactive layers
        let hasAudio = false;
        if (audioRef.current && layers.some((l) => EFFECTS[l.effect]?.category === 'Reactive')) {
          const { analyser, data, texture } = audioRef.current;
          analyser.getByteFrequencyData(data);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, data.length, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
          hasAudio = true;
          const bpm = bpmRef.current;
          let bassEnergy = 0;
          for (let i = 0; i < 4; i++) bassEnergy += data[i] / 255;
          bassEnergy /= 4;
          bpm.energyHistory[bpm.histIdx] = bassEnergy;
          bpm.histIdx = (bpm.histIdx + 1) % bpm.energyHistory.length;
          let avgEnergy = 0;
          for (let i = 0; i < bpm.energyHistory.length; i++) avgEnergy += bpm.energyHistory[i];
          avgEnergy /= bpm.energyHistory.length;
          const nowMs = performance.now();
          const timeSinceBeat = nowMs - bpm.lastBeatTime;
          if (bassEnergy > avgEnergy * 1.4 && bassEnergy > 0.1 && timeSinceBeat > 250) {
            if (bpm.lastBeatTime > 0 && timeSinceBeat < 2000) {
              bpm.beatIntervals.push(timeSinceBeat);
              if (bpm.beatIntervals.length > 8) bpm.beatIntervals.shift();
              if (bpm.beatIntervals.length >= 2) {
                const avg = bpm.beatIntervals.reduce((a, b) => a + b) / bpm.beatIntervals.length;
                const newBpm = Math.round(60000 / avg);
                if (newBpm !== bpm.bpm) { bpm.bpm = newBpm; onBpmRef.current(newBpm); }
              }
            }
            bpm.lastBeatTime = nowMs;
            bpm.beat = 1.0;
          }
          bpm.beat *= 0.88;
        }

        // Ping-pong accumulation
        let readTex = scene.accumTexA, readFBO = scene.accumFBO_A;
        let writeTex = scene.accumTexB, writeFBO = scene.accumFBO_B;
        gl.bindFramebuffer(gl.FRAMEBUFFER, readFBO);
        gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        for (const layer of layers) {
          const prog = programsRef.current[layer.effect];
          if (!prog) continue;

          // 1. Render effect to layerFBO
          gl.bindFramebuffer(gl.FRAMEBUFFER, scene.layerFBO);
          gl.viewport(0, 0, W, H);
          gl.useProgram(prog);
          const posLoc = gl.getAttribLocation(prog, 'a_position');
          gl.enableVertexAttribArray(posLoc);
          gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
          const timeLoc = gl.getUniformLocation(prog, 'u_time');
          if (timeLoc) gl.uniform1f(timeLoc, t);
          const effDef = EFFECTS[layer.effect];
          if (effDef?.params) {
            for (const [key, paramDef] of Object.entries(effDef.params)) {
              const val = key in layer.effectParams ? layer.effectParams[key] : paramDef.default;
              const loc = gl.getUniformLocation(prog, `u_${key}`);
              if (!loc) continue;
              if (paramDef.type === 'color') {
                const [r, g, b] = hexToRgb(val as string);
                gl.uniform3f(loc, r, g, b);
              } else {
                gl.uniform1f(loc, val as number);
              }
            }
          }
          if (effDef?.category === 'Reactive' && hasAudio && audioRef.current) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, audioRef.current.texture);
            const audioLoc = gl.getUniformLocation(prog, 'u_audio');
            if (audioLoc) gl.uniform1i(audioLoc, 0);
            const beatLoc = gl.getUniformLocation(prog, 'u_beat');
            if (beatLoc) gl.uniform1f(beatLoc, bpmRef.current.beat);
            const bpmLoc = gl.getUniformLocation(prog, 'u_bpm');
            if (bpmLoc) gl.uniform1f(bpmLoc, bpmRef.current.bpm);
          }
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

          // 2. Compute/upload mask texture
          const maskHash = JSON.stringify(layer.mask);
          const cached = maskCacheRef.current.get(layer.id);
          if (!cached || cached.hash !== maskHash) {
            maskCacheRef.current.set(layer.id, {
              data: rasterizeMask(layer.mask, stripsRef.current, W, H),
              hash: maskHash,
            });
          }
          const maskData = maskCacheRef.current.get(layer.id)!.data;
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, scene.maskTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, W, H, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, maskData);

          // 3. Composite: readTex + layerTex + mask → writeFBO
          gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
          gl.viewport(0, 0, W, H);
          gl.useProgram(scene.compositeProgram);
          const cpLoc = gl.getAttribLocation(scene.compositeProgram, 'a_position');
          gl.enableVertexAttribArray(cpLoc);
          gl.vertexAttribPointer(cpLoc, 2, gl.FLOAT, false, 0, 0);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, readTex);
          const baseLoc = gl.getUniformLocation(scene.compositeProgram, 'u_base');
          if (baseLoc) gl.uniform1i(baseLoc, 0);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, scene.layerTex);
          const layerLoc = gl.getUniformLocation(scene.compositeProgram, 'u_layer');
          if (layerLoc) gl.uniform1i(layerLoc, 1);
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, scene.maskTex);
          const maskLoc = gl.getUniformLocation(scene.compositeProgram, 'u_mask');
          if (maskLoc) gl.uniform1i(maskLoc, 2);
          const opacLoc = gl.getUniformLocation(scene.compositeProgram, 'u_opacity');
          if (opacLoc) gl.uniform1f(opacLoc, layer.opacity);
          const blendLoc = gl.getUniformLocation(scene.compositeProgram, 'u_blend');
          if (blendLoc) {
            const bIdx = layer.blendMode === 'add' ? 1 : layer.blendMode === 'multiply' ? 2 : layer.blendMode === 'screen' ? 3 : 0;
            gl.uniform1i(blendLoc, bIdx);
          }
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

          // Swap ping-pong buffers
          [readTex, writeTex] = [writeTex, readTex];
          [readFBO, writeFBO] = [writeFBO, readFBO];
        }

        // 4. Blit accumulated result to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.useProgram(scene.blitProgram);
        const bpLoc = gl.getAttribLocation(scene.blitProgram, 'a_position');
        gl.enableVertexAttribArray(bpLoc);
        gl.vertexAttribPointer(bpLoc, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readTex);
        const texLoc = gl.getUniformLocation(scene.blitProgram, 'u_tex');
        if (texLoc) gl.uniform1i(texLoc, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      } else {
        // ── Normal single-effect rendering ───────────────────────────────
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
        const effDef = EFFECTS[eff];
        if (effDef?.params) {
          const paramVals = effectParamsRef.current[eff] ?? {};
          for (const [key, paramDef] of Object.entries(effDef.params)) {
            const val = key in paramVals ? paramVals[key] : paramDef.default;
            const loc = gl.getUniformLocation(prog, `u_${key}`);
            if (!loc) continue;
            if (paramDef.type === 'color') {
              const [r, g, b] = hexToRgb(val as string);
              gl.uniform3f(loc, r, g, b);
            } else {
              gl.uniform1f(loc, val as number);
            }
          }
        }
        if (EFFECTS[eff]?.category === 'Reactive' && audioRef.current) {
          const { analyser, data, texture } = audioRef.current;
          analyser.getByteFrequencyData(data);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, data.length, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
          const audioLoc = gl.getUniformLocation(prog, 'u_audio');
          if (audioLoc) gl.uniform1i(audioLoc, 0);
          const bpm = bpmRef.current;
          let bassEnergy = 0;
          for (let i = 0; i < 4; i++) bassEnergy += data[i] / 255;
          bassEnergy /= 4;
          bpm.energyHistory[bpm.histIdx] = bassEnergy;
          bpm.histIdx = (bpm.histIdx + 1) % bpm.energyHistory.length;
          let avgEnergy = 0;
          for (let i = 0; i < bpm.energyHistory.length; i++) avgEnergy += bpm.energyHistory[i];
          avgEnergy /= bpm.energyHistory.length;
          const nowMs = performance.now();
          const timeSinceBeat = nowMs - bpm.lastBeatTime;
          if (bassEnergy > avgEnergy * 1.4 && bassEnergy > 0.1 && timeSinceBeat > 250) {
            if (bpm.lastBeatTime > 0 && timeSinceBeat < 2000) {
              bpm.beatIntervals.push(timeSinceBeat);
              if (bpm.beatIntervals.length > 8) bpm.beatIntervals.shift();
              if (bpm.beatIntervals.length >= 2) {
                const avgInterval = bpm.beatIntervals.reduce((a, b) => a + b) / bpm.beatIntervals.length;
                const newBpm = Math.round(60000 / avgInterval);
                if (newBpm !== bpm.bpm) { bpm.bpm = newBpm; onBpmRef.current(newBpm); }
              }
            }
            bpm.lastBeatTime = nowMs;
            bpm.beat = 1.0;
          }
          bpm.beat *= 0.88;
          const beatLoc = gl.getUniformLocation(prog, 'u_beat');
          if (beatLoc) gl.uniform1f(beatLoc, bpm.beat);
          const bpmLoc = gl.getUniformLocation(prog, 'u_bpm');
          if (bpmLoc) gl.uniform1f(bpmLoc, bpm.bpm);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // ── Shared: DMX output + FPS counter ─────────────────────────────
      const now = performance.now();
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
    // Drawing mode: track cursor for polygon preview
    if (drawingLayerIdRef.current) {
      const pos = getSvgPos(e);
      setPreviewPoint({ x: pos.x / 960, y: pos.y / 540 });
      return;
    }
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
    drawingLayerId ? 'crosshair'
    : dragType === 'rotate' || dragType === 'rotate-multi' ? 'grabbing'
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
        {/* Background: deselect on click or add polygon vertex in draw mode */}
        <rect x={0} y={0} width={960} height={540} fill="transparent"
          onPointerDown={(e) => {
            if (drawingLayerIdRef.current) {
              const pos = getSvgPos(e);
              onAddPolygonPoint(drawingLayerIdRef.current, { x: pos.x / 960, y: pos.y / 540 });
              return;
            }
            if (!dragRef.current) onSelectStrips([]);
          }} />

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
              {isSel && !isMulti && (
                <line x1={anchor.x} y1={anchor.y} x2={lastDot.x} y2={lastDot.y}
                  stroke="#0af" strokeWidth={0.8} strokeDasharray="5,4" opacity={0.45}
                  pointerEvents="none" />
              )}

              {dots.map((dot, i) => (
                <circle key={i} cx={dot.x} cy={dot.y} r={dotR}
                  fill={dotFill} stroke={dotStroke}
                  strokeWidth={isSel ? 1.5 : 0.5} opacity={0.9}
                  style={{ cursor: drawingLayerId ? 'crosshair' : isSel && isMulti ? 'move' : isSel ? 'move' : 'pointer' }}
                  onPointerDown={(e) => {
                    if (drawingLayerIdRef.current) return; // block fixture interaction in draw mode
                    if (e.shiftKey) {
                      const newIds = selectedStripIds.includes(strip.id)
                        ? selectedStripIds.filter((id) => id !== strip.id)
                        : [...selectedStripIds, strip.id];
                      onSelectStrips(newIds);
                      return;
                    }
                    if (isSel && isMulti && multiGizmo) {
                      startMultiDrag(e, 'move-multi', selectedStrips, multiGizmo.centroidNX, multiGizmo.centroidNY);
                    } else {
                      startDrag(e, 'move', strip);
                    }
                  }}
                />
              ))}

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
              <rect x={bx} y={by} width={bw} height={bh}
                fill="none" stroke="#0af" strokeWidth={1}
                strokeDasharray="6,4" opacity={0.5} pointerEvents="none" />

              <g style={{ cursor: 'move' }}
                onPointerDown={(e) => startMultiDrag(e, 'move-multi', selectedStrips, centroidNX, centroidNY)}>
                <circle cx={centroidSX} cy={centroidSY} r={10} fill="#0af" opacity={0.15} />
                <line x1={centroidSX - 8} y1={centroidSY} x2={centroidSX + 8} y2={centroidSY}
                  stroke="#0af" strokeWidth={1.5} />
                <line x1={centroidSX} y1={centroidSY - 8} x2={centroidSX} y2={centroidSY + 8}
                  stroke="#0af" strokeWidth={1.5} />
                <circle cx={centroidSX} cy={centroidSY} r={3} fill="#0af" />
              </g>

              <line x1={centroidSX} y1={by} x2={rotHandle.x} y2={rotHandle.y}
                stroke="#0af" strokeWidth={0.8} strokeDasharray="3,3" opacity={0.4} pointerEvents="none" />

              <g style={{ cursor: 'grab' }}
                onPointerDown={(e) => startMultiDrag(e, 'rotate-multi', selectedStrips, centroidNX, centroidNY)}>
                <circle cx={rotHandle.x} cy={rotHandle.y} r={9} fill="#0af" stroke="#fff" strokeWidth={1.5} />
                <text x={rotHandle.x} y={rotHandle.y + 0.5}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={10} fill="#000" style={{ userSelect: 'none' }} pointerEvents="none">⟳</text>
              </g>

              <g style={{ cursor: 'nwse-resize' }}
                onPointerDown={(e) => startMultiDrag(e, 'scale-multi', selectedStrips, centroidNX, centroidNY)}>
                <rect x={scaleHandle.x - 7} y={scaleHandle.y - 7} width={14} height={14}
                  fill="#0f8" stroke="#fff" strokeWidth={1.5} rx={2} />
                <text x={scaleHandle.x} y={scaleHandle.y + 0.5}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fill="#000" style={{ userSelect: 'none' }} pointerEvents="none">⤡</text>
              </g>

              <text x={bx + 4} y={by - 6} fontSize={9} fill="#0af" opacity={0.7} pointerEvents="none">
                {selectedStripIds.length} fixtures
              </text>
            </g>
          );
        })()}

        {/* ── Polygon drawing overlay ── */}
        {drawingLayerId && (() => {
          const layer = sceneLayers.find((l) => l.id === drawingLayerId);
          if (!layer || layer.mask.type !== 'polygon') return null;
          const pts = layer.mask.points ?? [];
          const canPts = pts.map((p) => ({ x: p.x * 960, y: p.y * 540 }));
          return (
            <g>
              {canPts.length >= 3 && (
                <polygon
                  points={canPts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(0,170,255,0.12)"
                  stroke="#0af" strokeWidth={1.5} strokeDasharray="6,4"
                  pointerEvents="none" />
              )}
              {canPts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={5}
                  fill={i === 0 && canPts.length >= 3 ? '#0f8' : '#0af'}
                  stroke="#fff" strokeWidth={1.5} pointerEvents="none" />
              ))}
              {canPts.length > 0 && previewPoint && (
                <line
                  x1={canPts[canPts.length - 1].x} y1={canPts[canPts.length - 1].y}
                  x2={previewPoint.x * 960} y2={previewPoint.y * 540}
                  stroke="#0af" strokeWidth={1} strokeDasharray="4,4" opacity={0.6}
                  pointerEvents="none" />
              )}
              {canPts.length === 0 && (
                <text x={480} y={270} textAnchor="middle" dominantBaseline="middle"
                  fontSize={14} fill="#0af" opacity={0.5} pointerEvents="none">
                  Click to add polygon vertices
                </text>
              )}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
