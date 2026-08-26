import * as THREE from 'three';

// ---- Shared noise GLSL ------------------------------------------------------
// Dave Hoskins "hash without sine": all intermediates stay small and bounded,
// so it survives lower-precision mobile GPU floats (no blocky breakdown).
export const NOISE_GLSL = /* glsl */ `
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

export const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ---- Nebula bake shader (runs ONCE per cloud, offscreen) --------------------
export const NEB_BAKE_FRAG = /* glsl */ `
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

export const QUAD_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D uMap;
  uniform float uOpacity;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    gl_FragColor = vec4(t.rgb, t.a * uOpacity);
  }
`;

// ---- Star shader (fades + min-size, no sub-pixel glitter) -------------------
export const STAR_VERT = /* glsl */ `
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
  uniform float uOpacity;
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
    // No twinkle: scintillation is refraction through Earth's atmosphere, and
    // this camera is in space. Animating per-star brightness here made ~100k
    // galaxy points and the field shimmer continuously at cruise, which reads
    // as noise rather than life.
    vAlpha = fade * (0.15 + 0.85 * small) * uWarpFade;
    vAlpha *= uOpacity;
    gl_PointSize = sizeCss * uPixelRatio;
  }
`;

export const STAR_FRAG = /* glsl */ `
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

/**
 * Dust points. Alpha carries extinction strength; the material multiplies the
 * framebuffer down rather than adding to it, so the lane silhouettes whatever
 * was drawn before it. Shares STAR_VERT, which declares `vAlpha` (not
 * `vFade`) — the varying names here must match or the program fails to link.
 */
export const DUST_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float soft = smoothstep(0.25, 0.0, r2);
    // Premultiplied: with OneMinusSrcColor the blend reads the COLOR, so the
    // soft radial falloff and the per-object opacity must be folded into it.
    gl_FragColor = vec4(vColor * soft * vAlpha, 1.0);
  }
`;

// ---- Star streak shader (warp jump) ----------------------------------------
// Each star becomes a 2-vertex line: the head sits at the star's position, the
// tail trails behind along the travel axis by uStreakLen. Alpha tapers from a
// bright head to a transparent tail (comet look) and scales with uWarp so the
// streaks fade in/out with the jump.
export const STREAK_VERT = /* glsl */ `
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

export const STREAK_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

// ---- Star material factory --------------------------------------------------
// Shared by the drifting field, per-cluster points, and (in later tasks) any
// other star-like point cloud. Takes its tunables as options instead of
// closing over renderer/scene state, so it can live outside the hero effect.
export function makeStarMaterial(opts: {
  sizeScale: number;
  pixelRatio: number;
  minPx: number;
  near: number;
  far: number;
  fadeIn: number;
  fadeOut: number;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSizeScale: { value: opts.sizeScale },
      uPixelRatio: { value: opts.pixelRatio },
      uMinPx: { value: opts.minPx },
      uNear: { value: opts.near },
      uFar: { value: opts.far },
      uFadeIn: { value: opts.fadeIn },
      uFadeOut: { value: opts.fadeOut },
      uWarpFade: { value: 1 },
      uOpacity: { value: 1 },
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
