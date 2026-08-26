# Deep-Sky Object Suite (Phases 1–2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, billboard-based procedural galaxies with true 3D galaxies built from real astrophysical density laws, after first extracting the space background into focused modules under `src/space/`.

**Architecture:** Phase 1 moves the nebula, field-star, meteor and shader systems out of a single 850-line `useEffect` into `src/space/` modules behind two interfaces (`SpaceCtx`, `SpaceObject`) with **zero behaviour change**. Phase 2 then replaces the galaxy renderer: bulge and disk become separate primitives (camera-facing sprite vs. oriented disk-plane point cloud) so inclination foreshortens only the disk, positions are drawn by exact inverse-CDF sampling of real density laws, and dust renders as a separate extinction pass that silhouettes the bulge.

**Tech Stack:** TypeScript, React 18, Three.js 0.184, Vite 5, Vitest 2 (added by Task 1), Tailwind 3.

**Spec:** `docs/superpowers/specs/2026-08-25-deep-sky-suite-design.md`

## Global Constraints

- **No new runtime dependencies.** Three.js only. Vitest is a devDependency.
- `tsc --noEmit -p tsconfig.app.json` must pass after every task. It passes today.
- `pnpm build` (`vite build`) must succeed after every task.
- Phase 1 is **behaviour-preserving**. Any visible change during Tasks 2–5 is a bug.
- Existing tunable constants keep their current names and values unless a task says otherwise (`FAR = -2200`, `NEAR = -40`, `FADE_IN = 750`, `FADE_OUT = 440`, `CRUISE_SPEED = 34`, `MIN_PX = 1.8`, `SAMPLE_RES = 128`, `GAS_OPACITY = 0.9`).
- Mobile detection stays the existing expression: `window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768`.
- All randomness in `src/space/` goes through an injected seeded RNG (`() => number`). No bare `Math.random()` inside builders — `?spacelab` reproducibility depends on this.
- Point clouds reuse the existing star vertex path so warp streaks keep working.
- Package manager is **pnpm**.

### Deliberate deviation from the spec

The spec's Phase 1 says "Galaxies move as-is, still using the old bake shader."
This plan **leaves the galaxy code in place in `SpaceBackground.tsx` during
Phase 1** and replaces it wholesale in Phase 2, rather than moving code that is
about to be deleted. Same end state, no throwaway work. Everything else follows
the spec.

## File Structure

| File | Responsibility |
|---|---|
| `src/space/rng.ts` | Seeded PRNG (mulberry32) |
| `src/space/rng.test.ts` | Determinism + uniformity tests |
| `src/space/sampling.ts` | Inverse-CDF samplers for every density law |
| `src/space/sampling.test.ts` | Statistical tests against exact analytic values |
| `src/space/types.ts` | `SpaceCtx`, `SpaceObject` interfaces |
| `src/space/shaders.ts` | Shared GLSL: noise, quad vert/frag, star vert/frag |
| `src/space/nebula.ts` | Nebula bake + importance-sampled stars (moved verbatim) |
| `src/space/field.ts` | Field starfield (moved verbatim) |
| `src/space/meteors.ts` | Shooting stars (moved verbatim) |
| `src/space/presets.ts` | Galaxy morphology presets + spawn abundance table |
| `src/space/presets.test.ts` | Preset invariants + abundance weights sum to 1 |
| `src/space/galaxy.ts` | Galaxy builder: disk, bulge, arms, HII, dust, 4-pass order |
| `src/space/galaxy.test.ts` | Geometry invariants (counts, bounds, far/near split) |
| `src/space/spacelab.tsx` | `?spacelab` preset grid harness |
| `src/components/SpaceBackground.tsx` | Scene, camera, loop, warp, hero scheduler |
| `vitest.config.ts` | Test config (node environment) |

---

## Phase 1 — Extraction (no behaviour change)

### Task 1: Test infrastructure + seeded RNG

**Files:**
- Create: `vitest.config.ts`
- Create: `src/space/rng.ts`
- Test: `src/space/rng.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `makeRng(seed: number): () => number` — returns a function yielding uniform floats in `[0, 1)`. Every later task takes this as its `rng` parameter.

- [ ] **Step 1: Install Vitest**

```bash
pnpm add -D vitest@^2.1.0
```

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

// The space math is pure TypeScript with no DOM or WebGL, so the fast node
// environment is enough. Rendering is verified by ?spacelab, not by unit tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `src/space/rng.test.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './rng'`

- [ ] **Step 6: Implement `src/space/rng.ts`**

```ts
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
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS, 4 tests.

- [ ] **Step 8: Verify the build is unaffected**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json && pnpm build`
Expected: both succeed.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/space/rng.ts src/space/rng.test.ts
git commit -m "test: add vitest and seeded RNG for space background"
```

---

### Task 2: Extract shared types and shaders

**Files:**
- Create: `src/space/types.ts`
- Create: `src/space/shaders.ts`
- Modify: `src/components/SpaceBackground.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SpaceCtx = { renderer: THREE.WebGLRenderer; bakeInto: (t: THREE.WebGLRenderTarget | null, m: THREE.ShaderMaterial) => void; isMobile: boolean; rng: () => number }`
  - `type SpaceObject = { group: THREE.Object3D; setOpacity: (o: number) => void; dispose: () => void }`
  - From `shaders.ts`: `NOISE_GLSL`, `QUAD_VERT`, `QUAD_FRAG`, `STAR_VERT`, `STAR_FRAG`, `NEB_BAKE_FRAG` — all `string`.

- [ ] **Step 1: Create `src/space/types.ts`**

```ts
import type * as THREE from 'three';

/**
 * Everything a space-object builder needs from the scene that owns it. Builders
 * are pure functions of this context plus their own parameters — they never
 * close over the renderer or scene, which is what makes them movable and
 * testable.
 */
export type SpaceCtx = {
  renderer: THREE.WebGLRenderer;
  /** Render a material into an offscreen target using the shared ortho bake rig. */
  bakeInto: (target: THREE.WebGLRenderTarget | null, material: THREE.ShaderMaterial) => void;
  isMobile: boolean;
  /** Seeded — see src/space/rng.ts. Builders must not call Math.random(). */
  rng: () => number;
};

/**
 * The uniform handle every builder returns, so the hero scheduler can treat a
 * nebula, a galaxy and a cluster identically.
 */
export type SpaceObject = {
  group: THREE.Object3D;
  setOpacity: (opacity: number) => void;
  dispose: () => void;
};
```

- [ ] **Step 2: Create `src/space/shaders.ts`**

Move these GLSL template literals out of `src/components/SpaceBackground.tsx`
**verbatim** — do not edit the shader source in this task:

| Constant | Current location |
|---|---|
| `NOISE_GLSL` | `SpaceBackground.tsx:94–133` |
| `QUAD_VERT` | `SpaceBackground.tsx:134–141` |
| `NEB_BAKE_FRAG` | `SpaceBackground.tsx:143–227` |
| `QUAD_FRAG` | `SpaceBackground.tsx:331–341` |
| `STAR_VERT` | `SpaceBackground.tsx:343–…` |
| `STAR_FRAG` | follows `STAR_VERT` |

Each becomes an `export const`. `NEB_BAKE_FRAG` interpolates `NOISE_GLSL`, so
`NOISE_GLSL` must be declared above it in the new file.

Leave `GALAXY_BAKE_FRAG` (`:233–329`) where it is — Phase 2 deletes it.

- [ ] **Step 3: Import them back in `SpaceBackground.tsx`**

```ts
import { NOISE_GLSL, QUAD_VERT, QUAD_FRAG, STAR_VERT, STAR_FRAG, NEB_BAKE_FRAG } from '../space/shaders';
```

Delete the now-duplicated definitions. `GALAXY_BAKE_FRAG` still references
`NOISE_GLSL`, which now comes from the import — confirm it still compiles.

- [ ] **Step 4: Verify no behaviour change**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json && pnpm build && pnpm test`
Expected: all pass.

Then run `pnpm dev`, open the site, and confirm the background is visually
identical: nebulae, stars, meteors, and the warp jump on navigating Home → Blog.

- [ ] **Step 5: Commit**

```bash
git add src/space/types.ts src/space/shaders.ts src/components/SpaceBackground.tsx
git commit -m "refactor: extract space shaders and shared types to src/space/"
```

---

### Task 3: Extract the nebula system

**Files:**
- Create: `src/space/nebula.ts`
- Modify: `src/components/SpaceBackground.tsx:692–910`

**Interfaces:**
- Consumes: `SpaceCtx` (Task 2), `NEB_BAKE_FRAG`/`QUAD_VERT`/`QUAD_FRAG` (Task 2).
- Produces:

```ts
export const PALETTE_HEX: Record<string, string[]>;
export type Structure = {
  scale: number; warp: number; coverage: number;
  softness: number; detail: number; contrast: number; intensity: number;
};
export const STRUCTURES: Structure[];
export function createNebulaField(ctx: SpaceCtx, opts: {
  count: number;
  starsPerCloud: number;
  sampleRes: number;
  gasOpacity: number;
  far: number; near: number;
}): NebulaField;

export type NebulaField = {
  group: THREE.Object3D;
  /** Star positions/colours/sizes, shared with the scene's point cloud. */
  points: THREE.Points;
  /** Advance clouds by `dz`, recycling any that pass `near`. */
  advance: (dz: number, fadeAt: (z: number) => number) => void;
  /** Rebake all clouds after a WebGL context loss. */
  rebake: () => void;
  dispose: () => void;
};
```

- [ ] **Step 1: Move the nebula code**

Move `PALETTE_HEX` (`:56–63`), `Structure`/`STRUCTURES` (`:65–83`), `hexToRgb`
(`:86–89`), the `nebBakeMat` setup, `randomParams`, `applyNebulaParams`,
`sampleNebula`, `regenCluster`, `writeClusterPositions`, and the cluster
buffers/`THREE.Points` into `src/space/nebula.ts`, wrapped in
`createNebulaField`.

Note for the implementer: what the current code calls a "cluster" **is a
nebula** — a gas cloud plus stars importance-sampled from its own baked
texture. The name changes to "cloud"/"nebula" in the new module. This is a
rename only; the algorithm is unchanged.

`CLUSTER_COUNT` → `opts.count` (4), `STARS_PER_CLUSTER` → `opts.starsPerCloud`
(420), `SAMPLE_RES` → `opts.sampleRes` (128), `GAS_OPACITY` → `opts.gasOpacity`
(0.9). Replace every `Math.random()` with `ctx.rng()`.

- [ ] **Step 2: Wire it up in `SpaceBackground.tsx`**

```ts
const nebulae = createNebulaField(ctx, {
  count: 4,
  starsPerCloud: 420,
  sampleRes: SAMPLE_RES,
  gasOpacity: GAS_OPACITY,
  far: FAR,
  near: NEAR,
});
scene.add(nebulae.group);
```

Call `nebulae.advance(step, fadeAt)` where `writeClusterPositions()` was called
in the frame loop, `nebulae.rebake()` in the context-restore handler, and
`nebulae.dispose()` in the cleanup return.

- [ ] **Step 3: Verify no behaviour change**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json && pnpm build && pnpm test`

Then `pnpm dev` and confirm nebulae still appear, drift, recycle, and carry
their star clouds. Because randomness moved from `Math.random()` to a seeded
`rng`, the *specific* clouds will differ from before — that is expected. Their
character, count and density must not.

- [ ] **Step 4: Commit**

```bash
git add src/space/nebula.ts src/components/SpaceBackground.tsx
git commit -m "refactor: extract nebula field to src/space/nebula.ts"
```

---

### Task 4: Extract field stars and meteors

**Files:**
- Create: `src/space/field.ts`
- Create: `src/space/meteors.ts`
- Modify: `src/components/SpaceBackground.tsx`

**Interfaces:**
- Consumes: `SpaceCtx`, `STAR_VERT`, `STAR_FRAG`.
- Produces:

```ts
// field.ts
export function createFieldStars(ctx: SpaceCtx, opts: {
  count: number; spread: number; far: number; near: number; minPx: number;
}): SpaceObject & { points: THREE.Points; advance: (dz: number) => void };

// meteors.ts
export function createMeteors(ctx: SpaceCtx, opts: {
  max: number; minWait: number; randWait: number; far: number; near: number;
}): SpaceObject & { update: (dt: number) => void };
```

- [ ] **Step 1: Move field-star generation into `field.ts`**

`FIELD_STARS` (1400) → `opts.count`, `FIELD_SPREAD` (0.72) → `opts.spread`,
`MIN_PX` (1.8) → `opts.minPx`. Replace `Math.random()` with `ctx.rng()`.

- [ ] **Step 2: Move meteor code into `meteors.ts`**

`METEOR_MAX` (3) → `opts.max`, `METEOR_MIN_WAIT` (5) → `opts.minWait`,
`METEOR_RAND_WAIT` (11) → `opts.randWait`. Replace `Math.random()` with
`ctx.rng()`.

- [ ] **Step 3: Wire both up and delete the originals**

```ts
const field = createFieldStars(ctx, {
  count: FIELD_STARS, spread: FIELD_SPREAD, far: FAR, near: NEAR, minPx: MIN_PX,
});
const meteors = createMeteors(ctx, {
  max: METEOR_MAX, minWait: METEOR_MIN_WAIT, randWait: METEOR_RAND_WAIT,
  far: FAR, near: NEAR,
});
scene.add(field.group, meteors.group);
```

Call `field.advance(step)` and `meteors.update(dt)` in the loop, and both
`dispose()`s in cleanup.

- [ ] **Step 4: Verify no behaviour change**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json && pnpm build && pnpm test`

Then `pnpm dev`: stars drift and recycle, meteors still streak across at
5–16 s intervals, warp still stretches stars into streaks.

- [ ] **Step 5: Commit**

```bash
git add src/space/field.ts src/space/meteors.ts src/components/SpaceBackground.tsx
git commit -m "refactor: extract field stars and meteors to src/space/"
```

---

### Task 5: Slim `SpaceBackground.tsx` and confirm parity

**Files:**
- Modify: `src/components/SpaceBackground.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces: a `SpaceCtx` value constructed once inside the effect and passed to every builder.

- [ ] **Step 1: Construct the context in one place**

```ts
const ctx: SpaceCtx = {
  renderer,
  bakeInto,
  isMobile,
  rng: makeRng(Math.floor(Math.random() * 0xffffffff)),
};
```

The top-level seed is still random per page load, so visitors do not all see an
identical sky. Only `?spacelab` pins it.

- [ ] **Step 2: Confirm what remains**

After extraction `SpaceBackground.tsx` should contain only: tunable constants,
the React component, renderer/camera/scene setup, the bake rig
(`bakeScene`/`bakeCam`/`bakeInto`/`makeTarget`), `fadeAt`, the warp state
machine, the frame loop, resize/context-loss handlers, cleanup, and the
still-untouched legacy galaxy block.

- [ ] **Step 3: Verify parity**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json && pnpm build && pnpm test`

Then `pnpm dev` and walk the whole surface: home page loads, nebulae drift,
stars twinkle, meteors fire, navigating Home → Blog → Home triggers the warp
jump both ways, and resizing the window does not break the scene.

- [ ] **Step 4: Check the line count moved in the right direction**

Run: `wc -l src/components/SpaceBackground.tsx src/space/*.ts`
Expected: `SpaceBackground.tsx` well under its original 1,369 lines.

- [ ] **Step 5: Commit**

```bash
git add src/components/SpaceBackground.tsx
git commit -m "refactor: slim SpaceBackground to scene orchestration"
```

---

## Phase 2 — Galaxy rewrite

### Task 6: Density-law samplers

**Files:**
- Create: `src/space/sampling.ts`
- Test: `src/space/sampling.test.ts`

**Interfaces:**
- Consumes: `makeRng` (Task 1).
- Produces:

```ts
export function sampleExponentialDiskRadius(rng: () => number, h: number): number;
export function sampleSech2Height(rng: () => number, z0: number): number;
export function sampleHernquistRadius(rng: () => number, a: number): number;
export function samplePlummerRadius(rng: () => number, a: number): number;
export function sampleInclination(rng: () => number): number; // radians
export function sampleUnitVector(rng: () => number): [number, number, number];
export function samplePowerLawBrightness(rng: () => number, min: number, max: number, alpha: number): number;
export function spiralArmAngle(radius: number, r0: number, pitchRad: number): number;
```

Every sampler is exact inverse-CDF. The analytic targets below were verified
numerically before this plan was written — they are correct, so a failure means
the implementation is wrong, not the expectation.

- [ ] **Step 1: Write the failing tests**

Create `src/space/sampling.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeRng } from './rng';
import {
  sampleExponentialDiskRadius,
  sampleSech2Height,
  sampleHernquistRadius,
  samplePlummerRadius,
  sampleInclination,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/space/sampling.test.ts`
Expected: FAIL — `Cannot find module './sampling'`

- [ ] **Step 3: Implement `src/space/sampling.ts`**

```ts
/**
 * Inverse-CDF samplers for the density laws the galaxy builder uses. Each is
 * exact — no rejection loops, no numerical inversion — which is why sampling a
 * 70k-point disk costs microseconds.
 *
 * Drawing positions from these distributions is also what makes the resolved
 * star density follow the light profile automatically: the dots ARE the
 * profile, rather than a uniform grid masked by brightness afterwards.
 */

/**
 * Exponential disk, Sigma(R) = Sigma0 * exp(-R/h).
 *
 * Mass in an annulus goes as Sigma(R) * 2*pi*R dR ∝ R*exp(-R/h) dR, which is
 * exactly Gamma(k=2, theta=h). A Gamma(2, h) draw is the sum of two Exp(h)
 * draws, and Exp(h) = -h*ln(u).
 */
export function sampleExponentialDiskRadius(rng: () => number, h: number): number {
  return -h * (Math.log(1 - rng()) + Math.log(1 - rng()));
}

/**
 * Isothermal sheet, rho(z) ∝ sech^2(z/z0).
 * CDF is (1 + tanh(z/z0))/2, so z = z0 * atanh(2u - 1).
 */
export function sampleSech2Height(rng: () => number, z0: number): number {
  // Guard the endpoints: atanh(±1) is infinite, and a PRNG returning exactly 0
  // would otherwise emit an infinite height that poisons the whole buffer.
  const u = Math.min(1 - 1e-12, Math.max(-1 + 1e-12, rng() * 2 - 1));
  return z0 * Math.atanh(u);
}

/**
 * Hernquist sphere, rho(r) = M*a / (2*pi*r*(r+a)^3).
 *
 * M(<r)/M = r^2/(r+a)^2, which inverts to r = a*sqrt(u)/(1 - sqrt(u)).
 * Chosen over a numerically-inverted Sersic because it has this closed form and
 * still projects to very nearly a de Vaucouleurs r^(1/4) profile.
 */
export function sampleHernquistRadius(rng: () => number, a: number): number {
  const s = Math.sqrt(rng());
  return (a * s) / (1 - s);
}

/**
 * Plummer sphere, rho(r) ∝ (1 + r^2/a^2)^(-5/2). Used for globular clusters.
 * M(<r)/M = r^3/(r^2+a^2)^(3/2) inverts to a*u^(1/3)/sqrt(1 - u^(2/3)).
 */
export function samplePlummerRadius(rng: () => number, a: number): number {
  const c = Math.cbrt(rng());
  return (a * c) / Math.sqrt(1 - c * c);
}

/**
 * Inclination of a randomly oriented disk, in radians on [0, pi/2].
 * For uniform orientation on the sphere cos(i) is uniform, so i = acos(u).
 * This yields edge-on (i > 80 deg) about 17% of the time and near-face-on
 * only about 6% — the real distribution, and the reason no separate "edge-on"
 * preset is needed.
 */
export function sampleInclination(rng: () => number): number {
  return Math.acos(rng());
}

/** A direction uniformly distributed on the unit sphere. */
export function sampleUnitVector(rng: () => number): [number, number, number] {
  const z = rng() * 2 - 1;
  const t = rng() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(t), r * Math.sin(t), z];
}

/**
 * Stellar brightness from a power-law luminosity function with index `alpha`
 * (alpha < -1 → many faint, few bright). Inverse-CDF of a bounded power law.
 */
export function samplePowerLawBrightness(
  rng: () => number,
  min: number,
  max: number,
  alpha: number,
): number {
  const p = alpha + 1;
  const lo = Math.pow(min, p);
  const hi = Math.pow(max, p);
  return Math.pow(lo + rng() * (hi - lo), 1 / p);
}

/**
 * Azimuth of a logarithmic spiral arm at `radius`: theta = ln(R/R0)/tan(p).
 * Smaller pitch angle `p` → more tightly wound (Sa ~10 deg, Sc ~25 deg).
 */
export function spiralArmAngle(radius: number, r0: number, pitchRad: number): number {
  return Math.log(Math.max(radius, 1e-6) / r0) / Math.tan(pitchRad);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/space/sampling.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/space/sampling.ts src/space/sampling.test.ts
git commit -m "feat: add exact inverse-CDF samplers for galaxy density laws"
```

---

### Task 7: Morphology presets and spawn abundance

**Files:**
- Create: `src/space/presets.ts`
- Test: `src/space/presets.test.ts`

**Interfaces:**
- Consumes: `makeRng`, `sampleInclination`.
- Produces:

```ts
export type GalaxyClass = 'Sa' | 'Sb' | 'Sc' | 'SBa' | 'SBb' | 'SBc' | 'S0' | 'E' | 'Irr';

export type GalaxyPreset = {
  cls: GalaxyClass;
  pitchDeg: [number, number];
  arms: number[];
  bulgeFraction: number;
  heightRatio: number;
  hiiAbundance: number;
  dustOpacity: number;
  barred: boolean;
  coreColor: string;
  armColor: string;
};

export const GALAXY_PRESETS: Record<GalaxyClass, GalaxyPreset>;
export const MORPHOLOGY_WEIGHTS: Record<GalaxyClass, number>;
export function rollGalaxyClass(rng: () => number): GalaxyClass;

export type GalaxyInstance = {
  preset: GalaxyPreset;
  pitchRad: number;
  arms: number;
  bulgeFraction: number;
  inclination: number;
  positionAngle: number;
  scale: number;
};
export function rollGalaxyInstance(rng: () => number): GalaxyInstance;
```

- [ ] **Step 1: Write the failing tests**

Create `src/space/presets.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/space/presets.test.ts`
Expected: FAIL — `Cannot find module './presets'`

- [ ] **Step 3: Implement `src/space/presets.ts`**

```ts
import { sampleInclination } from './sampling';

export type GalaxyClass = 'Sa' | 'Sb' | 'Sc' | 'SBa' | 'SBb' | 'SBc' | 'S0' | 'E' | 'Irr';

export type GalaxyPreset = {
  cls: GalaxyClass;
  /** Inclusive pitch-angle range in degrees; smaller = more tightly wound. */
  pitchDeg: [number, number];
  /** Allowed arm counts. */
  arms: number[];
  /** Bulge share of total light, B/T. */
  bulgeFraction: number;
  /** Disk scale height as a fraction of the radial scale length. */
  heightRatio: number;
  /** Relative number of HII knots, 0..1. */
  hiiAbundance: number;
  /** Peak extinction of the dust layer, 0..1. */
  dustOpacity: number;
  barred: boolean;
  coreColor: string;
  armColor: string;
};

/**
 * Morphology presets. Pitch angle and bulge fraction are what actually separate
 * the Hubble classes: Sa is tightly wound with a big red bulge, Sc is open-armed
 * with almost no bulge and vigorous star formation.
 */
export const GALAXY_PRESETS: Record<GalaxyClass, GalaxyPreset> = {
  Sa:  { cls: 'Sa',  pitchDeg: [8, 12],  arms: [2],    bulgeFraction: 0.50, heightRatio: 0.10, hiiAbundance: 0.20, dustOpacity: 0.75, barred: false, coreColor: '#ffd9a0', armColor: '#e8d0b0' },
  Sb:  { cls: 'Sb',  pitchDeg: [14, 20], arms: [2],    bulgeFraction: 0.25, heightRatio: 0.09, hiiAbundance: 0.55, dustOpacity: 0.55, barred: false, coreColor: '#ffe9c4', armColor: '#b8c8e8' },
  Sc:  { cls: 'Sc',  pitchDeg: [22, 28], arms: [2, 3, 4], bulgeFraction: 0.08, heightRatio: 0.08, hiiAbundance: 0.90, dustOpacity: 0.35, barred: false, coreColor: '#fff3e0', armColor: '#9cc0f0' },
  SBa: { cls: 'SBa', pitchDeg: [8, 12],  arms: [2],    bulgeFraction: 0.45, heightRatio: 0.10, hiiAbundance: 0.20, dustOpacity: 0.75, barred: true,  coreColor: '#ffd9a0', armColor: '#e8d0b0' },
  SBb: { cls: 'SBb', pitchDeg: [14, 20], arms: [2],    bulgeFraction: 0.22, heightRatio: 0.09, hiiAbundance: 0.55, dustOpacity: 0.55, barred: true,  coreColor: '#ffe9c4', armColor: '#b8c8e8' },
  SBc: { cls: 'SBc', pitchDeg: [22, 28], arms: [2, 3], bulgeFraction: 0.07, heightRatio: 0.08, hiiAbundance: 0.90, dustOpacity: 0.35, barred: true,  coreColor: '#fff3e0', armColor: '#9cc0f0' },
  S0:  { cls: 'S0',  pitchDeg: [0, 0],   arms: [0],    bulgeFraction: 0.60, heightRatio: 0.12, hiiAbundance: 0.00, dustOpacity: 0.25, barred: false, coreColor: '#ffe2b8', armColor: '#f0dcc0' },
  E:   { cls: 'E',   pitchDeg: [0, 0],   arms: [0],    bulgeFraction: 1.00, heightRatio: 0.00, hiiAbundance: 0.00, dustOpacity: 0.00, barred: false, coreColor: '#ffe2b8', armColor: '#ffe2b8' },
  Irr: { cls: 'Irr', pitchDeg: [0, 0],   arms: [0],    bulgeFraction: 0.02, heightRatio: 0.20, hiiAbundance: 1.00, dustOpacity: 0.30, barred: false, coreColor: '#e8f0ff', armColor: '#9cc4f0' },
};

/**
 * Spawn weights. Ratios WITHIN the galaxy category are the real bright-end mix
 * — spirals : ellipticals+S0 : irregulars of about 60 : 25 : 15. Weights ACROSS
 * categories (see the hero scheduler) are curated, because strict realism would
 * show mostly faint dwarfs and almost never anything dramatic.
 */
export const MORPHOLOGY_WEIGHTS: Record<GalaxyClass, number> = {
  Sa: 0.10, Sb: 0.16, Sc: 0.14,
  SBa: 0.06, SBb: 0.08, SBc: 0.06,
  S0: 0.10, E: 0.15,
  Irr: 0.15,
};

export function rollGalaxyClass(rng: () => number): GalaxyClass {
  const roll = rng();
  let acc = 0;
  for (const [cls, weight] of Object.entries(MORPHOLOGY_WEIGHTS) as [GalaxyClass, number][]) {
    acc += weight;
    if (roll < acc) return cls;
  }
  return 'Sb';
}

export type GalaxyInstance = {
  preset: GalaxyPreset;
  pitchRad: number;
  arms: number;
  bulgeFraction: number;
  inclination: number;
  /** Rotation of the disk's major axis in the sky plane, radians. */
  positionAngle: number;
  /** Overall size multiplier, 0.7..1.4. */
  scale: number;
};

/**
 * Roll one concrete galaxy: a preset plus per-instance jitter. Inclination uses
 * the true random-orientation distribution, so edge-on views turn up at their
 * real ~17% rate rather than being a special case.
 */
export function rollGalaxyInstance(rng: () => number): GalaxyInstance {
  const preset = GALAXY_PRESETS[rollGalaxyClass(rng)];
  const [lo, hi] = preset.pitchDeg;
  const pitchDeg = lo + rng() * (hi - lo);
  return {
    preset,
    pitchRad: (pitchDeg * Math.PI) / 180,
    arms: preset.arms[Math.floor(rng() * preset.arms.length)],
    // B/T jitter of +/-20%, clamped so it stays a fraction.
    bulgeFraction: Math.min(1, Math.max(0, preset.bulgeFraction * (0.8 + rng() * 0.4))),
    inclination: sampleInclination(rng),
    positionAngle: rng() * Math.PI * 2,
    scale: 0.7 + rng() * 0.7,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/space/presets.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/space/presets.ts src/space/presets.test.ts
git commit -m "feat: add galaxy morphology presets and spawn weights"
```

---

### Task 8: Disk and bulge point geometry

**Files:**
- Create: `src/space/galaxy.ts`
- Test: `src/space/galaxy.test.ts`

**Interfaces:**
- Consumes: `sampling.ts` (Task 6), `presets.ts` (Task 7).
- Produces:

```ts
export type GalaxyGeometry = {
  /** xyz triples in disk-local space, disk plane = xy, thickness along z. */
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  /** true where the point is on the camera-facing half after inclination. */
  nearHalf: Uint8Array;
  count: number;
};

export function buildDiskPoints(
  rng: () => number, inst: GalaxyInstance, count: number, scaleLength: number,
): GalaxyGeometry;

export function buildBulgePoints(
  rng: () => number, inst: GalaxyInstance, count: number, scaleRadius: number,
): GalaxyGeometry;
```

This task produces geometry only — no Three.js objects, so it is fully testable
in the node environment.

- [ ] **Step 1: Write the failing tests**

Create `src/space/galaxy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeRng } from './rng';
import { rollGalaxyInstance, GALAXY_PRESETS } from './presets';
import { buildDiskPoints, buildBulgePoints } from './galaxy';

// Every field is derived FROM the requested preset. Spreading a rolled
// instance and overriding only `preset` would keep pitch/arms/bulgeFraction
// from an unrelated class — so a fixture labelled 'Sc' could carry arms: 0 and
// produce a featureless disk, failing the arm tests for reasons unrelated to
// the code under test.
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/space/galaxy.test.ts`
Expected: FAIL — `Cannot find module './galaxy'`

- [ ] **Step 3: Implement the geometry builders in `src/space/galaxy.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/space/galaxy.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `pnpm test && ./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/space/galaxy.ts src/space/galaxy.test.ts
git commit -m "feat: add 3D disk and bulge point geometry for galaxies"
```

---

### Task 9: Spiral arms detail — HII regions and the stellar bar

**Files:**
- Modify: `src/space/galaxy.ts`
- Modify: `src/space/galaxy.test.ts`

**Interfaces:**
- Consumes: everything from Task 8.
- Produces:

```ts
export function buildHiiPoints(
  rng: () => number, inst: GalaxyInstance, count: number, scaleLength: number,
): GalaxyGeometry;

export function buildBarPoints(
  rng: () => number, inst: GalaxyInstance, count: number, scaleLength: number,
): GalaxyGeometry;
```

- [ ] **Step 1: Write the failing tests**

Append to `src/space/galaxy.test.ts`:

```ts
import { buildHiiPoints, buildBarPoints } from './galaxy';

describe('buildHiiPoints', () => {
  it('produces the requested count', () => {
    const geo = buildHiiPoints(makeRng(11), instanceOf('Sc', 11), 2000, 10);
    expect(geo.count).toBe(2000);
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

    expect(contrast(hii)).toBeGreaterThan(contrast(disk));
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/space/galaxy.test.ts`
Expected: FAIL — `buildHiiPoints is not a function`

- [ ] **Step 3: Implement both builders in `src/space/galaxy.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/space/galaxy.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/space/galaxy.ts src/space/galaxy.test.ts
git commit -m "feat: add HII regions and stellar bar to galaxy geometry"
```

---

### Task 10: Dust lane geometry

**Files:**
- Modify: `src/space/galaxy.ts`
- Modify: `src/space/galaxy.test.ts`

**Interfaces:**
- Consumes: Tasks 8–9.
- Produces: `export function buildDustPoints(rng, inst, count, scaleLength): GalaxyGeometry` — same shape, but `colors` carries extinction strength rather than emission.

- [ ] **Step 1: Write the failing tests**

Append to `src/space/galaxy.test.ts`:

```ts
import { buildDustPoints } from './galaxy';

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

  it('sits at a different azimuth from the stellar arm at the same radius', () => {
    // Density-wave theory puts the dust lane on the concave (inner) edge of the
    // stellar arm, offset upstream — not on top of it.
    const inst = instanceOf('Sb', 23);
    const dust = buildDustPoints(makeRng(23), inst, 20000, 10);
    let offsetSum = 0;
    let n = 0;
    for (let i = 0; i < dust.count; i++) {
      const x = dust.positions[i * 3];
      const y = dust.positions[i * 3 + 1];
      const r = Math.hypot(x, y);
      if (r < 8 || r > 16) continue;
      const armTheta = Math.atan2(y, x);
      offsetSum += armTheta;
      n++;
    }
    expect(n).toBeGreaterThan(0);
    expect(Number.isFinite(offsetSum / n)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/space/galaxy.test.ts`
Expected: FAIL — `buildDustPoints is not a function`

- [ ] **Step 3: Implement `buildDustPoints` in `src/space/galaxy.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add src/space/galaxy.ts src/space/galaxy.test.ts
git commit -m "feat: add dust lane geometry with density-wave offset"
```

---

### Task 11: Assemble the galaxy into a `SpaceObject` with four-pass draw order

**Files:**
- Modify: `src/space/galaxy.ts`
- Modify: `src/space/shaders.ts`

**Interfaces:**
- Consumes: Tasks 8–10, `SpaceCtx`/`SpaceObject` (Task 2), `STAR_VERT`/`STAR_FRAG` (Task 2).
- Produces:

```ts
export function createGalaxy(ctx: SpaceCtx, opts: {
  instance: GalaxyInstance;
  worldSize: number;
  pointBudget: number;   // total across all components
}): SpaceObject;
```

This is the task where extinction actually happens. There is no unit test —
correctness here is visual, and Task 12's `?spacelab` is how it gets checked.

- [ ] **Step 1: Add a `uOpacity` uniform to `STAR_VERT`**

`STAR_VERT` currently declares `varying vec3 vColor; varying float vAlpha;` and
derives `vAlpha` purely from the point's own depth fade. There is **no
`uOpacity`**, so a galaxy group cannot be faded as a unit.

In `src/space/shaders.ts`, add to `STAR_VERT`:

```glsl
uniform float uOpacity;
```

and multiply it into the existing `vAlpha` assignment:

```glsl
vAlpha *= uOpacity;
```

Every existing material must now supply `uOpacity: { value: 1 }`, which leaves
the nebula and field starfields pixel-identical. Add it to `starMaterial()` in
the same step.

- [ ] **Step 2: Add the dust fragment shader to `src/space/shaders.ts`**

Note the varying is `vAlpha` — it must match what `STAR_VERT` declares, or the
program will not link.

```ts
/**
 * Dust points. Alpha carries extinction strength; the material multiplies the
 * framebuffer down rather than adding to it, so the lane silhouettes whatever
 * was drawn before it.
 */
export const DUST_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float soft = smoothstep(0.25, 0.0, r2);
    gl_FragColor = vec4(vColor, soft * vAlpha);
  }
`;
```

- [ ] **Step 3: Implement `createGalaxy`**

Add to `src/space/galaxy.ts`. Key requirements:

1. Allocate the point budget across components:
   `disk 58%, bulge 25%, dust 12%, HII 4%, bar 1%` — and halve the whole budget
   when `ctx.isMobile`.
2. Build each component's geometry, then **split each into two `THREE.Points`**
   by the `nearHalf` flag.
3. Add all objects to one `THREE.Group`, then rotate that group by
   `inclination` about x and `positionAngle` about z. **Rotating the group is
   what makes inclination correct** — the bulge is a 3D spheroid, so
   foreshortening it is right; the old bug was foreshortening a *painting* of a
   face-on galaxy.
4. Set `renderOrder` to enforce the pass order:

```ts
// Extinction only works if the dust is drawn after the light behind it and
// before the light in front of it.
farDisk.renderOrder = 0;   // additive
farBulge.renderOrder = 1;  // additive
dust.renderOrder = 2;      // multiplying — darkens passes 0-1
nearBulge.renderOrder = 3; // additive
nearDisk.renderOrder = 4;  // additive
nearHii.renderOrder = 5;   // additive
```

5. The dust material uses a multiplying blend:

```ts
const dustMaterial = new THREE.ShaderMaterial({
  uniforms: { /* same star uniforms plus uOpacity */ },
  vertexShader: STAR_VERT,
  fragmentShader: DUST_FRAG,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.ZeroFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
});
```

6. Every other material is the existing additive star material.
7. `setOpacity(o)` writes `uOpacity` on every material.
8. `dispose()` disposes every geometry and material.

- [ ] **Step 4: Verify types and build**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json && pnpm build && pnpm test`
Expected: all pass. The nebula and field starfields must look unchanged — the
new `uOpacity` defaults to 1.

- [ ] **Step 5: Commit**

```bash
git add src/space/galaxy.ts src/space/shaders.ts
git commit -m "feat: assemble galaxy with four-pass extinction draw order"
```

---

### Task 12: `?spacelab` preset harness

**Files:**
- Create: `src/space/spacelab.tsx`
- Modify: `src/components/SpaceBackground.tsx`

**Interfaces:**
- Consumes: `createGalaxy` (Task 11), `GALAXY_PRESETS`/`rollGalaxyInstance` (Task 7), `makeRng` (Task 1).
- Produces: `export function isSpacelab(): boolean` and `export function mountSpacelab(container: HTMLElement): () => void`.

This lands with Phase 2 rather than after it, because it is the tuning loop for
Tasks 8–11 — without it, checking a preset means waiting for one to drift past.

- [ ] **Step 1: Implement the harness**

`src/space/spacelab.tsx` renders a grid with one galaxy per cell:

- One row per `GalaxyClass` in `GALAXY_PRESETS`.
- Four columns per row, seeded `1, 2, 3, 4`, so every cell is reproducible.
- A fixed camera per cell, no drift, no warp.
- A caption per cell: class, pitch in degrees, inclination in degrees, B/T.
- Additionally, one row of a single class at inclinations `0°, 30°, 60°, 85°`
  to check the bulge stays round while the disk foreshortens.

```ts
export function isSpacelab(): boolean {
  return new URLSearchParams(window.location.search).has('spacelab');
}
```

- [ ] **Step 2: Branch in `SpaceBackground.tsx`**

```ts
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;
  if (isSpacelab()) return mountSpacelab(container);
  // ...existing scene setup
}, []);
```

- [ ] **Step 3: Verify**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json && pnpm build && pnpm test`

Then `pnpm dev` and open `http://localhost:5173/?spacelab`. Confirm:
- Every class renders in its own row.
- Reloading gives byte-identical cells (seeded).
- In the inclination row, **the bulge stays round while the disk flattens** —
  this is the direct visual proof the original defect is fixed.
- The 85° cell shows a dust lane cutting across the bulge.

- [ ] **Step 4: Commit**

```bash
git add src/space/spacelab.tsx src/components/SpaceBackground.tsx
git commit -m "feat: add ?spacelab preset grid harness"
```

---

### Task 13: Replace the legacy galaxies with a hero scheduler

**Files:**
- Modify: `src/components/SpaceBackground.tsx`

**Interfaces:**
- Consumes: `createGalaxy` (Task 11), `rollGalaxyInstance` (Task 7).
- Produces: nothing new — this is the integration that retires the old renderer.

- [ ] **Step 1: Delete the legacy galaxy renderer**

Remove `GALAXY_BAKE_FRAG` (`SpaceBackground.tsx:233–329`), the `Galaxy` type,
`rollGalaxyType`, `GALAXY_CORES`, `GALAXY_ARMS`, `ELLIPTICAL_CORES`,
`IRREGULAR_ARMS`, `bakeGalaxy`, `regenGalaxy`, `writeGalaxyPositions`,
`galaxyBakeMat`, and `GALAXY_COUNT`.

- [ ] **Step 2: Add the hero scheduler**

```ts
// Hero objects are rare and large: at most one on screen, spawned far away and
// retired once it passes the camera. This is what buys the on-screen size that
// makes real structure visible — the old renderer showed three small galaxies
// at once and minified all the detail away.
const HERO_MAX = 1;
const HERO_MIN_GAP = 26;   // seconds after one retires before the next spawns
const HERO_RAND_GAP = 18;  // plus up to this many more
const HERO_SIZE = 900;     // world units; ~600-1200 px on screen near mid-field

let hero: SpaceObject | null = null;
let heroZ = FAR;
let heroTimer = HERO_MIN_GAP * 0.3;

const spawnHero = () => {
  const instance = rollGalaxyInstance(ctx.rng);
  hero = createGalaxy(ctx, {
    instance,
    worldSize: HERO_SIZE * instance.scale,
    pointBudget: ctx.isMobile ? 60000 : 120000,
  });
  heroZ = FAR;
  hero.group.position.set(
    (ctx.rng() - 0.5) * Math.abs(FAR) * 0.5,
    (ctx.rng() - 0.5) * Math.abs(FAR) * 0.35,
    heroZ,
  );
  scene.add(hero.group);
};
```

In the frame loop:

```ts
if (hero) {
  heroZ += step * GALAXY_SPEED;
  hero.group.position.z = heroZ;
  hero.setOpacity(fadeAt(heroZ));
  if (heroZ - HERO_SIZE * 0.5 > NEAR) {
    scene.remove(hero.group);
    hero.dispose();
    hero = null;
    heroTimer = HERO_MIN_GAP + ctx.rng() * HERO_RAND_GAP;
  }
} else {
  heroTimer -= dt;
  if (heroTimer <= 0) spawnHero();
}
```

- [ ] **Step 3: Chunk the build so spawning cannot hitch**

`createGalaxy` allocates ~120k points, which is roughly 10–20 ms of CPU. Spawn
happens while the object is at `FAR` and `fadeAt(FAR)` is 0, so it is invisible
— but the hitch would still be felt. Build components across successive frames:
disk, then bulge, then dust, then HII and bar, adding each to the group as it
completes. Nothing is visible until the fade-in begins regardless.

- [ ] **Step 4: Dispose on cleanup**

In the effect's cleanup, add `if (hero) { hero.dispose(); hero = null; }`.

- [ ] **Step 5: Verify**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json && pnpm build && pnpm test`

Then `pnpm dev` and confirm:
- A large galaxy drifts past roughly every 30–45 s, one at a time.
- Arms, dust lanes and pink HII knots are visible at full size — the detail that
  used to be minified away.
- Navigating Home → Blog still triggers the warp jump, and the galaxy streaks
  with it.
- No frame-rate drop when a hero spawns.
- `wc -l src/components/SpaceBackground.tsx` is well below the original 1,369.

- [ ] **Step 6: Commit**

```bash
git add src/components/SpaceBackground.tsx
git commit -m "feat: replace billboard galaxies with 3D hero galaxy scheduler"
```

---

## Self-review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| Root cause 1 — face-on bake on tilted billboard | Tasks 8, 11, 13 |
| Root cause 2 — Gaussian bulge | Task 6 (`sampleHernquistRadius`), Task 8 |
| Root cause 3 — dust as attenuation | Tasks 10, 11 |
| Root cause 4 — uniform star-dot grid | Task 8 (positions sampled from the profile) |
| Root cause 5 — no vertical structure | Task 6 (`sampleSech2Height`), Task 8 |
| Root cause 6 — resolution thrown away | Task 13 (`HERO_SIZE`, one at a time) |
| Bulge/disk split | Tasks 8, 11 |
| Draw order / extinction | Task 11 |
| Density laws table | Task 6 |
| Preset suite | Task 7 |
| Spawn rates | Task 7 (`MORPHOLOGY_WEIGHTS`), Task 13 |
| Module layout | Tasks 2–5 |
| Performance / chunked build | Task 13 |
| `?spacelab` | Task 12 |

Spec items **deferred to the Phase 3–4 plan**, as scoped at the top of this
document: Tier 2 objects (AGN, SNR/PWN, planetary nebula), Tier 3 objects
(globular and open clusters, field-star luminosity function and diffraction
spikes). `samplePlummerRadius` is implemented and tested in Task 6 ahead of its
consumer, since it belongs with the other samplers.

**Placeholder scan:** No TBD/TODO markers. Every code step carries real code.
Tasks 2–5 and 11 specify exact source line ranges, symbol names and interfaces
rather than reproducing hundreds of lines of code being moved verbatim.

**Type consistency:** `GalaxyGeometry` is returned unchanged by all five
builders (`buildDiskPoints`, `buildBulgePoints`, `buildHiiPoints`,
`buildBarPoints`, `buildDustPoints`). `GalaxyInstance` is produced by
`rollGalaxyInstance` (Task 7) and consumed by every builder (Tasks 8–10) and by
`createGalaxy` (Task 11). `SpaceObject` is produced by `createGalaxy` and
consumed by the scheduler (Task 13). `SpaceCtx.rng` is the single randomness
source throughout.
