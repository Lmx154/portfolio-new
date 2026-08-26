/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 *
 * Every builder in src/space/ takes an injected rng so a given seed always
 * produces the same object. That is what makes the ?spacelab preset grid
 * reproducible across reloads, and what lets a bad-looking galaxy be reported
 * by seed number and reproduced exactly.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
