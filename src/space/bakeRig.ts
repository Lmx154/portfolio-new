import * as THREE from 'three';

/**
 * Shared ortho-quad bake rig: renders a single ShaderMaterial into an
 * offscreen target (or the screen, for `target === null`). Used by every
 * "bake once, draw as a textured quad" object — nebulae, galaxies, and any
 * future deep-sky object — so the expensive per-pixel shader runs once per
 * object instead of per pixel per frame.
 *
 * Intentionally has NO knowledge of any particular bake shader: the initial
 * material on the internal quad is a throwaway placeholder that is never
 * actually rendered, since `bakeInto` reassigns the quad's material before
 * every render call.
 */
export function createBakeRig(renderer: THREE.WebGLRenderer): {
  bakeInto: (target: THREE.WebGLRenderTarget | null, material: THREE.ShaderMaterial) => void;
  makeTarget: (size: number) => THREE.WebGLRenderTarget;
  dispose: () => void;
} {
  const bakeScene = new THREE.Scene();
  const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  bakeCam.position.z = 1;

  // Never actually rendered — bakeInto() swaps in the real material first.
  const placeholderMat = new THREE.ShaderMaterial({
    vertexShader: `void main() { gl_Position = vec4(position, 1.0); }`,
    fragmentShader: `void main() { gl_FragColor = vec4(0.0); }`,
  });

  const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), placeholderMat);
  bakeScene.add(bakeQuad);

  const makeTarget = (size: number) =>
    new THREE.WebGLRenderTarget(size, size, {
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });

  const bakeInto = (target: THREE.WebGLRenderTarget | null, material: THREE.ShaderMaterial) => {
    bakeQuad.material = material;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(bakeScene, bakeCam);
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 1);
  };

  const dispose = () => {
    bakeQuad.geometry.dispose();
    placeholderMat.dispose();
  };

  return { bakeInto, makeTarget, dispose };
}
