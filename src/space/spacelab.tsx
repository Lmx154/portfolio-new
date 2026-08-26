import * as THREE from 'three';
import { createBakeRig } from './bakeRig';
import { createGalaxy } from './galaxy';
import { GALAXY_PRESETS, type GalaxyClass, type GalaxyInstance } from './presets';
import { sampleInclination } from './sampling';
import { makeRng } from './rng';
import type { SpaceCtx, SpaceObject } from './types';

/*
 * `?spacelab` — a static preset-grid harness for `createGalaxy`.
 *
 * Tasks 6-11 built the 3D galaxy renderer entirely against unit tests; nobody
 * has looked at its output. This mounts a grid — one row per `GalaxyClass`,
 * four seeded columns per row, plus two diagnostic rows — so a human can
 * finally judge the morphologies and say what needs tuning.
 *
 * Every cell is seeded (`makeRng(seed)`), so a given seed always produces the
 * same points: reloading the page gives byte-identical cells, which is what
 * turns "cell 3 of the Sc row looks wrong" into a reproducible bug report.
 *
 * The whole grid renders ONCE. There is no drift, no warp, no cruise, and no
 * rAF loop — cells are meant to sit still so they can be compared side by
 * side, and `uTime` is never advanced (expected: Task 13 adds the per-frame
 * hook that drives twinkle in the real scene).
 *
 * Mounting: `mountSpacelab` expects to own a plain, normal-flow container
 * (see `App.tsx`'s `SpacelabPage`) that is free to grow to the grid's full
 * height — the page itself scrolls, not some inner clipped box. It must NOT
 * be mounted underneath the normal site chrome (that was tried once and
 * produced a fixed background layer fighting the page's own scroll, with
 * the homepage rendered on top of it).
 *
 * Layout technique: one shared `WebGLRenderer` draws every cell's own
 * `THREE.Scene`/camera into a disjoint rectangle of one big canvas via
 * `setViewport`/`setScissor` (the standard multi-view Three.js pattern) —
 * cheaper than juggling ~40 separate WebGL contexts, which most browsers
 * cap well below that count. Captions are plain DOM nodes absolutely
 * positioned over the same coordinate space as the canvas, inside one
 * `position:relative` wrapper, so the two line up exactly.
 */

/** True when the page was loaded with `?spacelab` in the query string. */
export function isSpacelab(): boolean {
  return new URLSearchParams(window.location.search).has('spacelab');
}

// ---- Layout constants ------------------------------------------------------
// All sizes are fixed CSS px, independent of window size or devicePixelRatio,
// so a given seed renders the same pixels on any machine (modulo AA/sprite
// edge subpixel differences from a different devicePixelRatio) — the page
// grows to fit the grid and scrolls normally rather than the grid reflowing
// with the viewport.
//
// `instanceForClass` draws pitch, then arm index, then bulge-fraction jitter,
// then inclination, in that fixed order, for every class — so for a given
// seed, the raw rng() value behind inclination is identical across all 9
// rows regardless of which class occupies them. Seeds 1-4 happen to give
// 11.2°, 57.5°, 85.7°, 85.3° — two near-duplicate edge-on columns and no
// coverage of the 60-80° band. These four were hand-picked (by running
// `instanceForClass` over many seeds) for a spread across the sampled
// distribution instead: low, low-mid, mid-high, edge-on.
const GRID_SEEDS = [1, 19, 15, 3]; // ~11.2°, ~40.8°, ~63.5°, ~85.7°
// The dust row fixes inclination explicitly (see DUST_INCLINATION_DEG below),
// so the seed-vs-inclination coupling above doesn't apply here — plain
// sequential seeds are fine and keep that row's labels simple.
const DUST_SEEDS = [1, 2, 3, 4];
const CELL_W = 340;
const CELL_H = 340;
const CAPTION_H = 64;
const ROW_GAP = 16;
const COL_GAP = 16;
const HEADER_H = 32;
const HEADER_GAP = 14;
const SECTION_GAP = 36;

const ROW_H = CELL_H + CAPTION_H;
const COLS = GRID_SEEDS.length; // 4, shared by every row including the dust/inclination rows
const GRID_W = COLS * CELL_W + (COLS - 1) * COL_GAP;

// Matches Task 13's planned `HERO_SIZE` so this harness previews galaxies at
// the same world scale the hero scheduler will actually use.
const BASE_WORLD_SIZE = 900;
// The grid builds ~44 galaxies once at page load rather than one at a time
// during a cruise, so this favours fast iteration over hero-scene density —
// it is a harness-only choice, unrelated to the eventual hero point budget.
const POINT_BUDGET = 40000;
// Matches the main scene's camera FOV. STAR_VERT sizes point sprites as
// `aSize * uSizeScale / depth` — independent of FOV — so using the same FOV
// as production means a cell's camera distance (chosen below to fill the
// frame) puts point sprites at roughly the size/brightness they'd have in
// the real hero view, rather than an arbitrary close-up that misrepresents
// the `sizeScale`/`minPx` tuning this harness exists to expose.
const CAMERA_FOV = 70;
const FRAME_MARGIN = 1.2;

const deg2rad = (deg: number) => (deg * Math.PI) / 180;
const rad2degStr = (rad: number) => `${((rad * 180) / Math.PI).toFixed(1)}°`;

type RowSpec = {
  cls: GalaxyClass;
  seed: number;
  /** Radians. Overrides the instance's sampled inclination when set. */
  inclinationOverride?: number;
};

type Cell = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Top-left origin in the wrapper's CSS-px coordinate space. */
  x: number;
  y: number;
};

/**
 * Build one `GalaxyInstance` for a specific class, deliberately skipping the
 * weighted class roll `rollGalaxyInstance` does internally — the grid row
 * pins the class, not chance. Every other draw (pitch, arms, bulge fraction,
 * inclination, position angle, scale) mirrors `rollGalaxyInstance` exactly,
 * so a cell is what that function would have produced had it rolled this
 * class on this seed.
 */
function instanceForClass(cls: GalaxyClass, rng: () => number): GalaxyInstance {
  const preset = GALAXY_PRESETS[cls];
  const [lo, hi] = preset.pitchDeg;
  const pitchDeg = lo + rng() * (hi - lo);
  return {
    preset,
    pitchRad: (pitchDeg * Math.PI) / 180,
    arms: preset.arms[Math.floor(rng() * preset.arms.length)],
    bulgeFraction: Math.min(1, Math.max(0, preset.bulgeFraction * (0.8 + rng() * 0.4))),
    inclination: sampleInclination(rng),
    positionAngle: rng() * Math.PI * 2,
    scale: 0.7 + rng() * 0.7,
  };
}

/**
 * Fit `camera` so `object`'s bounding sphere fills most of the frame: places
 * it on +z from the sphere's center at the distance a perspective frustum of
 * `camera.fov` needs to inscribe that sphere (exact `asin` relation, not the
 * far-field `atan` approximation), then backs off by `FRAME_MARGIN` so nothing
 * clips the cell edge.
 */
function frameCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D): void {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const radius = Math.max(sphere.radius, 1e-3);
  const halfFovRad = (camera.fov * Math.PI) / 360;
  const dist = (radius * FRAME_MARGIN) / Math.sin(halfFovRad);

  camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z + dist);
  camera.lookAt(sphere.center);
  camera.near = Math.max(0.1, dist - radius * 4);
  camera.far = dist + radius * 6;
  camera.updateProjectionMatrix();
}

/** Mount the `?spacelab` grid into `container`. Returns a cleanup function. */
export function mountSpacelab(container: HTMLElement): () => void {
  const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
  const pixelRatio = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2);

  const root = document.createElement('div');
  // `position:relative` so the absolutely-positioned canvas/captions/headers
  // below are positioned relative to this element, not the page. `container`
  // itself is expected to be a plain, normal-flow element (see `SpacelabPage`
  // in App.tsx) that grows to fit `root`, so the browser's own page scroll —
  // not an inner clipped box — is what reaches every row.
  root.style.cssText =
    'position:relative;color:#dfe6f2;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;padding:16px;';
  container.appendChild(root);

  const title = document.createElement('div');
  title.textContent =
    '?spacelab — galaxy preset harness. Rows are fixed GalaxyClass, columns are fixed seeds. Reload for byte-identical cells.';
  title.style.cssText = 'margin-bottom:16px;font-size:14px;font-weight:600;color:#fff;';
  root.appendChild(title);

  const gridWrap = document.createElement('div');
  gridWrap.style.cssText = `position:relative;width:${GRID_W}px;`;
  root.appendChild(gridWrap);

  // ---- Renderer: one shared canvas, one shared bake rig ------------------
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 1);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;top:0;left:0;display:block;';
  gridWrap.appendChild(canvas);

  const { bakeInto, makeTarget, dispose: disposeBakeRig } = createBakeRig(renderer);

  const cells: Cell[] = [];
  const objects: SpaceObject[] = [];

  let cursorY = 0;

  const addHeader = (text: string): void => {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `position:absolute;left:0;top:${cursorY}px;width:${GRID_W}px;height:${HEADER_H}px;font-size:13px;font-weight:600;color:#fff;border-bottom:1px solid rgba(255,255,255,0.18);display:flex;align-items:flex-end;`;
    gridWrap.appendChild(el);
    cursorY += HEADER_H + HEADER_GAP;
  };

  const addRow = (specs: RowSpec[]): void => {
    const rowTop = cursorY;
    specs.forEach((spec, col) => {
      const x = col * (CELL_W + COL_GAP);
      const y = rowTop;

      const rng = makeRng(spec.seed);
      const instance = instanceForClass(spec.cls, rng);
      if (spec.inclinationOverride !== undefined) instance.inclination = spec.inclinationOverride;

      // A fresh SpaceCtx per cell (own rng) sharing the one renderer/bake rig,
      // per the task brief.
      const ctx: SpaceCtx = { renderer, bakeInto, makeTarget, isMobile, rng };
      const object = createGalaxy(ctx, {
        instance,
        worldSize: BASE_WORLD_SIZE * instance.scale,
        pointBudget: POINT_BUDGET,
      });
      object.setOpacity(1);
      objects.push(object);

      const scene = new THREE.Scene();
      scene.add(object.group);
      const camera = new THREE.PerspectiveCamera(CAMERA_FOV, CELL_W / CELL_H, 0.1, 100000);
      frameCamera(camera, object.group);
      cells.push({ scene, camera, x, y });

      const caption = document.createElement('div');
      const armsTxt = instance.arms > 0 ? ` · arms ${instance.arms}` : '';
      caption.textContent =
        `${spec.cls} · seed ${spec.seed} · pitch ${rad2degStr(instance.pitchRad)}` +
        ` · incl ${rad2degStr(instance.inclination)} · B/T ${instance.bulgeFraction.toFixed(2)}${armsTxt}`;
      caption.style.cssText = `position:absolute;left:${x}px;top:${y + CELL_H + 6}px;width:${CELL_W}px;height:${CAPTION_H - 6}px;font-size:11px;color:#b9c4d6;overflow:hidden;`;
      gridWrap.appendChild(caption);
    });
    cursorY += ROW_H;
  };

  // ---- Section 1: every GalaxyClass, seeds chosen for inclination spread --
  addHeader(
    `Galaxy classes × seeds ${GRID_SEEDS.join(', ')} (row = class, column = seed — chosen for inclination spread, see comment above)`,
  );
  const classes = Object.keys(GALAXY_PRESETS) as GalaxyClass[];
  classes.forEach((cls, i) => {
    addRow(GRID_SEEDS.map((seed) => ({ cls, seed })));
    if (i < classes.length - 1) cursorY += ROW_GAP;
  });

  // ---- Section 2: inclination sweep ---------------------------------------
  // The direct evidence for the defect this project exists to fix: the bulge
  // (a 3D Hernquist spheroid) must stay round while the disk foreshortens as
  // inclination increases. The old billboard renderer squashed both.
  cursorY += SECTION_GAP;
  const INCLINATION_SEED = 1;
  addHeader(
    `Inclination sweep — Sb, seed ${INCLINATION_SEED} — bulge stays round, disk foreshortens`,
  );
  addRow(
    [0, 30, 60, 85].map((deg) => ({
      cls: 'Sb' as GalaxyClass,
      seed: INCLINATION_SEED,
      inclinationOverride: deg2rad(deg),
    })),
  );

  // ---- Section 3: dust lane check ------------------------------------------
  // No unit test verifies extinction; this row is its only check. Far-side
  // light should visibly dim where the dust lane crosses it, near-side stars
  // should sit crisp on top, and the near/far split should show no hard seam.
  cursorY += SECTION_GAP;
  const DUST_INCLINATION_DEG = 80;
  addHeader(
    `Dust lanes — SBb @ ~${DUST_INCLINATION_DEG}° inclination, seeds ${DUST_SEEDS.join(', ')} — far side dims, near side crisp`,
  );
  addRow(
    DUST_SEEDS.map((seed) => ({
      cls: 'SBb' as GalaxyClass,
      seed,
      inclinationOverride: deg2rad(DUST_INCLINATION_DEG),
    })),
  );

  const totalHeight = cursorY;
  gridWrap.style.height = `${totalHeight}px`;
  renderer.setSize(GRID_W, totalHeight, true);

  // ---- Render once: static grid, no rAF loop ------------------------------
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, GRID_W, totalHeight);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const cell of cells) {
    // Three.js viewport/scissor use a lower-left origin; our layout math uses
    // a top-down DOM origin, so flip y here.
    const glY = totalHeight - (cell.y + CELL_H);
    renderer.setViewport(cell.x, glY, CELL_W, CELL_H);
    renderer.setScissor(cell.x, glY, CELL_W, CELL_H);
    renderer.render(cell.scene, cell.camera);
  }
  renderer.setScissorTest(false);

  return () => {
    for (const object of objects) object.dispose();
    disposeBakeRig();
    renderer.dispose();
    renderer.forceContextLoss();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    if (root.parentNode === container) container.removeChild(root);
  };
}
