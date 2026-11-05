import {describe,it,expect} from 'vitest';
import {contact,equilibrium,fitPlane,stability,PayloadPhysics,G} from './M1';
import type {SupportContactInput} from '../contracts/types';
const pad=(x:number,y=0,z=1):SupportContactInput=>({agentId:x+1,pad:{x,y},padZ:z,padVel:0,padHalfSize:.065,stiffness:200000,damping:2000,fAllow:180});
describe('M1',()=>{
 it('two supports reproduce 30/70 reactions',()=>{const r=equilibrium([pad(0),pad(1)],10,{x:.7,y:0});expect(r.contacts[0].force).toBeCloseTo(.3*10*G,7);expect(r.contacts[1].force).toBeCloseTo(.7*10*G,7);});
 it('unilateral contact never pulls',()=>{expect(contact(pad(0),1).force).toBe(0);expect(contact(pad(0),2).force).toBe(0);expect(contact(pad(0),.99,100).force).toBe(0);});
 it('fits a tilted plane and signed hull distance',()=>{const p=[pad(0,0,1),pad(1,0,1.1),pad(0,1,1.2),pad(1,1,1.3)];expect(fitPlane(p).b).toBeCloseTo(.1);expect(fitPlane(p).c).toBeCloseTo(.2);expect(stability(p.map(s=>s.pad),{x:.5,y:.5}).rho).toBeCloseTo(.5);expect(stability(p.map(s=>s.pad),{x:2,y:.5}).rho).toBeCloseTo(-1);});
 it('four elastic supports balance weight and moments',()=>{const p=[pad(-1,-1),pad(1,-1),pad(1,1),pad(-1,1)];const r=equilibrium(p,20,{x:.2,y:.1});expect(r.contacts.reduce((s,c)=>s+c.force,0)).toBeCloseTo(20*G);expect(r.contacts.reduce((s,c,i)=>s+c.force*p[i].pad.x,0)).toBeCloseTo(20*G*.2);});
 it('integrates equilibrium without drift',()=>{const p=[pad(-1,-1),pad(1,-1),pad(1,1),pad(-1,1)];const q=equilibrium(p,20,{x:0,y:0});const physics=new PayloadPhysics({id:'test',mass:20,com:{x:0,y:0},pose:{x:0,y:0,theta:0},z:q.plane.a});for(let i=0;i<100;i++)physics.step(.01,p);expect(physics.state.z).toBeCloseTo(q.plane.a,7);});
});
