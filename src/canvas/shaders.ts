export const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export type EffectParamType = 'color' | 'range';

export interface EffectParamDef {
  type: EffectParamType;
  label: string;
  default: string | number;
  min?: number;
  max?: number;
  step?: number;
}

export interface EffectDef {
  label: string;
  category: string;
  frag: string;
  params?: Record<string, EffectParamDef>;
}

// Shared utilities inlined per shader
const H = `vec3 hsv2rgb(vec3 c){vec4 K=vec4(1.,2./3.,1./3.,3.);vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}`;
const HASH = `float h1(float n){return fract(sin(n)*43758.5453);}float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`;
const NOISE = `${HASH}float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}`;

// Shared uniforms + UV rotation transform for Movement effects
const ROT_U = 'uniform float u_speed;\nuniform float u_size;\nuniform float u_rotation;';
const ROT = `
  vec2 uv = v_uv - 0.5;
  float cosR = cos(u_rotation * 0.017453);
  float sinR = sin(u_rotation * 0.017453);
  uv = vec2(uv.x * cosR - uv.y * sinR, uv.x * sinR + uv.y * cosR) + 0.5;`;

const MOTION_PARAMS: Record<string, EffectParamDef> = {
  rotation: { type: 'range', label: 'Rotation', default: 0,   min: -180, max: 180, step: 1   },
  speed:    { type: 'range', label: 'Speed',    default: 1,   min: 0,    max: 4,   step: 0.1 },
  size:     { type: 'range', label: 'Size',     default: 1,   min: 0.1,  max: 5,   step: 0.1 },
};

function frag(body: string, utils = '', extraUniforms = ''): string {
  return `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_beat;
uniform float u_bpm;
uniform sampler2D u_audio;
${extraUniforms}
in vec2 v_uv;
out vec4 fragColor;
${utils}
void main() {
${body}
}`;
}

export const EFFECTS: Record<string, EffectDef> = {
  // ─── Basic ───────────────────────────────────────────────────────────────
  solid: {
    label: 'Solid',
    category: 'Basic',
    params: {
      color: { type: 'color', label: 'Color', default: '#ffe0d0' },
    },
    frag: frag(`
  fragColor = vec4(u_color, 1.0);`, '', 'uniform vec3 u_color;'),
  },

  strobe: {
    label: 'Strobe',
    category: 'Basic',
    params: {
      speed: { type: 'range', label: 'Speed', default: 10, min: 1, max: 60, step: 1 },
      color: { type: 'color', label: 'Color', default: '#ffffff' },
    },
    frag: frag(`
  float on = step(0.5, fract(u_time * u_speed));
  fragColor = vec4(u_color * on, 1.0);`, '', 'uniform float u_speed;\nuniform vec3 u_color;'),
  },

  breathe: {
    label: 'Breathe',
    category: 'Basic',
    params: {
      speed: { type: 'range', label: 'Speed', default: 0.9, min: 0.1, max: 5.0, step: 0.1 },
      color: { type: 'color', label: 'Color', default: '#00aaff' },
    },
    frag: frag(`
  float b = pow(0.5 + 0.5 * sin(u_time * u_speed), 2.5);
  fragColor = vec4(u_color * b, 1.0);`, '', 'uniform float u_speed;\nuniform vec3 u_color;'),
  },

  // ─── Movement ────────────────────────────────────────────────────────────
  rainbow: {
    label: 'Rainbow',
    category: 'Movement',
    params: { ...MOTION_PARAMS },
    frag: frag(`${ROT}
  float hue = fract(uv.x * u_size + u_time * 0.3 * u_speed);
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, 1.0)), 1.0);`, H, ROT_U),
  },

  chase: {
    label: 'Chase',
    category: 'Movement',
    params: { ...MOTION_PARAMS },
    frag: frag(`${ROT}
  float pos = fract(u_time * 0.4 * u_speed);
  float d = abs(uv.x - pos);
  float wrap = min(d, 1.0 - d);
  float head = 1.0 - smoothstep(0.0, 0.06 * u_size, wrap);
  float tail = 1.0 - smoothstep(0.0, 0.15 * u_size, mod(uv.x - pos + 1.0, 1.0));
  float brightness = max(head, tail * 0.4);
  fragColor = vec4(hsv2rgb(vec3(fract(u_time * 0.1), 1.0, brightness)), 1.0);`, H, ROT_U),
  },

  scanner: {
    label: 'Scanner',
    category: 'Movement',
    params: { ...MOTION_PARAMS },
    frag: frag(`${ROT}
  float pos = 0.5 + 0.5 * sin(u_time * 2.2 * u_speed);
  float d = abs(uv.x - pos);
  float head = 1.0 - smoothstep(0.0, 0.03 * u_size, d);
  float glow = (1.0 - smoothstep(0.0, 0.14 * u_size, d)) * 0.28;
  float i = max(head, glow);
  fragColor = vec4(i, i * 0.08, 0.0, 1.0);`, '', ROT_U),
  },

  meteor: {
    label: 'Meteor',
    category: 'Movement',
    params: { ...MOTION_PARAMS },
    frag: frag(`${ROT}
  float m1 = fract(uv.x - u_time * 0.35 * u_speed);
  float m2 = fract(uv.x - u_time * 0.35 * u_speed * 0.65 + 0.45);
  float i1 = max(1.0 - smoothstep(0.0, 0.02 * u_size, m1),
                 (1.0 - smoothstep(0.0, 0.22 * u_size, m1)) * 0.55);
  float i2 = max(1.0 - smoothstep(0.0, 0.02 * u_size, m2),
                 (1.0 - smoothstep(0.0, 0.16 * u_size, m2)) * 0.45);
  vec3 c = vec3(i1, i1*0.55, i1*0.08) + vec3(i2*0.4, i2*0.7, i2);
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);`, '', ROT_U),
  },

  wipe: {
    label: 'Color Wipe',
    category: 'Movement',
    params: { ...MOTION_PARAMS },
    frag: frag(`${ROT}
  float cycle = u_time * 0.28 * u_speed;
  float wipePos = fract(cycle);
  float hue = fract(floor(cycle) * 0.618034);
  float on = step(fract(uv.x * u_size), wipePos);
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, 1.0)) * on, 1.0);`, H, ROT_U),
  },

  theater: {
    label: 'Theater',
    category: 'Movement',
    params: { ...MOTION_PARAMS },
    frag: frag(`${ROT}
  float phase = floor(u_time * 8.0 * u_speed);
  float col = floor(uv.x * 60.0 / u_size);
  float lit = float(mod(col + phase, 3.0) < 0.5);
  float hue = fract(phase / 8.0 * 0.3);
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, lit)), 1.0);`, H, ROT_U),
  },

  sinelon: {
    label: 'Sinelon',
    category: 'Movement',
    params: { ...MOTION_PARAMS },
    frag: frag(`${ROT}
  float dx = fract(u_time * 0.38 * u_speed);
  float dy = 0.5 + 0.42 * sin(u_time * 2.5 * u_speed);
  float dist = length(uv - vec2(dx, dy));
  float head = 1.0 - smoothstep(0.0, 0.055 * u_size, dist);
  float glow = (1.0 - smoothstep(0.0, 0.14 * u_size, dist)) * 0.18;
  float xBehind = fract(dx - uv.x);
  float trail = (1.0 - smoothstep(0.0, 0.22 * u_size, xBehind)) * 0.12
              * (1.0 - smoothstep(0.0, 0.09 * u_size, abs(uv.y - dy)));
  float i = max(max(head, glow), trail);
  fragColor = vec4(hsv2rgb(vec3(fract(u_time * 0.14), 1.0, 1.0)) * i, 1.0);`, H, ROT_U),
  },

  // ─── Color ───────────────────────────────────────────────────────────────
  gradient: {
    label: 'Gradient',
    category: 'Color',
    frag: frag(`
  float off = fract(u_time * 0.12);
  vec3 c1 = hsv2rgb(vec3(fract(off), 1.0, 1.0));
  vec3 c2 = hsv2rgb(vec3(fract(off + 0.5), 1.0, 1.0));
  float t = fract(v_uv.x + v_uv.y * 0.3 + u_time * 0.18);
  fragColor = vec4(mix(c1, c2, t), 1.0);`, H),
  },

  plasma: {
    label: 'Plasma',
    category: 'Color',
    frag: frag(`
  float t = u_time;
  float v1 = sin(v_uv.x * 10.0 + t);
  float v2 = sin(10.0 * (v_uv.x * sin(t*0.5) + v_uv.y * cos(t*0.3)) + t);
  float cx = v_uv.x + 0.5 * sin(t * 0.3);
  float cy = v_uv.y + 0.5 * cos(t * 0.4);
  float v3 = sin(sqrt(cx*cx + cy*cy) * 10.0 + t);
  float hue = 0.5 + (v1 + v2 + v3) / 6.0;
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, 1.0)), 1.0);`, H),
  },

  bpm: {
    label: 'BPM',
    category: 'Color',
    frag: frag(`
  float bps = 2.0;
  float beat = fract(u_time * bps);
  float pulse = pow(1.0 - beat, 3.0);
  float beatIdx = floor(u_time * bps);
  float hue = fract(beatIdx * 0.25);
  float stripe = step(0.5, fract(v_uv.x * 4.0 + beatIdx * 0.5));
  float b = max(pulse, stripe * pulse * 0.5);
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, b)), 1.0);`, H),
  },

  ripple: {
    label: 'Ripple',
    category: 'Color',
    frag: frag(`
  vec2 c = v_uv - vec2(0.5, 0.5);
  float d = length(c * vec2(1.78, 1.0));
  float r = sin(d * 22.0 - u_time * 5.5);
  float i = (r + 1.0) * 0.5 * max(0.0, 1.0 - d * 1.6);
  float hue = fract(d * 0.25 - u_time * 0.06);
  fragColor = vec4(hsv2rgb(vec3(hue, 0.9, i)), 1.0);`, H),
  },

  // ─── Particle ────────────────────────────────────────────────────────────
  twinkle: {
    label: 'Twinkle',
    category: 'Particle',
    frag: frag(`
  float t = floor(u_time * 9.0);
  vec2 cell = floor(v_uv * 45.0);
  float lit = step(0.78, h2(cell + t * 13.7));
  float hue = h2(cell * 3.1 + t);
  fragColor = vec4(hsv2rgb(vec3(hue, 0.6 + hue * 0.4, lit)), 1.0);`, HASH),
  },

  confetti: {
    label: 'Confetti',
    category: 'Particle',
    frag: frag(`
  float t = floor(u_time * 14.0);
  vec2 cell = floor(v_uv * 55.0);
  float lit = step(0.62, h2(cell + t * 31.7));
  float hue = h2(cell * 2.1 + t * 7.3);
  fragColor = vec4(hsv2rgb(vec3(hue, 0.95, lit)), 1.0);`, HASH),
  },

  fire: {
    label: 'Fire',
    category: 'Particle',
    frag: frag(`
  float t = u_time * 0.5;
  float n = noise(v_uv * 4.0 + vec2(0, -t*2.))
          + 0.5 * noise(v_uv * 8.0 + vec2(0, -t*3.))
          + 0.25 * noise(v_uv * 16.0 + vec2(0, -t*4.));
  n /= 1.75;
  float fire = clamp(n * 2.0 - (1.0 - v_uv.y) * 1.5, 0.0, 1.0);
  vec3 col = vec3(fire * 2.0, fire * fire * 0.6, fire * fire * fire * 0.1);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);`, NOISE),
  },

  lightning: {
    label: 'Lightning',
    category: 'Particle',
    frag: frag(`
  float t = floor(u_time * 5.5);
  float strength = h1(t);
  float isFlash = step(0.72, strength);
  float boltX = h1(t + 0.1);
  float rowJitter = h2(vec2(floor(v_uv.y * 50.0), t)) * 0.05 - 0.025;
  float d = abs(v_uv.x - boltX + rowJitter);
  float bolt = isFlash * (1.0 - smoothstep(0.0, 0.025, d));
  float glow = isFlash * (1.0 - smoothstep(0.0, 0.1, d)) * 0.18;
  float scatter = isFlash * step(0.93, h2(v_uv + t)) * strength;
  float i = max(max(bolt, glow), scatter);
  float flicker = 0.8 + 0.2 * fract(u_time * 120.0);
  fragColor = vec4(vec3(0.7, 0.88, 1.0) * i * flicker, 1.0);`, HASH),
  },

  matrix: {
    label: 'Matrix',
    category: 'Particle',
    frag: frag(`
  float cols = 42.0;
  float rows = 22.0;
  vec2 cell = vec2(floor(v_uv.x * cols), floor(v_uv.y * rows));
  float spd = 2.0 + h1(cell.x * 0.31) * 4.0;
  float head = fract(u_time * spd - cell.y / rows);
  float distH = fract(1.0 - head);
  float trailLen = 6.0 / rows;
  float trail = max(0.0, 1.0 - distH / trailLen);
  float flicker = 0.65 + 0.35 * h1(cell.x * 17.3 + cell.y * 31.1 + floor(u_time * spd) * 7.7);
  float green = trail * flicker;
  float isHead = step(0.96, 1.0 - distH);
  green = max(green, isHead);
  fragColor = vec4(isHead * 0.7, green, isHead * 0.25, 1.0);`, HASH),
  },

  // ─── Reactive ────────────────────────────────────────────────────────────
  audio: {
    label: 'Spectrum',
    category: 'Reactive',
    frag: frag(`
  float freq = texture(u_audio, vec2(v_uv.x, 0.5)).r;
  float lit = step(1.0 - v_uv.y, freq);
  float glow = smoothstep(0.0, 0.15, freq - (1.0 - v_uv.y));
  vec3 bass = vec3(1.0, 0.05, 0.0);
  vec3 mid  = vec3(0.1, 1.0,  0.1);
  vec3 high = vec3(0.0, 0.3,  1.0);
  vec3 hc = v_uv.x < 0.33 ? bass : (v_uv.x < 0.66 ? mid : high);
  fragColor = vec4(hc * (lit + glow * 0.3), 1.0);`),
  },

  bassPulse: {
    label: 'Bass Pulse',
    category: 'Reactive',
    frag: frag(`
  float bass = pow(texture(u_audio, vec2(0.04, 0.5)).r, 1.5);
  float pulse = max(bass, u_beat);
  float hue = fract(u_time * 0.07 + pulse * 0.2);
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, pulse)), 1.0);`, H),
  },

  beatFlash: {
    label: 'Beat Flash',
    category: 'Reactive',
    frag: frag(`
  float hue = fract(floor(u_time * 3.0) * 0.37);
  float sat = 1.0 - u_beat * 0.5;
  fragColor = vec4(hsv2rgb(vec3(hue, sat, u_beat)), 1.0);`, H),
  },

  vuMeter: {
    label: 'VU Meter',
    category: 'Reactive',
    frag: frag(`
  float vol = 0.0;
  for (int i = 0; i < 8; i++) {
    vol += texture(u_audio, vec2((float(i) + 0.5) / 8.0, 0.5)).r;
  }
  vol = clamp(vol / 4.0, 0.0, 1.0);
  float lit = step(v_uv.x, vol);
  float hue = 0.33 * (1.0 - v_uv.x);
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, lit)), 1.0);`, H),
  },

  freqRgb: {
    label: 'Freq RGB',
    category: 'Reactive',
    frag: frag(`
  float bass = pow(texture(u_audio, vec2(0.05, 0.5)).r, 1.3);
  float mid  = pow(texture(u_audio, vec2(0.35, 0.5)).r, 1.3);
  float high = pow(texture(u_audio, vec2(0.80, 0.5)).r, 1.3);
  fragColor = vec4(bass, mid, high, 1.0);`),
  },

  specChase: {
    label: 'Spec Chase',
    category: 'Reactive',
    frag: frag(`
  float maxVal = 0.0;
  float maxBin = 0.0;
  for (int i = 0; i < 16; i++) {
    float fx = (float(i) + 0.5) / 16.0;
    float fv = texture(u_audio, vec2(fx, 0.5)).r;
    float pick = step(maxVal, fv);
    maxBin = mix(maxBin, fx, pick);
    maxVal = max(maxVal, fv);
  }
  float d = abs(v_uv.x - maxBin);
  float wrap = min(d, 1.0 - d);
  float dotB = (1.0 - smoothstep(0.0, 0.04, wrap)) * maxVal;
  float glowB = (1.0 - smoothstep(0.0, 0.14, wrap)) * maxVal * 0.3;
  float hue = maxBin * 0.65;
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, max(dotB, glowB))), 1.0);`, H),
  },

  audioRipple: {
    label: 'Audio Ripple',
    category: 'Reactive',
    frag: frag(`
  float bass = texture(u_audio, vec2(0.04, 0.5)).r;
  float mid  = texture(u_audio, vec2(0.40, 0.5)).r;
  vec2 c = v_uv - 0.5;
  float d = length(c * vec2(1.78, 1.0));
  float r = sin(d * 20.0 - u_time * 6.0);
  float i = (r * 0.5 + 0.5) * bass * max(0.0, 1.0 - d * 2.2);
  float hue = fract(d * 0.4 - u_time * 0.08 + mid * 0.5);
  fragColor = vec4(hsv2rgb(vec3(hue, 0.9, i)), 1.0);`, H),
  },

  bassFire: {
    label: 'Bass Fire',
    category: 'Reactive',
    frag: frag(`
  float bass = texture(u_audio, vec2(0.04, 0.5)).r;
  float t = u_time * 0.5;
  float n = noise(v_uv * 4.0 + vec2(0.0, -t * 2.0))
          + 0.5 * noise(v_uv * 8.0 + vec2(0.0, -t * 3.0))
          + 0.25 * noise(v_uv * 16.0 + vec2(0.0, -t * 4.0));
  n /= 1.75;
  float height = 0.5 + 1.5 * bass;
  float fire = clamp(n * 2.0 - (1.0 - v_uv.y) * height, 0.0, 1.0);
  vec3 col = vec3(fire * 2.0, fire * fire * 0.6, fire * fire * fire * 0.1);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);`, NOISE),
  },

  waveform: {
    label: 'Waveform',
    category: 'Reactive',
    frag: frag(`
  float freq = texture(u_audio, vec2(v_uv.x, 0.5)).r;
  float wave = 0.5 + freq * 0.35 * sin(v_uv.x * 12.566 + u_time * 5.0);
  float d = abs(v_uv.y - wave);
  float line = 1.0 - smoothstep(0.0, 0.025, d);
  float glow = (1.0 - smoothstep(0.0, 0.1, d)) * freq * 0.5;
  float hue = fract(v_uv.x * 0.4 + u_time * 0.06);
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, min(1.0, line + glow))), 1.0);`, H),
  },

  bands: {
    label: 'Bands',
    category: 'Reactive',
    frag: frag(`
  float bass = pow(texture(u_audio, vec2(0.06, 0.5)).r, 1.2);
  float mid  = pow(texture(u_audio, vec2(0.35, 0.5)).r, 1.2);
  float high = pow(texture(u_audio, vec2(0.78, 0.5)).r, 1.2);
  vec3 bassCol = vec3(1.0, 0.05, 0.0) * bass;
  vec3 midCol  = vec3(0.05, 1.0, 0.1) * mid;
  vec3 highCol = vec3(0.1, 0.15, 1.0) * high;
  float t = v_uv.x;
  vec3 col = mix(mix(bassCol, midCol, smoothstep(0.1, 0.5, t)),
                 highCol, smoothstep(0.5, 0.9, t));
  fragColor = vec4(col, 1.0);`),
  },

  specMirror: {
    label: 'Spec Mirror',
    category: 'Reactive',
    frag: frag(`
  float x = abs(v_uv.x - 0.5) * 2.0;
  float freq = texture(u_audio, vec2(x * 0.8, 0.5)).r;
  float hue = fract(x * 0.35 + u_time * 0.05);
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, freq)), 1.0);`, H),
  },
};

export const EFFECT_CATEGORIES = ['Basic', 'Movement', 'Color', 'Particle', 'Reactive'] as const;

// Scene compositing shaders
export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_base;
uniform sampler2D u_layer;
uniform sampler2D u_mask;
uniform float u_opacity;
uniform int u_blend;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec4 base = texture(u_base, v_uv);
  vec4 layer = texture(u_layer, v_uv);
  float alpha = texture(u_mask, vec2(v_uv.x, 1.0 - v_uv.y)).r * u_opacity;
  vec3 blended;
  if (u_blend == 1) blended = min(base.rgb + layer.rgb, vec3(1.0));
  else if (u_blend == 2) blended = base.rgb * layer.rgb;
  else if (u_blend == 3) blended = 1.0 - (1.0 - base.rgb) * (1.0 - layer.rgb);
  else blended = layer.rgb;
  fragColor = vec4(mix(base.rgb, blended, alpha), 1.0);
}`;

export const BLIT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  fragColor = texture(u_tex, v_uv);
}`;

// Samples an effect FBO at each LED's UV position.
// u_ledPosTex is a RG32F texture: texel i = (u, v) for LED i.
// Viewport must be set to (0, 0, totalLeds, 1) before drawing.
export const LED_SAMPLE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_effectTex;
uniform highp sampler2D u_ledPosTex;
out vec4 fragColor;
void main() {
  vec2 uv = texelFetch(u_ledPosTex, ivec2(int(gl_FragCoord.x), 0), 0).rg;
  // Effect FBO: Y=0 at bottom; strip coords: Y=0 at top → flip
  fragColor = texture(u_effectTex, vec2(uv.x, 1.0 - uv.y));
}`;
