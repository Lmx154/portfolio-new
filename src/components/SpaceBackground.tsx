import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { NOISE_GLSL, QUAD_VERT, QUAD_FRAG } from '../space/shaders';
import { createBakeRig } from '../space/bakeRig';
import { createNebulaField } from '../space/nebula';
import { createFieldStars } from '../space/field';
import { createMeteors } from '../space/meteors';
import { makeRng } from '../space/rng';
import { isSpacelab, mountSpacelab } from '../space/spacelab';
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
 * Extras for realism: distant spiral galaxies (procedural, baked the same
 * way) drifting slowly past, occasional shooting stars, and subtle per-star
 * twinkle.
 *
 * Pure Three.js — no asset files, no new deps.
 */

// ---- Scene tunables --------------------------------------------------------
const FIELD_STARS = 1400;
const CLUSTER_COUNT = 4;
const STARS_PER_CLUSTER = 420;
const GALAXY_COUNT = 3;
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

const SPACE_VIGNETTE = 'radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0) 65%)';

// ---- Galaxy bake shader (runs ONCE per galaxy, offscreen) -------------------
// Four morphologies, picked per galaxy: 0 = classic spiral, 1 = barred spiral,
// 2 = elliptical, 3 = irregular. On top of the smooth light, layers of
// resolved star specks (soft gaussian dots a few texels wide, so they survive
// mip-mapped downscaling on screen) and pink HII knots along spiral arms.
const GALAXY_BAKE_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uGSeed;
  uniform float uType;
  uniform float uArms;
  uniform float uTwist;
  uniform float uBulge;
  uniform float uArmSharp;
  uniform vec3 uCoreColor;
  uniform vec3 uArmColor;

  ${NOISE_GLSL}

  // One layer of resolved stars: a hashed grid where sparse cells hold a soft
  // round dot at a random offset. Dots span a few texels — single-texel
  // speckle disappears the moment the texture is minified.
  float starLayer(vec2 c, float scale, float thresh, float seed) {
    vec2 p = c * scale + seed;
    vec2 cell = floor(p);
    float on = step(thresh, hash12(cell));
    vec2 pos = vec2(hash12(cell + 17.1), hash12(cell + 42.7)) * 0.6 + 0.2;
    float d = length(fract(p) - pos);
    return on * exp(-d * d * 55.0) * (0.4 + 0.6 * hash12(cell + 91.3));
  }

  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    float r = length(c) + 1e-4;
    float theta = atan(c.y, c.x);
    float n = fbm(c * 3.5 + uGSeed);

    float dens = 0.0;  // disc/arm light (arm-colored, young stars)
    float coreD = 0.0; // bulge/halo light (core-colored, old stars)
    float armHere = 0.0;

    if (uType < 0.5) {
      // -- Classic spiral: log-spiral arms winding out of a compact bulge.
      float swirl = theta * uArms + log(max(r, 0.05)) * uTwist + uGSeed;
      armHere = pow(0.5 + 0.5 * cos(swirl), uArmSharp);
      float disc = exp(-r * 2.7) * smoothstep(1.0, 0.2, r);
      dens = disc * (0.08 + 0.92 * armHere) * (0.7 + 0.6 * n);
      coreD = exp(-r * r * uBulge);
      float dust = smoothstep(0.5, 0.85, fbm(c * 5.0 + uGSeed + 31.0)) * smoothstep(0.06, 0.3, r);
      dens *= 1.0 - 0.6 * dust * armHere;
    } else if (uType < 1.5) {
      // -- Barred spiral: a bright stellar bar; two arms sweep from its ends.
      float barLen = 0.4, barW = 0.12;
      float bar = exp(-(c.x * c.x) / (barLen * barLen) - (c.y * c.y) / (barW * barW));
      // Phase-locked so arm crests meet the bar tips (theta 0 / pi at r=barLen).
      float swirl = theta * 2.0 + log(max(r, 0.05)) * uTwist - log(barLen) * uTwist;
      armHere = pow(0.5 + 0.5 * cos(swirl), uArmSharp);
      float disc = exp(-r * 2.6) * smoothstep(1.0, 0.2, r);
      dens = disc * (0.06 + 0.94 * armHere) * smoothstep(0.16, 0.45, r) * (0.7 + 0.6 * n);
      dens += bar * 0.85;
      coreD = exp(-r * r * uBulge);
      float dust = smoothstep(0.5, 0.85, fbm(c * 5.0 + uGSeed + 31.0)) * smoothstep(0.1, 0.35, r);
      dens *= 1.0 - 0.55 * dust * armHere;
    } else if (uType < 2.5) {
      // -- Elliptical: smooth old-star glow, eccentric, structureless but for
      // a whisper of noise; broad faint halo.
      vec2 e = c * vec2(1.0, 1.0 + uArms * 0.35); // reuse uArms as eccentricity
      float re = length(e) + 1e-4;
      coreD = exp(-re * 3.6) * 0.85 + exp(-re * re * uBulge) * 0.8;
      coreD *= 0.9 + 0.2 * n;
      dens = coreD * 0.12;
    } else {
      // -- Irregular: no symmetry, just clumpy blue star-forming knots.
      float clump = smoothstep(0.45, 0.8, fbm(c * 2.6 + uGSeed));
      float env = exp(-r * r * 2.4) * (0.5 + 0.9 * fbm(c * 1.3 + uGSeed + 7.0));
      dens = clump * env * 1.5;
      armHere = clump;
      coreD = env * 0.12;
    }

    vec3 col = uArmColor * dens * 1.5 + uCoreColor * (coreD * 1.15 + dens * 0.15);

    // Pink HII star-forming knots along spiral arms / irregular clumps.
    if (uType < 1.5 || uType > 2.5) {
      float knots = smoothstep(0.55, 0.9, fbm(c * 6.5 + uGSeed + 53.0)) * dens * armHere;
      col += vec3(0.95, 0.42, 0.5) * knots * 0.6;
    }

    // Resolved star specks: bright blue-white giants in the disc and arms,
    // a fine warm grain over the bulge.
    float discStars = starLayer(c, 26.0, 0.93, uGSeed * 7.0)
                    + starLayer(c, 44.0, 0.9, uGSeed * 13.0) * 0.6;
    float coreStars = starLayer(c, 58.0, 0.78, uGSeed * 3.0) * 0.45;
    float speck = discStars * smoothstep(0.03, 0.22, dens + coreD * 0.4) + coreStars * coreD;
    vec3 speckCol = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.9, 0.72), clamp(coreD * 1.4, 0.0, 1.0));
    col += speckCol * speck * 1.15;

    float alpha = clamp(dens * 1.4 + coreD * 1.05 + speck * 0.8, 0.0, 1.0);
    alpha *= smoothstep(1.0, 0.55, r);
    gl_FragColor = vec4(col, alpha);
  }
`;

const SpaceBackground = ({ warpSignal = 0 }: { warpSignal?: number }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Set by the scene effect; called from the warpSignal effect below to kick
  // off a warp jump without tearing down / rebuilding the Three.js scene.
  const triggerWarpRef = useRef<(() => void) | null>(null);
  const lastSignal = useRef(warpSignal);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // `?spacelab` swaps in the static preset-grid harness (Task 12) instead
    // of the normal cruising scene. It owns `container` entirely and returns
    // its own cleanup.
    if (isSpacelab()) return mountSpacelab(container);

    const cruiseSpeed = CRUISE_SPEED;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
    const GALAXY_BAKE_RES = isMobile ? 256 : 512;

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
    // Bake rig: one ortho quad scene reused for every nebula/galaxy bake.
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

    const galaxyBakeMat = new THREE.ShaderMaterial({
      uniforms: {
        uGSeed: { value: 0 },
        uType: { value: 0 },
        uArms: { value: 2 },
        uTwist: { value: 4.5 },
        uBulge: { value: 26 },
        uArmSharp: { value: 3 },
        uCoreColor: { value: new THREE.Color('#ffe9c4') },
        uArmColor: { value: new THREE.Color('#9db8e8') },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: GALAXY_BAKE_FRAG,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      precision: 'highp',
    });

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
    // Galaxies: small baked spiral sprites drifting far away
    // ---------------------------------------------------------------------
    const planeGeo = new THREE.PlaneGeometry(1, 1);

    const makeQuadMaterial = (tex: THREE.Texture) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: tex },
          uOpacity: { value: 0 },
        },
        vertexShader: QUAD_VERT,
        fragmentShader: QUAD_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

    type Galaxy = {
      x: number;
      y: number;
      z: number;
      size: number;
      spin: number;
      bright: number;
      type: number;
      mesh: THREE.Mesh;
      mat: THREE.ShaderMaterial;
      target: THREE.WebGLRenderTarget;
    };
    const galaxies: Galaxy[] = [];

    // Morphology mix (0 spiral / 1 barred / 2 elliptical / 3 irregular),
    // roughly like the bright end of the real population.
    const rollGalaxyType = () => {
      const roll = Math.random();
      if (roll < 0.34) return 0;
      if (roll < 0.62) return 1;
      if (roll < 0.83) return 2;
      return 3;
    };

    const GALAXY_CORES = ['#ffe9c4', '#fff3e0', '#ffd9a0', '#f2e2c0'];
    const GALAXY_ARMS = ['#8fb0e8', '#a8c4f0', '#7ea8d8', '#9cc0e4'];
    const ELLIPTICAL_CORES = ['#ffe2b8', '#f5e6c8', '#ffd9ad'];
    const IRREGULAR_ARMS = ['#9cc4f0', '#8fd0e8', '#a8c8f8'];

    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

    const bakeGalaxy = (g: Galaxy) => {
      const type = g.type;
      const u = galaxyBakeMat.uniforms;
      u.uGSeed.value = Math.random() * 40;
      u.uType.value = type;
      if (type === 2) {
        // Elliptical: uArms doubles as eccentricity, bulge is broad.
        u.uArms.value = Math.random();
        u.uBulge.value = 6 + Math.random() * 8;
        (u.uCoreColor.value as THREE.Color).set(pick(ELLIPTICAL_CORES));
        (u.uArmColor.value as THREE.Color).set(pick(ELLIPTICAL_CORES));
      } else if (type === 3) {
        // Irregular: all blue star-forming clumps, no real core.
        u.uBulge.value = 10;
        (u.uCoreColor.value as THREE.Color).set(pick(GALAXY_CORES));
        (u.uArmColor.value as THREE.Color).set(pick(IRREGULAR_ARMS));
      } else {
        u.uArms.value = Math.random() < 0.6 ? 2 : 3;
        u.uTwist.value = (type === 1 ? 3.0 : 3.2) + Math.random() * 2.2;
        u.uBulge.value = 18 + Math.random() * 22;
        u.uArmSharp.value = 2.5 + Math.random() * 2.5; // higher → thinner, crisper arms
        (u.uCoreColor.value as THREE.Color).set(pick(GALAXY_CORES));
        (u.uArmColor.value as THREE.Color).set(pick(GALAXY_ARMS));
      }
      bakeInto(g.target, galaxyBakeMat);
    };

    const regenGalaxy = (g: Galaxy, z: number) => {
      const type = rollGalaxyType();
      g.type = type;
      const az = Math.abs(FAR);
      g.x = (Math.random() - 0.5) * 2 * az * 0.55;
      g.y = (Math.random() - 0.5) * 2 * az * 0.4;
      g.z = z;
      g.size = (type === 3 ? 200 : 280) + Math.random() * 260;
      g.spin = (Math.random() - 0.5) * 0.01; // barely-perceptible in-plane drift
      // Ellipticals are all bulge — at full brightness they read like a sun.
      g.bright = (type === 2 ? 0.4 : 0.55) + Math.random() * 0.3;
      g.mesh.scale.set(g.size, g.size, 1);
      // Random 3D tilt → elliptical on screen, like a real inclined disc.
      // Ellipticals/irregulars aren't discs; keep them nearly face-on.
      const tilt = type >= 2 ? 0.4 : 1.9;
      g.mesh.rotation.set((Math.random() - 0.5) * tilt, (Math.random() - 0.5) * tilt, Math.random() * Math.PI);
      bakeGalaxy(g);
    };

    for (let i = 0; i < GALAXY_COUNT; i++) {
      const target = makeTarget(GALAXY_BAKE_RES);
      const mat = makeQuadMaterial(target.texture);
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.renderOrder = -1;
      mesh.frustumCulled = false;
      scene.add(mesh);
      const g: Galaxy = { x: 0, y: 0, z: FAR, size: 300, spin: 0, bright: 0.8, type: 0, mesh, mat, target };
      galaxies.push(g);
      // Stagger through the cycle so one drifts past only occasionally.
      regenGalaxy(g, FAR + Math.random() * (NEAR - FAR));
    }

    const writeGalaxyPositions = () => {
      for (const g of galaxies) {
        g.mesh.position.set(g.x, g.y, g.z);
        const op = g.bright * fadeAt(g.z);
        g.mat.uniforms.uOpacity.value = op;
        g.mesh.visible = op > 0.003;
      }
    };
    writeGalaxyPositions();

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

      nebulae.advance(step, fadeAt);

      // Galaxies drift by slower (parallax says "much farther away").
      for (const g of galaxies) {
        g.z += step * GALAXY_SPEED;
        g.mesh.rotation.z += g.spin * dt;
        if (g.z - g.size * 0.5 > NEAR) regenGalaxy(g, FAR);
      }
      writeGalaxyPositions();

      // Shooting stars (not during warp — streaks own that moment).
      meteors.update(dt, warpEased);

      camera.position.x += (targetX * 26 - camera.position.x) * 0.03;
      camera.position.y += (-targetY * 26 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, -600);

      renderer.render(scene, camera);
    };

    if (prefersReducedMotion) {
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
      // Rebake every nebula/galaxy — RT contents don't survive context loss.
      nebulae.rebake();
      for (const g of galaxies) bakeGalaxy(g);
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
      planeGeo.dispose();
      for (const g of galaxies) {
        g.mat.dispose();
        g.target.dispose();
      }
      galaxyBakeMat.dispose();
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
