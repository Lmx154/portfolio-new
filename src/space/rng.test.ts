import { describe, it, expect } from 'vitest';
import { makeRng } from './rng';

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('gives different streams for different seeds', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a()).not.toBe(b());
  });

  it('stays within [0, 1)', () => {
    const r = makeRng(7);
    for (let i = 0; i < 10000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform (mean ~0.5 over 100k draws)', () => {
    const r = makeRng(99);
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) sum += r();
    expect(sum / n).toBeCloseTo(0.5, 2);
  });
});
