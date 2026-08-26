import { describe, it, expect } from 'vitest';
import { makeRng } from './rng';
import { sampleInclination, spiralArmAngle } from './sampling';
import { GALAXY_PRESETS, type GalaxyInstance } from './presets';
import {
  buildDiskPoints,
  buildBulgePoints,
  buildHiiPoints,
  buildBarPoints,
  buildDustPoints,
  type GalaxyGeometry,
} from './galaxy';

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

  it('classifies near/far correctly at an intermediate inclination', () => {
    // Complements the edge-on test: at pi/4 both sin and cos are ~0.707, so this
    // pins that BOTH terms carry the same sign, not just the y term. A z-term
    // inversion (y*sin - z*cos) passes the edge-on test but fails this one.
    const inc = Math.PI / 4;
    const inst = { ...instanceOf('Sb', 4), inclination: inc };
    const geo = buildDiskPoints(makeRng(4), inst, 20000, 10);
    let agree = 0;
    for (let i = 0; i < geo.count; i++) {
      const y = geo.positions[i * 3 + 1];
      const z = geo.positions[i * 3 + 2];
      // Ground truth: world z after Three.js R_x(inc) is y*sin + z*cos.
      const worldZ = y * Math.sin(inc) + z * Math.cos(inc);
      if ((worldZ > 0) === (geo.nearHalf[i] === 1)) agree++;
    }
    expect(agree).toBe(geo.count);
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

describe('buildHiiPoints', () => {
  it('scales the requested budget by the preset HII abundance', () => {
    // `count` is a BUDGET, not an output size: buildHiiPoints returns
    // round(count * hiiAbundance) so a gas-rich Sc gets far more knots than a
    // quiescent Sa from the same budget. Expressed as a relationship rather
    // than a literal because presets.ts is the tuning surface — hardcoding the
    // product would break the moment someone retunes hiiAbundance.
    const budget = 2000;
    const geo = buildHiiPoints(makeRng(11), instanceOf('Sc', 11), budget, 10);
    expect(geo.count).toBe(Math.round(budget * GALAXY_PRESETS.Sc.hiiAbundance));
    expect(geo.count).toBeLessThan(budget);
  });

  it('clusters far more tightly on arms than the general disk', () => {
    // HII regions form where gas shocks on the arm, so their azimuthal
    // contrast must exceed that of the disk stars at the same radius.
    const inst = instanceOf('Sc', 12);
    const hii = buildHiiPoints(makeRng(12), inst, 20000, 10);
    const disk = buildDiskPoints(makeRng(12), inst, 20000, 10);

    const contrast = (geo: typeof hii) => {
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
      return Math.max(...bins) / Math.max(1, Math.min(...bins));
    };

    // Ratio, not a bare ">", and calibrated by mutation test. Dropping the
    // Kennicutt-Schmidt exponent (KS_INDEX 1.4 -> 1.0) still leaves HII more
    // clustered than the disk (5.048 vs 3.549), so `hii > disk` passes for the
    // broken build too. Measured ratios: correct 2.777, no-exponent mutant
    // 1.422. A bar of 2.0 separates them with ~39% margin above and ~29% below.
    expect(contrast(hii) / contrast(disk)).toBeGreaterThan(2.0);
  });

  it('is pink-dominated (red channel exceeds green)', () => {
    const geo = buildHiiPoints(makeRng(13), instanceOf('Sc', 13), 1000, 10);
    let r = 0;
    let g = 0;
    for (let i = 0; i < geo.count; i++) {
      r += geo.colors[i * 3];
      g += geo.colors[i * 3 + 1];
    }
    expect(r).toBeGreaterThan(g);
  });

  it('returns an empty set when the preset has no star formation', () => {
    const geo = buildHiiPoints(makeRng(14), instanceOf('E', 14), 2000, 10);
    expect(geo.count).toBe(0);
  });

  it('produces no NaN coordinates', () => {
    const geo = buildHiiPoints(makeRng(31), instanceOf('Sc', 31), 2000, 10);
    for (let i = 0; i < geo.positions.length; i++) {
      expect(Number.isFinite(geo.positions[i])).toBe(true);
    }
  });
});

describe('buildBarPoints', () => {
  it('is elongated along one axis', () => {
    const geo = buildBarPoints(makeRng(15), instanceOf('SBb', 15), 5000, 10);
    let sumAbsX = 0;
    let sumAbsY = 0;
    for (let i = 0; i < geo.count; i++) {
      sumAbsX += Math.abs(geo.positions[i * 3]);
      sumAbsY += Math.abs(geo.positions[i * 3 + 1]);
    }
    expect(sumAbsX).toBeGreaterThan(sumAbsY * 2);
  });

  it('returns an empty set for unbarred presets', () => {
    const geo = buildBarPoints(makeRng(16), instanceOf('Sb', 16), 5000, 10);
    expect(geo.count).toBe(0);
  });

  it('produces no NaN coordinates', () => {
    const geo = buildBarPoints(makeRng(32), instanceOf('SBb', 32), 5000, 10);
    for (let i = 0; i < geo.positions.length; i++) {
      expect(Number.isFinite(geo.positions[i])).toBe(true);
    }
  });
});

describe('buildDustPoints', () => {
  it('is thinner than the stellar disk', () => {
    // Dust settles into a layer roughly half the stellar scale height. That is
    // what lets it read as a sharp lane rather than a general haze.
    const inst = instanceOf('Sb', 20);
    const dust = buildDustPoints(makeRng(20), inst, 20000, 10);
    const stars = buildDiskPoints(makeRng(20), inst, 20000, 10);

    const meanAbsZ = (geo: typeof dust) => {
      let s = 0;
      for (let i = 0; i < geo.count; i++) s += Math.abs(geo.positions[i * 3 + 2]);
      return s / geo.count;
    };

    expect(meanAbsZ(dust)).toBeLessThan(meanAbsZ(stars) * 0.8);
  });

  it('returns an empty set for dust-free presets', () => {
    const geo = buildDustPoints(makeRng(21), instanceOf('E', 21), 5000, 10);
    expect(geo.count).toBe(0);
  });

  it('produces no NaN coordinates', () => {
    const geo = buildDustPoints(makeRng(22), instanceOf('Sa', 22), 5000, 10);
    for (let i = 0; i < geo.positions.length; i++) {
      expect(Number.isFinite(geo.positions[i])).toBe(true);
    }
  });

  it('crests upstream of the stellar arm, not on top of it', () => {
    // Density-wave theory puts the dust lane on the concave (inner) edge of the
    // stellar arm: gas shocks there and stars form downstream. buildDustPoints
    // encodes that as LANE_OFFSET = -0.18 rad in theta, so measured as an ARM
    // PHASE (arms * (theta - armTheta)) the dust crest should sit at
    // arms * LANE_OFFSET = -0.36 rad for a 2-armed Sb, while the stars crest at 0.
    //
    // Uses the CIRCULAR mean (atan2 of summed unit vectors), because a plain
    // arithmetic mean of angles is meaningless across the -pi/pi wrap.
    const inst = instanceOf('Sb', 23);
    const dust = buildDustPoints(makeRng(23), inst, 20000, 10);
    const stars = buildDiskPoints(makeRng(23), inst, 20000, 10);

    const crestPhase = (geo: GalaxyGeometry) => {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let i = 0; i < geo.count; i++) {
        const x = geo.positions[i * 3];
        const y = geo.positions[i * 3 + 1];
        const r = Math.hypot(x, y);
        if (r < 8 || r > 16) continue;
        const phase = inst.arms * (Math.atan2(y, x) - spiralArmAngle(r, 10, inst.pitchRad));
        sx += Math.cos(phase);
        sy += Math.sin(phase);
        n += 1;
      }
      expect(n).toBeGreaterThan(1000);
      return Math.atan2(sy, sx);
    };

    const starCrest = crestPhase(stars);
    const dustCrest = crestPhase(dust);

    // Stars crest on the arm.
    expect(Math.abs(starCrest)).toBeLessThan(0.15);
    // Dust crests upstream of it — negative, and clearly separated.
    expect(dustCrest).toBeLessThan(-0.15);
    expect(starCrest - dustCrest).toBeGreaterThan(0.2);
  });
});
