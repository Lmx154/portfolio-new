import type { GalaxyInstance } from './presets';
import {
  sampleExponentialDiskRadius,
  sampleSech2Height,
  sampleHernquistRadius,
  samplePowerLawBrightness,
  spiralArmAngle,
} from './sampling';

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
