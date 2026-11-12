import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Matrix4, Object3D, type InstancedMesh } from 'three';
import type { Engine } from '@/platform/Engine';
/** Distant TALOS rigs retain chassis dimensions, yellow mecanum wheels and four-column moving lift.
 * Within 14 m the original CAD rig takes over. Far field: five instanced draws for the whole fleet. */
export default function FieldRobotLOD({engine}:{engine:Engine}):JSX.Element {
 const body=useRef<InstancedMesh>(null),wheels=useRef<InstancedMesh>(null),columns=useRef<InstancedMesh>(null),pads=useRef<InstancedMesh>(null),lights=useRef<InstancedMesh>(null);
 const scratch=useMemo(()=>({obj:new Object3D(),matrix:new Matrix4(),hidden:new Matrix4().makeScale(0,0,0),color:new Color()}),[]);
 useFrame(({camera})=>{
  const {obj,matrix,hidden,color}=scratch;
  for(let i=0;i<engine.agents.length;i++){
   const a=engine.agents[i],p=a.pose,z=a.groundZ,far=Math.hypot(camera.position.x-p.x,camera.position.y-p.y,camera.position.z-z)>14;
   a.root.visible=!far;
   obj.position.set(p.x,p.y,z);obj.rotation.copy(a.root.rotation);obj.scale.set(1,1,1);obj.updateMatrix();
   const put=(mesh:InstancedMesh|null,k:number,x:number,y:number,h:number)=>{matrix.makeTranslation(x,y,h);matrix.premultiply(obj.matrix);mesh?.setMatrixAt(k,far?matrix:hidden);};
   put(body.current,i,0,0,.16);put(pads.current,i,0,0,.47+a.lift.h);put(lights.current,i,0,0,.56+a.lift.h);
   color.set(a.mode==='HOLD'?0xe86455:i<8?0xf0ba6c:i>11?0xa1b3c3:0x73d6af);lights.current?.setColorAt(i,color);
   for(let j=0;j<4;j++){const x=(j<2?1:-1)*.168,y=(j%2?1:-1)*.208;put(wheels.current,i*4+j,x,y,.07);put(columns.current,i*4+j,x*.8,y*.7,.32);}
  }
  for(const r of [body,wheels,columns,pads,lights])if(r.current){r.current.instanceMatrix.needsUpdate=true;if(r.current.instanceColor)r.current.instanceColor.needsUpdate=true;}
 });
 const common={frustumCulled:false,raycast:()=>null};
 return <>
  <instancedMesh ref={body} args={[undefined,undefined,14]} {...common}><boxGeometry args={[.43,.36,.14]} /><meshStandardMaterial color="#596466" metalness={.5} roughness={.55} /></instancedMesh>
  <instancedMesh ref={wheels} args={[undefined,undefined,56]} {...common}><cylinderGeometry args={[.07,.07,.065,8]} /><meshStandardMaterial color="#d1a545" roughness={.8} /></instancedMesh>
  <instancedMesh ref={columns} args={[undefined,undefined,56]} {...common}><boxGeometry args={[.025,.025,.34]} /><meshStandardMaterial color="#87958f" metalness={.6} roughness={.4} /></instancedMesh>
  <instancedMesh ref={pads} args={[undefined,undefined,14]} {...common}><boxGeometry args={[.43,.36,.035]} /><meshStandardMaterial color="#a9b9ad" metalness={.5} roughness={.5} /></instancedMesh>
  <instancedMesh ref={lights} args={[undefined,undefined,14]} {...common}><boxGeometry args={[.18,.09,.025]} /><meshBasicMaterial /></instancedMesh>
 </>;
}
