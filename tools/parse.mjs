// Stage 1: parse STEP with OpenCascade (slow, ~3 min) and cache raw meshes.
import fs from 'fs'; import v8 from 'v8';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const [,, input, cache] = process.argv;
const occt = await require('occt-import-js')();
const res = occt.ReadStepFile(new Uint8Array(fs.readFileSync(input)), { linearUnit:'meter', linearDeflectionType:'bounding_box_ratio', linearDeflection:0.0015, angularDeflection:0.5 });
if (!res.success) throw new Error('STEP import failed');
// flatten tree -> list of {name, meshes[]}
let top = res.root;
while (top.children.length === 1 && top.meshes.length === 0) top = top.children[0];
const nodes = top.children.map(c => ({ name: c.name, meshes: c.meshes }));
const meshes = res.meshes.map(m => ({
  name: m.name, color: m.color || null,
  pos: new Float32Array(m.attributes.position.array),
  nor: m.attributes.normal ? new Float32Array(m.attributes.normal.array) : null,
  idx: new Uint32Array(m.index.array),
}));
fs.writeFileSync(cache, v8.serialize({ nodes, meshes }));
console.log('cached', meshes.length, 'meshes');
