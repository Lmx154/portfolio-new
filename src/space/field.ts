import * as THREE from 'three';
import { STREAK_VERT, STREAK_FRAG, makeStarMaterial } from './shaders';
import type { SpaceCtx } from './types';

/*
 * Field stars: the drifting starfield that fills the whole scene depth, plus
 * its warp-jump rendering mode. Each star is a point sprite that recycles
 * from `far` back to `near` as it drifts past the camera (see `advance`).
 *
 * Warp streaks are a second draw of the exact same star buffers — a line
 * per star (head at the star's position, tail trailing behind along the
 * travel axis) — so during a warp jump the round-point field fades out
 * (`uWarpFade`) while the streaks fade in. They are a rendering mode of the
 * starfield, not a separate system, which is why they live here rather than
 * in their own module.
 */

export type FieldStars = {
  group: THREE.Object3D;
  /** Advance stars by `step`, recycling any that pass `near`. */
  advance: (step: number) => void;
  /** Drive the warp envelope: star dim/twinkle time and streak stretch/visibility.
   *  `warp` is the raw (pre-easing) warp value; visibility gates on it rather
   *  than on `warpEased` to match the original un-extracted behaviour exactly. */
  setWarp: (warpEased: number, streakMax: number, warp: number) => void;
  /** Rescale the star material for the current viewport (call on resize). */
  onResize: (sizeScale: number) => void;
  dispose: () => void;
};

export function createFieldStars(
  ctx: SpaceCtx,
  opts: {
    count: number;
    spread: number;
    far: number;
    near: number;
    minPx: number;
    sizeScale: number;
    pixelRatio: number;
    fadeIn: number;
    fadeOut: number;
  },
): FieldStars {
  const { rng } = ctx;
  const { count, spread, far, near, minPx, fadeIn, fadeOut } = opts;

  const color = new THREE.Color();
  const group = new THREE.Group();

  // -----------------------------------------------------------------------
  // Field stars
  // -----------------------------------------------------------------------
  const fieldPos = new Float32Array(count * 3);
  const fieldColor = new Float32Array(count * 3);
  const fieldSize = new Float32Array(count);

  const placeFieldStar = (i: number, z: number) => {
    const az = Math.abs(z);
    fieldPos[i * 3] = (rng() - 0.5) * 2 * az * spread;
    fieldPos[i * 3 + 1] = (rng() - 0.5) * 2 * az * spread * 0.8;
    fieldPos[i * 3 + 2] = z;
  };
  const setFieldColor = (i: number) => {
    const roll = rng();
    if (roll < 0.62) color.setHSL(0, 0, 0.85 + rng() * 0.15);
    else if (roll < 0.82) color.setHSL(0.6, 0.45, 0.82);
    else if (roll < 0.92) color.setHSL(0.53, 0.5, 0.8);
    else if (roll < 0.98) color.setHSL(0.08, 0.55, 0.82);
    else color.setHSL(0.02, 0.6, 0.75);
    fieldColor[i * 3] = color.r;
    fieldColor[i * 3 + 1] = color.g;
    fieldColor[i * 3 + 2] = color.b;
    fieldSize[i] = rng() < 0.9 ? 1.1 + rng() * 1.7 : 3 + rng() * 2.5;
  };
  for (let i = 0; i < count; i++) {
    placeFieldStar(i, far + rng() * (near - far));
    setFieldColor(i);
  }
  const fieldGeo = new THREE.BufferGeometry();
  fieldGeo.setAttribute('position', new THREE.BufferAttribute(fieldPos, 3));
  fieldGeo.setAttribute('aColor', new THREE.BufferAttribute(fieldColor, 3));
  fieldGeo.setAttribute('aSize', new THREE.BufferAttribute(fieldSize, 1));
  const fieldMat = makeStarMaterial({
    sizeScale: opts.sizeScale,
    pixelRatio: opts.pixelRatio,
    minPx,
    near,
    far,
    fadeIn,
    fadeOut,
  });
  const points = new THREE.Points(fieldGeo, fieldMat);
  points.frustumCulled = false;
  group.add(points);
  const fieldPosAttr = fieldGeo.getAttribute('position') as THREE.BufferAttribute;

  // --- Warp streaks: a line per field star (head + trailing tail vertex) ---
  const streakPos = new Float32Array(count * 2 * 3);
  const streakEnd = new Float32Array(count * 2);
  const streakColor = new Float32Array(count * 2 * 3);
  for (let i = 0; i < count; i++) {
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
      uNear: { value: near },
      uFar: { value: far },
      uFadeIn: { value: fadeIn },
      uFadeOut: { value: fadeOut },
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
  group.add(streaks);
  const streakPosAttr = streakGeo.getAttribute('position') as THREE.BufferAttribute;

  const advance = (step: number) => {
    for (let i = 0; i < count; i++) {
      const zi = i * 3 + 2;
      fieldPos[zi] += step;
      if (fieldPos[zi] > near) placeFieldStar(i, far);
    }
    fieldPosAttr.needsUpdate = true;
  };

  const setWarp = (warpEased: number, streakMax: number, warp: number) => {
    fieldMat.uniforms.uWarpFade.value = 1 - 0.82 * warpEased;
    streakMat.uniforms.uWarp.value = warpEased;
    streakMat.uniforms.uStreakLen.value = warpEased * streakMax;
    if (warp > 0.001) {
      streaks.visible = true;
      for (let i = 0; i < count; i++) {
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
  };

  const onResize = (sizeScale: number) => {
    fieldMat.uniforms.uSizeScale.value = sizeScale;
  };

  const dispose = () => {
    fieldGeo.dispose();
    fieldMat.dispose();
    streakGeo.dispose();
    streakMat.dispose();
  };

  return { group, advance, setWarp, onResize, dispose };
}
