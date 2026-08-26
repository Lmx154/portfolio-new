import * as THREE from 'three';
import type { GalaxyInstance } from './presets';
import {
  sampleExponentialDiskRadius,
  sampleSech2Height,
  sampleHernquistRadius,
  samplePowerLawBrightness,
  spiralArmAngle,
} from './sampling';
import { STAR_VERT, DUST_FRAG, makeStarMaterial } from './shaders';
import type { SpaceCtx, SpaceObject } from './types';

export type GalaxyGeometry = {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  nearHalf: Uint8Array;
  count: number;
};

/** Linear blend between two hex colours, returned as an rgb triple in 0..1. */
function mixHex(a: string, b: string, t: number): [number, number, number] {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  return [
    (ar + (br - ar) * t) / 255,
    (ag + (bg - ag) * t) / 255,
    (ab + (bb - ab) * t) / 255,
  ];
}

/**
 * Which side of the disk plane a point falls on once the disk is inclined.
 *
 * Three.js `makeRotationX(i)` maps (y, z) -> (y cos i - z sin i, y sin i + z cos i),
 * so a point's WORLD z after inclination is `y sin i + z cos i`. The camera sits
 * at the origin looking toward -z, so larger world z means nearer. Both terms
 * therefore carry the SAME sign — negating the y term mirrors the split, which
 * would put the dust layer behind the galaxy instead of in front of it.
 *
 * Orientation is fixed at spawn, so this is computed once here rather than
 * sorted every frame. Task 11 must apply the rotation as a POSITIVE
 * `rotation.x = inclination` for this to hold.
 */
function isNearHalf(y: number, z: number, inclination: number): boolean {
  return y * Math.sin(inclination) + z * Math.cos(inclination) > 0;
}

/**
 * Disk stars: exponential in radius, sech^2 in height, with azimuth biased onto
 * logarithmic spiral arms by rejection sampling.
 */
export function buildDiskPoints(
  rng: () => number,
  inst: GalaxyInstance,
  count: number,
  scaleLength: number,
): GalaxyGeometry {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const nearHalf = new Uint8Array(count);

  const z0 = scaleLength * inst.preset.heightRatio;
  const armCount = inst.arms;
  const armAmp = armCount > 0 ? 0.85 : 0;
  const maxRadius = scaleLength * 5;

  for (let i = 0; i < count; i++) {
    let radius = sampleExponentialDiskRadius(rng, scaleLength);
    // Keep the disk bounded. For Gamma(2,h) this truncates P(R>5h) = 6e^-5 =
    // 4.0% of draws, not a negligible tail: it pulls the mean radius from 2h to
    // about 1.90h. That is intentional (a hard visual edge beats a few stray
    // points at 8h) and the mean-radius test's [1.5h, 2.5h] band accommodates it.
    if (radius > maxRadius) radius = maxRadius * (0.5 + rng() * 0.5);

    let theta = rng() * Math.PI * 2;
    if (armCount > 0) {
      // Rejection-sample azimuth against 1 + A*cos(m*(theta - theta_arm(R))).
      // Arms widen outward, so the scatter grows with radius.
      const armTheta = spiralArmAngle(radius, scaleLength, inst.pitchRad);
      for (let tries = 0; tries < 8; tries++) {
        const candidate = rng() * Math.PI * 2;
        const phase = armCount * (candidate - armTheta);
        const p = (1 + armAmp * Math.cos(phase)) / (1 + armAmp);
        if (rng() < p) {
          theta = candidate;
          break;
        }
      }
      const spread = 0.12 + 0.10 * (radius / maxRadius);
      theta += (rng() - 0.5) * spread * Math.PI;
    }

    const x = radius * Math.cos(theta);
    const y = radius * Math.sin(theta);
    const z = sampleSech2Height(rng, z0);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    nearHalf[i] = isNearHalf(y, z, inst.inclination) ? 1 : 0;

    // Negative colour gradient: redder toward the centre (old, metal-rich),
    // bluer in the outer arms (young). This is a real, measurable gradient.
    const t = Math.min(1, radius / (scaleLength * 3));
    const [r, g, b] = mixHex(inst.preset.coreColor, inst.preset.armColor, t);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;

    // Luminosity function: many faint, few bright.
    sizes[i] = samplePowerLawBrightness(rng, 0.6, 3.2, -2.35);
  }

  return { positions, colors, sizes, nearHalf, count };
}

/**
 * Bulge stars: a Hernquist spheroid, optionally flattened. Crucially this is a
 * 3D spheroid, so inclination must NOT squash it — that mismatch is what made
 * the previous billboard implementation read as flat.
 */
export function buildBulgePoints(
  rng: () => number,
  inst: GalaxyInstance,
  count: number,
  scaleRadius: number,
): GalaxyGeometry {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const nearHalf = new Uint8Array(count);

  // Ellipticals flatten from E0 (round) toward E7; bulges stay fairly round.
  const flattening = inst.preset.cls === 'E' ? 0.4 + rng() * 0.6 : 0.7;
  const maxRadius = scaleRadius * 8;

  for (let i = 0; i < count; i++) {
    let radius = sampleHernquistRadius(rng, scaleRadius);
    // Hernquist has an infinite tail; clamp so a rare draw cannot escape.
    if (!Number.isFinite(radius) || radius > maxRadius) {
      radius = maxRadius * (0.4 + rng() * 0.6);
    }

    // Uniform direction on the sphere, then flatten along z.
    const cosPhi = rng() * 2 - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const lambda = rng() * Math.PI * 2;

    const x = radius * sinPhi * Math.cos(lambda);
    const y = radius * sinPhi * Math.sin(lambda);
    const z = radius * cosPhi * flattening;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    nearHalf[i] = isNearHalf(y, z, inst.inclination) ? 1 : 0;

    const [r, g, b] = mixHex(inst.preset.coreColor, '#ffb870', Math.min(1, radius / maxRadius));
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;

    sizes[i] = samplePowerLawBrightness(rng, 0.5, 2.2, -2.35);
  }

  return { positions, colors, sizes, nearHalf, count };
}

const EMPTY_GEOMETRY: GalaxyGeometry = {
  positions: new Float32Array(0),
  colors: new Float32Array(0),
  sizes: new Float32Array(0),
  nearHalf: new Uint8Array(0),
  count: 0,
};

/**
 * HII regions: the pink Hα knots strung along spiral arms.
 *
 * Star formation follows Kennicutt-Schmidt, Sigma_SFR ∝ Sigma_gas^1.4, and gas
 * piles up on the arm. Raising the arm response to that power is what makes
 * these cluster far more tightly than the disk stars do — beads on a string
 * rather than a smooth haze.
 */
export function buildHiiPoints(
  rng: () => number,
  inst: GalaxyInstance,
  count: number,
  scaleLength: number,
): GalaxyGeometry {
  if (inst.preset.hiiAbundance <= 0 || inst.arms <= 0) return EMPTY_GEOMETRY;

  const n = Math.round(count * inst.preset.hiiAbundance);
  if (n <= 0) return EMPTY_GEOMETRY;

  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const nearHalf = new Uint8Array(n);

  const z0 = scaleLength * inst.preset.heightRatio * 0.6;
  const maxRadius = scaleLength * 5;
  const KS_INDEX = 1.4;

  for (let i = 0; i < n; i++) {
    // Star formation is suppressed in the very centre and dies off outward.
    let radius = scaleLength * (0.6 + rng() * 3.4);
    if (radius > maxRadius) radius = maxRadius;

    const armTheta = spiralArmAngle(radius, scaleLength, inst.pitchRad);
    let theta = rng() * Math.PI * 2;
    for (let tries = 0; tries < 16; tries++) {
      const candidate = rng() * Math.PI * 2;
      const phase = inst.arms * (candidate - armTheta);
      const armResponse = (1 + Math.cos(phase)) / 2;
      if (rng() < Math.pow(armResponse, KS_INDEX)) {
        theta = candidate;
        break;
      }
    }
    theta += (rng() - 0.5) * 0.06 * Math.PI;

    const x = radius * Math.cos(theta);
    const y = radius * Math.sin(theta);
    const z = sampleSech2Height(rng, z0);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    nearHalf[i] = isNearHalf(y, z, inst.inclination) ? 1 : 0;

    // Hα pink, with hot blue OB associations mixed in alongside.
    const blue = rng() < 0.35;
    const [r, g, b] = blue ? mixHex('#a8c8ff', '#ff6a90', 0.2) : mixHex('#ff5a7a', '#ffc0d0', rng() * 0.5);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;

    sizes[i] = 1.4 + rng() * 2.6;
  }

  return { positions, colors, sizes, nearHalf, count: n };
}

/**
 * The stellar bar of an SB galaxy: a prolate concentration through the centre.
 * Arms start at the bar tips, which the disk builder already honours because
 * both use the same spiral phase reference.
 */
export function buildBarPoints(
  rng: () => number,
  inst: GalaxyInstance,
  count: number,
  scaleLength: number,
): GalaxyGeometry {
  if (!inst.preset.barred) return EMPTY_GEOMETRY;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const nearHalf = new Uint8Array(count);

  const halfLength = scaleLength * 1.6;
  const halfWidth = halfLength * 0.22;
  const z0 = scaleLength * inst.preset.heightRatio;

  for (let i = 0; i < count; i++) {
    // Gaussian along the bar, tighter Gaussian across it.
    const along = (rng() + rng() + rng() + rng() - 2) * halfLength * 0.6;
    const across = (rng() + rng() + rng() + rng() - 2) * halfWidth * 0.6;
    const z = sampleSech2Height(rng, z0);

    positions[i * 3] = along;
    positions[i * 3 + 1] = across;
    positions[i * 3 + 2] = z;
    nearHalf[i] = isNearHalf(across, z, inst.inclination) ? 1 : 0;

    const [r, g, b] = mixHex(inst.preset.coreColor, '#ffcf95', rng());
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;

    sizes[i] = samplePowerLawBrightness(rng, 0.5, 2.4, -2.35);
  }

  return { positions, colors, sizes, nearHalf, count };
}

/**
 * Dust: the dark lanes that silhouette against the light behind them.
 *
 * Two details make this read correctly. First, the dust layer is about half the
 * stellar scale height, so it forms a sharp lane rather than a haze. Second, it
 * sits slightly upstream of the stellar arm — density-wave theory has gas
 * shocking on the arm's concave edge with stars forming downstream, which is
 * why photographs show the lane on the inner edge.
 *
 * `colors` carries extinction strength here, not emission; the renderer draws
 * this set with a multiplying blend so it darkens what is already in the
 * framebuffer.
 */
export function buildDustPoints(
  rng: () => number,
  inst: GalaxyInstance,
  count: number,
  scaleLength: number,
): GalaxyGeometry {
  if (inst.preset.dustOpacity <= 0) return EMPTY_GEOMETRY;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const nearHalf = new Uint8Array(count);

  // Half the stellar scale height — dust settles further than stars do.
  const z0 = scaleLength * inst.preset.heightRatio * 0.5;
  // The dust disk is slightly more extended than the stellar disk.
  const dustScale = scaleLength * 1.15;
  const maxRadius = scaleLength * 5;
  // Upstream offset of the lane from the stellar arm crest, in radians.
  const LANE_OFFSET = -0.18;

  for (let i = 0; i < count; i++) {
    let radius = sampleExponentialDiskRadius(rng, dustScale);
    if (radius > maxRadius) radius = maxRadius * (0.5 + rng() * 0.5);

    let theta = rng() * Math.PI * 2;
    if (inst.arms > 0) {
      const armTheta = spiralArmAngle(radius, scaleLength, inst.pitchRad) + LANE_OFFSET;
      for (let tries = 0; tries < 8; tries++) {
        const candidate = rng() * Math.PI * 2;
        const phase = inst.arms * (candidate - armTheta);
        const p = (1 + 0.9 * Math.cos(phase)) / 1.9;
        if (rng() < p) {
          theta = candidate;
          break;
        }
      }
      theta += (rng() - 0.5) * 0.09 * Math.PI;
    }

    const x = radius * Math.cos(theta);
    const y = radius * Math.sin(theta);
    const z = sampleSech2Height(rng, z0);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    nearHalf[i] = isNearHalf(y, z, inst.inclination) ? 1 : 0;

    // Extinction strength, reddened: dust removes blue light first.
    const strength = inst.preset.dustOpacity * (0.5 + rng() * 0.5);
    colors[i * 3] = strength * 0.75;
    colors[i * 3 + 1] = strength * 0.9;
    colors[i * 3 + 2] = strength;

    sizes[i] = 2.5 + rng() * 4.0;
  }

  return { positions, colors, sizes, nearHalf, count };
}

// -----------------------------------------------------------------------
// Assembly: geometry -> a renderable SpaceObject
// -----------------------------------------------------------------------

/** A `GalaxyGeometry`-shaped bag of points, partitioned by `nearHalf`. */
type PointBag = { positions: Float32Array; colors: Float32Array; sizes: Float32Array; count: number };

/**
 * Partition a `GalaxyGeometry` into its near and far halves. `GalaxyGeometry`
 * is treated as read-only here (several builders return the shared
 * `EMPTY_GEOMETRY` singleton by reference) — this always allocates fresh
 * typed arrays rather than mutating the input.
 */
function splitByNearHalf(geo: GalaxyGeometry): { near: PointBag; far: PointBag } {
  let nearCount = 0;
  for (let i = 0; i < geo.count; i++) if (geo.nearHalf[i]) nearCount++;
  const farCount = geo.count - nearCount;

  const near: PointBag = {
    positions: new Float32Array(nearCount * 3),
    colors: new Float32Array(nearCount * 3),
    sizes: new Float32Array(nearCount),
    count: nearCount,
  };
  const far: PointBag = {
    positions: new Float32Array(farCount * 3),
    colors: new Float32Array(farCount * 3),
    sizes: new Float32Array(farCount),
    count: farCount,
  };

  let ni = 0;
  let fi = 0;
  for (let i = 0; i < geo.count; i++) {
    const bag = geo.nearHalf[i] ? near : far;
    const j = geo.nearHalf[i] ? ni++ : fi++;
    bag.positions[j * 3] = geo.positions[i * 3];
    bag.positions[j * 3 + 1] = geo.positions[i * 3 + 1];
    bag.positions[j * 3 + 2] = geo.positions[i * 3 + 2];
    bag.colors[j * 3] = geo.colors[i * 3];
    bag.colors[j * 3 + 1] = geo.colors[i * 3 + 1];
    bag.colors[j * 3 + 2] = geo.colors[i * 3 + 2];
    bag.sizes[j] = geo.sizes[i];
  }

  return { near, far };
}

/** Build a `THREE.Points` from a bag, or `null` for an empty one (never add a zero-count object). */
function makePoints(bag: PointBag, material: THREE.ShaderMaterial): THREE.Points | null {
  if (bag.count === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(bag.positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(bag.colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(bag.sizes, 1));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

// Extinction only works if the dust is drawn after the light behind it and
// before the light in front of it. Additive passes commute, so each half needs
// only one renderOrder tier between them.
const FAR_TIER = 0; // additive: far disk, far bulge, far HII, far bar
const DUST_TIER = 1; // multiplying — darkens everything in FAR_TIER
const NEAR_TIER = 2; // additive: near disk, near bulge, near HII, near bar

/**
 * Assemble the five geometry builders into one renderable galaxy.
 *
 * Two things make the draw order correct:
 *
 * 1. Every star-emitting component (disk, bulge, HII, bar) splits into a far
 *    half and a near half; the dust — which darkens whatever is already in the
 *    framebuffer — is drawn as a single unsplit pass in between. Additive
 *    blending commutes, so ordering *within* a half never matters.
 * 2. Inclination and position angle are applied as TWO nested groups, not two
 *    rotations on one group. `isNearHalf()` above bakes in the assumption that
 *    a point's world z is exactly `y*sin(i) + z*cos(i)` — true only for a bare
 *    `makeRotationX(i)`. Three.js composes a single object's Euler as
 *    `Rx * Ry * Rz`, which applies the z-rotation (position angle) to the
 *    local point *before* the x-rotation and would fold position angle into
 *    that formula, silently invalidating every precomputed `nearHalf` flag for
 *    almost every instance (position angle is `rng() * 2*PI`, essentially
 *    never 0). Nesting an inner group (pure `rotation.x = inclination`,
 *    holding the points) inside an outer group (pure `rotation.z =
 *    positionAngle`) instead composes as `Rz * (Rx * v)`: the inner transform
 *    alone determines world z exactly as `isNearHalf` assumes, and the outer
 *    z-rotation — being a rotation about the axis it doesn't touch — leaves
 *    that z untouched while still spinning the galaxy's on-sky orientation.
 */
/**
 * The handle `createGalaxy`/`createGalaxyIncremental` return. Extends the
 * shared `SpaceObject` contract with one galaxy-only hook: `advance` drives
 * the star material's `uTime` uniform (per-point twinkle), which the nebula
 * and field starfields already advance from their own `setWarp`/`advance`
 * calls but which this module never wired up until now. This is deliberately
 * NOT folded into `SpaceObject` itself — the nebula/field/meteor handles have
 * no equivalent uniform to drive and shouldn't be forced to grow a no-op stub.
 */
/**
 * The handle `createGalaxy`/`createGalaxyIncremental` return. Extends the
 * shared `SpaceObject` contract with two galaxy-only hooks: `advance` drives
 * the star material's `uTime` uniform (per-point twinkle), and `setWarp`
 * dims the galaxy the same way `field.ts`/`nebula.ts` dim their own star
 * materials during a warp jump. Neither is folded into `SpaceObject` itself —
 * the nebula/field/meteor handles have no equivalent uniform to drive and
 * shouldn't be forced to grow a no-op stub.
 */
export type GalaxyHandle = SpaceObject & {
  advance: (elapsedTime: number) => void;
  setWarp: (warpEased: number) => void;
};

/**
 * Assemble five already-built `GalaxyGeometry` bags into one renderable
 * galaxy. Split out of `createGalaxy` so `createGalaxyIncremental` — which
 * builds the same five bags across many time-boxed steps instead of one
 * synchronous call — can share every bit of draw-order/material/disposal
 * logic below instead of duplicating it.
 */
function assembleGalaxy(
  ctx: SpaceCtx,
  inst: GalaxyInstance,
  worldSize: number,
  geos: {
    diskGeo: GalaxyGeometry;
    bulgeGeo: GalaxyGeometry;
    hiiGeo: GalaxyGeometry;
    barGeo: GalaxyGeometry;
    dustGeo: GalaxyGeometry;
  },
): GalaxyHandle {
  const { diskGeo, bulgeGeo, hiiGeo, barGeo, dustGeo } = geos;

  const diskHalves = splitByNearHalf(diskGeo);
  const bulgeHalves = splitByNearHalf(bulgeGeo);
  const hiiHalves = splitByNearHalf(hiiGeo);
  const barHalves = splitByNearHalf(barGeo);

  // The galaxy is a static object, not a recycling conveyor like the field
  // stars or nebula clouds — STAR_VERT's near/far depth fade exists for their
  // "approach the camera, wrap around" motion, which the galaxy has no
  // equivalent of. Push the thresholds well outside any point's local-space
  // coordinate (bounded by a handful of scale lengths, i.e. a fraction of
  // worldSize) so that fade evaluates to 1 everywhere and every point's
  // opacity is governed purely by `uOpacity`.
  const pixelRatio = ctx.renderer.getPixelRatio();
  const sizeScale = worldSize * 0.5;
  const minPx = 1.6;
  const far = -worldSize * 4;
  const near = worldSize * 4;
  const fadeIn = worldSize;
  const fadeOut = worldSize;

  const starMat = makeStarMaterial({ sizeScale, pixelRatio, minPx, near, far, fadeIn, fadeOut });
  const dustMat = new THREE.ShaderMaterial({
    uniforms: {
      uSizeScale: { value: sizeScale },
      uPixelRatio: { value: pixelRatio },
      uMinPx: { value: minPx },
      uNear: { value: near },
      uFar: { value: far },
      uFadeIn: { value: fadeIn },
      uFadeOut: { value: fadeOut },
      uWarpFade: { value: 1 },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: STAR_VERT,
    fragmentShader: DUST_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    // OneMinusSrcCOLOR, not OneMinusSrcAlpha: `result = dst * (1 - srcColor)`
    // attenuates each channel independently, so the per-channel extinction
    // buildDustPoints writes (r 0.75 / g 0.9 / b 1.0 of strength) actually
    // reaches the framebuffer and reddens the light behind the lane. With
    // OneMinusSrcAlpha the source colour is discarded entirely and dust darkens
    // neutrally — grey lanes instead of the brown ones real dust produces.
    blendDst: THREE.OneMinusSrcColorFactor,
  });

  // `inner` carries ONLY the inclination rotation, so isNearHalf's world-z
  // formula holds exactly (see the doc comment above). `outer` — the object
  // returned to the caller — carries only the position-angle spin on top.
  const inner = new THREE.Group();
  const outer = new THREE.Group();
  outer.add(inner);

  const geometries: THREE.BufferGeometry[] = [];

  const addHalf = (bag: PointBag, tier: number) => {
    const points = makePoints(bag, starMat);
    if (!points) return;
    points.renderOrder = tier;
    inner.add(points);
    geometries.push(points.geometry);
  };

  addHalf(diskHalves.far, FAR_TIER);
  addHalf(bulgeHalves.far, FAR_TIER);
  addHalf(hiiHalves.far, FAR_TIER);
  addHalf(barHalves.far, FAR_TIER);

  // Dust is drawn as a single unsplit pass between the two star tiers rather
  // than split into its own near/far halves — see the createGalaxy doc
  // comment.
  // Unlike the split components (which allocate fresh arrays in
  // splitByNearHalf), the dust pass is unsplit, so it can wrap dustGeo's
  // arrays directly — nothing here mutates them, and a zero-count dust
  // geometry is the shared EMPTY_GEOMETRY singleton, which never reaches
  // makePoints below.
  const dustPoints = makePoints(
    { positions: dustGeo.positions, colors: dustGeo.colors, sizes: dustGeo.sizes, count: dustGeo.count },
    dustMat,
  );
  if (dustPoints) {
    dustPoints.renderOrder = DUST_TIER;
    inner.add(dustPoints);
    geometries.push(dustPoints.geometry);
  }

  addHalf(diskHalves.near, NEAR_TIER);
  addHalf(bulgeHalves.near, NEAR_TIER);
  addHalf(hiiHalves.near, NEAR_TIER);
  addHalf(barHalves.near, NEAR_TIER);

  // Hard contract: this MUST be a positive rotation. isNearHalf() computes
  // world-z ordering assuming Three.js `makeRotationX(+inclination)`; negating
  // it would silently put every dust lane on the back of the galaxy.
  inner.rotation.x = inst.inclination;
  outer.rotation.z = inst.positionAngle;

  const setOpacity = (o: number) => {
    starMat.uniforms.uOpacity.value = o;
    dustMat.uniforms.uOpacity.value = o;
  };

  // Drives the same per-point twinkle the field starfield and nebula clouds
  // already animate via their own `uTime` uniforms (see STAR_VERT). Without
  // this the galaxy's twinkle sits frozen at t=0 for its entire time on screen.
  const advance = (elapsedTime: number) => {
    starMat.uniforms.uTime.value = elapsedTime;
    dustMat.uniforms.uTime.value = elapsedTime;
  };

  // Same warp-dim curve field.ts/nebula.ts already apply to their own star
  // materials (`1 - 0.82 * warpEased`) — without this the hero galaxy sat at
  // full brightness while everything else dimmed and streaked past.
  const setWarp = (warpEased: number) => {
    const warpFade = 1 - 0.82 * warpEased;
    starMat.uniforms.uWarpFade.value = warpFade;
    dustMat.uniforms.uWarpFade.value = warpFade;
  };

  const dispose = () => {
    for (const g of geometries) g.dispose();
    starMat.dispose();
    dustMat.dispose();
  };

  return { group: outer, setOpacity, dispose, advance, setWarp };
}

/**
 * Roll the fixed per-component point allocation for a `pointBudget`. Only
 * needs `isMobile`, not the rest of `SpaceCtx` — kept narrow so the ordered
 * component list below (and its tests) never need a `THREE.WebGLRenderer`.
 */
function galaxyBudget(isMobile: boolean, pointBudget: number) {
  // Fixed allocation across components, halved on mobile. buildHiiPoints
  // further scales its own share by hiiAbundance internally, so the 4% share
  // handed to it is a budget, not the eventual point count — do not pre-scale.
  const budget = isMobile ? Math.floor(pointBudget / 2) : pointBudget;
  return {
    diskCount: Math.round(budget * 0.58),
    bulgeCount: Math.round(budget * 0.25),
    dustCount: Math.round(budget * 0.12),
    hiiCount: Math.round(budget * 0.04),
    barCount: Math.round(budget * 0.01),
  };
}

/** One of the five point-generating components: how many points it wants and
 * how to build any given slice of that count. */
export type ComponentSpec = {
  key: 'disk' | 'bulge' | 'hii' | 'bar' | 'dust';
  count: number;
  build: (n: number) => GalaxyGeometry;
};

/**
 * The five components, in the EXACT order their outputs are drawn (see the
 * `assembleGalaxy` doc comment for why draw order matters) and — just as
 * importantly — the exact order they consume `ctx.rng()`. `createGalaxy` and
 * `createGalaxyIncremental` both derive their component list from this one
 * function instead of each hand-rolling their own sequence of build calls, so
 * the two can no longer silently diverge in what order they draw from the rng
 * stream (a real bug caught in Task 13 review: the incremental path had
 * settled into disk/bulge/dust/hii/bar while `createGalaxy` used
 * disk/bulge/hii/bar/dust — same point counts, different points, and a
 * `?spacelab` preview that no longer matched the live site for a given seed).
 *
 * Deliberately typed to need only `rng`/`isMobile`, not a full `SpaceCtx` —
 * building geometry never touches the renderer, and keeping this signature
 * narrow is what lets it be unit-tested without a `THREE.WebGLRenderer` (this
 * project's tests run in a DOM-less node environment; see vitest.config.ts).
 */
export function galaxyComponentSpecs(
  ctxLike: { rng: () => number; isMobile: boolean },
  inst: GalaxyInstance,
  worldSize: number,
  pointBudget: number,
): ComponentSpec[] {
  const { rng } = ctxLike;
  const { diskCount, bulgeCount, dustCount, hiiCount, barCount } = galaxyBudget(ctxLike.isMobile, pointBudget);

  // Disk exponential scale length as a fraction of the requested world size.
  // `worldSize` is authoritative for overall size — per-instance jitter (e.g.
  // `inst.scale`) is the caller's job, folded into `worldSize` before it gets
  // here, not reapplied inside this function. The bulge's Hernquist radius is
  // a smaller fraction of that, since real bulges are far more compact than
  // the disk they sit inside.
  const scaleLength = worldSize * 0.14;
  const scaleRadius = scaleLength * 0.3;

  return [
    { key: 'disk', count: diskCount, build: (n) => buildDiskPoints(rng, inst, n, scaleLength) },
    { key: 'bulge', count: bulgeCount, build: (n) => buildBulgePoints(rng, inst, n, scaleRadius) },
    { key: 'hii', count: hiiCount, build: (n) => buildHiiPoints(rng, inst, n, scaleLength) },
    { key: 'bar', count: barCount, build: (n) => buildBarPoints(rng, inst, n, scaleLength) },
    { key: 'dust', count: dustCount, build: (n) => buildDustPoints(rng, inst, n, scaleLength) },
  ];
}

function geosByKey(specs: { key: ComponentSpec['key']; geo: GalaxyGeometry }[]) {
  const byKey = Object.fromEntries(specs.map((s) => [s.key, s.geo])) as Record<ComponentSpec['key'], GalaxyGeometry>;
  return {
    diskGeo: byKey.disk,
    bulgeGeo: byKey.bulge,
    hiiGeo: byKey.hii,
    barGeo: byKey.bar,
    dustGeo: byKey.dust,
  };
}

export function createGalaxy(
  ctx: SpaceCtx,
  opts: {
    instance: GalaxyInstance;
    worldSize: number;
    pointBudget: number;
  },
): GalaxyHandle {
  const { instance: inst, worldSize } = opts;
  const specs = galaxyComponentSpecs(ctx, inst, worldSize, opts.pointBudget);
  const geos = geosByKey(specs.map((spec) => ({ key: spec.key, geo: spec.build(spec.count) })));
  return assembleGalaxy(ctx, inst, worldSize, geos);
}

/** Merge several same-shaped `GalaxyGeometry` chunks, built independently, into one. */
function concatGeometry(chunks: GalaxyGeometry[]): GalaxyGeometry {
  let total = 0;
  for (const c of chunks) total += c.count;
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const nearHalf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    positions.set(c.positions, offset * 3);
    colors.set(c.colors, offset * 3);
    sizes.set(c.sizes, offset);
    nearHalf.set(c.nearHalf, offset);
    offset += c.count;
  }
  return { positions, colors, sizes, nearHalf, count: total };
}

// Points per sub-batch while chunk-building a galaxy incrementally. Measured
// (see task-13-report.md): `buildDiskPoints` — the heaviest of the five, since
// it parses two hex colours per point via `mixHex` — costs roughly
// 0.35-0.45us/point, so a 6000-point batch runs ~2-3ms: comfortably inside a
// single frame even stacked with the rest of the scene's per-frame work.
const BUILD_BATCH = 6000;

function makeBatchSizes(total: number): number[] {
  const sizes: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const n = Math.min(BUILD_BATCH, remaining);
    sizes.push(n);
    remaining -= n;
  }
  return sizes;
}

/**
 * Build one component's full geometry across `BUILD_BATCH`-sized sub-batches
 * instead of one call, concatenating the results. Splitting a component's
 * `count` into smaller calls against the SAME `rng` stream and concatenating
 * in order produces byte-identical output to one `spec.build(spec.count)`
 * call — each sub-batch only ever indexes its own freshly-allocated output
 * arrays, so the point-generation loop can't tell it's being resumed rather
 * than run once start-to-finish. `createGalaxyIncremental` relies on exactly
 * this property; `galaxy.test.ts` verifies it directly.
 */
function buildChunked(spec: ComponentSpec): GalaxyGeometry {
  return concatGeometry(makeBatchSizes(spec.count).map((n) => spec.build(n)));
}

/**
 * Same output as `createGalaxy` — bit-for-bit, given the same seed and
 * instance, because both derive their component list from the single
 * `galaxyComponentSpecs` above — built across many time-boxed `step()` calls
 * instead of one synchronous call. A full `createGalaxy` call allocates ~120k
 * points and measured 25-55ms of wall time on desktop (see task-13-report.md)
 * — a visible dropped frame or two if it runs inside a single
 * `requestAnimationFrame` callback. The hero scheduler spawns a galaxy while
 * it's still at `FAR`, where `fadeAt` is 0, so nothing is lost by spreading
 * the build across as many `step()` calls as it takes; the caller adds the
 * finished `group` to the scene only once `step()` returns non-null.
 */
export function createGalaxyIncremental(
  ctx: SpaceCtx,
  opts: {
    instance: GalaxyInstance;
    worldSize: number;
    pointBudget: number;
  },
): { step: (budgetMs: number) => GalaxyHandle | null } {
  const { instance: inst, worldSize } = opts;
  const specs = galaxyComponentSpecs(ctx, inst, worldSize, opts.pointBudget);

  type Job = { key: ComponentSpec['key']; chunks: GalaxyGeometry[]; queue: number[]; build: (n: number) => GalaxyGeometry };
  const jobs: Job[] = specs.map((spec) => ({
    key: spec.key,
    chunks: [],
    queue: makeBatchSizes(spec.count),
    build: spec.build,
  }));
  let jobIndex = 0;

  const step = (budgetMs: number): GalaxyHandle | null => {
    const start = performance.now();
    while (jobIndex < jobs.length) {
      const job = jobs[jobIndex];
      if (job.queue.length === 0) {
        jobIndex++;
        continue;
      }
      const n = job.queue.shift()!;
      job.chunks.push(job.build(n));
      if (performance.now() - start >= budgetMs) return null;
    }

    const geos = geosByKey(jobs.map((job) => ({ key: job.key, geo: concatGeometry(job.chunks) })));
    return assembleGalaxy(ctx, inst, worldSize, geos);
  };

  return { step };
}

// Exported for testing only — lets galaxy.test.ts verify that chunking a
// component's build doesn't change its output, without needing a
// `THREE.WebGLRenderer` (see `galaxyComponentSpecs`'s doc comment).
export const _internal = { buildChunked };
