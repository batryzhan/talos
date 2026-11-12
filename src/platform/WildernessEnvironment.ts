import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {radioLink} from '../swarm/graph';
import { Rng } from '../swarm/rng';
import { BASE, WildernessMap } from '../core/terrain/WildernessMap';
import { stability } from '../physics/M1';
import type { SearchRescueSim } from '../missions/SearchRescueSim';

const TREE_SPEC={whorls:5,branches:6,height:6,radius:1.5,segments:7};
/** Bounded conifer kit: a tapered trunk and five progressively smaller, offset branch whorls. */
function conifer():T.BufferGeometry {
  const parts:T.BufferGeometry[]=[];
  for(let i=0;i<TREE_SPEC.whorls;i++){
    const g=new T.ConeGeometry(TREE_SPEC.radius*(1-i*.16),2.5-i*.25,TREE_SPEC.segments,1);
    g.rotateX(Math.PI/2);g.rotateZ(i*.47);g.translate(0,0,1.8+i*.85);parts.push(g);
  }
  const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());return merged;
}
export class WildernessEnvironment {
  readonly root=new T.Group();
  readonly overlay=new T.Group();
  readonly relay=new T.Group();
  readonly shelter=new T.Group();
  readonly distress:T.Mesh;
  readonly beacon:T.Mesh;
  private readonly wind={value:0};
  private readonly radioLines:T.LineSegments;
  private readonly radioPositions=new Float32Array(16*16*10*6);
  private readonly radioColors=new Float32Array(16*16*10*6);
  private lastRadio=-1;
  private readonly supportLine:T.LineLoop;
  private readonly supportPositions=new Float32Array(16*3);
  private readonly distressLight=new T.PointLight(0xff8a51,3,7,2);
  private readonly routeLine:T.Line;
  private readonly routePositions=new Float32Array(400*3);
  constructor(readonly mission:SearchRescueSim){
    const map=mission.map,rng=new Rng(map.seed+401);
    this.root.name='wilderness';
    const terrain=new T.PlaneGeometry(120,120,120,120),p=terrain.attributes.position,c=new Float32Array(p.count*3),color=new T.Color();
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),h=map.heightAt(x,y),g=map.gradientAt(x,y);
      p.setZ(i,h);
      color.set(map.riverAt(x,y)?(Math.abs(x)<=4?0xc4ac77:0x716c56):Math.hypot(g.x,g.y)>.28?0x8b8b7b:map.forestAt(x,y)?0x43553b:0x81905b);
      color.multiplyScalar(.94+.07*Math.sin(x*.7+y*.3));color.toArray(c,i*3);
    }
    terrain.setAttribute('color',new T.BufferAttribute(c,3));terrain.computeVertexNormals();
    const ground=new T.Mesh(terrain,new T.MeshStandardMaterial({vertexColors:true,roughness:1}));ground.receiveShadow=true;ground.castShadow=true;this.root.add(ground);
    // Forest instances exclude trails, camp, ford and the survivor clearing. Two draw calls for all 420 trees.
    const foliageMat=new T.MeshStandardMaterial({color:0x355a3b,roughness:1,flatShading:true});
    const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});
    const wind=(shader:T.WebGLProgramParametersWithUniforms)=>{shader.uniforms.uWind=this.wind;shader.vertexShader='uniform float uWind;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float anchor = clamp(position.z / 6.0, 0.0, 1.0);
      transformed.x += sin(uWind * 1.1 + instanceMatrix[3].x * .19 + instanceMatrix[3].y * .13) * .14 * anchor * anchor;`);};
    foliageMat.onBeforeCompile=wind;depth.onBeforeCompile=wind;
    const trees=new T.InstancedMesh(conifer(),foliageMat,420);trees.customDepthMaterial=depth;
    const trunks=new T.InstancedMesh(new T.CylinderGeometry(.075,.18,5.4,6).rotateX(Math.PI/2).translate(0,0,2.7),new T.MeshStandardMaterial({color:0x62513d,roughness:1}),420);
    const dummy=new T.Object3D();let count=0;
    for(let attempt=0;attempt<30000&&count<420;attempt++){
      const x=rng.uniform(-57,57),y=rng.uniform(-57,57);
      if(!map.forestAt(x,y)||map.riverAt(x,y)||Math.hypot(x-map.victim.x,y-map.victim.y)<6||Math.hypot(x-mission.relay.position.x,y-mission.relay.position.y)<4)continue;
      // Clear the navigation lattice so paths and individual trunks agree.
      if(Math.abs(x/6-Math.round(x/6))<.13||Math.abs(y/6-Math.round(y/6))<.13)continue;
      dummy.position.set(x,y,map.heightAt(x,y));dummy.rotation.set(0,0,rng.uniform(0,Math.PI*2));dummy.scale.setScalar(rng.uniform(.7,1.3));dummy.updateMatrix();
      trees.setMatrixAt(count,dummy.matrix);trunks.setMatrixAt(count,dummy.matrix);trees.setColorAt(count,new T.Color().setHSL(rng.uniform(.27,.35),.22,rng.uniform(.2,.32)));count++;
    }
    trees.count=trunks.count=count;trees.castShadow=trunks.castShadow=true;trees.receiveShadow=true;this.root.add(trees,trunks);
    const rocks=new T.InstancedMesh(new T.DodecahedronGeometry(1,0),new T.MeshStandardMaterial({color:0x96958b,roughness:1,flatShading:true}),65);
    for(let i=0;i<65;i++){const x=rng.uniform(-57,57),y=rng.uniform(-57,57);dummy.position.set(x,y,map.heightAt(x,y)-.2);dummy.rotation.set(rng.random(),rng.random(),rng.random()*6);dummy.scale.set(rng.uniform(.4,1.4),rng.uniform(.4,1),rng.uniform(.3,1));dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);}rocks.castShadow=true;rocks.receiveShadow=true;this.root.add(rocks);
    // A dry, sandy ford: the obstacle is logical, no water surface is rendered.
    this.label('БРОД · 8 м',0,-5,map.heightAt(0,-5)+.12,0xe6c98b,5);
    this.label('БАЗА / РЕЗЕРВ',BASE.x,BASE.y-5,map.heightAt(BASE.x,BASE.y-5)+.12,0xb7d9ed,9);
    this.label('ПОСТРАДАВШИЙ',map.victim.x,map.victim.y+3,map.heightAt(map.victim.x,map.victim.y)+.3,0xffa76d,8);
    const victim=new T.Group();victim.position.set(map.victim.x,map.victim.y,map.heightAt(map.victim.x,map.victim.y));
    const skin=new T.MeshStandardMaterial({color:0xe0ba96}),coat=new T.MeshStandardMaterial({color:0xd06437});
    const body=new T.Mesh(new T.CapsuleGeometry(.22,.5,3,6).rotateX(Math.PI/2),coat);body.position.z=.8;victim.add(body);
    const head=new T.Mesh(new T.SphereGeometry(.18,8,6),skin);head.position.z=1.4;victim.add(head);
    for(const x of [-.13,.13]){const leg=new T.Mesh(new T.CylinderGeometry(.07,.08,.6,5).rotateX(Math.PI/2),new T.MeshStandardMaterial({color:0x343e42}));leg.position.set(x,0,.3);victim.add(leg);}
    this.distress=new T.Mesh(new T.RingGeometry(.8,1.05,40),new T.MeshBasicMaterial({color:0xff8a51,transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}));this.distress.position.z=.06;victim.add(this.distress);this.root.add(victim);this.distressLight.position.z=1.7;victim.add(this.distressLight);
    const mast=new T.Mesh(new T.CylinderGeometry(.045,.09,6,8).rotateX(Math.PI/2),new T.MeshStandardMaterial({color:0xc4c8bf,metalness:.7,roughness:.4}));mast.position.z=3;this.relay.add(mast);
    const station=new T.Mesh(new T.BoxGeometry(.9,.7,.4),new T.MeshStandardMaterial({color:0xd49b52}));station.position.z=.2;this.relay.add(station);
    const antenna=new T.Mesh(new T.BoxGeometry(1.4,.08,.12),new T.MeshStandardMaterial({color:0xd5dcd6}));antenna.position.z=5.7;this.relay.add(antenna);
    this.beacon=new T.Mesh(new T.SphereGeometry(.16,8,6),new T.MeshBasicMaterial({color:0x7fe5bb}));this.beacon.position.z=6;this.relay.add(this.beacon);
    this.relay.position.set(mission.relay.position.x,mission.relay.position.y,map.heightAt(mission.relay.position.x,mission.relay.position.y));this.root.add(this.relay);
    this.label('РЕЛЕ / M0',mission.relay.position.x,mission.relay.position.y+2,this.relay.position.z+.1,0xa1dfc7,6);
    // Shelter is carried on the actual Alpha support pads, with a stretcher underneath.
    const roof=new T.Mesh(new T.BoxGeometry(3.4,2.2,.16),new T.MeshStandardMaterial({color:0xe1a45d,roughness:.8}));roof.position.z=.08;roof.castShadow=true;this.shelter.add(roof);
    for(const y of [-.85,.85]){const rail=new T.Mesh(new T.BoxGeometry(3.2,.07,.1),new T.MeshStandardMaterial({color:0x505d59,metalness:.6,roughness:.4}));rail.position.set(0,y,-.12);this.shelter.add(rail);}
    const bed=new T.Mesh(new T.BoxGeometry(2,.7,.07),new T.MeshStandardMaterial({color:0x4e705d}));bed.position.z=-.12;this.shelter.add(bed);this.root.add(this.shelter);
    const geom=new T.BufferGeometry();geom.setAttribute('position',new T.BufferAttribute(this.radioPositions,3));geom.setAttribute('color',new T.BufferAttribute(this.radioColors,3));
    this.radioLines=new T.LineSegments(geom,new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.65,depthWrite:false}));this.radioLines.frustumCulled=false;this.overlay.add(this.radioLines);
    const routeGeom=new T.BufferGeometry();routeGeom.setAttribute('position',new T.BufferAttribute(this.routePositions,3));
    this.routeLine=new T.Line(routeGeom,new T.LineBasicMaterial({color:0xffca6f,depthWrite:false}));this.routeLine.frustumCulled=false;this.overlay.add(this.routeLine);
    const supportGeom=new T.BufferGeometry();supportGeom.setAttribute('position',new T.BufferAttribute(this.supportPositions,3));
    this.supportLine=new T.LineLoop(supportGeom,new T.LineBasicMaterial({color:0x78dba6,depthWrite:false}));this.supportLine.frustumCulled=false;this.overlay.add(this.supportLine);
    this.contours(map);this.root.add(this.overlay);
  }
  private label(text:string,x:number,y:number,z:number,color:number,width:number):void {
    if(typeof document==='undefined')return;
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;
    const ctx=canvas.getContext('2d');if(!ctx)return;ctx.font='500 28px monospace';ctx.textAlign='center';ctx.fillStyle=`#${color.toString(16).padStart(6,'0')}`;ctx.fillText(text,256,42);
    const tex=new T.CanvasTexture(canvas),plane=new T.Mesh(new T.PlaneGeometry(width,width/8),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:T.DoubleSide}));plane.position.set(x,y,z);this.root.add(plane);
  }
  private contours(map:WildernessMap):void {
    const positions:number[]=[];
    for(let level=1;level<=6;level++)for(let y=-59;y<59;y+=2)for(let x=-59;x<59;x+=2){
      const corners=[[x,y],[x+2,y],[x+2,y+2],[x,y+2]],hits:number[][]=[];
      for(let k=0;k<4;k++){const a=corners[k],b=corners[(k+1)%4],ha=map.heightAt(a[0],a[1]),hb=map.heightAt(b[0],b[1]);if((ha<level)!==(hb<level)){const t=(level-ha)/(hb-ha);hits.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,level+.035]);}}
      if(hits.length===2)positions.push(...hits[0],...hits[1]);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));this.overlay.add(new T.LineSegments(g,new T.LineBasicMaterial({color:0xe3d8ad,transparent:true,opacity:.2,depthWrite:false})));
  }
  sync(time:number,overlay:boolean):void {
    const s=this.mission;this.wind.value=time;this.overlay.visible=overlay;this.distressLight.intensity=2+2*Math.max(0,Math.sin(time*4));
    this.relay.visible=s.found;
    if(!s.relay.active){const a=s.agents[s.installer-1];this.relay.position.set(a.pose.x,a.pose.y,a.groundZ+.5);this.relay.scale.set(.45,.45,.18);}else{this.relay.position.set(s.relay.position.x,s.relay.position.y,s.map.heightAt(s.relay.position.x,s.relay.position.y));this.relay.scale.set(1,1,1);}this.beacon.visible=s.relay.active&&Math.sin(time*5)>0;
    this.distress.scale.setScalar(1+(time*.5%1)*1.5);(this.distress.material as T.MeshBasicMaterial).opacity=.85*(1-time*.5%1);
    const p=s.fleet.measuredPayloadPose('Alpha'),g=s.map.gradientAt(p.x,p.y);this.shelter.position.set(p.x,p.y,s.roofHeight);this.shelter.rotation.set(Math.atan(g.y),-Math.atan(g.x),p.theta);
    if(!overlay||Math.floor(time*5)===this.lastRadio)return;this.lastRadio=Math.floor(time*5);
    const inputs=s.fleet.team('Alpha')!.getSupportContactInputs(),hull=stability(inputs.map(i=>i.pad),{x:p.x+.12,y:p.y+.04}).hull;
    hull.forEach((q,i)=>this.supportPositions.set([q.x,q.y,s.map.heightAt(q.x,q.y)+.25],i*3));
    this.supportLine.geometry.setDrawRange(0,hull.length);this.supportLine.geometry.attributes.position.needsUpdate=true;
    const nav=s.navigation.get('Alpha');let count=0;
    this.routePositions.set([p.x,p.y,s.map.heightAt(p.x,p.y)+.15],0);count++;
    if(nav)for(let i=nav.index;i<nav.path.length;i++){const q=s.routing.nodes[nav.path[i]];this.routePositions.set([q.x,q.y,s.map.heightAt(q.x,q.y)+.15],count++*3);}
    this.routeLine.geometry.setDrawRange(0,count);this.routeLine.geometry.attributes.position.needsUpdate=true;
    const env=s.radio;let n=0;
    // Radio links include blocked direct links, with relay connections drawn as dashes.
    for(let a=0;a<env.positions.length;a++)for(let b=a+1;b<env.positions.length;b++){
      const u=env.positions[a],v=env.positions[b],kind=radioLinkLocal(s,a,b);if(kind!=='relay'&&Math.hypot(u.x-v.x,u.y-v.y)>18)continue;
      const color=new T.Color(kind==='relay'?0x85cdec:kind==='blocked'?0xe47562:0x8bdca1);
      const chunks=kind==='relay'?10:1;
      for(let j=0;j<chunks;j++){const t=j/chunks,q=(j+(chunks===1?1:.55))/chunks;
        const z1=s.map.heightAt(u.x,u.y)+1.8,z2=s.map.heightAt(v.x,v.y)+1.8;
        this.radioPositions.set([u.x+(v.x-u.x)*t,u.y+(v.y-u.y)*t,z1+(z2-z1)*t,u.x+(v.x-u.x)*q,u.y+(v.y-u.y)*q,z1+(z2-z1)*q],n*6);color.toArray(this.radioColors,n*6);color.toArray(this.radioColors,n*6+3);n++;
        if(n>=2560)break;
      }if(n>=2560)break;
    }
    this.radioLines.geometry.setDrawRange(0,n*2);this.radioLines.geometry.attributes.position.needsUpdate=true;this.radioLines.geometry.attributes.color.needsUpdate=true;
  }
}
function radioLinkLocal(s:SearchRescueSim,a:number,b:number){const env=s.radio;return radioLink(env.positions[a],env.positions[b],env);}
