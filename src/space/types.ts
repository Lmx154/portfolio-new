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
  /** Allocate an offscreen render target sized for a bake, via the shared rig. */
  makeTarget: (size: number) => THREE.WebGLRenderTarget;
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
