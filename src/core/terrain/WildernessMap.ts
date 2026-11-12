import type { TerrainField, Vec2 } from '../../contracts/types';
import { Rng } from '../../swarm/rng';

export const BASE = { x: -18, y: -24 };
export const FIELD_PARAMS = { slopeSlowdown: 1.5, uphillWatts: 180, forestSpeed: 0.4, fordSpeed: 0.45, fordWatts: 90 };
/** The same sampled, bilinear height field owns rendering, navigation, physics and radio. Z-up metres. */
export class WildernessMap implements TerrainField {
  readonly size = 120;
  readonly resolution = 120;
  readonly heights = new Float32Array(121 * 121);
  readonly victim: Vec2;
  readonly sectors = [{x:-18,y:30},{x:0,y:30},{x:18,y:30},{x:30,y:24}];
  readonly victimSector: number;
  constructor(readonly seed = 0) {
    const rng = new Rng(seed);
    const phase = rng.random() * 6;
    this.victimSector = Math.floor(rng.random() * 4);
    const sector = this.sectors[this.victimSector];
    this.victim = { x: sector.x + rng.random() * 3 - 1.5, y: sector.y + rng.random() * 3 - 1.5 };
    for (let j=0;j<=120;j++) for(let i=0;i<=120;i++) {
      const x=i-60,y=j-60;
      const hill=(cx:number,cy:number,s:number)=>Math.exp(-((x-cx)**2+(y-cy)**2)/s);
      const h=0.4+4.8*hill(-8,12,190)+5.1*hill(24,8,150)+3.4*hill(-32,-5,210)+1.1*(1+Math.sin(x*.09+phase)*Math.cos(y*.075));
      this.heights[j*121+i]=Math.min(6,h);
    }
  }
  heightAt(x:number,y:number):number {
    const u=Math.max(0,Math.min(119.999,x+60)),v=Math.max(0,Math.min(119.999,y+60));
    const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*121+i,h=this.heights;
    return (h[k]*(1-a)+h[k+1]*a)*(1-b)+(h[k+121]*(1-a)+h[k+122]*a)*b;
  }
  gradientAt(x:number,y:number):Vec2 { return {x:(this.heightAt(x+.5,y)-this.heightAt(x-.5,y)),y:(this.heightAt(x,y+.5)-this.heightAt(x,y-.5))}; }
  forestAt(x:number,y:number):boolean { return (Math.hypot(x+9,y+15)<9 || Math.sin(x*.12)*Math.cos(y*.1)+.35*Math.sin(y*.23+x*.06)>.05) && Math.hypot(x-BASE.x,y-BASE.y)>7 && Math.abs(x)>5; }
  riverAt(x:number,y:number):boolean { return Math.abs(y-(2+2*Math.sin(x*.05)))<3; }
  passable(x:number,y:number):boolean { return Math.abs(x)<=59&&Math.abs(y)<=59&&(!this.riverAt(x,y)||Math.abs(x)<=4); }
  speedAt(x:number,y:number):number { return this.riverAt(x,y)?FIELD_PARAMS.fordSpeed:this.forestAt(x,y)?FIELD_PARAMS.forestSpeed:1; }
  extraWattsAt(x:number,y:number):number { return this.riverAt(x,y)?FIELD_PARAMS.fordWatts:0; }
  segmentPassable(a:Vec2,b:Vec2,clearance=0):boolean {
    const n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*2);
    for(let i=0;i<=n;i++){const t=i/Math.max(1,n),x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(!this.passable(x,y)||!this.passable(x-clearance,y)||!this.passable(x+clearance,y))return false;}
    return true;
  }
}
