import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Z-up, metres. Static geometry is compiled by surface identity, not per object.
export const SITE_PLAN = {floorHeight:3.2, floors:5, bays:[-10,-5,0,5,10], backRows:[11,15,19], crane:{x:12,y:12,height:22}};
export class IndustrialEnvironment {
 readonly root=new T.Group();
 private slots=new Map<T.MeshStandardMaterial,T.BufferGeometry[]>();
 readonly concrete=this.surface(0x99978e,.92,0,'formwork');
 readonly ground=this.surface(0x827865,.98,0,'gravel');
 readonly steel=this.surface(0x59616a,.48,.78);
 readonly yellow=this.surface(0xc69a27,.62,.45);
 readonly dark=this.surface(0x292c30,.76,.35);
 readonly red=this.surface(0x805548,.85,.05);
 readonly white=this.surface(0xb9b8ae,.75,.1);
 constructor(){this.root.name='industrial-environment';this.root.userData.plan=SITE_PLAN;}
 private surface(color:number,roughness:number,metalness:number,pattern?:string){
  const m=new T.MeshStandardMaterial({color,roughness,metalness});
  if(pattern){const n=128,data=new Uint8Array(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const grain=((x*137+y*269+(x*y)%67)%31)-15;const seam=pattern==='formwork'&&(y%32<2||x%64===0)?-32:0;const v=180+grain+seam;const i=(y*n+x)*4;data.set([v,v,v,255],i);}const map=new T.DataTexture(data,n,n);map.wrapS=map.wrapT=T.RepeatWrapping;map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;map.colorSpace=T.SRGBColorSpace;map.needsUpdate=true;m.map=map;m.bumpMap=map;m.bumpScale=pattern==='gravel'?.025:.009;}
  return m;
 }
 private emit(g:T.BufferGeometry,m:T.MeshStandardMaterial){const list=this.slots.get(m)??[];list.push(g);this.slots.set(m,list);}
 box(x:number,y:number,z:number,w:number,d:number,h:number,m=this.steel){const g=new T.BoxGeometry(w,d,h);const uv=g.getAttribute('uv');if(m.map)for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.max(w,d)/2,uv.getY(i)*Math.max(h,d)/2);g.translate(x,y,z+h/2);this.emit(g,m);}
 rod(a:number[],b:number[],radius=.04,m=this.steel){const p=new T.Vector3(...a),q=new T.Vector3(...b),v=q.clone().sub(p);const g=new T.CylinderGeometry(radius,radius,v.length(),10);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.normalize()));g.translate(...p.add(q).multiplyScalar(.5).toArray());this.emit(g,m);}
 rail(x:number,y:number,z:number,length:number){for(const h of [.5,1.05])this.rod([x,y,z+h],[x+length,y,z+h],.025,this.yellow);for(let a=0;a<=length;a+=1)this.rod([x+a,y,z],[x+a,y,z+1.05],.025,this.yellow);}
 finish(){for(const [material,parts] of this.slots){const geometry=mergeGeometries(parts);if(!geometry)throw new Error('Environment geometry compilation failed');const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);parts.forEach(g=>g.dispose());}this.root.userData.diagnostics={materialSlots:this.slots.size,triangles:this.root.children.reduce((sum,o)=>sum+((o as T.Mesh).geometry.index?.count??0)/3,0)};return this.root;}
}
export function buildConstruction(){
 const e=new IndustrialEnvironment(),p=SITE_PLAN;
 e.box(0,5,-.2,46,42,.2,e.ground);
 for(let f=0;f<p.floors;f++){const z=f*p.floorHeight;for(const x of p.bays)for(const y of p.backRows)e.rod([x,y,z],[x,y,z+p.floorHeight],.24,e.concrete);e.box(0,15,z+p.floorHeight,21,9,.26,e.concrete);e.rail(-10,10.5,z+p.floorHeight+.26,20);}
 // Independent scaffold bays with diagonal bracing along exposed facade.
 for(let x=-11;x<=11;x+=2){for(const y of [9.7,10.3]){e.rod([x,y,0],[x,y,16.5],.035);for(let z=0;z<16;z+=2){e.rod([x,y,z],[x+2,y,z+2],.023);e.rod([x,y,z],[x+2,y,z],.025);}}}
 const {x:cx,y:cy,height:ch}=p.crane;
 e.box(cx,cy,0,3,3,.8,e.concrete);
 for(const dx of [-.6,.6])for(const dy of [-.6,.6])e.rod([cx+dx,cy+dy,.8],[cx+dx,cy+dy,ch],.075,e.yellow);
 for(let z=1;z<ch;z+=1.5)for(const s of [-1,1]){e.rod([cx-.6,cy+s*.6,z],[cx+.6,cy+s*.6,z+1.5],.04,e.yellow);e.rod([cx+s*.6,cy-.6,z],[cx+s*.6,cy+.6,z+1.5],.04,e.yellow);e.rod([cx-.6,cy+s*.6,z],[cx+.6,cy+s*.6,z],.04,e.yellow);}
 for(const y of [cy-.55,cy+.55]){e.rod([cx-18,y,ch],[cx+6,y,ch],.08,e.yellow);e.rod([cx-18,y,ch+1.2],[cx+6,y,ch+1.2],.06,e.yellow);for(let x=cx-18;x<cx+6;x+=1.5)e.rod([x,y,ch],[x+1.5,y,ch+1.2],.04,e.yellow);}
 e.box(cx+3.8,cy,ch-.8,2.8,2,1.5,e.concrete);e.box(cx-1,cy,ch-1.5,1.4,1.4,1.5,e.white);e.rod([cx,cy,ch],[cx,cy,ch+3],.08,e.yellow);for(const x of [cx-17,cx+5])e.rod([cx,cy,ch+3],[x,cy,ch+1.2],.025,e.dark);
 e.rod([9,cy,ch],[9,cy,3],.025,e.dark);e.box(9,cy,2.6,.5,.35,.4,e.yellow);
 for(const x of [-16,-11]){e.box(x,5,0,3.5,2.5,2.6,e.white);e.box(x,5,2.6,3.7,2.7,.12,e.dark);e.box(x-.8,3.73,.8,.8,.04,1.1,e.dark);e.box(x+.7,3.73,1.1,.9,.04,.7,e.steel);}
 e.box(-17,12,0,3,6,2.7,e.red);for(let y=9;y<15;y+=.3)e.box(-15.48,y,.1,.06,.06,2.5,e.steel);
 for(let x=-17;x<-9;x+=2)for(let y=-.5;y<3;y+=2){e.box(x,y,0,1.2,1,.12,e.dark);for(let z=0;z<3;z++)for(let i=0;i<3;i++)e.box(x-.4+i*.4,y,.12+z*.23,.36,.85,.21,e.concrete);}
 // Paired tyre impressions, outside the transport corridor.
 for(const x of [-12,-10])for(let y=-13;y<0;y+=.25)e.box(x,y,.002,.42,.1,.006,e.dark);
 // Truck unloading bay with trailer bed and wheels.
 e.box(17,-5,.6,2.5,7,.35,e.steel);e.box(17,-9,.2,2.5,2,2.3,e.white);for(const x of [15.6,18.4])for(const y of [-7,-3])e.rod([x,y,.45],[x+.18,y,.45],.45,e.dark);
 return e.finish();
}
export function buildFactory(){
 const e=new IndustrialEnvironment();e.box(0,2,-.2,32,30,.2,e.concrete);
 for(const x of [-14,14])for(let y=-10;y<=14;y+=6){e.box(x,y,0,.35,.45,9);e.box(x,y,0,.8,.9,.25,e.concrete);e.rod([x,y,8.6],[-x,y,8.6],.1);for(let a=-14;a<14;a+=2)e.rod([a,y,8.6],[a+2,y,9.5],.045);e.rod([-14,y,9.5],[14,y,9.5],.08);}
 for(const x of [-13.7,13.7]){e.box(x,2,7.4,.45,28,.55);e.box(x,2,8,.12,28,.12,e.dark);}
 for(const y of [3,12]){for(const dy of [-.5,.5])e.box(0,y+dy,8.1,28,.22,.6,e.yellow);for(let x=-13;x<14;x+=1.5)e.rod([x,y-.5,8.1],[x+1.5,y+.5,8.6],.05,e.yellow);e.box(4,y,7.5,1.6,1.5,.65,e.dark);e.rod([4,y,7.5],[4,y,3],.022,e.dark);}
 for(const x of [-11,-5,2,9]){e.box(x,12,0,4,3,3.7,e.dark);e.box(x,10.46,.8,2,.08,1.8,e.red);for(const dx of [-1,1])e.rod([x+dx,12,3.7],[x+dx,12,6.8],.28);e.rod([x-1,12,6.8],[x+1,12,6.8],.28);e.box(x,9.5,0,.8,.6,1.4,e.steel);}
 for(const x of [-12,12]){e.rod([x,6,0],[x,6,4],1,e.steel);e.rod([x,6,4],[x,6,6],.35);e.rod([x,6,6],[x,14,6],.35);}
 e.box(0,9,3.8,27,1.2,.15);e.rail(-13,8.4,3.95,26);e.rail(-13,9.6,3.95,26);for(let x=-12;x<=12;x+=4)e.box(x,9,0,.12,.12,3.8);for(let i=0;i<16;i++)e.box(13,8-i*.22,i*.24,.9,.24,.08);e.rod([12.5,4.5,1],[12.5,8,4.9],.03,e.yellow);
 for(const x of [-9,10]){e.box(x,0,.003,.08,20,.008,e.yellow);for(let y=-10;y<10;y+=.5)e.box(x+.3,y,.003,.45,.22,.008,e.dark);}
 for(let i=0;i<4;i++){const x=-7+i*4;e.box(x,8,.002,2,2,.01,e.yellow);e.box(x,8,.015,1.8,1.8,.012,e.dark);e.box(x,9,0,.8,.25,1,e.steel);}
 for(const x of [-7,-5,-3]){e.box(x,-6,.003,1.4,1.5,.012,e.yellow);e.box(x,-6,.016,1.25,1.35,.012,e.dark);e.box(x,-6.7,0,.8,.25,1.2);}
 const root=e.finish();for(const x of [-8,0,8])for(const y of [-5,4,12]){const light=new T.SpotLight(0xffe9cb,65,18,.85,.65,1.5);light.position.set(x,y,8.4);light.target.position.set(x,y,0);root.add(light,light.target);const lamp=new T.Mesh(new T.CylinderGeometry(.28,.4,.15,12),new T.MeshStandardMaterial({color:0xddd5be,emissive:0xffe2ac,emissiveIntensity:.6}));lamp.rotation.x=Math.PI/2;lamp.position.copy(light.position);root.add(lamp);}const furnace=new T.PointLight(0xf09b52,12,9,2);furnace.position.set(-5,10,1.6);root.add(furnace);return root;
}
