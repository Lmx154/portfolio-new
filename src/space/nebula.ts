import * as THREE from 'three';
import { QUAD_VERT, QUAD_FRAG, NEB_BAKE_FRAG, makeStarMaterial } from './shaders';
import type { SpaceCtx } from './types';

/*
 * Nebulae: soft, self-shadowed gas clouds. Each cloud is BAKED once into a
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
 */

// ---- Nebula presets (mix & match) -----------------------------------------
export const PALETTE_HEX: Record<string, string[]> = {
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
export type Structure = {
  scale: number;
  warp: number;
  coverage: number;
  softness: number;
  detail: number;
  contrast: number;
  intensity: number;
};
export const STRUCTURES: Structure[] = [
  { scale: 1.6, warp: 1.2, coverage: 0.38, softness: 0.34, detail: 1.0, contrast: 1.1, intensity: 1.0 },
  { scale: 2.2, warp: 0.9, coverage: 0.44, softness: 0.28, detail: 1.15, contrast: 1.2, intensity: 0.95 },
  { scale: 1.3, warp: 1.6, coverage: 0.34, softness: 0.4, detail: 0.9, contrast: 1.0, intensity: 1.05 },
  { scale: 1.9, warp: 1.1, coverage: 0.4, softness: 0.3, detail: 1.05, contrast: 1.15, intensity: 1.0 },
];

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

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

type Cloud = { x: number; y: number; z: number; size: number };

export type NebulaField = {
  group: THREE.Object3D;
  /** Star positions/colours/sizes, shared with the scene's point cloud. */
  points: THREE.Points;
  /** Advance clouds by `dz`, recycling any that pass `near`. */
  advance: (dz: number, fadeAt: (z: number) => number) => void;
  /** Drive the warp envelope: dims the cloud stars and advances their twinkle clock. */
  setWarp: (warpEased: number, elapsedTime: number) => void;
  /** Rebake all clouds after a WebGL context loss. */
  rebake: () => void;
  /** Rescale the star material for the current viewport (call on resize). */
  onResize: (sizeScale: number) => void;
  dispose: () => void;
};

export function createNebulaField(
  ctx: SpaceCtx,
  opts: {
    count: number;
    starsPerCloud: number;
    sampleRes: number;
    gasOpacity: number;
    far: number;
    near: number;
    sizeScale: number;
    pixelRatio: number;
    minPx: number;
    fadeIn: number;
    fadeOut: number;
  },
): NebulaField {
  const { renderer, bakeInto, makeTarget, isMobile, rng } = ctx;
  const { count, starsPerCloud, sampleRes, gasOpacity, far, near } = opts;

  const NEB_BAKE_RES = isMobile ? 512 : 1024;

  const color = new THREE.Color();
  const palettes = Object.values(PALETTE_HEX).map((stops) => stops.map(hexToRgb));
  const structures = STRUCTURES;

  const gauss3 = () => rng() + rng() + rng() - 1.5;

  const group = new THREE.Group();

  // -----------------------------------------------------------------------
  // Bake material + param rolling
  // -----------------------------------------------------------------------
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
    const a = Math.floor(rng() * palettes.length);
    let b = Math.floor(rng() * palettes.length);
    if (b === a) b = (a + 1) % palettes.length;
    const lightAngle = rng() * Math.PI * 2;
    // One dominant clump near the middle + two satellites drifting off it.
    const blobs = [
      { x: (rng() - 0.5) * 0.3, y: (rng() - 0.5) * 0.3, r: 0.45 + rng() * 0.2, a: 0.9 + rng() * 0.1 },
      { x: (rng() - 0.5) * 0.9, y: (rng() - 0.5) * 0.9, r: 0.22 + rng() * 0.2, a: 0.55 + rng() * 0.35 },
      { x: (rng() - 0.5) * 1.1, y: (rng() - 0.5) * 1.1, r: 0.16 + rng() * 0.18, a: 0.4 + rng() * 0.4 },
    ];
    return {
      palA: palettes[a],
      palB: palettes[b],
      st: structures[Math.floor(rng() * structures.length)],
      // Keep noise coords small so floor()/fract() stay precise on mobile GPUs.
      seedX: rng() * 6,
      seedY: rng() * 6,
      rot: rng() * Math.PI,
      anisoX: 0.6 + rng() * 0.9,
      anisoY: 0.6 + rng() * 0.9,
      lightX: Math.cos(lightAngle),
      lightY: Math.sin(lightAngle),
      blobs,
    };
  };

  // --- Offscreen sampler: rebake tiny + read back for star placement. ---
  const rt = new THREE.WebGLRenderTarget(sampleRes, sampleRes, { depthBuffer: false, stencilBuffer: false });
  const rtBuf = new Uint8Array(sampleRes * sampleRes * 4);
  const sampleNebula = () => {
    bakeInto(rt, nebBakeMat);
    renderer.readRenderTargetPixels(rt, 0, 0, sampleRes, sampleRes, rtBuf);
  };

  // -----------------------------------------------------------------------
  // Clouds: a baked nebula texture quad + stars sampled from it
  // -----------------------------------------------------------------------
  const clouds: Cloud[] = [];
  const gasMeshes: THREE.Mesh[] = [];
  const gasMats: THREE.ShaderMaterial[] = [];
  const gasTargets: THREE.WebGLRenderTarget[] = [];
  // Not shared with the legacy galaxy quads (which own their own plane) — this
  // trivial unit geometry has no tunable state, so duplicating it carries no
  // drift risk.
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

  for (let k = 0; k < count; k++) {
    const target = makeTarget(NEB_BAKE_RES);
    const mat = makeQuadMaterial(target.texture);
    const mesh = new THREE.Mesh(planeGeo, mat);
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    group.add(mesh);
    gasTargets.push(target);
    gasMeshes.push(mesh);
    gasMats.push(mat);
  }

  const cloudTotal = count * starsPerCloud;
  const cloudPos = new Float32Array(cloudTotal * 3);
  const cloudOffset = new Float32Array(cloudTotal * 3);
  const cloudColor = new Float32Array(cloudTotal * 3);
  const cloudSize = new Float32Array(cloudTotal);

  const regenCloud = (k: number) => {
    const z = far;
    const az = Math.abs(z);
    const c: Cloud = {
      x: (rng() - 0.5) * 2 * az * 0.4,
      y: (rng() - 0.5) * 2 * az * 0.32,
      z,
      size: 800 + rng() * 800,
    };
    clouds[k] = c;

    const P = randomParams();
    applyNebulaParams(P);
    // Bake the cloud once into this cloud's texture; the per-frame cost
    // of the nebula is then a single texture fetch.
    bakeInto(gasTargets[k], nebBakeMat);
    gasMeshes[k].scale.set(c.size, c.size, 1);

    // Rebake tiny, then importance-sample stars from that exact output.
    sampleNebula();
    const span = c.size;
    const R = sampleRes;
    for (let j = 0; j < starsPerCloud; j++) {
      const gi = k * starsPerCloud + j;
      let bx = 0;
      let by = 0;
      let dens = 0;
      for (let tries = 0; tries < 12; tries++) {
        bx = (rng() * R) | 0;
        by = (rng() * R) | 0;
        dens = rtBuf[(by * R + bx) * 4 + 3] / 255;
        if (dens > rng() * 0.8) break;
      }
      cloudOffset[gi * 3] = ((bx + 0.5) / R - 0.5) * span;
      cloudOffset[gi * 3 + 1] = ((by + 0.5) / R - 0.5) * span;
      cloudOffset[gi * 3 + 2] = gauss3() * span * 0.12;

      const pi = (by * R + bx) * 4;
      if (rng() < 0.12) {
        color.setHSL(0, 0, 0.9 + rng() * 0.1);
      } else {
        const boost = 0.6 + rng() * 0.7;
        color.setRGB(
          Math.min(1, (rtBuf[pi] / 255) * boost + 0.12),
          Math.min(1, (rtBuf[pi + 1] / 255) * boost + 0.12),
          Math.min(1, (rtBuf[pi + 2] / 255) * boost + 0.12),
        );
      }
      cloudColor[gi * 3] = color.r;
      cloudColor[gi * 3 + 1] = color.g;
      cloudColor[gi * 3 + 2] = color.b;
      const big = rng() < (dens > 0.6 ? 0.14 : 0.05);
      cloudSize[gi] = big ? 2.2 + rng() * 1.8 : 0.7 + rng() * 1.2;
    }
  };

  for (let k = 0; k < count; k++) {
    regenCloud(k);
    clouds[k].z = far + rng() * (near - far);
  }

  const cloudGeo = new THREE.BufferGeometry();
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(cloudPos, 3));
  cloudGeo.setAttribute('aColor', new THREE.BufferAttribute(cloudColor, 3));
  cloudGeo.setAttribute('aSize', new THREE.BufferAttribute(cloudSize, 1));
  const cloudMat = makeStarMaterial({
    sizeScale: opts.sizeScale,
    pixelRatio: opts.pixelRatio,
    minPx: opts.minPx,
    near,
    far,
    fadeIn: opts.fadeIn,
    fadeOut: opts.fadeOut,
  });
  const points = new THREE.Points(cloudGeo, cloudMat);
  points.frustumCulled = false;
  group.add(points);

  const cloudPosAttr = cloudGeo.getAttribute('position') as THREE.BufferAttribute;
  const cloudColorAttr = cloudGeo.getAttribute('aColor') as THREE.BufferAttribute;
  const cloudSizeAttr = cloudGeo.getAttribute('aSize') as THREE.BufferAttribute;

  const writeCloudPositions = (fadeAt: (z: number) => number) => {
    for (let k = 0; k < count; k++) {
      const c = clouds[k];
      gasMeshes[k].position.set(c.x, c.y, c.z);
      const op = gasOpacity * fadeAt(c.z);
      gasMats[k].uniforms.uOpacity.value = op;
      gasMeshes[k].visible = op > 0.003;
      for (let j = 0; j < starsPerCloud; j++) {
        const gi = k * starsPerCloud + j;
        cloudPos[gi * 3] = c.x + cloudOffset[gi * 3];
        cloudPos[gi * 3 + 1] = c.y + cloudOffset[gi * 3 + 1];
        cloudPos[gi * 3 + 2] = c.z + cloudOffset[gi * 3 + 2];
      }
    }
  };

  const advance = (dz: number, fadeAt: (z: number) => number) => {
    let colorDirty = false;
    for (let k = 0; k < count; k++) {
      const c = clouds[k];
      c.z += dz;
      if (c.z - c.size * 0.5 > near) {
        regenCloud(k);
        colorDirty = true;
      }
    }
    writeCloudPositions(fadeAt);
    cloudPosAttr.needsUpdate = true;
    if (colorDirty) {
      cloudColorAttr.needsUpdate = true;
      cloudSizeAttr.needsUpdate = true;
    }
  };

  const setWarp = (warpEased: number, elapsedTime: number) => {
    cloudMat.uniforms.uWarpFade.value = 1 - 0.82 * warpEased;
    cloudMat.uniforms.uTime.value = elapsedTime;
  };

  const rebake = () => {
    // Rebake every cloud — render-target contents don't survive context loss.
    for (let k = 0; k < count; k++) {
      const keepZ = clouds[k].z;
      regenCloud(k);
      clouds[k].z = keepZ;
    }
  };

  const onResize = (sizeScale: number) => {
    cloudMat.uniforms.uSizeScale.value = sizeScale;
  };

  const dispose = () => {
    cloudGeo.dispose();
    cloudMat.dispose();
    planeGeo.dispose();
    for (const m of gasMats) m.dispose();
    for (const t of gasTargets) t.dispose();
    nebBakeMat.dispose();
    rt.dispose();
  };

  return { group, points, advance, setWarp, rebake, onResize, dispose };
}
