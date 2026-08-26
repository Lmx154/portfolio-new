import { describe, it, expect } from 'vitest';
import { makeRng } from './rng';
import {
  GALAXY_PRESETS,
  MORPHOLOGY_WEIGHTS,
  rollGalaxyClass,
  rollGalaxyInstance,
} from './presets';

describe('MORPHOLOGY_WEIGHTS', () => {
  it('sums to 1', () => {
    const total = Object.values(MORPHOLOGY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('keeps the real bright-end mix of 60:25:15 spiral:elliptical:irregular', () => {
    const w = MORPHOLOGY_WEIGHTS;
    const spiral = w.Sa + w.Sb + w.Sc + w.SBa + w.SBb + w.SBc;
    const elliptical = w.E + w.S0;
    expect(spiral).toBeCloseTo(0.6, 2);
    expect(elliptical).toBeCloseTo(0.25, 2);
    expect(w.Irr).toBeCloseTo(0.15, 2);
  });
});

describe('GALAXY_PRESETS', () => {
  it('has an entry for every weighted class', () => {
    for (const cls of Object.keys(MORPHOLOGY_WEIGHTS)) {
      expect(GALAXY_PRESETS[cls as keyof typeof GALAXY_PRESETS]).toBeDefined();
    }
  });

  it('winds Sa more tightly than Sc', () => {
    expect(GALAXY_PRESETS.Sa.pitchDeg[1]).toBeLessThan(GALAXY_PRESETS.Sc.pitchDeg[0]);
  });

  it('gives Sa a larger bulge fraction than Sc', () => {
    expect(GALAXY_PRESETS.Sa.bulgeFraction).toBeGreaterThan(GALAXY_PRESETS.Sc.bulgeFraction);
  });

  it('marks exactly the SB classes as barred', () => {
    for (const [cls, p] of Object.entries(GALAXY_PRESETS)) {
      expect(p.barred).toBe(cls.startsWith('SB'));
    }
  });

  it('gives ellipticals no dust and no HII', () => {
    expect(GALAXY_PRESETS.E.dustOpacity).toBe(0);
    expect(GALAXY_PRESETS.E.hiiAbundance).toBe(0);
  });
});

describe('rollGalaxyClass', () => {
  it('reproduces the weight table over many draws', () => {
    const rng = makeRng(42);
    const counts: Record<string, number> = {};
    const n = 200000;
    for (let i = 0; i < n; i++) {
      const c = rollGalaxyClass(rng);
      counts[c] = (counts[c] ?? 0) + 1;
    }
    for (const [cls, weight] of Object.entries(MORPHOLOGY_WEIGHTS)) {
      expect((counts[cls] ?? 0) / n).toBeCloseTo(weight, 2);
    }
  });
});

describe('rollGalaxyInstance', () => {
  it('is reproducible for a given seed', () => {
    const a = rollGalaxyInstance(makeRng(123));
    const b = rollGalaxyInstance(makeRng(123));
    expect(a).toEqual(b);
  });

  it('keeps pitch inside the preset range', () => {
    const rng = makeRng(5);
    for (let i = 0; i < 2000; i++) {
      const inst = rollGalaxyInstance(rng);
      const [lo, hi] = inst.preset.pitchDeg;
      const deg = (inst.pitchRad * 180) / Math.PI;
      expect(deg).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(deg).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it('keeps inclination within [0, pi/2]', () => {
    const rng = makeRng(6);
    for (let i = 0; i < 2000; i++) {
      const inc = rollGalaxyInstance(rng).inclination;
      expect(inc).toBeGreaterThanOrEqual(0);
      expect(inc).toBeLessThanOrEqual(Math.PI / 2);
    }
  });
});
