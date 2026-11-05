import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const occtimport = require('occt-import-js');
const occt = await occtimport();
const buf = fs.readFileSync('3209-0001-0004 assembly.STEP');
console.time('read');
const res = occt.ReadStepFile(new Uint8Array(buf), { linearUnit:'meter', linearDeflectionType:'bounding_box_ratio', linearDeflection:0.0015, angularDeflection:0.5 });
console.timeEnd('read');
console.log(res.success, res.meshes.length);
fs.writeFileSync('/tmp/claude-1000/-home-batryzhan-Documents-projects-talos/a720f9f8-233a-4a62-9429-b33b594c88eb/scratchpad/tree.json', JSON.stringify({root:res.root, meshes:res.meshes.map(m=>({name:m.name,tris:m.index.array.length/3}))}));
function pr(n,d){ if(d>6)return; console.log(' '.repeat(d)+n.name+(n.meshes.length?` [m${n.meshes.join(',')}]`:'')); n.children.forEach(c=>pr(c,d+1)); }
pr(res.root,0);
console.log('tris', res.meshes.reduce((a,m)=>a+m.index.array.length/3,0));
