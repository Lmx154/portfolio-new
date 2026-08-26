import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createBakeRig } from '../space/bakeRig';
import { createNebulaField } from '../space/nebula';
import { createFieldStars } from '../space/field';
import { createMeteors } from '../space/meteors';
import { createGalaxyIncremental, type GalaxyHandle } from '../space/galaxy';
import { rollGalaxyInstance } from '../space/presets';
import { makeRng } from '../space/rng';
import type { SpaceCtx } from '../space/types';

/*
 * Dynamic "cruising through space" background.
 *
 * Nebulae are soft, self-shadowed gas clouds. Each cloud is BAKED once into a
 * texture (billowy multi-octave fBm, gentle domain drift, blob-shaped
 * envelopes, density-difference lighting) and then drawn as a plain textured
 * quad — so the expensive shader runs once per cloud, not per pixel per
 * frame. This is both why the gas looks like cumulus instead of marbled silk
 * (no ridged-filament term, low warp) and why the wallpaper is cheap at
 * runtime.
 *
 * Each nebula is also rendered to a small offscreen buffer; stars are
 * importance-sampled from that exact output, so they sit in the bright
 * clumps and take the local gas color.
 *
 * Extras for realism: one large "hero" galaxy (a real 3D point-cloud disk +
 * bulge + dust + HII regions, see src/space/galaxy.ts) drifting slowly past
 * every so often, occasional shooting stars, and subtle per-star twinkle.
 *
 * Pure Three.js — no asset files, no new deps.
 */

// ---- Scene tunables --------------------------------------------------------
const FIELD_STARS = 1400;
const CLUSTER_COUNT = 4;
const STARS_PER_CLUSTER = 420;
const METEOR_MAX = 3;

const FAR = -2200;
const NEAR = -40;
const FADE_IN = 750;
const FADE_OUT = 440;
const CRUISE_SPEED = 34;
const FIELD_SPREAD = 0.72;
const MIN_PX = 1.8;

// ---- Warp jump (page transition) ------------------------------------------
// On navigation we briefly slam the cruise speed up so the field rushes past,
// stretch stars into comet streaks, then ease back down to CRUISE_SPEED.
const WARP_SPEED = 1700; // peak forward speed while warping (~50x cruise)
const WARP_ATTACK = 9; // how fast warp intensity ramps up (per second)
const WARP_DECAY = 2.6; // how fast it eases back down (per second)
const WARP_HOLD = 0.16; // seconds held at peak before decaying
const STREAK_MAX = 600; // world-space length of a star streak at full warp
const GAS_OPACITY = 0.9; // overall nebula brightness
const SAMPLE_RES = 128; // offscreen buffer size used for star placement
const GALAXY_SPEED = 0.35; // galaxies drift slower than the field → feel distant
const METEOR_MIN_WAIT = 5; // seconds between shooting stars (min)
const METEOR_RAND_WAIT = 11; // + up to this many more

// ---- Hero galaxy scheduler -------------------------------------------------
// Hero objects are rare and large: at most one on screen, spawned far away and
// retired once it passes the camera. This is what buys the on-screen size that
// makes real structure visible — the old renderer showed three small galaxies
// at once and minified all the detail away.
const HERO_MAX = 1; // never more than one hero galaxy at a time
const HERO_MIN_GAP = 26; // seconds after one retires before the next spawns
const HERO_RAND_GAP = 18; // plus up to this many more
const HERO_SIZE = 900; // world units; ~600-1200 px on screen near mid-field
const HERO_POINT_BUDGET = 120000; // createGalaxy halves this internally on mobile
// Per-frame time budget (ms) for chunked hero construction — see galaxy.ts's
// createGalaxyIncremental. Comfortably under a 16.7ms (60fps) frame even
// stacked with the rest of this loop's work; the build simply takes a few
// more frames on a slower device instead of ever blocking one.
const HERO_BUILD_BUDGET_MS = 6;
// Depth at which a reduced-motion visitor's single static hero is placed —
// squarely inside the [FAR+FADE_IN, NEAR-FADE_OUT] band where `fadeAt`
// evaluates to 1, so it renders at full opacity instead of at FAR (where it
// would be invisible) or drifting toward NEAR (there is no drift here).
const HERO_STATIC_Z = (FAR + NEAR) / 2;

const SPACE_VIGNETTE = 'radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0) 65%)';

const SpaceBackground = ({ warpSignal = 0 }: { warpSignal?: number }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Set by the scene effect; called from the warpSignal effect below to kick
  // off a warp jump without tearing down / rebuilding the Three.js scene.
  const triggerWarpRef = useRef<(() => void) | null>(null);
  const lastSignal = useRef(warpSignal);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cruiseSpeed = CRUISE_SPEED;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;

    // --- Renderer / scene / camera ---
    // No MSAA: stars are soft sprites and gas quads fade at their edges, so
    // multisampling buys nothing here while costing memory + fill rate.
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    const pixelRatio = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1);
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 5000);
    camera.position.set(0, 0, 0);

    const sizeScale = () => window.innerHeight * 0.5;

    // -----------------------------------------------------------------------
    // Bake rig: one ortho quad scene reused for every nebula bake. The hero
    // galaxy doesn't bake anything — it's plain BufferGeometry/ShaderMaterial
    // point clouds — but SpaceCtx is shared, so it still carries bakeInto/
    // makeTarget for the nebula field to use.
    // -----------------------------------------------------------------------
    const { bakeInto, makeTarget, dispose: disposeBakeRig } = createBakeRig(renderer);

    const ctx: SpaceCtx = {
      renderer,
      bakeInto,
      makeTarget,
      isMobile,
      // Random per page load; a later `?spacelab` mode will pin this seed.
      rng: makeRng(Math.floor(Math.random() * 0xffffffff)),
    };

    // ---------------------------------------------------------------------
    // Field stars (+ warp streaks — a rendering mode of the same buffers)
    // ---------------------------------------------------------------------
    const field = createFieldStars(ctx, {
      count: FIELD_STARS,
      spread: FIELD_SPREAD,
      far: FAR,
      near: NEAR,
      minPx: MIN_PX,
      sizeScale: sizeScale(),
      pixelRatio,
      fadeIn: FADE_IN,
      fadeOut: FADE_OUT,
    });
    scene.add(field.group);

    const fadeAt = (z: number) => {
      const fin = THREE.MathUtils.smoothstep(z, FAR, FAR + FADE_IN);
      const fout = 1 - THREE.MathUtils.smoothstep(z, NEAR - FADE_OUT, NEAR);
      return Math.max(0, Math.min(1, fin * fout));
    };

    // ---------------------------------------------------------------------
    // Nebulae: baked gas-cloud quads + stars sampled from each cloud
    // ---------------------------------------------------------------------
    const nebulae = createNebulaField(ctx, {
      count: CLUSTER_COUNT,
      starsPerCloud: STARS_PER_CLUSTER,
      sampleRes: SAMPLE_RES,
      gasOpacity: GAS_OPACITY,
      far: FAR,
      near: NEAR,
      sizeScale: sizeScale(),
      pixelRatio,
      minPx: MIN_PX,
      fadeIn: FADE_IN,
      fadeOut: FADE_OUT,
    });
    scene.add(nebulae.group);
    // Prime positions/opacity before the first render — mirrors the one-time
    // writeClusterPositions() call the pre-extraction code made here.
    nebulae.advance(0, fadeAt);

    // ---------------------------------------------------------------------
    // Hero galaxy: one large 3D point-cloud galaxy (src/space/galaxy.ts)
    // drifting past at a time. Rare-and-large is the point — the old
    // renderer showed three small baked billboards at once and minified all
    // the structure (arms, dust lanes, HII knots) away. `createGalaxyIncremental`
    // spreads its ~120k-point build across many frames (see galaxy.ts) so the
    // spawn — which happens off-screen, at FAR, where `fadeAt` is 0 — never
    // costs a dropped frame; the finished `group` is added to the scene only
    // once the build completes.
    // ---------------------------------------------------------------------
    let hero: GalaxyHandle | null = null;
    let heroBuild: { step: (budgetMs: number) => GalaxyHandle | null } | null = null;
    let heroZ = FAR;
    let heroX = 0;
    let heroY = 0;
    // First hero arrives sooner than a full retire-to-spawn gap would give,
    // so the effect isn't waiting HERO_MIN_GAP seconds after page load.
    let heroTimer = HERO_MIN_GAP * 0.3;

    const activeHeroCount = () => (hero ? 1 : 0) + (heroBuild ? 1 : 0);

    const spawnHero = () => {
      if (activeHeroCount() >= HERO_MAX) return;
      const instance = rollGalaxyInstance(ctx.rng);
      heroX = (ctx.rng() - 0.5) * Math.abs(FAR) * 0.5;
      heroY = (ctx.rng() - 0.5) * Math.abs(FAR) * 0.35;
      heroZ = FAR;
      heroBuild = createGalaxyIncremental(ctx, {
        instance,
        worldSize: HERO_SIZE * instance.scale,
        pointBudget: HERO_POINT_BUDGET,
      });
    };

    // ---------------------------------------------------------------------
    // Shooting stars: a small pool of head+tail meteors on random timers
    // ---------------------------------------------------------------------
    const meteors = createMeteors(ctx, {
      max: METEOR_MAX,
      minWait: METEOR_MIN_WAIT,
      randWait: METEOR_RAND_WAIT,
      sizeScale: sizeScale(),
      pixelRatio,
    });
    scene.add(meteors.group);

    // --- Mouse parallax ---
    let targetX = 0;
    let targetY = 0;
    const onPointerMove = (e: PointerEvent) => {
      targetX = e.clientX / window.innerWidth - 0.5;
      targetY = e.clientY / window.innerHeight - 0.5;
    };
    if (!prefersReducedMotion) window.addEventListener('pointermove', onPointerMove);

    // --- Resize ---
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      field.onResize(sizeScale());
      nebulae.onResize(sizeScale());
      meteors.onResize(sizeScale());
      if (prefersReducedMotion) renderer.render(scene, camera);
    };
    window.addEventListener('resize', onResize);

    // --- Warp jump state ---
    // warp eases toward warpTarget; a nav bump sets target=1 and a hold window,
    // after which target drops back to 0 and the field decelerates to cruise.
    let warp = 0;
    let warpTarget = 0;
    let warpHoldUntil = 0;
    const triggerWarp = () => {
      if (prefersReducedMotion) return;
      warpTarget = 1;
      warpHoldUntil = clock.elapsedTime + WARP_HOLD;
    };
    triggerWarpRef.current = triggerWarp;

    // --- Animation ---
    const clock = new THREE.Clock();
    let raf = 0;
    let contextLost = false;
    // Cap the frame rate on mobile to save battery/GPU; the slow cruise looks
    // identical at 30fps. Desktop runs uncapped for the smoothest parallax.
    const minDelta = isMobile ? 1 / 30 : 0;
    let acc = 0;
    const renderFrame = () => {
      raf = requestAnimationFrame(renderFrame);
      const delta = clock.getDelta();
      if (minDelta > 0) {
        acc += delta;
        if (acc < minDelta) return;
      }
      const dt = Math.min(minDelta > 0 ? acc : delta, 0.05);
      acc = 0;

      // Advance the warp envelope: fast attack up to the hold window, then decay.
      if (warpTarget === 1 && clock.elapsedTime >= warpHoldUntil) warpTarget = 0;
      const wRate = warpTarget > warp ? WARP_ATTACK : WARP_DECAY;
      warp += (warpTarget - warp) * Math.min(1, wRate * dt);
      if (warpTarget === 0 && warp < 0.0005) warp = 0;
      const warpEased = warp * warp * (3 - 2 * warp); // smoothstep
      const step = (cruiseSpeed + warpEased * (WARP_SPEED - cruiseSpeed)) * dt;

      field.advance(step);

      // Drive the warp streaks + dim the round stars while warping.
      field.setWarp(warpEased, STREAK_MAX, clock.elapsedTime, warp);
      nebulae.setWarp(warpEased, clock.elapsedTime);
      if (hero) hero.setWarp(warpEased);

      nebulae.advance(step, fadeAt);

      // Hero galaxy: drifts by slower than the field (parallax says "much
      // farther away"), fades in/out with the same envelope as everything
      // else, and retires once past the camera.
      if (hero) {
        heroZ += step * GALAXY_SPEED;
        hero.group.position.z = heroZ;
        hero.setOpacity(fadeAt(heroZ));
        hero.advance(clock.elapsedTime);
        if (heroZ - HERO_SIZE * 0.5 > NEAR) {
          scene.remove(hero.group);
          hero.dispose();
          hero = null;
          heroTimer = HERO_MIN_GAP + ctx.rng() * HERO_RAND_GAP;
        }
      } else if (heroBuild) {
        // Chunked build in progress — do a small time-boxed slice of it this
        // frame. Nothing is visible until this resolves and the group is
        // actually added below, so a build spanning many frames is invisible.
        const built = heroBuild.step(HERO_BUILD_BUDGET_MS);
        if (built) {
          heroBuild = null;
          hero = built;
          hero.group.position.set(heroX, heroY, heroZ);
          hero.setOpacity(fadeAt(heroZ));
          scene.add(hero.group);
        }
      } else {
        heroTimer -= dt;
        if (heroTimer <= 0) spawnHero();
      }

      // Shooting stars (not during warp — streaks own that moment).
      meteors.update(dt, warpEased);

      camera.position.x += (targetX * 26 - camera.position.x) * 0.03;
      camera.position.y += (-targetY * 26 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, -600);

      renderer.render(scene, camera);
    };

    if (prefersReducedMotion) {
      // spawnHero() is only ever called from inside renderFrame, which never
      // runs under reduced motion — so without this, the headline feature of
      // this branch (a real 3D galaxy) would never appear for that audience,
      // where before it was baked during setup and present in every static
      // render. Build one hero to completion (no per-frame time budget to
      // respect, since there is no render loop here) and place it well inside
      // the fully-faded-in band before the single static frame below.
      const instance = rollGalaxyInstance(ctx.rng);
      heroX = (ctx.rng() - 0.5) * Math.abs(FAR) * 0.5;
      heroY = (ctx.rng() - 0.5) * Math.abs(FAR) * 0.35;
      heroZ = HERO_STATIC_Z;
      const build = createGalaxyIncremental(ctx, {
        instance,
        worldSize: HERO_SIZE * instance.scale,
        pointBudget: HERO_POINT_BUDGET,
      });
      let built: GalaxyHandle | null = null;
      while (!built) built = build.step(Number.POSITIVE_INFINITY);
      hero = built;
      hero.group.position.set(heroX, heroY, heroZ);
      hero.setOpacity(fadeAt(heroZ));
      scene.add(hero.group);

      camera.lookAt(0, 0, -600);
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(renderFrame);
    }

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf && !prefersReducedMotion && !contextLost) {
        clock.getDelta();
        acc = 0;
        raf = requestAnimationFrame(renderFrame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Survive a lost GL context. If the browser ever drops this context (e.g.
    // too many contexts elsewhere), pause and — once restored — resume. Calling
    // preventDefault() opts into restoration; three.js re-uploads its resources
    // on the next render, so the field comes back instead of staying black.
    // Baked textures live in render targets, so they must be re-rendered too.
    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onContextRestored = () => {
      contextLost = false;
      // Rebake every nebula — RT contents don't survive context loss. The hero
      // galaxy is plain BufferGeometry/ShaderMaterial (no render-target bake),
      // so three.js's own context-restore re-upload is all it needs.
      nebulae.rebake();
      if (prefersReducedMotion) {
        camera.lookAt(0, 0, -600);
        renderer.render(scene, camera);
      } else if (!raf && !document.hidden) {
        clock.getDelta();
        acc = 0;
        raf = requestAnimationFrame(renderFrame);
      }
    };
    canvas.addEventListener('webglcontextlost', onContextLost as EventListener);
    canvas.addEventListener('webglcontextrestored', onContextRestored as EventListener);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost as EventListener);
      canvas.removeEventListener('webglcontextrestored', onContextRestored as EventListener);
      field.dispose();
      nebulae.dispose();
      meteors.dispose();
      if (hero) {
        hero.dispose();
        hero = null;
      }
      heroBuild = null;
      disposeBakeRig();
      renderer.dispose();
      renderer.forceContextLoss();
      triggerWarpRef.current = null;
      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, []);

  // Fire a warp jump whenever the route (warpSignal) changes. The scene itself
  // is never rebuilt, so the field keeps flowing across page transitions.
  useEffect(() => {
    if (warpSignal === lastSignal.current) return;
    lastSignal.current = warpSignal;
    triggerWarpRef.current?.();
  }, [warpSignal]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-0" style={{ background: '#000' }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: SPACE_VIGNETTE }} />
    </div>
  );
};

export default SpaceBackground;
