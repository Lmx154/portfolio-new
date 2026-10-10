import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * In-CMS 3D viewer for GLB/glTF (GLTFLoader) and OBJ (OBJLoader) — both are
 * mature, standard three.js loaders, nothing hand-rolled. Loads from an
 * asset-protocol URL, recenters + lays the model flat, and lets you orbit.
 *
 * Raw OBJ exports (e.g. OpenRocket assemblies) carry one named child mesh per
 * component ("1_Nose cone", "2_Telemetry", …). We surface those names via
 * `onComponents` and honor a `hidden` set so a parent can build a 3dviewer-style
 * show/hide panel. GLB stays as authored; OBJ gets a neutral material so the
 * untextured export still renders cleanly.
 */

const isObjUrl = (u: string) => /\.obj(\?|$)/i.test(u);

export default function ModelPreview({
  url,
  ext,
  autoRotate = true,
  className = '',
  onComponents,
  hidden,
}: {
  url: string;
  /** Source extension hint ("obj" | "glb" | "gltf"); more reliable than the URL. */
  ext?: string;
  autoRotate?: boolean;
  className?: string;
  /** Called once the model loads, with the names of its toggleable components. */
  onComponents?: (names: string[]) => void;
  /** Component names to hide (drives per-part visibility). */
  hidden?: Set<string>;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef<Map<string, THREE.Object3D[]>>(new Map());
  const onComponentsRef = useRef(onComponents);
  onComponentsRef.current = onComponents;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Apply per-component visibility whenever the hidden set (or the model) changes.
  useEffect(() => {
    for (const [name, meshes] of groupsRef.current) {
      const visible = !hidden?.has(name);
      for (const m of meshes) m.visible = visible;
    }
  }, [hidden, status]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    setStatus('loading');
    groupsRef.current = new Map();

    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;
    let resizeObserver: ResizeObserver | null = null;

    // Index meshes by their nearest named ancestor → the toggleable "components".
    const indexComponents = (root: THREE.Object3D) => {
      const groups = new Map<string, THREE.Object3D[]>();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        let name = mesh.name;
        let p: THREE.Object3D | null = mesh.parent;
        while (!name && p) { name = p.name; p = p.parent; }
        if (!name) name = 'Mesh';
        (groups.get(name) ?? groups.set(name, []).get(name)!).push(mesh);
      });
      groupsRef.current = groups;
      onComponentsRef.current?.([...groups.keys()]);
    };

    const setupScene = (object: THREE.Object3D, isObj: boolean) => {
      if (disposed) return;
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;

      // Untextured OBJ exports get a neutral standard material so they shade
      // nicely under the environment (OBJLoader otherwise leaves flat phong).
      if (isObj) {
        object.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const geo = mesh.geometry as THREE.BufferGeometry;
          if (geo && !geo.getAttribute('normal')) geo.computeVertexNormals();
          mesh.material = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.1, roughness: 0.72 });
        });
      }
      indexComponents(object);

      const scene = new THREE.Scene();
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 0.95;
      mount.appendChild(renderer.domElement);

      pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.2;

      // pivot (turntable) → orient (lay flat) → object (centered).
      const orient = new THREE.Group();
      const pivot = new THREE.Group();
      orient.add(object);
      pivot.add(orient);
      scene.add(pivot);
      scene.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(object, true);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      object.position.sub(center);

      // Lay flat: rotate the thinnest axis up to +Y (keeps long parts horizontal).
      const dims = [size.x, size.y, size.z];
      const thin = dims.indexOf(Math.min(dims[0], dims[1], dims[2]));
      if (thin === 0) orient.rotation.z = Math.PI / 2;
      else if (thin === 2) orient.rotation.x = -Math.PI / 2;
      scene.updateMatrixWorld(true);

      const box2 = new THREE.Box3().setFromObject(orient, true);
      const size2 = box2.getSize(new THREE.Vector3());
      const maxDim = Math.max(size2.x, size2.y, size2.z) || 1;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x202024, 0.3));
      const key = new THREE.DirectionalLight(0xffffff, 1.3);
      key.position.set(maxDim * 0.6, maxDim * 1.6, maxDim * 0.9);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.35);
      fill.position.set(-maxDim, maxDim * 0.5, -maxDim * 0.8);
      scene.add(fill);

      const camera = new THREE.PerspectiveCamera(38, width / height, maxDim / 100, maxDim * 100);
      const dist = maxDim * 1.7;
      camera.position.set(dist * 0.5, dist * 1.0, dist * 0.7);
      camera.lookAt(0, 0, 0);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.set(0, 0, 0);
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 1.2;
      controls.addEventListener('start', () => {
        if (controls) controls.autoRotate = false;
      });

      // Honor any initial hidden set.
      for (const [name, meshes] of groupsRef.current) {
        const visible = !hidden?.has(name);
        for (const m of meshes) m.visible = visible;
      }

      const loop = () => {
        frame = requestAnimationFrame(loop);
        controls?.update();
        renderer?.render(scene, camera);
      };
      loop();

      resizeObserver = new ResizeObserver(() => {
        const w = mount.clientWidth || 1;
        const h = mount.clientHeight || 1;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer?.setSize(w, h);
      });
      resizeObserver.observe(mount);

      setStatus('ready');
    };

    const onError = () => { if (!disposed) setStatus('error'); };
    const objMode = ext ? ext.toLowerCase() === 'obj' : isObjUrl(url);

    if (objMode) {
      new OBJLoader().load(url, (obj) => { if (!disposed) setupScene(obj, true); }, undefined, onError);
    } else {
      new GLTFLoader().load(url, (gltf) => { if (!disposed) setupScene(gltf.scene, false); }, undefined, onError);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      controls?.dispose();
      pmrem?.dispose();
      groupsRef.current = new Map();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
    // hidden is intentionally applied via the separate effect above, not here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ext, autoRotate]);

  return (
    <div className={`model-preview ${className}`}>
      <div ref={mountRef} className="mp-canvas" />
      {status !== 'ready' && (
        <div className="mp-status">{status === 'error' ? 'Could not load 3D model' : 'Loading 3D…'}</div>
      )}
      {status === 'ready' && <div className="mp-hint">drag to rotate</div>}
    </div>
  );
}
