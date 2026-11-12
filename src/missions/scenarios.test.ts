import {it,expect} from 'vitest';
import {HeavyConstructionSim} from './HeavyConstructionSim';
import {TalosRobotAgent} from '../robot/TalosRobotAgent';
import {SwarmFleet} from '../swarm/SwarmFleet';
import {equilibrium,PayloadPhysics,stability} from '../physics/M1';
for(const plan of [new HeavyConstructionSim()])it(`scenario ${plan.count}: contact / lift integration`,()=>{
 const agents=Array.from({length:plan.count},(_,i)=>new TalosRobotAgent({id:i+1,forceSensor:'calibrated',stiffness:20000,damping:200}));const fleet=new SwarmFleet(agents,{seed:0});
 const loads=plan.teams.map(spec=>{spec.supports.forEach(s=>agents[s.agentId-1].reset({x:spec.payloadPose.x+s.r.x,y:spec.payloadPose.y+s.r.y}));const m=fleet.dispatch(spec),inputs=m.getSupportContactInputs(),com={x:spec.payloadPose.x+spec.com!.x,y:spec.payloadPose.y+spec.com!.y},eq=equilibrium(inputs,spec.mass!,com);expect(eq.contacts.reduce((s,c)=>s+c.force,0)).toBeCloseTo(spec.mass!*9.81,3);expect(eq.contacts.every((c,i)=>c.force<=inputs[i].fAllow)).toBe(true);const p=new PayloadPhysics({id:spec.teamId,mass:spec.mass!,com,pose:spec.payloadPose,z:eq.plane.a+eq.plane.b*com.x+eq.plane.c*com.y,rho:inputs.length===1?.065:stability(inputs.map(s=>s.pad),com).rho});p.pitch=eq.plane.b;p.roll=eq.plane.c;fleet.startTeam(spec.teamId);m.startTransport();return {spec,p,contacts:eq.contacts};});
 for(let k=0;k<1200;k++){fleet.step(.01,{time:k*.01,contacts:loads.flatMap(l=>l.contacts),payloads:Object.fromEntries(loads.map(l=>[l.spec.teamId,l.p.state]))});for(const l of loads)l.contacts=l.p.step(.01,fleet.team(l.spec.teamId)!.getSupportContactInputs()).contacts;}
 expect(plan.teams.map(t=>fleet.team(t.teamId)!.agents.every(a=>a.mode==='TRANSPORT'))).toEqual(plan.teams.map(()=>true));
});
