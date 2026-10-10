import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Cache GLB downloads + parses by URL. A rocket's model is loaded once per
 * session even though it appears in the catalog tile, the lightbox and the
 * detail page; each caller gets its own clone of the scene graph (clones
 * share geometry/material data, so this costs almost nothing).
 */
const cache = new Map<string, Promise<THREE.Group>>();

export function loadModel(src: string): Promise<THREE.Group> {
  let entry = cache.get(src);
  if (!entry) {
    entry = new GLTFLoader().loadAsync(src).then((gltf) => gltf.scene);
    // Drop failed loads so a flaky network doesn't poison the cache.
    entry.catch(() => cache.delete(src));
    cache.set(src, entry);
  }
  return entry.then((scene) => scene.clone(true));
}
