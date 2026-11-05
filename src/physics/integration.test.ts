import {it,expect} from 'vitest';
import {TalosRobotAgent} from '../robot/TalosRobotAgent';
import {SwarmManager} from '../swarm/SwarmManager';
import {equilibrium,PayloadPhysics} from './M1';
import {supports} from '../missions/cases';
it('public swarm API lifts an elastic payload into transport',()=>{
 const points=supports(4,{x:2.6,y:1.7}),agents=points.map((p,i)=>new TalosRobotAgent({id:i+1,pose:{...p,theta:0},forceSensor:'calibrated',stiffness:20000,damping:200}));
 const manager=new SwarmManager(agents);manager.assignSupports(points.map((r,i)=>({agentId:i+1,r})),{x:0,y:0,theta:0});const eq=equilibrium(manager.getSupportContactInputs(),24,{x:.25,y:.12});
 const physics=new PayloadPhysics({id:'test',mass:24,com:{x:.25,y:.12},pose:{x:0,y:0,theta:0},z:eq.plane.a+eq.plane.b*.25+eq.plane.c*.12,rho:.3},{x:2.6,y:1.7});physics.pitch=eq.plane.b;physics.roll=eq.plane.c;let contacts=eq.contacts;
 manager.beginApproach();manager.requestLift();manager.startTransport();
 for(let i=0;i<2000;i++){manager.step(.01,{time:i*.01,contacts,payload:physics.state});contacts=physics.step(.01,manager.getSupportContactInputs()).contacts;}
 expect(agents.map(a=>a.mode)).toEqual(['TRANSPORT','TRANSPORT','TRANSPORT','TRANSPORT']);expect(physics.state.rho).toBeGreaterThan(0);
 for(let i=0;i<200;i++){manager.step(.01,{time:20+i*.01,contacts,payload:physics.state,faults:{lossP:.3,radioDead:[1]}});contacts=physics.step(.01,manager.getSupportContactInputs()).contacts;}
 expect(agents.every(a=>a.mode==='HOLD')).toBe(true);expect(contacts.every(c=>c.force>=0)).toBe(true);
});
