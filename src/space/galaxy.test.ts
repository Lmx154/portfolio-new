import { describe, it, expect } from 'vitest';
import { makeRng } from './rng';
import { sampleInclination } from './sampling';
import { GALAXY_PRESETS, type GalaxyInstance } from './presets';
import { buildDiskPoints, buildBulgePoints } from './galaxy';

function instanceOf(cls: keyof typeof GALAXY_PRESETS, seed: number): GalaxyInstance {
  const rng = makeRng(seed);
  const preset = GALAXY_PRESETS[cls];
  const [lo, hi] = preset.pitchDeg;
  const pitchDeg = lo + rng() * (hi - lo);
  return {
    preset,
    pitchRad: (pitchDeg * Math.PI) / 180,
    arms: preset.arms[Math.floor(rng() * preset.arms.length)],
    bulgeFraction: preset.bulgeFraction,
    inclination: sampleInclination(rng),
    positionAngle: rng() * Math.PI * 2,
    scale: 1,
  };
}

describe('buildDiskPoints', () => {
  it('produces the requested number of points with matching buffer lengths', () => {
    const geo = buildDiskPoints(makeRng(1), instanceOf('Sb', 1), 5000, 10);
    expect(geo.count).toBe(5000);
    expect(geo.positions.length).toBe(5000 * 3);
    expect(geo.colors.length).toBe(5000 * 3);
    expect(geo.sizes.length).toBe(5000);
    expect(geo.nearHalf.length).toBe(5000);
  });

  it('is flat: thickness is far smaller than radial extent', () => {
    const h = 10;
    const geo = buildDiskPoints(makeRng(2), instanceOf('Sb', 2), 20000, h);
    let maxR = 0;
    let sumAbsZ = 0;
    for (let i = 0; i < geo.count; i++) {
      const x = geo.positions[i * 3];
      const y = geo.positions[i * 3 + 1];
      const z = geo.positions[i * 3 + 2];
      maxR = Math.max(maxR, Math.hypot(x, y));
      sumAbsZ += Math.abs(z);
    }
    const meanAbsZ = sumAbsZ / geo.count;
    expect(meanAbsZ).toBeLessThan(maxR * 0.1);
  });

  it('has a mean radius near the analytic 2h', () => {
    const h = 10;
    const geo = buildDiskPoints(makeRng(3), instanceOf('Sb', 3), 40000, h);
    let sumR = 0;
    for (let i = 0; i < geo.count; i++) {
      sumR += Math.hypot(geo.positions[i * 3], geo.positions[i * 3 + 1]);
    }
    expect(sumR / geo.count).toBeGreaterThan(h * 1.5);
    expect(sumR / geo.count).toBeLessThan(h * 2.5);
  });

  it('splits points into two non-empty halves', () => {
    const geo = buildDiskPoints(makeRng(4), instanceOf('Sb', 4), 10000, 10);
    let near = 0;
    for (let i = 0; i < geo.count; i++) if (geo.nearHalf[i]) near++;
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(geo.count);
  });

  it('puts the +y edge on the near side of an inclined disk', () => {
    // Direction test, not just a split test. Three.js R_x(i) sends (y=1, z=0)
    // to world z = +sin(i), and the camera looks toward -z, so the +y edge must
    // come out NEAR. A mirrored sign convention still produces two non-empty
    // halves, so only an assertion about WHICH half catches it — and getting it
    // backwards would render dust lanes on the far side of the galaxy.
    const inst = { ...instanceOf('Sb', 3), inclination: Math.PI / 2 };
    const geo = buildDiskPoints(makeRng(3), inst, 20000, 10);
    let nearPosY = 0;
    let nearNegY = 0;
    for (let i = 0; i < geo.count; i++) {
      if (!geo.nearHalf[i]) continue;
      if (geo.positions[i * 3 + 1] > 0) nearPosY++;
      else nearNegY++;
    }
    // Edge-on, the near half should be almost entirely the +y side.
    expect(nearPosY).toBeGreaterThan(nearNegY * 10);
  });

  it('is reproducible for a given seed', () => {
    const a = buildDiskPoints(makeRng(9), instanceOf('Sb', 9), 1000, 10);
    const b = buildDiskPoints(makeRng(9), instanceOf('Sb', 9), 1000, 10);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });

  it('concentrates points on arms for a spiral', () => {
    // Arm contrast: the densest azimuthal bin should clearly beat the sparsest
    // once radius is factored out. A featureless disk would be flat.
    const geo = buildDiskPoints(makeRng(5), instanceOf('Sc', 5), 40000, 10);
    const bins = new Array(36).fill(0);
    for (let i = 0; i < geo.count; i++) {
      const x = geo.positions[i * 3];
      const y = geo.positions[i * 3 + 1];
      const r = Math.hypot(x, y);
      if (r < 8 || r > 16) continue;
      let t = Math.atan2(y, x);
      if (t < 0) t += Math.PI * 2;
      bins[Math.floor((t / (Math.PI * 2)) * 36) % 36]++;
    }
    const max = Math.max(...bins);
    const min = Math.min(...bins);
    // Threshold calibrated against the shipped code, not guessed. A disk with
    // NO arms scores 1.24-1.30 (pure binning noise); armed disks score
    // 1.52-4.13 depending on how many arms the seed rolls (more arms spread
    // the density over more bins, so 4-arm seeds sit lowest). 1.4 sits clear of
    // the null without hugging the worst armed case.
    expect(max / min).toBeGreaterThan(1.4);
  });

  it('produces no azimuthal structure when the preset has no arms', () => {
    // The null case for the arm-contrast test above: an armless disk should
    // score at binning-noise level, well below the armed threshold. Without
    // this, a metric that always returned a high ratio would pass unnoticed.
    const geo = buildDiskPoints(makeRng(5), instanceOf('E', 5), 40000, 10);
    const bins = new Array(36).fill(0);
    for (let i = 0; i < geo.count; i++) {
      const x = geo.positions[i * 3];
      const y = geo.positions[i * 3 + 1];
      const r = Math.hypot(x, y);
      if (r < 8 || r > 16) continue;
      let t = Math.atan2(y, x);
      if (t < 0) t += Math.PI * 2;
      bins[Math.floor((t / (Math.PI * 2)) * 36) % 36]++;
    }
    expect(Math.max(...bins) / Math.min(...bins)).toBeLessThan(1.35);
  });

  it('produces no NaN coordinates', () => {
    const geo = buildDiskPoints(makeRng(6), instanceOf('Sb', 6), 5000, 10);
    for (let i = 0; i < geo.positions.length; i++) {
      expect(Number.isFinite(geo.positions[i])).toBe(true);
    }
  });
});

describe('buildBulgePoints', () => {
  it('produces the requested number of points', () => {
    const geo = buildBulgePoints(makeRng(7), instanceOf('Sa', 7), 3000, 4);
    expect(geo.count).toBe(3000);
    expect(geo.positions.length).toBe(3000 * 3);
  });

  it('is round, not flat: thickness is comparable to radial extent', () => {
    const inst = instanceOf('E', 8);
    const geo = buildBulgePoints(makeRng(8), inst, 20000, 4);
    let sumAbsZ = 0;
    let sumR = 0;
    for (let i = 0; i < geo.count; i++) {
      sumR += Math.hypot(geo.positions[i * 3], geo.positions[i * 3 + 1]);
      sumAbsZ += Math.abs(geo.positions[i * 3 + 2]);
    }
    // A spheroid keeps mean |z| within the same order as mean radius. This is
    // the invariant that separates a bulge from a disk, and the whole reason
    // inclination must not squash it.
    //
    // Analytically the ratio is 0.637 * flattening, and E-class flattening is
    // rolled in 0.4..1.0, so the true range is 0.25..0.64. The threshold sits
    // below that range rather than at its edge, so a flat-ish but still valid
    // elliptical does not fail the test.
    expect(sumAbsZ / geo.count).toBeGreaterThan((sumR / geo.count) * 0.2);
  });

  it('produces no NaN coordinates', () => {
    const geo = buildBulgePoints(makeRng(10), instanceOf('Sb', 10), 3000, 4);
    for (let i = 0; i < geo.positions.length; i++) {
      expect(Number.isFinite(geo.positions[i])).toBe(true);
    }
  });
});
