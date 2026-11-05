import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {buildConstruction,buildFactory} from './IndustrialEnvironment';
describe('industrial environment compilation',()=>{
 for(const [name,build] of [['construction',buildConstruction],['factory',buildFactory]] as const){
  it(`${name}: finite, batched geometry with floor support and authored height`,()=>{
   const root=build();const meshes:T.Mesh[]=[];root.traverse(o=>{if(o instanceof T.Mesh)meshes.push(o);});
   expect(root.userData.diagnostics.materialSlots).toBeLessThanOrEqual(8);
   expect(root.userData.diagnostics.triangles).toBeGreaterThan(5000);
   for(const mesh of meshes){const g=mesh.geometry;expect(g.getAttribute('position').count).toBeGreaterThan(0);g.computeBoundingBox();expect(g.boundingBox!.min.toArray().every(Number.isFinite)).toBe(true);expect(g.boundingBox!.max.toArray().every(Number.isFinite)).toBe(true);}
   const bounds=new T.Box3().setFromObject(root);expect(bounds.min.z).toBeLessThan(0);expect(bounds.max.z).toBeGreaterThan(name==='construction'?22:9);
   root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){const p=m as T.MeshStandardMaterial;p.map?.dispose();m.dispose();}}});
  });
 }
});
