import {describe,it,expect} from 'vitest';
import {WildernessMap} from '../src/core/terrain/WildernessMap';
import {RouteLearning} from '../src/core/terrain/routeLearning';
import {lineOfSight, sampleActiveEdges} from '../src/swarm/graph';
import {Rng} from '../src/swarm/rng';
import {TalosRobotAgent} from '../src/robot/TalosRobotAgent';
import {SearchRescueSim} from '../src/missions/SearchRescueSim';
import {SwarmFleet} from '../src/swarm/SwarmFleet';
import {stabilityMargin} from '../src/swarm/supportPolygon';
import {buildEdges,terrainEdges} from '../src/swarm/graph';
import {WildernessEnvironment} from '../src/platform/WildernessEnvironment';
import {team} from '../src/missions/HeavyConstructionSim';

const run=(s:SearchRescueSim,seconds:number)=>{for(let i=0;i<seconds*100;i++)s.step(.01);};
describe('field mechanics',()=>{
 it('terrain blocks LOS, relay adds a virtual edge and loss still applies',()=>{
  const terrain={heightAt:(x:number)=>Math.abs(x)<1?5:0,gradientAt:()=>({x:0,y:0})};
  const positions=[{x:-5,y:0},{x:5,y:0}],env={terrain,positions,relays:[{position:{x:0,y:0},radius:25,active:false}]};
  expect(lineOfSight(positions[0],positions[1],terrain)).toBe(false);
  expect(sampleActiveEdges([[0,1]],0,new Rng(0),env)).toEqual([]);
  env.relays[0].active=true;
  expect(sampleActiveEdges([],0,new Rng(0),env)).toEqual([[0,1]]);
  expect(sampleActiveEdges([],1,new Rng(0),env)).toEqual([]);
 });
 it('smooths three observations with alpha .25 and tests the strict 30% trigger against the OLD estimate',()=>{
  const l=new RouteLearning();expect(l.observe(7,20,10)).toEqual({old:10,value:12.5,replan:true});
  expect(l.observe(7,10,10)).toEqual({old:12.5,value:11.875,replan:false});
  expect(l.observe(7,15,10).value).toBe(12.65625);
  expect(new RouteLearning().observe(1,13,10).replan).toBe(false);
 });
 it('motion slows and uphill energy increases monotonically with gradient in SI units',()=>{
  const result=[0,.1,.3,.6].map(g=>{const a=new TalosRobotAgent({id:1,terrain:{field:{heightAt:x=>x*g,gradientAt:()=>({x:g,y:0})},uphillWatts:180}});a.setTwistCommand({vx:1,vy:0,omega:0});for(let i=0;i<100;i++)a.step(.01);return {x:a.pose.x,b:a.battery};});
  for(let i=1;i<result.length;i++){expect(result[i].x).toBeLessThan(result[i-1].x);expect(result[i].b).toBeLessThan(result[i-1].b);}
 });
 it('river edges are only passable through the eight metre ford',()=>{const m=new WildernessMap(0);expect(m.segmentPassable({x:12,y:-6},{x:12,y:12})).toBe(false);expect(m.segmentPassable({x:0,y:-6},{x:0,y:12},1.6)).toBe(true);});
 it('reuses fleet hot-swap on a slope with a positive remaining polygon',()=>{
  const field={heightAt:(x:number)=>x*.22,gradientAt:()=>({x:.22,y:0})};
  const agents=Array.from({length:10},(_,i)=>new TalosRobotAgent({id:i+1,terrain:{field}}));
  const spec=team('Alpha',[1,2,3,4,5,6,7,8],0,0,32,.8,.65);
  spec.supports.forEach(s=>agents[s.agentId-1].reset({x:s.r.x,y:s.r.y}));agents[8].reset({x:2,y:1});agents[9].reset({x:2,y:-1});
  const fleet=new SwarmFleet(agents,{chargers:[{x:-3,y:0}],driveSpeed:1,slopePolicy:{degreesAt:()=>12.4,thresholdDegrees:10,marginMultiplier:.65}});
  fleet.dispatch(spec);fleet.setReserves([9,10]);fleet.startTeam('Alpha');fleet.team('Alpha')!.startTransport();
  const events=[];for(let i=0;i<18000;i++){if(i===1500)agents[0].setBattery(.249);events.push(...fleet.step(.01).events);}
  expect(events.some(e=>e.kind==='hot-swap-start'&&e.detail.includes('уклон'))).toBe(true);
  expect(events.some(e=>e.kind==='hot-swap-done')).toBe(true);
  expect(fleet.team('Alpha')!.ids).not.toContain(1);expect(fleet.team('Alpha')!.ids.length).toBe(8);
  expect(stabilityMargin(fleet.team('Alpha')!.ids.map(id=>fleet.team('Alpha')!.supportOf(id)!),spec.com!)).toBeGreaterThan(0);
 });
});
describe('search and rescue mission',()=>{
 it('renders 420 deterministic conifers with instancing and a matching wind depth material',()=>{
  const s=new SearchRescueSim({seed:0}),world=new WildernessEnvironment(s);
  const instances=world.root.children.filter(o=>'isInstancedMesh' in o);
  expect(instances.map(o=>('count' in o?o.count:0))).toEqual([420,420,65]);
  const foliage=instances[0];expect('customDepthMaterial' in foliage&&foliage.customDepthMaterial).toBeTruthy();
 });
 it('relay increases available connectivity at the same positions; emergency stop holds every chassis',()=>{
  const s=new SearchRescueSim();run(s,120);
  const env=s.radio,base=buildEdges(env.positions.length,'complete');
  expect(terrainEdges(base,env).length).toBeGreaterThan(terrainEdges(base,{...env,relays:[]}).length);
  s.hold();const poses=s.agents.map(a=>({...a.pose}));run(s,2);
  expect(s.agents.map(a=>a.pose)).toEqual(poses);expect(s.agents.every(a=>a.mode==='HOLD')).toBe(true);
 });
 it.each([1,7,42])('finishes for additional deterministic seed %i',seed=>{
  const s=new SearchRescueSim({seed});run(s,420);expect(s.phase).toBe('COMPLETE');
 },30000);

 it('completes deployment with stable radio; learned routes improve evacuation time',()=>{
  const a=new SearchRescueSim({seed:0}),b=new SearchRescueSim({seed:0,learning:false});
  run(a,310);run(b,310);
  expect(a.phase).toBe('COMPLETE');expect(a.rho).toBeGreaterThan(0);expect(a.stableSeconds).toBeGreaterThanOrEqual(5);
  expect(a.events.some(e=>e.text.includes('hot-swap-done'))).toBe(true);
  expect(b.replans).toBe(0);expect(a.replans).toBeGreaterThan(0);
  const arrival=(s:SearchRescueSim)=>s.events.find(e=>e.text.includes('совместное опускание'))!.t;
  expect(arrival(a)).toBeLessThan(arrival(b));
 },30000);

 it('reaches evacuation in 120 model seconds at seed 0 and repeats exactly',()=>{
  const a=new SearchRescueSim({seed:0}),b=new SearchRescueSim({seed:0});run(a,120);run(b,120);
  expect(a.phase).toBe('EVACUATION');expect(a.events).toEqual(b.events);expect(a.agents.map(a=>a.pose)).toEqual(b.agents.map(a=>a.pose));expect(a.relay.active).toBe(true);
 },30000);
});
