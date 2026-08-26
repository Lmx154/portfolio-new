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
 * The disk's normal after inclination `i` about the x axis is (0, -sin i, cos i)
 * in view space, so the sign of that dot product separates the half nearer the
 * camera from the half behind. Orientation is fixed at spawn, so this is
 * computed once here rather than sorted every frame.
 */
function isNearHalf(y: number, z: number, inclination: number): boolean {
  return -y * Math.sin(inclination) + z * Math.cos(inclination) > 0;
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
    // Keep the disk bounded so a rare huge draw cannot stretch the object.
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
