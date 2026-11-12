import type { Vec2, SupportContactInput, SupportContactOutput, PayloadState } from '../contracts/types';
export const G = 9.81;
const cross = (a:Vec2,b:Vec2,c:Vec2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const byXY=(a:Vec2,b:Vec2)=>a.x-b.x||a.y-b.y;
/** Monotone-chain hull (counter-clockwise); duplicate points collapse. One output array, no string keys. */
export function convexHull(points:Vec2[]):Vec2[] {
 const sorted=points.slice().sort(byXY);let n=0;
 for(let i=0;i<sorted.length;i++)if(n===0||sorted[i].x!==sorted[n-1].x||sorted[i].y!==sorted[n-1].y)sorted[n++]=sorted[i];
 sorted.length=n;
 if(n<3)return sorted;
 const h:Vec2[]=[];
 for(let i=0;i<n;i++){const v=sorted[i];while(h.length>1&&cross(h[h.length-2],h[h.length-1],v)<=0)h.pop();h.push(v);}
 h.pop();const lower=h.length;
 for(let i=n-1;i>=0;i--){const v=sorted[i];while(h.length>lower+1&&cross(h[h.length-2],h[h.length-1],v)<=0)h.pop();h.push(v);}
 h.pop();
 return h;
}
export function stability(points:Vec2[],com:Vec2){
 const hull=convexHull(points);let distance=Infinity,nearest={...com},inside=hull.length>=3;
 for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length],dx=b.x-a.x,dy=b.y-a.y;
 const t=Math.max(0,Math.min(1,((com.x-a.x)*dx+(com.y-a.y)*dy)/(dx*dx+dy*dy||1)));
 const q={x:a.x+t*dx,y:a.y+t*dy},d=Math.hypot(com.x-q.x,com.y-q.y);if(d<distance){distance=d;nearest=q;}if(cross(a,b,com)<-1e-10)inside=false;}
 // A two-point support has zero transverse margin, including its endpoints.
 if(hull.length===2&&distance<1e-9)inside=true;
 return {hull,nearest,rho:Number.isFinite(distance)?(inside?distance:-Math.max(distance,1e-9)):-1};
}
/** Pivoted elimination; zero unobservable slopes for collinear supports. */
function solve(a:number[][],b:number[]):number[]{
 const m=a.map((r,i)=>[...r,b[i]]);const piv:number[]=[];let row=0;
 for(let col=0;col<3;col++){let p=row;for(let j=row;j<3;j++)if(Math.abs(m[j][col])>Math.abs(m[p][col]))p=j;if(Math.abs(m[p][col])<1e-10)continue;
 [m[row],m[p]]=[m[p],m[row]];const d=m[row][col];for(let j=col;j<4;j++)m[row][j]/=d;
 for(let k=0;k<3;k++)if(k!==row){const f=m[k][col];for(let j=col;j<4;j++)m[k][j]-=f*m[row][j];}piv[row++]=col;}
 const x=[0,0,0];piv.forEach((c,i)=>x[c]=m[i][3]);return x;
}
function fit(inputs:SupportContactInput[],values:number[],weights=inputs.map(()=>1)){
 const a=Array.from({length:3},()=>[0,0,0]),b=[0,0,0];inputs.forEach((s,i)=>{const v=[1,s.pad.x,s.pad.y];for(let j=0;j<3;j++){b[j]+=weights[i]*v[j]*values[i];for(let k=0;k<3;k++)a[j][k]+=weights[i]*v[j]*v[k];}});return {a,b};
}
export function fitPlane(inputs:SupportContactInput[]){const {a,b}=fit(inputs,inputs.map(s=>s.padZ));const [z,x,y]=solve(a,b);return {a:z,b:x,c:y};}
export function contact(s:SupportContactInput,z:number,velocity=0):SupportContactOutput {
 const delta=s.padZ-z,deltaDot=s.padVel-velocity;
 return {agentId:s.agentId,delta,deltaDot,force:delta>0?Math.max(0,s.stiffness*delta+s.damping*deltaDot):0};
}
/** Elastic equilibrium active-set solution (also works for two collinear supports). */
export function equilibrium(inputs:SupportContactInput[],mass:number,com:Vec2){
 let active=[...inputs],plane={a:0,b:0,c:0};
 for(let k=0;k<=inputs.length&&active.length;k++){
 const {a,b}=fit(active,active.map(s=>s.padZ),active.map(s=>s.stiffness));
 b[0]-=mass*G;b[1]-=mass*G*com.x;b[2]-=mass*G*com.y;
 const q=solve(a,b);plane={a:q[0],b:q[1],c:q[2]};
 const next=active.filter(s=>s.padZ-plane.a-plane.b*s.pad.x-plane.c*s.pad.y>0);if(next.length===active.length)break;active=next;
 }
 return {plane,contacts:inputs.map(s=>contact({...s,damping:0},plane.a+plane.b*s.pad.x+plane.c*s.pad.y))};
}
export class PayloadPhysics {
 velocity=0; rollVelocity=0; pitchVelocity=0; roll=0; pitch=0;
 /** Contact outputs reused by every step (the substep loop runs 40× per 10 ms: no allocation there). */
 private readonly out:SupportContactOutput[]=[];
 constructor(public state:PayloadState,public size={x:2,y:1}){}
 step(dt:number,inputs:SupportContactInput[]){
 // Small substeps resolve stiff contacts without explicit-Euler instability.
 const n=Math.ceil(dt/0.00025),h=dt/n,contacts=this.out;
 while(contacts.length<inputs.length)contacts.push({agentId:0,delta:0,deltaDot:0,force:0});
 contacts.length=inputs.length;
 const com=this.state.com;
 for(let k=0;k<n;k++){
 let f=0,tx=0,ty=0;
 for(let i=0;i<inputs.length;i++){
  const s=inputs[i],x=s.pad.x-com.x,y=s.pad.y-com.y,c=contacts[i];
  const delta=s.padZ-(this.state.z+this.pitch*x+this.roll*y),deltaDot=s.padVel-(this.velocity+this.pitchVelocity*x+this.rollVelocity*y);
  c.agentId=s.agentId;c.delta=delta;c.deltaDot=deltaDot;c.force=delta>0?Math.max(0,s.stiffness*delta+s.damping*deltaDot):0;
  f+=c.force;tx+=c.force*y;ty+=c.force*x;
 }
 this.velocity+=(f/this.state.mass-G)*h;this.state.z+=this.velocity*h;
 this.rollVelocity+=tx/(this.state.mass*this.size.y**2/12)*h;this.pitchVelocity+=ty/(this.state.mass*this.size.x**2/12)*h;
 this.roll+=this.rollVelocity*h;this.pitch+=this.pitchVelocity*h;
 if(this.state.z<0){this.state.z=0;this.velocity=Math.max(0,this.velocity);}
 }
 const support=stability(inputs.filter((_,i)=>contacts[i].delta>0).flatMap(s=>inputs.length===1?[-1,1].flatMap(x=>[-1,1].map(y=>({x:s.pad.x+x*s.padHalfSize,y:s.pad.y+y*s.padHalfSize}))):[s.pad]),this.state.com);
 this.state.rho=support.rho;this.state.plane=fitPlane(inputs);
 const plane=this.state.plane;
 return {contacts,payload:this.state,...support,roll:Math.atan(this.roll),pitch:Math.atan(this.pitch),residuals:inputs.map(s=>s.padZ-plane.a-plane.b*s.pad.x-plane.c*s.pad.y)};
 }
}
