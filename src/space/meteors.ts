import * as THREE from 'three';
import type { SpaceCtx } from './types';

/*
 * Shooting stars: a small pool of head+tail meteors on random timers. Each
 * meteor streaks diagonally down-left or down-right from the upper half of
 * the frame, fading in/out over its lifetime. Spawning is gated by the warp
 * state at the call site — meteors don't spawn while the field is streaking
 * (see `update`'s `warpEased` gate).
 */

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

export type Meteors = {
  group: THREE.Object3D;
  /** Advance timers/positions by `dt`; spawns a new meteor when the wait
   *  elapses and `warpEased` is below the spawn gate (streaks own that moment). */
  update: (dt: number, warpEased: number) => void;
  /** Rescale the meteor-head material for the current viewport (call on resize). */
  onResize: (sizeScale: number) => void;
  dispose: () => void;
};

export function createMeteors(
  ctx: SpaceCtx,
  opts: {
    max: number;
    minWait: number;
    randWait: number;
    // Accepted for interface symmetry with the other src/space/ builders;
    // current meteor placement/lifetime math doesn't depend on scene depth.
    far: number;
    near: number;
    sizeScale: number;
    pixelRatio: number;
  },
): Meteors {
  const { rng } = ctx;
  const { max, minWait, randWait } = opts;

  const group = new THREE.Group();

  const meteors: Meteor[] = Array.from({ length: max }, () => ({
    active: false, x: 0, y: 0, z: -400, vx: 0, vy: 0, len: 0, life: 0, ttl: 1,
  }));
  let meteorWait = minWait + rng() * randWait;

  const meteorTailPos = new Float32Array(max * 2 * 3);
  const meteorTailAlpha = new Float32Array(max * 2);
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
  group.add(meteorTails);

  const meteorHeadPos = new Float32Array(max * 3);
  const meteorHeadAlpha = new Float32Array(max);
  const meteorHeadGeo = new THREE.BufferGeometry();
  meteorHeadGeo.setAttribute('position', new THREE.BufferAttribute(meteorHeadPos, 3));
  meteorHeadGeo.setAttribute('aAlpha', new THREE.BufferAttribute(meteorHeadAlpha, 1));
  const meteorHeadMat = new THREE.ShaderMaterial({
    uniforms: {
      uSizeScale: { value: opts.sizeScale },
      uPixelRatio: { value: opts.pixelRatio },
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
  group.add(meteorHeads);

  const meteorTailPosAttr = meteorTailGeo.getAttribute('position') as THREE.BufferAttribute;
  const meteorTailAlphaAttr = meteorTailGeo.getAttribute('aAlpha') as THREE.BufferAttribute;
  const meteorHeadPosAttr = meteorHeadGeo.getAttribute('position') as THREE.BufferAttribute;
  const meteorHeadAlphaAttr = meteorHeadGeo.getAttribute('aAlpha') as THREE.BufferAttribute;

  const spawnMeteor = () => {
    const m = meteors.find((mm) => !mm.active);
    if (!m) return;
    const z = -(250 + rng() * 550);
    const az = Math.abs(z);
    m.z = z;
    // Start in the upper half, streak diagonally down-left or down-right.
    m.x = (rng() - 0.5) * 2 * az * 0.55;
    m.y = (0.15 + rng() * 0.5) * az * 0.6;
    const dirX = (rng() < 0.5 ? -1 : 1) * (0.55 + rng() * 0.45);
    const dirY = -(0.35 + rng() * 0.5);
    const norm = Math.hypot(dirX, dirY);
    const speed = az * (0.8 + rng() * 0.7);
    m.vx = (dirX / norm) * speed;
    m.vy = (dirY / norm) * speed;
    m.len = speed * 0.22;
    m.life = 0;
    m.ttl = 0.7 + rng() * 0.7;
    m.active = true;
  };

  const updateMeteors = (dt: number) => {
    let anyActive = false;
    for (let i = 0; i < max; i++) {
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

  const update = (dt: number, warpEased: number) => {
    // Shooting stars don't spawn during warp — streaks own that moment.
    meteorWait -= dt;
    if (meteorWait <= 0 && warpEased < 0.05) {
      spawnMeteor();
      meteorWait = minWait + rng() * randWait;
    }
    updateMeteors(dt);
  };

  const onResize = (sizeScale: number) => {
    meteorHeadMat.uniforms.uSizeScale.value = sizeScale;
  };

  const dispose = () => {
    meteorTailGeo.dispose();
    meteorTailMat.dispose();
    meteorHeadGeo.dispose();
    meteorHeadMat.dispose();
  };

  return { group, update, onResize, dispose };
}
