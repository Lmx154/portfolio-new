// Single-file 3D converter used by the CMS: <input> -> <output.glb>
//
//   node --max-old-space-size=4096 scripts/convert-model.mjs in.step out.glb
//
// Supports STEP/STP (via occt), OBJ (manual parse), and GLB/glTF (optimize
// pass-through). Always emits an optimized, quantized GLB so the website only
// ever deals with small binary meshes — no STEP/OBJ/WASM at runtime.
import * as occtMod from 'occt-import-js';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, weld, quantize } from '@gltf-transform/functions';
import fs from 'node:fs';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: convert-model.mjs <input> <output.glb>');
  process.exit(1);
}
const ext = inPath.toLowerCase().split('.').pop();

function buildDoc(meshes) {
  // meshes: [{ position:number[], normal?:number[], index?:number[], color?:[r,g,b] }]
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const rootNode = doc.createNode();
  scene.addChild(rootNode);
  for (const m of meshes) {
    if (!m.position?.length) continue;
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(m.position)).setBuffer(buffer));
    if (m.normal?.length) {
      prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(m.normal)).setBuffer(buffer));
    }
    if (m.index?.length) {
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(m.index)).setBuffer(buffer));
    }
    const mat = doc.createMaterial().setMetallicFactor(0.2).setRoughnessFactor(0.7);
    if (m.color) mat.setBaseColorFactor([m.color[0], m.color[1], m.color[2], 1]);
    prim.setMaterial(mat);
    rootNode.addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)));
  }
  return doc;
}

async function fromStep() {
  const occt = await (occtMod.default ?? occtMod)();
  const result = occt.ReadStepFile(new Uint8Array(fs.readFileSync(inPath)), null);
  if (!result.success || !result.meshes.length) throw new Error('Could not read STEP geometry');
  return buildDoc(
    result.meshes.map((m) => ({
      position: m.attributes.position.array,
      normal: m.attributes.normal?.array,
      index: m.index.array,
      color: m.color,
    })),
  );
}

function fromObj() {
  const text = fs.readFileSync(inPath, 'utf8');
  const positions = [];
  const normals = [];
  const outPos = [];
  const outNorm = [];
  const ref = (i, len) => (i > 0 ? i - 1 : len + i);
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') positions.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'vn') normals.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'f') {
      const verts = p.slice(1).map((tok) => {
        const [vi, , ni] = tok.split('/');
        return { v: ref(+vi, positions.length), n: ni ? ref(+ni, normals.length) : -1 };
      });
      for (let i = 1; i < verts.length - 1; i++) {
        const tri = [verts[0], verts[i], verts[i + 1]];
        const ps = tri.map((t) => positions[t.v] || [0, 0, 0]);
        let ns = tri.map((t) => (t.n >= 0 ? normals[t.n] : null));
        if (ns.some((n) => !n)) {
          // flat normal from the triangle
          const ax = ps[1][0] - ps[0][0], ay = ps[1][1] - ps[0][1], az = ps[1][2] - ps[0][2];
          const bx = ps[2][0] - ps[0][0], by = ps[2][1] - ps[0][1], bz = ps[2][2] - ps[0][2];
          let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l; ny /= l; nz /= l;
          ns = [[nx, ny, nz], [nx, ny, nz], [nx, ny, nz]];
        }
        for (let k = 0; k < 3; k++) {
          outPos.push(ps[k][0], ps[k][1], ps[k][2]);
          outNorm.push(ns[k][0], ns[k][1], ns[k][2]);
        }
      }
    }
  }
  if (!outPos.length) throw new Error('Could not read OBJ geometry');
  return buildDoc([{ position: outPos, normal: outNorm }]);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

let doc;
if (ext === 'step' || ext === 'stp') doc = await fromStep();
else if (ext === 'obj') doc = fromObj();
else if (ext === 'glb' || ext === 'gltf') doc = await io.read(inPath);
else {
  console.error(`Unsupported model format: .${ext}`);
  process.exit(1);
}

// KiCad's GLB export leaves metallicFactor unset, which glTF reads as 1.0
// (fully metallic), so boards render near-black under the site's soft
// environment light. Give KiCad exports the matte values the site's other
// boards use, and make the nearly opaque silkscreen opaque (no blending).
if (String(doc.getRoot().getAsset().extras?.generator ?? '').startsWith('KiCad')) {
  for (const mat of doc.getRoot().listMaterials()) {
    mat.setMetallicFactor(0.05).setRoughnessFactor(0.5);
    if (mat.getAlphaMode() === 'BLEND' && mat.getAlpha() >= 0.89) mat.setAlpha(1).setAlphaMode('OPAQUE');
  }
}

// flatten + join merge every primitive that shares a material into one draw
// call (a KiCad board arrives as ~17k primitives, one per track/pad/part).
await doc.transform(dedup(), flatten(), join(), weld(), quantize());
const glb = await io.writeBinary(doc);
fs.writeFileSync(outPath, glb);
console.log(`wrote ${outPath} (${(glb.byteLength / 1048576).toFixed(2)} MB)`);
