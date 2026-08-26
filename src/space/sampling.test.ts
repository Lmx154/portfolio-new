import { describe, it, expect } from 'vitest';
import { makeRng } from './rng';
import {
  sampleExponentialDiskRadius,
  sampleSech2Height,
  sampleHernquistRadius,
  samplePlummerRadius,
  sampleInclination,
  sampleUnitVector,
  samplePowerLawBrightness,
  spiralArmAngle,
} from './sampling';

const N = 200000;

function moments(draw: () => number) {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < N; i++) {
    const v = draw();
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / N;
  return { mean, variance: sumSq / N - mean * mean };
}

function median(draw: () => number) {
  const xs = new Float64Array(N);
  for (let i = 0; i < N; i++) xs[i] = draw();
  xs.sort();
  return xs[N >> 1];
}

describe('sampleExponentialDiskRadius', () => {
  // Mass in an annulus goes as R*exp(-R/h), i.e. Gamma(2, h):
  // mean = 2h, variance = 2h^2.
  it('matches Gamma(2,h) moments', () => {
    const rng = makeRng(1);
    const h = 3;
    const { mean, variance } = moments(() => sampleExponentialDiskRadius(rng, h));
    expect(mean).toBeCloseTo(2 * h, 1);
    expect(variance / (2 * h * h)).toBeCloseTo(1, 1);
  });

  it('is always positive', () => {
    const rng = makeRng(2);
    for (let i = 0; i < 5000; i++) {
      expect(sampleExponentialDiskRadius(rng, 2)).toBeGreaterThan(0);
    }
  });
});

describe('sampleSech2Height', () => {
  // pdf ∝ sech²(z/z0) → mean 0, variance z0²·π²/12.
  it('matches sech-squared moments', () => {
    const rng = makeRng(3);
    const z0 = 2;
    const { mean, variance } = moments(() => sampleSech2Height(rng, z0));
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(variance).toBeCloseTo((z0 * z0 * Math.PI ** 2) / 12, 1);
  });

  it('is symmetric about zero', () => {
    const rng = makeRng(4);
    let positive = 0;
    for (let i = 0; i < N; i++) if (sampleSech2Height(rng, 1) > 0) positive++;
    expect(positive / N).toBeCloseTo(0.5, 2);
  });
});

describe('sampleHernquistRadius', () => {
  // Hernquist half-mass radius is exactly a(1 + sqrt(2)) ≈ 2.4142a.
  it('has the analytic half-mass radius', () => {
    const rng = makeRng(5);
    const a = 1;
    expect(median(() => sampleHernquistRadius(rng, a))).toBeCloseTo(a * (1 + Math.SQRT2), 1);
  });
});

describe('samplePlummerRadius', () => {
  // Plummer half-mass radius is a / sqrt(2^(2/3) - 1) ≈ 1.3048a.
  it('has the analytic half-mass radius', () => {
    const rng = makeRng(6);
    const a = 1;
    const expected = a / Math.sqrt(Math.cbrt(4) - 1);
    expect(median(() => samplePlummerRadius(rng, a))).toBeCloseTo(expected, 1);
  });
});

describe('sampleInclination', () => {
  // Random 3D orientation → cos(i) uniform. P(i > 80°) = cos(80°) ≈ 0.1736,
  // and only ~6% of disks land near face-on. This is what makes edge-on
  // galaxies appear at their real rate without a dedicated preset.
  it('produces edge-on views about 17% of the time', () => {
    const rng = makeRng(7);
    let edgeOn = 0;
    for (let i = 0; i < N; i++) {
      if (sampleInclination(rng) > (80 * Math.PI) / 180) edgeOn++;
    }
    expect(edgeOn / N).toBeCloseTo(Math.cos((80 * Math.PI) / 180), 2);
  });

  it('produces near-face-on views only about 6% of the time', () => {
    const rng = makeRng(8);
    let faceOn = 0;
    for (let i = 0; i < N; i++) {
      if (sampleInclination(rng) < (20 * Math.PI) / 180) faceOn++;
    }
    expect(faceOn / N).toBeCloseTo(1 - Math.cos((20 * Math.PI) / 180), 2);
  });

  it('stays within [0, pi/2]', () => {
    const rng = makeRng(9);
    for (let i = 0; i < 5000; i++) {
      const inc = sampleInclination(rng);
      expect(inc).toBeGreaterThanOrEqual(0);
      expect(inc).toBeLessThanOrEqual(Math.PI / 2);
    }
  });
});

describe('spiralArmAngle', () => {
  // A logarithmic spiral: theta = ln(R/R0) / tan(p).
  it('is zero at the reference radius', () => {
    expect(spiralArmAngle(1, 1, 0.3)).toBeCloseTo(0, 10);
  });

  it('winds further at smaller pitch angles', () => {
    const tight = Math.abs(spiralArmAngle(4, 1, (10 * Math.PI) / 180));
    const open = Math.abs(spiralArmAngle(4, 1, (25 * Math.PI) / 180));
    expect(tight).toBeGreaterThan(open);
  });
});

describe('samplePowerLawBrightness', () => {
  it('all draws land within [min, max]', () => {
    const rng = makeRng(10);
    const min = 0.6;
    const max = 3.2;
    const alpha = -2.35;
    for (let i = 0; i < 5000; i++) {
      const v = samplePowerLawBrightness(rng, min, max, alpha);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
  });

  it('with steep negative alpha the distribution is bottom-heavy', () => {
    const rng = makeRng(11);
    const min = 0.6;
    const max = 3.2;
    const alpha = -3; // Steep negative alpha
    const med = median(() => samplePowerLawBrightness(rng, min, max, alpha));
    const midpoint = (min + max) / 2;
    expect(med).toBeLessThan(midpoint);
  });

  it('alpha === -1 returns finite log-uniform values in range with correct median', () => {
    const rng = makeRng(12);
    const min = 0.6;
    const max = 3.2;
    const alpha = -1;
    const expectedMedian = Math.sqrt(min * max); // Geometric mean
    const med = median(() => samplePowerLawBrightness(rng, min, max, alpha));
    expect(med).toBeCloseTo(expectedMedian, 1);
    // Also check that all values are finite and in range
    for (let i = 0; i < 1000; i++) {
      const v = samplePowerLawBrightness(rng, min, max, alpha);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
  });
});

describe('sampleUnitVector', () => {
  it('every result has length 1', () => {
    const rng = makeRng(13);
    for (let i = 0; i < 5000; i++) {
      const [x, y, z] = sampleUnitVector(rng);
      const len = Math.sqrt(x * x + y * y + z * z);
      expect(len).toBeCloseTo(1, 10);
    }
  });

  it('does NOT cluster at the poles (z distribution is roughly uniform)', () => {
    const rng = makeRng(14);
    let sumZ = 0;
    let countAboveHalf = 0;
    for (let i = 0; i < N; i++) {
      const [, , z] = sampleUnitVector(rng);
      sumZ += z;
      if (Math.abs(z) > 0.5) countAboveHalf++;
    }
    const meanZ = sumZ / N;
    const fracAboveHalf = countAboveHalf / N;
    // If uniformly distributed on [-1, 1], mean should be 0
    expect(Math.abs(meanZ)).toBeLessThan(0.01);
    // Fraction with |z| > 0.5 should be about 0.5 (50% of the range)
    expect(fracAboveHalf).toBeCloseTo(0.5, 2);
  });
});
