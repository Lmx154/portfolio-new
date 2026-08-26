import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/*
 * Dynamic "cruising through space" background.
 *
 * Nebulae are soft, self-shadowed gas clouds. Each cloud is BAKED once into a
 * texture (billowy multi-octave fBm, gentle domain drift, blob-shaped
 * envelopes, density-difference lighting) and then drawn as a plain textured
 * quad — so the expensive shader runs once per cloud, not per pixel per
 * frame. This is both why the gas looks like cumulus instead of marbled silk
 * (no ridged-filament term, low warp) and why the wallpaper is cheap at
 * runtime.
 *
 * Each nebula is also rendered to a small offscreen buffer; stars are
 * importance-sampled from that exact output, so they sit in the bright
 * clumps and take the local gas color.
 *
 * Extras for realism: distant spiral galaxies (procedural, baked the same
 * way) drifting slowly past, occasional shooting stars, and subtle per-star
 * twinkle.
 *
 * Pure Three.js — no asset files, no new deps.
 */

// ---- Scene tunables --------------------------------------------------------
const FIELD_STARS = 1400;
const CLUSTER_COUNT = 4;
const STARS_PER_CLUSTER = 420;
const GALAXY_COUNT = 3;
const METEOR_MAX = 3;

const FAR = -2200;
const NEAR = -40;
const FADE_IN = 750;
const FADE_OUT = 440;
const CRUISE_SPEED = 34;
const FIELD_SPREAD = 0.72;
const MIN_PX = 1.8;

// ---- Warp jump (page transition) ------------------------------------------
// On navigation we briefly slam the cruise speed up so the field rushes past,
// stretch stars into comet streaks, then ease back down to CRUISE_SPEED.
const WARP_SPEED = 1700; // peak forward speed while warping (~50x cruise)
const WARP_ATTACK = 9; // how fast warp intensity ramps up (per second)
const WARP_DECAY = 2.6; // how fast it eases back down (per second)
const WARP_HOLD = 0.16; // seconds held at peak before decaying
const STREAK_MAX = 600; // world-space length of a star streak at full warp
const GAS_OPACITY = 0.9; // overall nebula brightness
const SAMPLE_RES = 128; // offscreen buffer size used for star placement
const GALAXY_SPEED = 0.35; // galaxies drift slower than the field → feel distant
const METEOR_MIN_WAIT = 5; // seconds between shooting stars (min)
const METEOR_RAND_WAIT = 11; // + up to this many more

// ---- Nebula presets (mix & match) -----------------------------------------
const PALETTE_HEX: Record<string, string[]> = {
  crab: ['#10324a', '#2f7fa0', '#bfe6f2', '#e0b24a', '#b5552a'],
  emission: ['#241246', '#7a2d8f', '#d6478f', '#ff7a6b', '#7fa0ff'],
  reflection: ['#0a1736', '#244e9e', '#3f8fe0', '#9fd0ff', '#eaf4ff'],
  ember: ['#160a06', '#5a2410', '#a8521e', '#e0934a', '#f5d9a8'],
  oxygen: ['#06231f', '#157a5f', '#3fd0a0', '#bff0d8', '#d8d04a'],
  pillars: ['#10210a', '#3a5f1f', '#7fae3f', '#d9c24a', '#b5773a'],
};

// Cloud structure presets. `coverage`/`softness` shape how much sky the gas
// fills and how feathered its edges are; `warp` stays low — high warp is what
// produced the old marbled-silk look.
type Structure = {
  scale: number;
  warp: number;
  coverage: number;
  softness: number;
  detail: number;
  contrast: number;
  intensity: number;
};
const STRUCTURES: Structure[] = [
  { scale: 1.6, warp: 1.2, coverage: 0.38, softness: 0.34, detail: 1.0, contrast: 1.1, intensity: 1.0 },
  { scale: 2.2, warp: 0.9, coverage: 0.44, softness: 0.28, detail: 1.15, contrast: 1.2, intensity: 0.95 },
  { scale: 1.3, warp: 1.6, coverage: 0.34, softness: 0.4, detail: 0.9, contrast: 1.0, intensity: 1.05 },
  { scale: 1.9, warp: 1.1, coverage: 0.4, softness: 0.3, detail: 1.05, contrast: 1.15, intensity: 1.0 },
];

const SPACE_VIGNETTE = 'radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0) 65%)';

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// ---- Shared noise GLSL ------------------------------------------------------
// Dave Hoskins "hash without sine": all intermediates stay small and bounded,
// so it survives lower-precision mobile GPU floats (no blocky breakdown).
const NOISE_GLSL = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(p);
    float b = hash12(p + vec2(1.0, 0.0));
    float c = hash12(p + vec2(0.0, 1.0));
    float d = hash12(p + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  // 5 octaves, rotated each octave so nothing lines up with the pixel grid.
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5, n = 0.0;
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      n += a;
      p = mat2(1.6, 1.2, -1.2, 1.6) * p + 11.5;
      a *= 0.5;
    }
    return s / n;
  }
  // Billow: folded noise reads as puffy cauliflower tops — the cloud texture.
  float billow(vec2 p) {
    float s = 0.0, a = 0.5, n = 0.0;
    for (int i = 0; i < 5; i++) {
      s += a * (1.0 - abs(2.0 * vnoise(p) - 1.0));
      n += a;
      p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3;
      a *= 0.55;
    }
    return s / n;
  }
`;

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ---- Nebula bake shader (runs ONCE per cloud, offscreen) --------------------
const NEB_BAKE_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uPaletteA[5];
  uniform vec3 uPaletteB[5];
  uniform vec2 uSeed;
  uniform vec2 uAniso;
  uniform vec2 uLightDir;
  uniform vec4 uBlob[3];
  uniform float uRot, uScale, uWarp, uCoverage, uSoftness, uDetail, uContrast;

  ${NOISE_GLSL}

  // Cloud density: gently-drifted fbm shaped by a soft threshold, textured by
  // billow. No ridged/filament term — that's what made silk, not clouds.
  float density(vec2 p) {
    vec2 drift = vec2(fbm(p * 0.45 + vec2(2.3, 7.7)), fbm(p * 0.45 + vec2(9.1, 3.4))) - 0.5;
    vec2 q = p + drift * uWarp;
    float base = fbm(q);
    float d = smoothstep(uCoverage, uCoverage + uSoftness, base);
    float puff = billow(q * 2.3 + vec2(4.7, 1.9));
    d *= 0.55 + 0.9 * puff * uDetail;
    return clamp(d, 0.0, 1.0);
  }

  // Envelope: a few soft irregular blobs instead of a hard global threshold —
  // clumps that dissolve outward, never curtain-like sheets or straight cuts.
  float envelope(vec2 c) {
    float e = 0.0;
    for (int i = 0; i < 3; i++) {
      vec2 q = c - uBlob[i].xy;
      float wobble = 0.7 + 0.6 * fbm(c * 1.4 + uSeed + float(i) * 13.7);
      float r = length(q) * wobble / max(uBlob[i].z, 1e-3);
      e += uBlob[i].w * exp(-r * r * 1.8);
    }
    return clamp(e, 0.0, 1.0);
  }

  vec3 palA(float t) {
    vec3 col = uPaletteA[0];
    col = mix(col, uPaletteA[1], clamp(t, 0.0, 1.0));
    col = mix(col, uPaletteA[2], clamp(t - 1.0, 0.0, 1.0));
    col = mix(col, uPaletteA[3], clamp(t - 2.0, 0.0, 1.0));
    col = mix(col, uPaletteA[4], clamp(t - 3.0, 0.0, 1.0));
    return col;
  }
  vec3 palB(float t) {
    vec3 col = uPaletteB[0];
    col = mix(col, uPaletteB[1], clamp(t, 0.0, 1.0));
    col = mix(col, uPaletteB[2], clamp(t - 1.0, 0.0, 1.0));
    col = mix(col, uPaletteB[3], clamp(t - 2.0, 0.0, 1.0));
    col = mix(col, uPaletteB[4], clamp(t - 3.0, 0.0, 1.0));
    return col;
  }

  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    // Box edge fade -> gas dissolves well before the quad border.
    vec2 ef = 1.0 - smoothstep(0.55, 0.98, abs(c));
    float edge = ef.x * ef.y;

    float ca = cos(uRot), sa = sin(uRot);
    vec2 rc = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
    vec2 p = rc * uScale * uAniso + uSeed;

    float d0 = density(p);
    // Fake self-shadowing: puffs denser than their light-facing neighborhood
    // catch light; the far side falls into shadow. Sells "volume" instantly.
    float toward = density(p + uLightDir * 0.22);
    float lit = clamp(0.55 + (d0 - toward) * 1.7, 0.18, 1.35);

    float d = d0 * envelope(c) * edge;
    d = pow(clamp(d, 0.0, 1.0), uContrast);

    float hsel = fbm(rc * 0.8 + uSeed + vec2(3.0, 19.0)) * 4.0;
    float region = fbm(rc * 0.5 + uSeed + vec2(20.0, 7.0));
    vec3 col = mix(palA(hsel), palB(hsel), smoothstep(0.35, 0.65, region));
    // Thick gas glows, thin edges dim out; lighting modulates on top.
    col *= (0.35 + 0.85 * d) * lit;
    float core = smoothstep(0.75, 1.0, d * lit);
    col += (vec3(1.0) - col) * core * 0.5;

    gl_FragColor = vec4(col, d);
  }
`;

// ---- Galaxy bake shader (runs ONCE per galaxy, offscreen) -------------------
// Four morphologies, picked per galaxy: 0 = classic spiral, 1 = barred spiral,
// 2 = elliptical, 3 = irregular. On top of the smooth light, layers of
// resolved star specks (soft gaussian dots a few texels wide, so they survive
// mip-mapped downscaling on screen) and pink HII knots along spiral arms.
const GALAXY_BAKE_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uGSeed;
  uniform float uType;
  uniform float uArms;
  uniform float uTwist;
  uniform float uBulge;
  uniform float uArmSharp;
  uniform vec3 uCoreColor;
  uniform vec3 uArmColor;

  ${NOISE_GLSL}

  // One layer of resolved stars: a hashed grid where sparse cells hold a soft
  // round dot at a random offset. Dots span a few texels — single-texel
  // speckle disappears the moment the texture is minified.
  float starLayer(vec2 c, float scale, float thresh, float seed) {
    vec2 p = c * scale + seed;
    vec2 cell = floor(p);
    float on = step(thresh, hash12(cell));
    vec2 pos = vec2(hash12(cell + 17.1), hash12(cell + 42.7)) * 0.6 + 0.2;
    float d = length(fract(p) - pos);
    return on * exp(-d * d * 55.0) * (0.4 + 0.6 * hash12(cell + 91.3));
  }

  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    float r = length(c) + 1e-4;
    float theta = atan(c.y, c.x);
    float n = fbm(c * 3.5 + uGSeed);

    float dens = 0.0;  // disc/arm light (arm-colored, young stars)
    float coreD = 0.0; // bulge/halo light (core-colored, old stars)
    float armHere = 0.0;

    if (uType < 0.5) {
      // -- Classic spiral: log-spiral arms winding out of a compact bulge.
      float swirl = theta * uArms + log(max(r, 0.05)) * uTwist + uGSeed;
      armHere = pow(0.5 + 0.5 * cos(swirl), uArmSharp);
      float disc = exp(-r * 2.7) * smoothstep(1.0, 0.2, r);
      dens = disc * (0.08 + 0.92 * armHere) * (0.7 + 0.6 * n);
      coreD = exp(-r * r * uBulge);
      float dust = smoothstep(0.5, 0.85, fbm(c * 5.0 + uGSeed + 31.0)) * smoothstep(0.06, 0.3, r);
      dens *= 1.0 - 0.6 * dust * armHere;
    } else if (uType < 1.5) {
      // -- Barred spiral: a bright stellar bar; two arms sweep from its ends.
      float barLen = 0.4, barW = 0.12;
      float bar = exp(-(c.x * c.x) / (barLen * barLen) - (c.y * c.y) / (barW * barW));
      // Phase-locked so arm crests meet the bar tips (theta 0 / pi at r=barLen).
      float swirl = theta * 2.0 + log(max(r, 0.05)) * uTwist - log(barLen) * uTwist;
      armHere = pow(0.5 + 0.5 * cos(swirl), uArmSharp);
      float disc = exp(-r * 2.6) * smoothstep(1.0, 0.2, r);
      dens = disc * (0.06 + 0.94 * armHere) * smoothstep(0.16, 0.45, r) * (0.7 + 0.6 * n);
      dens += bar * 0.85;
      coreD = exp(-r * r * uBulge);
      float dust = smoothstep(0.5, 0.85, fbm(c * 5.0 + uGSeed + 31.0)) * smoothstep(0.1, 0.35, r);
      dens *= 1.0 - 0.55 * dust * armHere;
    } else if (uType < 2.5) {
      // -- Elliptical: smooth old-star glow, eccentric, structureless but for
      // a whisper of noise; broad faint halo.
      vec2 e = c * vec2(1.0, 1.0 + uArms * 0.35); // reuse uArms as eccentricity
      float re = length(e) + 1e-4;
      coreD = exp(-re * 3.6) * 0.85 + exp(-re * re * uBulge) * 0.8;
      coreD *= 0.9 + 0.2 * n;
      dens = coreD * 0.12;
    } else {
      // -- Irregular: no symmetry, just clumpy blue star-forming knots.
      float clump = smoothstep(0.45, 0.8, fbm(c * 2.6 + uGSeed));
      float env = exp(-r * r * 2.4) * (0.5 + 0.9 * fbm(c * 1.3 + uGSeed + 7.0));
      dens = clump * env * 1.5;
      armHere = clump;
      coreD = env * 0.12;
    }

    vec3 col = uArmColor * dens * 1.5 + uCoreColor * (coreD * 1.15 + dens * 0.15);

    // Pink HII star-forming knots along spiral arms / irregular clumps.
    if (uType < 1.5 || uType > 2.5) {
      float knots = smoothstep(0.55, 0.9, fbm(c * 6.5 + uGSeed + 53.0)) * dens * armHere;
      col += vec3(0.95, 0.42, 0.5) * knots * 0.6;
    }

    // Resolved star specks: bright blue-white giants in the disc and arms,
    // a fine warm grain over the bulge.
    float discStars = starLayer(c, 26.0, 0.93, uGSeed * 7.0)
                    + starLayer(c, 44.0, 0.9, uGSeed * 13.0) * 0.6;
    float coreStars = starLayer(c, 58.0, 0.78, uGSeed * 3.0) * 0.45;
    float speck = discStars * smoothstep(0.03, 0.22, dens + coreD * 0.4) + coreStars * coreD;
    vec3 speckCol = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.9, 0.72), clamp(coreD * 1.4, 0.0, 1.0));
    col += speckCol * speck * 1.15;

    float alpha = clamp(dens * 1.4 + coreD * 1.05 + speck * 0.8, 0.0, 1.0);
    alpha *= smoothstep(1.0, 0.55, r);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ---- Display shader: just a textured quad × opacity -------------------------
const QUAD_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D uMap;
  uniform float uOpacity;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    gl_FragColor = vec4(t.rgb, t.a * uOpacity);
  }
`;

// ---- Star shader (fades + min-size + twinkle, no sub-pixel glitter) ---------
const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uSizeScale;
  uniform float uPixelRatio;
  uniform float uMinPx;
  uniform float uNear;
  uniform float uFar;
  uniform float uFadeIn;
  uniform float uFadeOut;
  uniform float uWarpFade;
  uniform float uTime;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float z = position.z;
    float fin = smoothstep(uFar, uFar + uFadeIn, z);
    float fout = 1.0 - smoothstep(uNear - uFadeOut, uNear, z);
    float fade = clamp(fin * fout, 0.0, 1.0);
    float wantCss = aSize * uSizeScale / max(-mv.z, 1.0);
    float small = clamp(wantCss / uMinPx, 0.0, 1.0);
    float sizeCss = clamp(max(wantCss, uMinPx), 0.0, 18.0);
    // Subtle atmospheric-style twinkle, per-star phase + rate.
    float ph = fract(aSize * 43.7585 + position.x * 0.0113 + position.y * 0.0177) * 6.2831;
    float tw = 0.82 + 0.18 * sin(uTime * (1.0 + fract(aSize * 17.31) * 3.0) + ph);
    vAlpha = fade * (0.15 + 0.85 * small) * uWarpFade * tw;
    gl_PointSize = sizeCss * uPixelRatio;
  }
`;

const STAR_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.0, 0.5, d);
    gl_FragColor = vec4(vColor, pow(core, 1.7) * vAlpha);
  }
`;

// ---- Star streak shader (warp jump) ----------------------------------------
// Each star becomes a 2-vertex line: the head sits at the star's position, the
// tail trails behind along the travel axis by uStreakLen. Alpha tapers from a
// bright head to a transparent tail (comet look) and scales with uWarp so the
// streaks fade in/out with the jump.
const STREAK_VERT = /* glsl */ `
  attribute float aEnd;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uStreakLen;
  uniform float uWarp;
  uniform float uNear;
  uniform float uFar;
  uniform float uFadeIn;
  uniform float uFadeOut;
  void main() {
    vColor = aColor;
    vec3 p = position;
    p.z -= aEnd * uStreakLen; // tail trails toward -z (away from camera)
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float z = position.z;
    float fin = smoothstep(uFar, uFar + uFadeIn, z);
    float fout = 1.0 - smoothstep(uNear - uFadeOut, uNear, z);
    float fade = clamp(fin * fout, 0.0, 1.0);
    float taper = 1.0 - aEnd; // 1 at head, 0 at tail
    vAlpha = fade * uWarp * taper;
  }
`;

const STREAK_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

// ---- Shooting star shaders --------------------------------------------------
const METEOR_TAIL_VERT = /* glsl */ `
  attribute float aAlpha;
  varying float vA;
  void main() {
    vA = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const METEOR_TAIL_FRAG = /* glsl */ `
  precision mediump float;
  varying float vA;
  void main() {
    gl_FragColor = vec4(vec3(0.95, 0.93, 0.86), vA);
  }
`;

const METEOR_HEAD_VERT = /* glsl */ `
  attribute float aAlpha;
  varying float vA;
  uniform float uSizeScale;
  uniform float uPixelRatio;
  void main() {
    vA = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float sizeCss = clamp(uSizeScale * 4.0 / max(-mv.z, 1.0), 2.0, 8.0);
    gl_PointSize = sizeCss * uPixelRatio;
  }
`;

const METEOR_HEAD_FRAG = /* glsl */ `
  precision mediump float;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.0, 0.5, d);
    gl_FragColor = vec4(vec3(1.0, 0.98, 0.92), pow(core, 1.4) * vA);
  }
`;

const gauss3 = () => Math.random() + Math.random() + Math.random() - 1.5;

type NebulaParams = {
  palA: [number, number, number][];
  palB: [number, number, number][];
  st: Structure;
  seedX: number;
  seedY: number;
  rot: number;
  anisoX: number;
  anisoY: number;
  lightX: number;
  lightY: number;
  blobs: { x: number; y: number; r: number; a: number }[];
};

type Meteor = {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  len: number;
  life: number;
  ttl: number;
};

const SpaceBackground = ({ warpSignal = 0 }: { warpSignal?: number }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Set by the scene effect; called from the warpSignal effect below to kick
  // off a warp jump without tearing down / rebuilding the Three.js scene.
  const triggerWarpRef = useRef<(() => void) | null>(null);
  const lastSignal = useRef(warpSignal);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const gasOpacity = GAS_OPACITY;
    const cruiseSpeed = CRUISE_SPEED;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
    const NEB_BAKE_RES = isMobile ? 512 : 1024;
    const GALAXY_BAKE_RES = isMobile ? 256 : 512;

    // --- Renderer / scene / camera ---
    // No MSAA: stars are soft sprites and gas quads fade at their edges, so
    // multisampling buys nothing here while costing memory + fill rate.
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    const pixelRatio = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1);
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 5000);
    camera.position.set(0, 0, 0);

    const sizeScale = () => window.innerHeight * 0.5;
    const starMaterial = () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uSizeScale: { value: sizeScale() },
          uPixelRatio: { value: pixelRatio },
          uMinPx: { value: MIN_PX },
          uNear: { value: NEAR },
          uFar: { value: FAR },
          uFadeIn: { value: FADE_IN },
          uFadeOut: { value: FADE_OUT },
          uWarpFade: { value: 1 },
          uTime: { value: 0 },
        },
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

    const color = new THREE.Color();
    const palettes = Object.values(PALETTE_HEX).map((stops) => stops.map(hexToRgb));
    const structures = STRUCTURES;

    // -----------------------------------------------------------------------
    // Bake rig: one ortho quad scene reused for every nebula/galaxy bake.
    // -----------------------------------------------------------------------
    const bakeScene = new THREE.Scene();
    const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    bakeCam.position.z = 1;

    const nebBakeMat = new THREE.ShaderMaterial({
      uniforms: {
        uPaletteA: { value: [0, 0, 0, 0, 0].map(() => new THREE.Vector3()) },
        uPaletteB: { value: [0, 0, 0, 0, 0].map(() => new THREE.Vector3()) },
        uSeed: { value: new THREE.Vector2() },
        uAniso: { value: new THREE.Vector2(1, 1) },
        uLightDir: { value: new THREE.Vector2(1, 0) },
        uBlob: { value: [0, 0, 0].map(() => new THREE.Vector4()) },
        uRot: { value: 0 },
        uScale: { value: 2 },
        uWarp: { value: 1 },
        uCoverage: { value: 0.4 },
        uSoftness: { value: 0.3 },
        uDetail: { value: 1 },
        uContrast: { value: 1.1 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: NEB_BAKE_FRAG,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      precision: 'highp', // inject one clean highp declaration (mobile-safe)
    });

    const galaxyBakeMat = new THREE.ShaderMaterial({
      uniforms: {
        uGSeed: { value: 0 },
        uType: { value: 0 },
        uArms: { value: 2 },
        uTwist: { value: 4.5 },
        uBulge: { value: 26 },
        uArmSharp: { value: 3 },
        uCoreColor: { value: new THREE.Color('#ffe9c4') },
        uArmColor: { value: new THREE.Color('#9db8e8') },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: GALAXY_BAKE_FRAG,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      precision: 'highp',
    });

    const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), nebBakeMat);
    bakeScene.add(bakeQuad);

    const makeTarget = (size: number) =>
      new THREE.WebGLRenderTarget(size, size, {
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
      });

    const bakeInto = (target: THREE.WebGLRenderTarget | null, material: THREE.ShaderMaterial) => {
      bakeQuad.material = material;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(bakeScene, bakeCam);
      renderer.setRenderTarget(null);
      renderer.setClearColor(0x000000, 1);
    };

    const applyNebulaParams = (P: NebulaParams) => {
      const u = nebBakeMat.uniforms;
      for (let i = 0; i < 5; i++) {
        (u.uPaletteA.value as THREE.Vector3[])[i].set(P.palA[i][0], P.palA[i][1], P.palA[i][2]);
        (u.uPaletteB.value as THREE.Vector3[])[i].set(P.palB[i][0], P.palB[i][1], P.palB[i][2]);
      }
      (u.uSeed.value as THREE.Vector2).set(P.seedX, P.seedY);
      (u.uAniso.value as THREE.Vector2).set(P.anisoX, P.anisoY);
      (u.uLightDir.value as THREE.Vector2).set(P.lightX, P.lightY);
      for (let i = 0; i < 3; i++) {
        const b = P.blobs[i];
        (u.uBlob.value as THREE.Vector4[])[i].set(b.x, b.y, b.r, b.a);
      }
      u.uRot.value = P.rot;
      u.uScale.value = P.st.scale;
      u.uWarp.value = P.st.warp;
      u.uCoverage.value = P.st.coverage;
      u.uSoftness.value = P.st.softness;
      u.uDetail.value = P.st.detail;
      u.uContrast.value = P.st.contrast;
    };

    const randomParams = (): NebulaParams => {
      const a = Math.floor(Math.random() * palettes.length);
      let b = Math.floor(Math.random() * palettes.length);
      if (b === a) b = (a + 1) % palettes.length;
      const lightAngle = Math.random() * Math.PI * 2;
      // One dominant clump near the middle + two satellites drifting off it.
      const blobs = [
        { x: (Math.random() - 0.5) * 0.3, y: (Math.random() - 0.5) * 0.3, r: 0.45 + Math.random() * 0.2, a: 0.9 + Math.random() * 0.1 },
        { x: (Math.random() - 0.5) * 0.9, y: (Math.random() - 0.5) * 0.9, r: 0.22 + Math.random() * 0.2, a: 0.55 + Math.random() * 0.35 },
        { x: (Math.random() - 0.5) * 1.1, y: (Math.random() - 0.5) * 1.1, r: 0.16 + Math.random() * 0.18, a: 0.4 + Math.random() * 0.4 },
      ];
      return {
        palA: palettes[a],
        palB: palettes[b],
        st: structures[Math.floor(Math.random() * structures.length)],
        // Keep noise coords small so floor()/fract() stay precise on mobile GPUs.
        seedX: Math.random() * 6,
        seedY: Math.random() * 6,
        rot: Math.random() * Math.PI,
        anisoX: 0.6 + Math.random() * 0.9,
        anisoY: 0.6 + Math.random() * 0.9,
        lightX: Math.cos(lightAngle),
        lightY: Math.sin(lightAngle),
        blobs,
      };
    };

    // --- Offscreen sampler: rebake tiny + read back for star placement. ---
    const rt = new THREE.WebGLRenderTarget(SAMPLE_RES, SAMPLE_RES, { depthBuffer: false, stencilBuffer: false });
    const rtBuf = new Uint8Array(SAMPLE_RES * SAMPLE_RES * 4);
    const sampleNebula = () => {
      bakeInto(rt, nebBakeMat);
      renderer.readRenderTargetPixels(rt, 0, 0, SAMPLE_RES, SAMPLE_RES, rtBuf);
    };

    // ---------------------------------------------------------------------
    // Field stars
    // ---------------------------------------------------------------------
    const fieldPos = new Float32Array(FIELD_STARS * 3);
    const fieldColor = new Float32Array(FIELD_STARS * 3);
    const fieldSize = new Float32Array(FIELD_STARS);

    const placeFieldStar = (i: number, z: number) => {
      const az = Math.abs(z);
      fieldPos[i * 3] = (Math.random() - 0.5) * 2 * az * FIELD_SPREAD;
      fieldPos[i * 3 + 1] = (Math.random() - 0.5) * 2 * az * FIELD_SPREAD * 0.8;
      fieldPos[i * 3 + 2] = z;
    };
    const setFieldColor = (i: number) => {
      const roll = Math.random();
      if (roll < 0.62) color.setHSL(0, 0, 0.85 + Math.random() * 0.15);
      else if (roll < 0.82) color.setHSL(0.6, 0.45, 0.82);
      else if (roll < 0.92) color.setHSL(0.53, 0.5, 0.8);
      else if (roll < 0.98) color.setHSL(0.08, 0.55, 0.82);
      else color.setHSL(0.02, 0.6, 0.75);
      fieldColor[i * 3] = color.r;
      fieldColor[i * 3 + 1] = color.g;
      fieldColor[i * 3 + 2] = color.b;
      fieldSize[i] = Math.random() < 0.9 ? 1.1 + Math.random() * 1.7 : 3 + Math.random() * 2.5;
    };
    for (let i = 0; i < FIELD_STARS; i++) {
      placeFieldStar(i, FAR + Math.random() * (NEAR - FAR));
      setFieldColor(i);
    }
    const fieldGeo = new THREE.BufferGeometry();
    fieldGeo.setAttribute('position', new THREE.BufferAttribute(fieldPos, 3));
    fieldGeo.setAttribute('aColor', new THREE.BufferAttribute(fieldColor, 3));
    fieldGeo.setAttribute('aSize', new THREE.BufferAttribute(fieldSize, 1));
    const fieldMat = starMaterial();
    const field = new THREE.Points(fieldGeo, fieldMat);
    field.frustumCulled = false;
    scene.add(field);

    // --- Warp streaks: a line per field star (head + trailing tail vertex) ---
    const streakPos = new Float32Array(FIELD_STARS * 2 * 3);
    const streakEnd = new Float32Array(FIELD_STARS * 2);
    const streakColor = new Float32Array(FIELD_STARS * 2 * 3);
    for (let i = 0; i < FIELD_STARS; i++) {
      streakEnd[i * 2] = 0; // head
      streakEnd[i * 2 + 1] = 1; // tail
      for (let e = 0; e < 2; e++) {
        streakColor[(i * 2 + e) * 3] = fieldColor[i * 3];
        streakColor[(i * 2 + e) * 3 + 1] = fieldColor[i * 3 + 1];
        streakColor[(i * 2 + e) * 3 + 2] = fieldColor[i * 3 + 2];
      }
    }
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
    streakGeo.setAttribute('aEnd', new THREE.BufferAttribute(streakEnd, 1));
    streakGeo.setAttribute('aColor', new THREE.BufferAttribute(streakColor, 3));
    const streakMat = new THREE.ShaderMaterial({
      uniforms: {
        uStreakLen: { value: 0 },
        uWarp: { value: 0 },
        uNear: { value: NEAR },
        uFar: { value: FAR },
        uFadeIn: { value: FADE_IN },
        uFadeOut: { value: FADE_OUT },
      },
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const streaks = new THREE.LineSegments(streakGeo, streakMat);
    streaks.frustumCulled = false;
    streaks.visible = false;
    scene.add(streaks);
    const streakPosAttr = streakGeo.getAttribute('position') as THREE.BufferAttribute;

    // ---------------------------------------------------------------------
    // Clusters: a baked nebula texture quad + stars sampled from it
    // ---------------------------------------------------------------------
    type Cluster = { x: number; y: number; z: number; size: number };
    const clusters: Cluster[] = [];
    const gasMeshes: THREE.Mesh[] = [];
    const gasMats: THREE.ShaderMaterial[] = [];
    const gasTargets: THREE.WebGLRenderTarget[] = [];
    const planeGeo = new THREE.PlaneGeometry(1, 1);

    const makeQuadMaterial = (tex: THREE.Texture) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: tex },
          uOpacity: { value: 0 },
        },
        vertexShader: QUAD_VERT,
        fragmentShader: QUAD_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

    for (let k = 0; k < CLUSTER_COUNT; k++) {
      const target = makeTarget(NEB_BAKE_RES);
      const mat = makeQuadMaterial(target.texture);
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.renderOrder = -1;
      mesh.frustumCulled = false;
      scene.add(mesh);
      gasTargets.push(target);
      gasMeshes.push(mesh);
      gasMats.push(mat);
    }

    const clusterTotal = CLUSTER_COUNT * STARS_PER_CLUSTER;
    const clusterPos = new Float32Array(clusterTotal * 3);
    const clusterOffset = new Float32Array(clusterTotal * 3);
    const clusterColor = new Float32Array(clusterTotal * 3);
    const clusterSize = new Float32Array(clusterTotal);

    const regenCluster = (k: number) => {
      const z = FAR;
      const az = Math.abs(z);
      const c: Cluster = {
        x: (Math.random() - 0.5) * 2 * az * 0.4,
        y: (Math.random() - 0.5) * 2 * az * 0.32,
        z,
        size: 800 + Math.random() * 800,
      };
      clusters[k] = c;

      const P = randomParams();
      applyNebulaParams(P);
      // Bake the cloud once into this cluster's texture; the per-frame cost
      // of the nebula is then a single texture fetch.
      bakeInto(gasTargets[k], nebBakeMat);
      gasMeshes[k].scale.set(c.size, c.size, 1);

      // Rebake tiny, then importance-sample stars from that exact output.
      sampleNebula();
      const span = c.size;
      const R = SAMPLE_RES;
      for (let j = 0; j < STARS_PER_CLUSTER; j++) {
        const gi = k * STARS_PER_CLUSTER + j;
        let bx = 0;
        let by = 0;
        let dens = 0;
        for (let tries = 0; tries < 12; tries++) {
          bx = (Math.random() * R) | 0;
          by = (Math.random() * R) | 0;
          dens = rtBuf[(by * R + bx) * 4 + 3] / 255;
          if (dens > Math.random() * 0.8) break;
        }
        clusterOffset[gi * 3] = ((bx + 0.5) / R - 0.5) * span;
        clusterOffset[gi * 3 + 1] = ((by + 0.5) / R - 0.5) * span;
        clusterOffset[gi * 3 + 2] = gauss3() * span * 0.12;

        const pi = (by * R + bx) * 4;
        if (Math.random() < 0.12) {
          color.setHSL(0, 0, 0.9 + Math.random() * 0.1);
        } else {
          const boost = 0.6 + Math.random() * 0.7;
          color.setRGB(
            Math.min(1, (rtBuf[pi] / 255) * boost + 0.12),
            Math.min(1, (rtBuf[pi + 1] / 255) * boost + 0.12),
            Math.min(1, (rtBuf[pi + 2] / 255) * boost + 0.12),
          );
        }
        clusterColor[gi * 3] = color.r;
        clusterColor[gi * 3 + 1] = color.g;
        clusterColor[gi * 3 + 2] = color.b;
        const big = Math.random() < (dens > 0.6 ? 0.14 : 0.05);
        clusterSize[gi] = big ? 2.2 + Math.random() * 1.8 : 0.7 + Math.random() * 1.2;
      }
    };

    for (let k = 0; k < CLUSTER_COUNT; k++) {
      regenCluster(k);
      clusters[k].z = FAR + Math.random() * (NEAR - FAR);
    }

    const clusterGeo = new THREE.BufferGeometry();
    clusterGeo.setAttribute('position', new THREE.BufferAttribute(clusterPos, 3));
    clusterGeo.setAttribute('aColor', new THREE.BufferAttribute(clusterColor, 3));
    clusterGeo.setAttribute('aSize', new THREE.BufferAttribute(clusterSize, 1));
    const clusterMat = starMaterial();
    const clusterPoints = new THREE.Points(clusterGeo, clusterMat);
    clusterPoints.frustumCulled = false;
    scene.add(clusterPoints);

    const clusterPosAttr = clusterGeo.getAttribute('position') as THREE.BufferAttribute;
    const clusterColorAttr = clusterGeo.getAttribute('aColor') as THREE.BufferAttribute;
    const clusterSizeAttr = clusterGeo.getAttribute('aSize') as THREE.BufferAttribute;
    const fieldPosAttr = fieldGeo.getAttribute('position') as THREE.BufferAttribute;

    const fadeAt = (z: number) => {
      const fin = THREE.MathUtils.smoothstep(z, FAR, FAR + FADE_IN);
      const fout = 1 - THREE.MathUtils.smoothstep(z, NEAR - FADE_OUT, NEAR);
      return Math.max(0, Math.min(1, fin * fout));
    };

    const writeClusterPositions = () => {
      for (let k = 0; k < CLUSTER_COUNT; k++) {
        const c = clusters[k];
        gasMeshes[k].position.set(c.x, c.y, c.z);
        const op = gasOpacity * fadeAt(c.z);
        gasMats[k].uniforms.uOpacity.value = op;
        gasMeshes[k].visible = op > 0.003;
        for (let j = 0; j < STARS_PER_CLUSTER; j++) {
          const gi = k * STARS_PER_CLUSTER + j;
          clusterPos[gi * 3] = c.x + clusterOffset[gi * 3];
          clusterPos[gi * 3 + 1] = c.y + clusterOffset[gi * 3 + 1];
          clusterPos[gi * 3 + 2] = c.z + clusterOffset[gi * 3 + 2];
        }
      }
    };
    writeClusterPositions();
    clusterPosAttr.needsUpdate = true;

    // ---------------------------------------------------------------------
    // Galaxies: small baked spiral sprites drifting far away
    // ---------------------------------------------------------------------
    type Galaxy = {
      x: number;
      y: number;
      z: number;
      size: number;
      spin: number;
      bright: number;
      type: number;
      mesh: THREE.Mesh;
      mat: THREE.ShaderMaterial;
      target: THREE.WebGLRenderTarget;
    };
    const galaxies: Galaxy[] = [];

    // Morphology mix (0 spiral / 1 barred / 2 elliptical / 3 irregular),
    // roughly like the bright end of the real population.
    const rollGalaxyType = () => {
      const roll = Math.random();
      if (roll < 0.34) return 0;
      if (roll < 0.62) return 1;
      if (roll < 0.83) return 2;
      return 3;
    };

    const GALAXY_CORES = ['#ffe9c4', '#fff3e0', '#ffd9a0', '#f2e2c0'];
    const GALAXY_ARMS = ['#8fb0e8', '#a8c4f0', '#7ea8d8', '#9cc0e4'];
    const ELLIPTICAL_CORES = ['#ffe2b8', '#f5e6c8', '#ffd9ad'];
    const IRREGULAR_ARMS = ['#9cc4f0', '#8fd0e8', '#a8c8f8'];

    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

    const bakeGalaxy = (g: Galaxy) => {
      const type = g.type;
      const u = galaxyBakeMat.uniforms;
      u.uGSeed.value = Math.random() * 40;
      u.uType.value = type;
      if (type === 2) {
        // Elliptical: uArms doubles as eccentricity, bulge is broad.
        u.uArms.value = Math.random();
        u.uBulge.value = 6 + Math.random() * 8;
        (u.uCoreColor.value as THREE.Color).set(pick(ELLIPTICAL_CORES));
        (u.uArmColor.value as THREE.Color).set(pick(ELLIPTICAL_CORES));
      } else if (type === 3) {
        // Irregular: all blue star-forming clumps, no real core.
        u.uBulge.value = 10;
        (u.uCoreColor.value as THREE.Color).set(pick(GALAXY_CORES));
        (u.uArmColor.value as THREE.Color).set(pick(IRREGULAR_ARMS));
      } else {
        u.uArms.value = Math.random() < 0.6 ? 2 : 3;
        u.uTwist.value = (type === 1 ? 3.0 : 3.2) + Math.random() * 2.2;
        u.uBulge.value = 18 + Math.random() * 22;
        u.uArmSharp.value = 2.5 + Math.random() * 2.5; // higher → thinner, crisper arms
        (u.uCoreColor.value as THREE.Color).set(pick(GALAXY_CORES));
        (u.uArmColor.value as THREE.Color).set(pick(GALAXY_ARMS));
      }
      bakeInto(g.target, galaxyBakeMat);
    };

    const regenGalaxy = (g: Galaxy, z: number) => {
      const type = rollGalaxyType();
      g.type = type;
      const az = Math.abs(FAR);
      g.x = (Math.random() - 0.5) * 2 * az * 0.55;
      g.y = (Math.random() - 0.5) * 2 * az * 0.4;
      g.z = z;
      g.size = (type === 3 ? 200 : 280) + Math.random() * 260;
      g.spin = (Math.random() - 0.5) * 0.01; // barely-perceptible in-plane drift
      // Ellipticals are all bulge — at full brightness they read like a sun.
      g.bright = (type === 2 ? 0.4 : 0.55) + Math.random() * 0.3;
      g.mesh.scale.set(g.size, g.size, 1);
      // Random 3D tilt → elliptical on screen, like a real inclined disc.
      // Ellipticals/irregulars aren't discs; keep them nearly face-on.
      const tilt = type >= 2 ? 0.4 : 1.9;
      g.mesh.rotation.set((Math.random() - 0.5) * tilt, (Math.random() - 0.5) * tilt, Math.random() * Math.PI);
      bakeGalaxy(g);
    };

    for (let i = 0; i < GALAXY_COUNT; i++) {
      const target = makeTarget(GALAXY_BAKE_RES);
      const mat = makeQuadMaterial(target.texture);
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.renderOrder = -1;
      mesh.frustumCulled = false;
      scene.add(mesh);
      const g: Galaxy = { x: 0, y: 0, z: FAR, size: 300, spin: 0, bright: 0.8, type: 0, mesh, mat, target };
      galaxies.push(g);
      // Stagger through the cycle so one drifts past only occasionally.
      regenGalaxy(g, FAR + Math.random() * (NEAR - FAR));
    }

    const writeGalaxyPositions = () => {
      for (const g of galaxies) {
        g.mesh.position.set(g.x, g.y, g.z);
        const op = g.bright * fadeAt(g.z);
        g.mat.uniforms.uOpacity.value = op;
        g.mesh.visible = op > 0.003;
      }
    };
    writeGalaxyPositions();

    // ---------------------------------------------------------------------
    // Shooting stars: a small pool of head+tail meteors on random timers
    // ---------------------------------------------------------------------
    const meteors: Meteor[] = Array.from({ length: METEOR_MAX }, () => ({
      active: false, x: 0, y: 0, z: -400, vx: 0, vy: 0, len: 0, life: 0, ttl: 1,
    }));
    let meteorWait = METEOR_MIN_WAIT + Math.random() * METEOR_RAND_WAIT;

    const meteorTailPos = new Float32Array(METEOR_MAX * 2 * 3);
    const meteorTailAlpha = new Float32Array(METEOR_MAX * 2);
    const meteorTailGeo = new THREE.BufferGeometry();
    meteorTailGeo.setAttribute('position', new THREE.BufferAttribute(meteorTailPos, 3));
    meteorTailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(meteorTailAlpha, 1));
    const meteorTailMat = new THREE.ShaderMaterial({
      vertexShader: METEOR_TAIL_VERT,
      fragmentShader: METEOR_TAIL_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const meteorTails = new THREE.LineSegments(meteorTailGeo, meteorTailMat);
    meteorTails.frustumCulled = false;
    meteorTails.visible = false;
    scene.add(meteorTails);

    const meteorHeadPos = new Float32Array(METEOR_MAX * 3);
    const meteorHeadAlpha = new Float32Array(METEOR_MAX);
    const meteorHeadGeo = new THREE.BufferGeometry();
    meteorHeadGeo.setAttribute('position', new THREE.BufferAttribute(meteorHeadPos, 3));
    meteorHeadGeo.setAttribute('aAlpha', new THREE.BufferAttribute(meteorHeadAlpha, 1));
    const meteorHeadMat = new THREE.ShaderMaterial({
      uniforms: {
        uSizeScale: { value: sizeScale() },
        uPixelRatio: { value: pixelRatio },
      },
      vertexShader: METEOR_HEAD_VERT,
      fragmentShader: METEOR_HEAD_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const meteorHeads = new THREE.Points(meteorHeadGeo, meteorHeadMat);
    meteorHeads.frustumCulled = false;
    meteorHeads.visible = false;
    scene.add(meteorHeads);

    const meteorTailPosAttr = meteorTailGeo.getAttribute('position') as THREE.BufferAttribute;
    const meteorTailAlphaAttr = meteorTailGeo.getAttribute('aAlpha') as THREE.BufferAttribute;
    const meteorHeadPosAttr = meteorHeadGeo.getAttribute('position') as THREE.BufferAttribute;
    const meteorHeadAlphaAttr = meteorHeadGeo.getAttribute('aAlpha') as THREE.BufferAttribute;

    const spawnMeteor = () => {
      const m = meteors.find((mm) => !mm.active);
      if (!m) return;
      const z = -(250 + Math.random() * 550);
      const az = Math.abs(z);
      m.z = z;
      // Start in the upper half, streak diagonally down-left or down-right.
      m.x = (Math.random() - 0.5) * 2 * az * 0.55;
      m.y = (0.15 + Math.random() * 0.5) * az * 0.6;
      const dirX = (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.45);
      const dirY = -(0.35 + Math.random() * 0.5);
      const norm = Math.hypot(dirX, dirY);
      const speed = az * (0.8 + Math.random() * 0.7);
      m.vx = (dirX / norm) * speed;
      m.vy = (dirY / norm) * speed;
      m.len = speed * 0.22;
      m.life = 0;
      m.ttl = 0.7 + Math.random() * 0.7;
      m.active = true;
    };

    const updateMeteors = (dt: number) => {
      let anyActive = false;
      for (let i = 0; i < METEOR_MAX; i++) {
        const m = meteors[i];
        const b = i * 6;
        if (m.active) {
          m.life += dt;
          if (m.life >= m.ttl) m.active = false;
        }
        if (!m.active) {
          meteorTailAlpha[i * 2] = 0;
          meteorTailAlpha[i * 2 + 1] = 0;
          meteorHeadAlpha[i] = 0;
          continue;
        }
        anyActive = true;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const t = m.life / m.ttl;
        const a = Math.pow(Math.sin(Math.PI * Math.min(t, 1)), 0.7);
        const inv = 1 / Math.hypot(m.vx, m.vy);
        const tail = m.len * (0.35 + 0.65 * t); // tail stretches as it burns
        const tx = m.x - m.vx * inv * tail;
        const ty = m.y - m.vy * inv * tail;
        meteorTailPos[b] = m.x;
        meteorTailPos[b + 1] = m.y;
        meteorTailPos[b + 2] = m.z;
        meteorTailPos[b + 3] = tx;
        meteorTailPos[b + 4] = ty;
        meteorTailPos[b + 5] = m.z;
        meteorTailAlpha[i * 2] = a;
        meteorTailAlpha[i * 2 + 1] = 0;
        meteorHeadPos[i * 3] = m.x;
        meteorHeadPos[i * 3 + 1] = m.y;
        meteorHeadPos[i * 3 + 2] = m.z;
        meteorHeadAlpha[i] = a;
      }
      meteorTails.visible = anyActive;
      meteorHeads.visible = anyActive;
      if (anyActive) {
        meteorTailPosAttr.needsUpdate = true;
        meteorTailAlphaAttr.needsUpdate = true;
        meteorHeadPosAttr.needsUpdate = true;
        meteorHeadAlphaAttr.needsUpdate = true;
      }
    };

    // --- Mouse parallax ---
    let targetX = 0;
    let targetY = 0;
    const onPointerMove = (e: PointerEvent) => {
      targetX = e.clientX / window.innerWidth - 0.5;
      targetY = e.clientY / window.innerHeight - 0.5;
    };
    if (!prefersReducedMotion) window.addEventListener('pointermove', onPointerMove);

    // --- Resize ---
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      fieldMat.uniforms.uSizeScale.value = sizeScale();
      clusterMat.uniforms.uSizeScale.value = sizeScale();
      meteorHeadMat.uniforms.uSizeScale.value = sizeScale();
      if (prefersReducedMotion) renderer.render(scene, camera);
    };
    window.addEventListener('resize', onResize);

    // --- Warp jump state ---
    // warp eases toward warpTarget; a nav bump sets target=1 and a hold window,
    // after which target drops back to 0 and the field decelerates to cruise.
    let warp = 0;
    let warpTarget = 0;
    let warpHoldUntil = 0;
    const triggerWarp = () => {
      if (prefersReducedMotion) return;
      warpTarget = 1;
      warpHoldUntil = clock.elapsedTime + WARP_HOLD;
    };
    triggerWarpRef.current = triggerWarp;

    // --- Animation ---
    const clock = new THREE.Clock();
    let raf = 0;
    let contextLost = false;
    // Cap the frame rate on mobile to save battery/GPU; the slow cruise looks
    // identical at 30fps. Desktop runs uncapped for the smoothest parallax.
    const minDelta = isMobile ? 1 / 30 : 0;
    let acc = 0;
    const renderFrame = () => {
      raf = requestAnimationFrame(renderFrame);
      const delta = clock.getDelta();
      if (minDelta > 0) {
        acc += delta;
        if (acc < minDelta) return;
      }
      const dt = Math.min(minDelta > 0 ? acc : delta, 0.05);
      acc = 0;

      // Advance the warp envelope: fast attack up to the hold window, then decay.
      if (warpTarget === 1 && clock.elapsedTime >= warpHoldUntil) warpTarget = 0;
      const wRate = warpTarget > warp ? WARP_ATTACK : WARP_DECAY;
      warp += (warpTarget - warp) * Math.min(1, wRate * dt);
      if (warpTarget === 0 && warp < 0.0005) warp = 0;
      const warpEased = warp * warp * (3 - 2 * warp); // smoothstep
      const step = (cruiseSpeed + warpEased * (WARP_SPEED - cruiseSpeed)) * dt;

      for (let i = 0; i < FIELD_STARS; i++) {
        const zi = i * 3 + 2;
        fieldPos[zi] += step;
        if (fieldPos[zi] > NEAR) placeFieldStar(i, FAR);
      }
      fieldPosAttr.needsUpdate = true;

      // Drive the warp streaks + dim the round stars while warping.
      fieldMat.uniforms.uWarpFade.value = 1 - 0.82 * warpEased;
      clusterMat.uniforms.uWarpFade.value = 1 - 0.82 * warpEased;
      fieldMat.uniforms.uTime.value = clock.elapsedTime;
      clusterMat.uniforms.uTime.value = clock.elapsedTime;
      streakMat.uniforms.uWarp.value = warpEased;
      streakMat.uniforms.uStreakLen.value = warpEased * STREAK_MAX;
      if (warp > 0.001) {
        streaks.visible = true;
        for (let i = 0; i < FIELD_STARS; i++) {
          const px = fieldPos[i * 3];
          const py = fieldPos[i * 3 + 1];
          const pz = fieldPos[i * 3 + 2];
          const b = i * 6;
          streakPos[b] = px;
          streakPos[b + 1] = py;
          streakPos[b + 2] = pz;
          streakPos[b + 3] = px;
          streakPos[b + 4] = py;
          streakPos[b + 5] = pz;
        }
        streakPosAttr.needsUpdate = true;
      } else {
        streaks.visible = false;
      }

      let colorDirty = false;
      for (let k = 0; k < CLUSTER_COUNT; k++) {
        const c = clusters[k];
        c.z += step;
        if (c.z - c.size * 0.5 > NEAR) {
          regenCluster(k);
          colorDirty = true;
        }
      }
      writeClusterPositions();
      clusterPosAttr.needsUpdate = true;
      if (colorDirty) {
        clusterColorAttr.needsUpdate = true;
        clusterSizeAttr.needsUpdate = true;
      }

      // Galaxies drift by slower (parallax says "much farther away").
      for (const g of galaxies) {
        g.z += step * GALAXY_SPEED;
        g.mesh.rotation.z += g.spin * dt;
        if (g.z - g.size * 0.5 > NEAR) regenGalaxy(g, FAR);
      }
      writeGalaxyPositions();

      // Shooting stars (not during warp — streaks own that moment).
      meteorWait -= dt;
      if (meteorWait <= 0 && warpEased < 0.05) {
        spawnMeteor();
        meteorWait = METEOR_MIN_WAIT + Math.random() * METEOR_RAND_WAIT;
      }
      updateMeteors(dt);

      camera.position.x += (targetX * 26 - camera.position.x) * 0.03;
      camera.position.y += (-targetY * 26 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, -600);

      renderer.render(scene, camera);
    };

    if (prefersReducedMotion) {
      camera.lookAt(0, 0, -600);
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(renderFrame);
    }

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf && !prefersReducedMotion && !contextLost) {
        clock.getDelta();
        acc = 0;
        raf = requestAnimationFrame(renderFrame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Survive a lost GL context. If the browser ever drops this context (e.g.
    // too many contexts elsewhere), pause and — once restored — resume. Calling
    // preventDefault() opts into restoration; three.js re-uploads its resources
    // on the next render, so the field comes back instead of staying black.
    // Baked textures live in render targets, so they must be re-rendered too.
    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onContextRestored = () => {
      contextLost = false;
      // Rebake every nebula/galaxy — RT contents don't survive context loss.
      for (let k = 0; k < CLUSTER_COUNT; k++) {
        const keepZ = clusters[k].z;
        regenCluster(k);
        clusters[k].z = keepZ;
      }
      for (const g of galaxies) bakeGalaxy(g);
      if (prefersReducedMotion) {
        camera.lookAt(0, 0, -600);
        renderer.render(scene, camera);
      } else if (!raf && !document.hidden) {
        clock.getDelta();
        acc = 0;
        raf = requestAnimationFrame(renderFrame);
      }
    };
    canvas.addEventListener('webglcontextlost', onContextLost as EventListener);
    canvas.addEventListener('webglcontextrestored', onContextRestored as EventListener);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost as EventListener);
      canvas.removeEventListener('webglcontextrestored', onContextRestored as EventListener);
      fieldGeo.dispose();
      fieldMat.dispose();
      streakGeo.dispose();
      streakMat.dispose();
      clusterGeo.dispose();
      clusterMat.dispose();
      meteorTailGeo.dispose();
      meteorTailMat.dispose();
      meteorHeadGeo.dispose();
      meteorHeadMat.dispose();
      planeGeo.dispose();
      for (const m of gasMats) m.dispose();
      for (const t of gasTargets) t.dispose();
      for (const g of galaxies) {
        g.mat.dispose();
        g.target.dispose();
      }
      nebBakeMat.dispose();
      galaxyBakeMat.dispose();
      bakeQuad.geometry.dispose();
      rt.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      triggerWarpRef.current = null;
      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, []);

  // Fire a warp jump whenever the route (warpSignal) changes. The scene itself
  // is never rebuilt, so the field keeps flowing across page transitions.
  useEffect(() => {
    if (warpSignal === lastSignal.current) return;
    lastSignal.current = warpSignal;
    triggerWarpRef.current?.();
  }, [warpSignal]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-0" style={{ background: '#000' }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: SPACE_VIGNETTE }} />
    </div>
  );
};

export default SpaceBackground;
