export const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export interface EffectDef {
  label: string;
  category: string;
  frag: string;
}

// Shared utilities inlined per shader
const H = `vec3 hsv2rgb(vec3 c){vec4 K=vec4(1.,2./3.,1./3.,3.);vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}`;
const HASH = `float h1(float n){return fract(sin(n)*43758.5453);}float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`;
const NOISE = `${HASH}float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}`;

function frag(body: string, utils = ''): string {
  return `#version 300 es
precision highp float;
uniform float u_time;
uniform sampler2D u_audio;
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
    frag: frag(`
  fragColor = vec4(1.0, 0.94, 0.82, 1.0);`),
  },

  strobe: {
    label: 'Strobe',
    category: 'Basic',
    frag: frag(`
  float on = step(0.5, fract(u_time * 10.0));
  fragColor = vec4(vec3(on), 1.0);`),
  },

  breathe: {
    label: 'Breathe',
    category: 'Basic',
    frag: frag(`
  float b = pow(0.5 + 0.5 * sin(u_time * 0.9), 2.5);
  float hue = fract(u_time * 0.04);
  fragColor = vec4(hsv2rgb(vec3(hue, 0.75, b)), 1.0);`, H),
  },

  // ─── Movement ────────────────────────────────────────────────────────────
  rainbow: {
    label: 'Rainbow',
    category: 'Movement',
    frag: frag(`
  float hue = fract(v_uv.x + u_time * 0.3);
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, 1.0)), 1.0);`, H),
  },

  chase: {
    label: 'Chase',
    category: 'Movement',
    frag: frag(`
  float pos = fract(u_time * 0.4);
  float d = abs(v_uv.x - pos);
  float wrap = min(d, 1.0 - d);
  float head = 1.0 - smoothstep(0.0, 0.06, wrap);
  float tail = 1.0 - smoothstep(0.0, 0.15, mod(v_uv.x - pos + 1.0, 1.0));
  float brightness = max(head, tail * 0.4);
  fragColor = vec4(hsv2rgb(vec3(fract(u_time * 0.1), 1.0, brightness)), 1.0);`, H),
  },

  scanner: {
    label: 'Scanner',
    category: 'Movement',
    frag: frag(`
  float pos = 0.5 + 0.5 * sin(u_time * 2.2);
  float d = abs(v_uv.x - pos);
  float head = 1.0 - smoothstep(0.0, 0.03, d);
  float glow = (1.0 - smoothstep(0.0, 0.14, d)) * 0.28;
  float i = max(head, glow);
  fragColor = vec4(i, i * 0.08, 0.0, 1.0);`),
  },

  meteor: {
    label: 'Meteor',
    category: 'Movement',
    frag: frag(`
  float sp = 0.35;
  float m1 = fract(v_uv.x - u_time * sp);
  float m2 = fract(v_uv.x - u_time * sp * 0.65 + 0.45);
  float i1 = max(1.0 - smoothstep(0.0, 0.02, m1),
                 (1.0 - smoothstep(0.0, 0.22, m1)) * 0.55);
  float i2 = max(1.0 - smoothstep(0.0, 0.02, m2),
                 (1.0 - smoothstep(0.0, 0.16, m2)) * 0.45);
  vec3 c = vec3(i1, i1*0.55, i1*0.08) + vec3(i2*0.4, i2*0.7, i2);
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);`),
  },

  wipe: {
    label: 'Color Wipe',
    category: 'Movement',
    frag: frag(`
  float cycle = u_time * 0.28;
  float wipePos = fract(cycle);
  float hue = fract(floor(cycle) * 0.618034);
  float on = step(v_uv.x, wipePos);
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, 1.0)) * on, 1.0);`, H),
  },

  theater: {
    label: 'Theater',
    category: 'Movement',
    frag: frag(`
  float phase = floor(u_time * 8.0);
  float col = floor(v_uv.x * 60.0);
  float lit = float(mod(col + phase, 3.0) < 0.5);
  float hue = fract(phase / 8.0 * 0.3);
  fragColor = vec4(hsv2rgb(vec3(hue, 1.0, lit)), 1.0);`, H),
  },

  sinelon: {
    label: 'Sinelon',
    category: 'Movement',
    frag: frag(`
  float dx = fract(u_time * 0.38);
  float dy = 0.5 + 0.42 * sin(u_time * 2.5);
  float dist = length(v_uv - vec2(dx, dy));
  float head = 1.0 - smoothstep(0.0, 0.055, dist);
  float glow = (1.0 - smoothstep(0.0, 0.14, dist)) * 0.18;
  float xBehind = fract(dx - v_uv.x);
  float trail = (1.0 - smoothstep(0.0, 0.22, xBehind)) * 0.12
              * (1.0 - smoothstep(0.0, 0.09, abs(v_uv.y - dy)));
  float i = max(max(head, glow), trail);
  fragColor = vec4(hsv2rgb(vec3(fract(u_time * 0.14), 1.0, 1.0)) * i, 1.0);`, H),
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
    label: 'Audio',
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
};

export const EFFECT_CATEGORIES = ['Basic', 'Movement', 'Color', 'Particle', 'Reactive'] as const;
