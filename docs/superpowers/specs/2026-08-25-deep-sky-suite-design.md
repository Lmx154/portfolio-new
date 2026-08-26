# Deep-sky object suite — design

**Date:** 2026-08-25
**Component:** `src/components/SpaceBackground.tsx` → `src/space/*`
**Status:** approved design, ready for implementation planning

## Problem

The procedural galaxies in the space background read as low-quality — "flat
disks", "Mario 64 quality". Diagnosis against the current code:

1. **Galaxies are face-on paintings on a tilted billboard.** `GALAXY_BAKE_FRAG`
   works entirely in `vec2 c = vUv * 2.0 - 1.0` — a circular, face-on disk.
   `regenGalaxy` then tilts the *quad* (`mesh.rotation.set(...)`). Tilting a flat
   image foreshortens every component uniformly, so the **bulge squashes along
   with the disk**. A real inclined galaxy keeps a round bulge (a 3D spheroid)
   while only the disk compresses. That mismatch is what reads as "flat disk",
   and it makes edge-on views impossible.

2. **Wrong bulge law.** `coreD = exp(-r * r * uBulge)` is a Gaussian. Real
   bulges follow Sérsic n ≈ 4 (de Vaucouleurs r^¼), which has both a brighter
   nucleus and a halo reaching much further out. A Gaussian dies too fast, so
   cores render as small blurry dots with no extended glow.

3. **Dust is a dimmer, not an occluder.** `dens *= 1.0 - 0.6 * dust * armHere`
   attenuates arm brightness. Real dust lanes are foreground extinction that
   silhouettes against the bulge behind them. Attenuating arm light cannot
   produce the dark band across Centaurus A or NGC 253.

4. **Star-dot density is uniform, not physical.** `starLayer()` hashes a fixed
   grid at a fixed threshold, then masks the result by
   `smoothstep(0.03, 0.22, dens)`. Dots are laid down evenly and clipped, so
   their density does not follow the light profile, and all dots are roughly
   one size.

5. **No vertical structure.** There is no `z` anywhere in the galaxy shader — no
   disk thickness, so no edge-on view and no dust-lane geometry.

6. **Resolution thrown away.** Baked at 512² (256² mobile) but drawn at roughly
   100–260 px on screen. Mip minification averages away every HII knot and star
   speck before it is ever seen.

## Decisions taken

| Decision | Choice |
|---|---|
| Scale/magnification | **Cinematic cruise** — hero objects, rare and large (600–1200 px), one at a time. Not a literal magnification; it is the conceit the site already uses. Removes the minification problem at its root. |
| Render approach | **Hybrid** — smooth unresolved light + resolved 3D points + separate dust layer with extinction blending. |
| Object tiers | **Tiers 1–3**: core galaxy suite; exotic heroes (AGN / SNR / planetary nebula); resolved stellar populations (clusters + field-star realism). Tier 4 (rogue-planet flyby, gravitational lensing) **excluded**. |
| Spawn rates | **Real ratios within a category, curated weights across categories.** |
| Code structure | **Extract to `src/space/`.** |

### Explicitly out of scope

- **Rogue planets** — invisible at any magnification where a galaxy is also in
  frame (cold, unlit, sub-pixel). No honest rendering exists; excluded.
- **Pulsars as points** — unresolvable. The visible object is the pulsar wind
  nebula around one, which is covered by the SNR/PWN preset in Tier 2.
- **Black holes as objects** — invisible by definition. The visible signature is
  an AGN's jet and accretion glow, covered by the AGN preset in Tier 2.
- **Gravitational lensing** — real physics and spectacular, but needs a
  screen-space pass with real cost. Deferred.
- **The existing nebulae** — what the code calls `clusters` (`CLUSTER_COUNT = 4`)
  are nebula + importance-sampled star pairs. These already look good and are
  **not** changed by this work, beyond being moved during the extraction.

## Architecture

### The bulge/disk split

The core correction. Bulge and disk are different shapes and become different
primitives:

- **Bulge** — a spheroid, which projects to the same shape from every viewing
  angle (modulo axis ratio). Rendered as a **camera-facing sprite** with a
  Hernquist-projected profile. Never foreshortens.
- **Disk** — genuinely flat. Rendered as an **oriented quad plus a point cloud
  in the disk plane**. Foreshortens correctly with inclination.

The oriented quad is referred to below as the **disk continuum**: the smooth,
unresolved stellar light of the disk, carrying an exponential radial falloff
`e^(−R/h)` modulated by the same spiral arm function used to place points. It is
low-frequency by nature, so it can be baked at low resolution without visible
loss, and it is what keeps the disk from looking like loose confetti between the
resolved points.

Inclination then follows from correct statistics rather than tuning. For
randomly oriented disks, `cos i` is uniform, so:

```
i = acos(u),  u ~ U(0,1)
```

This yields edge-on views (i > 80°) ≈ **17%** of the time and near-face-on
(i < 20°) only ≈ **6%**. No separate "edge-on preset" is needed — dramatic
edge-on lanes appear at their real rate. Today's renderer produces face-on
pinwheels essentially always.

### Draw order — extinction

Extinction cannot be expressed with additive blending. Each galaxy draws in four
passes:

```
1. far half:   disk points + disk continuum      additive
2. bulge:      camera-facing sprite               additive
3. dust:       blendSrc ZERO, blendDst ONE_MINUS_SRC_ALPHA
4. near half:  disk points + HII knots            additive
```

Pass 3 multiplies down what passes 1–2 already wrote — real extinction, and the
mechanism that cuts a dark band across the bulge.

Orientation is fixed at spawn and the object only drifts, so the **far/near
split is computed once at build time** from the sign of the disk-plane
coordinate along the view axis. No per-frame sorting.

### Density laws

Every law is sampled by exact inverse-CDF except spiral arms, which use
rejection.

| Component | Law | Sampler |
|---|---|---|
| Disk radius | Σ(R) = Σ₀·e^(−R/h) | `R = −h·(ln u₁ + ln u₂)` — Gamma(2,h) |
| Disk height | ρ ∝ sech²(z/z₀), z₀ = h/9 | `z = z₀·atanh(2u − 1)` |
| Bulge | Hernquist ρ = M·a / (2π·r·(r+a)³) | `r = a·√u / (1 − √u)` |
| Globular cluster | Plummer ρ ∝ (1 + r²/a²)^(−5/2) | `r = a·u^(1/3) / √(1 − u^(2/3))` |
| Spiral arms | θ_arm(R) = ln(R/R₀) / tan p | rejection on `1 + A·cos(m(θ − θ_arm))`, arm width grows with R |
| HII regions | Kennicutt–Schmidt Σ_SFR ∝ Σ_gas^1.4 | weighted onto arm crests, tight σ_θ |
| Dust | same disk, z₀/2, θ offset **inward** of the stellar arm | density-wave prediction: gas shocks on the concave edge, stars form downstream |
| Star brightness | power-law luminosity function | many faint, few bright |

Justifications:

- **Gamma(2,h) for the disk.** Mass in an annulus is `dM ∝ Σ(R)·2πR dR ∝
  R·e^(−R/h) dR`, which is exactly Gamma(k=2, θ=h). A sum of two Exp(h) draws
  gives it, and `Exp(h) = −h·ln u`.
- **Hernquist for the bulge.** It has a closed-form inverse-CDF and projects to
  a profile very close to de Vaucouleurs r^¼ (Hernquist 1990), so it buys the
  correct r^¼ appearance without a numerical inversion.
- **Dot density.** Resolved stars are *samples of* the density field, so their
  spatial density follows the light profile by construction. This replaces the
  uniform hash grid that is masked after the fact.

Sérsic index conversion where needed: `b_n ≈ 2n − 1/3 + 0.009876/n`.

### Preset suite

Per-instance jitter on every row: pitch ±2°, B/T ±20%, colour gradient, HII
abundance, and inclination from `acos(u)`.

| Preset | p (pitch) | m (arms) | B/T | z₀/h | HII | dust | colour |
|---|---|---|---|---|---|---|---|
| Sa / SBa | 8–12° | 2 | 0.50 | 0.10 | low | heavy | red-yellow |
| Sb / SBb | 14–20° | 2 | 0.25 | 0.09 | med | med | balanced |
| Sc / SBc | 22–28° | 2–4 | 0.08 | 0.08 | high | light | blue |
| S0 | — | 0 | 0.60 | 0.12 | none | thin lane | red |
| E0–E7 | — | — | 1.00 | — | none | none | red, q 1.0 → 0.3 |
| Irr | — | — | 0.02 | 0.20 | very high | patchy | blue, tidal tails |

Barred variants (`SB*`) place a stellar bar through the centre and start both
arms at the bar tips, phase-locked so crests meet the ends of the bar.

**Tier 2 — exotic heroes**

- **AGN** — collimated relativistic jet with brightness knots along its length,
  two radio lobes, on an elliptical or S0 host carrying a dust lane.
- **SNR / pulsar wind nebula** — filamentary expanding shell with
  Rayleigh–Taylor structure, synchrotron core glow, pulsing nucleus with polar
  jets.
- **Planetary nebula** — small bipolar or ring shell, OIII teal + Hα red, hot
  white-dwarf core.

**Tier 3 — resolved stellar populations**

- **Globular cluster** — Plummer profile, old red stars, dense resolved core.
- **Open cluster** — loose, young, blue, with residual nebulosity.
- **Field stars** — real stellar luminosity function (many faint red, few bright
  blue) replacing near-uniform dots, plus 4-point diffraction spikes on the
  brightest handful.

### Spawn rates

Real ratios *within* a category; curated weights *across* categories. The
deviation is deliberate: strict realism would show mostly faint dwarf smudges
and a visible jet in well under 1% of spawns, so the sky would read as empty.

- Galaxy morphology holds the real bright-end mix, spirals : ellipticals+S0 :
  irregulars ≈ **60 : 25 : 15**.
- Inclination distribution is exactly real (`acos(u)`).
- The Schechter luminosity function (α ≈ −1.25) shapes size within a category,
  but is **truncated** at the faint end so dwarfs do not dominate.
- AGN is lifted to ≈**3%** of hero spawns, from a real rate closer to 1%.

All weights live in one table in `presets.ts` and are retunable in one place.

### Module layout

`SpaceBackground.tsx` is ~1,369 lines, effectively one `useEffect` spanning
lines 506–1355 with every builder closure-scoped over `renderer`, `scene`,
`bakeInto`, and the tunables. Extraction requires those builders to become pure
functions taking an explicit context object rather than capturing scope:

```ts
type SpaceCtx = {
  renderer: THREE.WebGLRenderer;
  bakeInto: (t: THREE.WebGLRenderTarget | null, m: THREE.ShaderMaterial) => void;
  isMobile: boolean;
  rng: () => number;      // seeded, so ?spacelab is reproducible
};
```

Each builder returns a uniform handle so the scheduler can treat all object
types alike:

```ts
type SpaceObject = {
  group: THREE.Object3D;
  setOpacity: (o: number) => void;
  dispose: () => void;
};
```

Target layout:

```
src/space/sampling.ts   seeded RNG + inverse-CDF samplers
src/space/presets.ts    preset + abundance tables (the tuning surface)
src/space/galaxy.ts     galaxy builder
src/space/deepSky.ts    cluster / AGN / SNR / planetary builders
src/space/field.ts      field stars + diffraction spikes
src/components/SpaceBackground.tsx   scene, camera, loop, warp, hero scheduler
```

The nebula bake moves as-is; its behaviour is unchanged.

### Performance

- ~120k points per hero galaxy: disk 70k, bulge 30k, HII 8k, dust 15k.
- One hero on screen at a time → 4–6 draw calls.
- Point counts halve on mobile via the existing `isMobile` flag.
- CPU build is ~10–20 ms, so it is **chunked across frames while the object is
  still at `FAR` and fully faded out**. No hitch on spawn.
- Galaxy points reuse the existing `starMaterial` vertex path, so warp streaks
  apply to galaxies for free.

## Implementation phases

Four phases, each independently verifiable. Phase 1 is a prerequisite for the
rest; phases 3 and 4 are additive and could be dropped without affecting
phase 2.

1. **Extraction, no behaviour change.** Create `src/space/`, move the nebula,
   field-star, meteor and warp systems out of the single `useEffect` behind the
   `SpaceCtx` / `SpaceObject` interfaces. Galaxies move as-is, still using the
   old bake shader. Verified by the background looking and performing exactly as
   it does today.
2. **Galaxy rewrite (Tier 1).** Add `sampling.ts`, `presets.ts`, `galaxy.ts`;
   replace the baked-billboard galaxy with the bulge/disk split, the four-pass
   draw order, and the preset suite. Add the `?spacelab` harness here — it is
   the tuning loop for this phase, so it needs to land with it, not after.
   This phase alone resolves the original complaint.
3. **Exotic heroes (Tier 2).** AGN, SNR/PWN, planetary nebula in `deepSky.ts`.
4. **Resolved stellar populations (Tier 3).** Globular and open clusters, then
   the field-star luminosity function and diffraction spikes in `field.ts`.

## Verification

- `tsc --noEmit -p tsconfig.app.json` stays clean (it is clean today).
- `vite build` succeeds.
- **`?spacelab` URL flag** renders every preset at fixed seeds in a grid, so the
  whole suite can be reviewed side by side and tuned against reference images
  without waiting for a hero object to drift past. Seeded RNG makes each cell
  reproducible across reloads.
- Visual checks against the reference set: an inclined grand-design spiral
  (NGC 4258-like), an edge-on dusty disk (NGC 253-like), and an AGN with a jet
  (Centaurus A-like).
- Confirm the bulge stays round while the disk foreshortens, at several
  inclinations, in `?spacelab`.

## Risks

- **Extraction touches working code.** The nebula, field-star, meteor, and warp
  systems all currently share closure scope. The extraction must preserve their
  behaviour exactly; the galaxy rewrite is the only intended behaviour change.
  Sequencing the extraction as its own step, verified before any new object work
  begins, contains this.
- **Point-count tuning is empirical.** The 120k budget is an estimate; the
  `?spacelab` harness exists partly to find the real floor where the bulge stops
  looking grainy.
- **Curated spawn weights are a judgement call**, documented as a deliberate
  deviation from realism so they can be retuned without re-deriving intent.
