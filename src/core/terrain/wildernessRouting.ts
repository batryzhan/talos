import type { Vec2 } from '../../contracts/types';
import { WildernessMap } from './WildernessMap';
import type { RouteLearning } from './routeLearning';
export interface TrailEdge {id:number;a:number;b:number;length:number;time:number}
/** Six metre terrain lattice; all edge samples and the complete Alpha footprint must clear the river. */
export class WildernessRouting {
  readonly nodes:Vec2[]=[];
  readonly edges:TrailEdge[]=[];
  readonly incident:number[][]=[];
  constructor(readonly map:WildernessMap){
    const index=new Map<string,number>();
    for(let y=-54;y<=54;y+=6)for(let x=-54;x<=54;x+=6)if(map.passable(x,y)){index.set(`${x},${y}`,this.nodes.length);this.nodes.push({x,y});this.incident.push([]);}
    for(let a=0;a<this.nodes.length;a++){
      const p=this.nodes[a];for(const [dx,dy]of [[6,0],[0,6],[6,6],[-6,6]]){
        const b=index.get(`${p.x+dx},${p.y+dy}`);if(b===undefined||!map.segmentPassable(p,this.nodes[b],1.6))continue;
        const q=this.nodes[b],length=Math.hypot(dx,dy),g=map.gradientAt((p.x+q.x)/2,(p.y+q.y)/2);
        const time=length/(1.4*Math.max(.35,1-Math.hypot(g.x,g.y)*1.5)*(map.forestAt((p.x+q.x)/2,(p.y+q.y)/2)?.85:1));
        const id=this.edges.length;this.edges.push({id,a,b,length,time});this.incident[a].push(id);this.incident[b].push(id);
      }
    }
  }
  nearest(p:Vec2):number {let best=0,d=Infinity;this.nodes.forEach((q,i)=>{const v=Math.hypot(p.x-q.x,p.y-q.y);if(v<d){best=i;d=v;}});return best;}
  edge(a:number,b:number):TrailEdge|undefined{return this.incident[a].map(i=>this.edges[i]).find(e=>e.a===b||e.b===b);}
  route(from:Vec2,to:Vec2,learning?:RouteLearning, timeScale=1):number[]{
    const start=this.nearest(from),goal=this.nearest(to),d=new Float64Array(this.nodes.length).fill(Infinity),prev=new Int32Array(this.nodes.length).fill(-1),done=new Uint8Array(this.nodes.length);d[start]=0;
    for(let k=0;k<this.nodes.length;k++){
      let a=-1;for(let i=0;i<d.length;i++)if(!done[i]&&(a<0||d[i]<d[a]))a=i;
      if(a<0||!Number.isFinite(d[a]))break;if(a===goal)break;done[a]=1;
      for(const id of this.incident[a]){const e=this.edges[id],b=e.a===a?e.b:e.a,w=learning?.estimate(id,e.time*timeScale)??e.time*timeScale;if(d[a]+w<d[b]){d[b]=d[a]+w;prev[b]=a;}}
    }
    if(!Number.isFinite(d[goal]))return [];
    const path=[goal];while(path[0]!==start)path.unshift(prev[path[0]]);return path;
  }
}
