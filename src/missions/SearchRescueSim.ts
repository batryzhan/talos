import type { ControllerKind, FleetStepOutput, RadioEnvironment, SubSwarmAssignment, SupportContactOutput, Vec2 } from '../contracts/types';
import type { Object3D } from 'three';
import { TalosRobotAgent } from '../robot/TalosRobotAgent';
import { SwarmFleet } from '../swarm/SwarmFleet';
import { consensusStep } from '../swarm/consensus';
import { buildEdges, lineOfSight, radioLink, sampleActiveEdges } from '../swarm/graph';
import { Rng } from '../swarm/rng';
import { equilibrium, stability } from '../physics/M1';
import { team } from './HeavyConstructionSim';
import { BASE, FIELD_PARAMS, WildernessMap } from '../core/terrain/WildernessMap';
import { WildernessRouting } from '../core/terrain/wildernessRouting';
import { RouteLearning } from '../core/terrain/routeLearning';

export type RescuePhase='FORMING'|'SEARCH'|'RELAY'|'EVACUATION'|'COMPLETE';
export interface RescueSnapshot {phase:RescuePhase;found:boolean;sector:string;relayActive:boolean;relayPhase:string;connected:boolean;links:number;stableSeconds:number;updates:number;replans:number;routeSeconds:number;deployed:boolean}
interface Navigation {path:number[];index:number;start:number;goal:Vec2;done:boolean;edgeStart:number}
export interface RescueOptions {seed?:number;model?:Object3D;learning?:boolean;onEvent?:(text:string,t:number)=>void}
const speedOf=(id:number)=>id>=9&&id<=12?1.4:.75;
const distance=(a:Vec2,b:Vec2)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Deterministic fixed-step field mission, shared verbatim by the browser and headless tests. */
export class SearchRescueSim {
  readonly map:WildernessMap;
  readonly routing:WildernessRouting;
  readonly agents:TalosRobotAgent[];
  readonly fleet:SwarmFleet;
  readonly teams:SubSwarmAssignment[];
  readonly learners=new Map<number,RouteLearning>();
  readonly navigation=new Map<string,Navigation>();
  readonly relay:{position:Vec2;radius:number;active:boolean};
  readonly coverage:Vec2[];
  readonly events:{t:number;text:string}[]=[];
  readonly radioRng:Rng;
  contacts:SupportContactOutput[]=[];
  phase:RescuePhase='FORMING';
  relayPhase='Ожидание координат';
  installer=9;
  time=0;lossP=0;controller:ControllerKind='C';learning=true;stopped=false;found=false;connected=false;stableSeconds=0;deployed=false;replans=0;
  activeEdges:readonly (readonly [number,number])[]=[];
  out?:FleetStepOutput;
  roofHeight=.12;
  rho=.5;
  private acc=0;
  private readonly surveyed=new Set<number>();
  private dockingStable=0;
  private roofStage:'CARRY'|'LOWER'|'RAISE'|'HOLD'='CARRY';
  private readonly onEvent?:RescueOptions['onEvent'];
  constructor(o:RescueOptions={}){
    this.onEvent=o.onEvent;this.learning=o.learning??true;
    this.map=new WildernessMap(o.seed??0);this.routing=new WildernessRouting(this.map);this.radioRng=new Rng((o.seed??0)+718);
    this.relay={position:this.chooseHill(),radius:25,active:false};
    this.coverage=this.coveragePositions();
    this.agents=Array.from({length:14},(_,i)=>new TalosRobotAgent({id:i+1,model:o.model,terrain:{field:this.map,...FIELD_PARAMS},forceSensor:'calibrated',stiffness:1600,damping:80,batteryWh:i===0?3:36,pose:{x:BASE.x+(i%4)*.8,y:BASE.y-3-Math.floor(i/4),theta:0}}));
    this.teams=[team('Alpha',[1,2,3,4,5,6,7,8],BASE.x,BASE.y,32,.8,.65),...Array.from({length:4},(_,i)=>team(`Scout-${i+1}`,[9+i],BASE.x+i*1.3-2,BASE.y+3,0,1,1))];
    this.fleet=new SwarmFleet(this.agents,{seed:o.seed,chargers:[{x:BASE.x-3,y:BASE.y-4},{x:BASE.x+3,y:BASE.y-4}],driveSpeed:1.4,reserveParking:{13:{x:BASE.x-3,y:BASE.y-2},14:{x:BASE.x+3,y:BASE.y-2}},slopePolicy:{degreesAt:p=>this.slopeAt(p),thresholdDegrees:10,marginMultiplier:.65},defaults:{slopeCoordination:{thresholdDegrees:8,couplingMultiplier:2},safety:{maxHeightSkew:.08,neighborTimeout:2,minBattery:.08,rhoMin:.03,posTol:.03,headingTol:.05}}});
    for(const spec of this.teams){
      for(const s of spec.supports){this.agents[s.agentId-1].reset({x:spec.payloadPose.x+s.r.x,y:spec.payloadPose.y+s.r.y});this.learners.set(s.agentId,new RouteLearning());}
      const mgr=this.fleet.dispatch(spec);if(spec.agentIds.length===1)mgr.setSafety({rhoMin:-1});this.fleet.startTeam(spec.teamId);mgr.startTransport();
    }
    this.fleet.setReserves([13,14]);this.learners.set(13,new RouteLearning());this.learners.set(14,new RouteLearning());
    this.log('ФОРМИРОВАНИЕ: Alpha — укрытие и носилки 32 кг; четыре разведчика выходят в сектора; резерв #13–14 на базе');
  }
  slopeAt(p:Vec2):number {const g=this.map.gradientAt(p.x,p.y);return Math.atan(Math.hypot(g.x,g.y))*180/Math.PI;}
  private chooseHill():Vec2 {
    const candidates=this.routing.nodes.filter(p=>distance(p,this.map.victim)<24&&lineOfSight(BASE,p,this.map,3,6)&&lineOfSight(p,this.map.victim,this.map,6,1.2));
    candidates.sort((a,b)=>(this.map.heightAt(b.x,b.y)-distance(b,{x:0,y:18})*.4)-(this.map.heightAt(a.x,a.y)-distance(a,{x:0,y:18})*.4));
    return candidates[0]??{x:0,y:18};
  }
  /** Pick radio-visible stepping stones, rather than placing a perimeter through an occluding hill. */
  private coveragePositions():Vec2[]{
    const points=[BASE,...this.routing.nodes,this.map.victim],goal=points.length-1;
    const previous=new Int32Array(points.length).fill(-1),queue=[0];previous[0]=0;
    const env:RadioEnvironment={terrain:this.map,positions:points,antennaHeight:1.8,range:17,relays:[{...this.relay,radius:24,active:true}]};
    for(let head=0;head<queue.length&&previous[goal]<0;head++){
      const a=queue[head];for(let b=1;b<points.length;b++)if(previous[b]<0&&radioLink(points[a],points[b],env)!=='blocked'){previous[b]=a;queue.push(b);}
    }
    const path:number[]=[];if(previous[goal]>=0){let p=goal;while(p!==0){path.unshift(p);p=previous[p];}}
    const intermediates=path.slice(0,-1).map(i=>points[i]);
    return Array.from({length:3},(_,i)=>intermediates[i]??this.relay.position);
  }
  private log(text:string):void {this.events.push({t:this.time,text});this.onEvent?.(text,this.time);}
  get radio():RadioEnvironment {return {terrain:this.map,positions:[BASE,...this.agents.map(a=>a.pose),this.map.victim],range:18,antennaHeight:1.8,relays:[this.relay]};}
  get snapshot():RescueSnapshot {return {phase:this.phase,found:this.found,sector:`${String.fromCharCode(65+this.map.victimSector)}4`,relayActive:this.relay.active,relayPhase:this.relayPhase,connected:this.connected,links:this.activeEdges.length,stableSeconds:this.stableSeconds,updates:[...this.learners.values()].reduce((n,l)=>n+l.updates,0),replans:this.replans,routeSeconds:this.routeEstimate('Alpha'),deployed:this.deployed};}
  routeEstimate(id:string):number {
    const n=this.navigation.get(id),agent=this.fleet.team(id)?.ids[0];if(!n||n.done||agent===undefined)return 0;
    let t=0;for(let i=Math.max(1,n.index);i<n.path.length;i++){const e=this.routing.edge(n.path[i-1],n.path[i]);if(e)t+=this.learning?this.learners.get(agent)!.estimate(e.id,e.time*1.4/speedOf(agent)):e.time*1.4/speedOf(agent);}return t;
  }
  private navigate(id:string,goal:Vec2):void {
    const mgr=this.fleet.team(id)!,p=this.fleet.measuredPayloadPose(id),agent=mgr.ids[0],learner=this.learners.get(agent)!;
    let n=this.navigation.get(id);
    if(!n||distance(n.goal,goal)>.1){const path=this.routing.route(p,goal,this.learning?learner:undefined,1.4/speedOf(agent));n={path,index:0,start:this.time,goal:{...goal},done:false,edgeStart:this.time};this.navigation.set(id,n);}
    if(n.done){mgr.setTransportCommand({vc:{x:0,y:0},omegaC:0});return;}
    let target=n.path[n.index]===undefined?goal:this.routing.nodes[n.path[n.index]];
    if(distance(p,target)<.45){
      let replan=false;
      if(n.index>0){const e=this.routing.edge(n.path[n.index-1],n.path[n.index]);if(e&&this.learning){const observed=this.time-n.edgeStart;const result=learner.observe(e.id,observed,e.time*1.4/speedOf(agent));replan=result.replan;
        this.log(`ОБУЧЕНИЕ: #${agent}, оценка времени ребра E${e.id} обновлена ${result.old.toFixed(1)}→${result.value.toFixed(1)} с${replan?' · перепланирование':''}`);
        // Published observations remain local to receivers that have a delivered radio path to the scout.
        const reachable=this.reachable(agent);
        for(const a of this.agents)if(a.id!==agent&&reachable.has(a.id))this.learners.get(a.id)?.observe(e.id,observed*speedOf(agent)/speedOf(a.id),e.time*1.4/speedOf(a.id));
      }}
      n.index++;n.edgeStart=this.time;
      if(n.index>=n.path.length){n.done=true;mgr.setTransportCommand({vc:{x:0,y:0},omegaC:0});return;}
      if(replan){n.path=this.routing.route(p,goal,learner,1.4/speedOf(agent));n.index=Math.min(1,n.path.length-1);this.replans++;}
      target=this.routing.nodes[n.path[n.index]];
    }
    const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),speed=id==='Alpha'?.75:1.4;
    mgr.setTransportCommand({vc:{x:dx/Math.max(1,d)*speed,y:dy/Math.max(1,d)*speed},omegaC:0});
  }
  private reachable(id:number):Set<number>{
    const seen=new Set([id]);let change=true;
    while(change){change=false;for(const [a,b]of this.activeEdges){if(seen.has(a)&&!seen.has(b)){seen.add(b);change=true;}if(seen.has(b)&&!seen.has(a)){seen.add(a);change=true;}}}return seen;
  }
  private radioTick():void {
    const env=this.radio;this.activeEdges=sampleActiveEdges(buildEdges(env.positions.length,'complete'),this.lossP,this.radioRng,env);
    this.connected=this.found&&this.reachable(0).has(15);
  }
  requestDeploy():void {if(this.phase==='EVACUATION')this.log('УКРЫТИЕ: автоматическое развёртывание при прибытии Alpha к пострадавшему');else this.log('УКРЫТИЕ: задача принята; ожидается поиск и установка реле');}
  hold():void {this.stopped=true;this.fleet.teamIds.forEach(id=>this.fleet.team(id)!.emergencyHold('Экстренная остановка'));this.agents.forEach(a=>a.setMode('HOLD'));this.log('ОПЕРАТОР: экстренная остановка, подъёмники удерживают груз');}
  step(dt:number):void {
    this.time+=dt;if(this.stopped)return;
    this.acc+=dt;
    if(this.acc>=.1-1e-9){this.acc-=.1;this.radioTick();this.missionTick();}
    for(const id of this.fleet.teamIds)this.fleet.team(id)!.setController(this.controller);
    this.out=this.fleet.step(dt,{time:this.time,contacts:this.contacts,radioEnvironment:this.radio,faults:{lossP:this.lossP}});
    for(const e of this.out.events)this.log(`${e.kind.startsWith('hot-swap')?'РЕЗЕРВ':'ОТРЯД'}: ${e.teamId??''} ${e.kind}: ${e.detail}`);
    const mgr=this.fleet.team('Alpha')!,pose=this.fleet.measuredPayloadPose('Alpha'),inputs=mgr.getSupportContactInputs();
    const com={x:pose.x+.12,y:pose.y+.04};
    const eq=equilibrium(inputs,32,com);this.contacts=eq.contacts;this.rho=stability(inputs.map(s=>s.pad),com).rho;
    for(const c of this.contacts)this.fleet.agent(c.agentId)?.applySupportContact(c);
    this.roofHeight=eq.plane.a+eq.plane.b*pose.x+eq.plane.c*pose.y;
  }
  private missionTick():void {
    for(const id of this.fleet.teamIds){const mgr=this.fleet.team(id)!;if(!mgr.isFrozen)mgr.setPayloadReference(this.fleet.measuredPayloadPose(id));}
    if(this.phase==='FORMING'&&this.time>=1){this.phase='SEARCH';this.log('ПОИСК: разведчики патрулируют четыре сектора по графу рельефа');}
    if(this.phase==='SEARCH'){
      for(let i=0;i<4;i++){
        const a=this.agents[8+i];
        const waypoint=i===0?{x:-18,y:-12}:i===2?{x:0,y:-24}:i===3?{x:-18,y:-6}:undefined;
        if(waypoint&&distance(a.pose,waypoint)<1)this.surveyed.add(i);
        this.navigate(`Scout-${i+1}`,waypoint&&!this.surveyed.has(i)?waypoint:this.map.sectors[i]);
        if(!this.found&&distance(a.pose,this.map.victim)<14){this.found=true;this.installer=9+[0,1,2,3].sort((u,v)=>distance(this.agents[8+u].pose,this.relay.position)-distance(this.agents[8+v].pose,this.relay.position))[0];this.log(`РАЗВЕДЧИК-${i+1}: пострадавший обнаружен в секторе ${this.snapshot.sector}; координаты опубликованы в радиосеть`);this.phase='RELAY';this.relayPhase='DOCKING_ALIGN';}
      }
    }
    if(this.phase==='RELAY'||this.phase==='EVACUATION'||this.phase==='COMPLETE'){
      let perimeter=0;
      for(let i=0;i<4;i++){
        const id=9+i;if(id===this.installer)continue;
        const target=this.coverage[perimeter++];
        this.navigate(`Scout-${i+1}`,target);
      }
      const id=`Scout-${this.installer-8}`,mgr=this.fleet.team(id)!,agent=this.agents[this.installer-1];
      if(!this.relay.active){
        this.navigate(id,this.relay.position);
        const p=distance(agent.pose,this.relay.position);
        // Two-node M0 consensus between mast datum and the installer slide.
        const h=consensusStep([mgr.targetHeight,.16],[[0,1]],.2)[0];mgr.setTargetHeight(h);
        if(p<2){
          const dx=this.relay.position.x-agent.pose.x,dy=this.relay.position.y-agent.pose.y;
          mgr.setTransportCommand({vc:{x:dx*.8,y:dy*.8},omegaC:-agent.pose.theta*.8});
          if(p<.015&&this.relayPhase==='DOCKING_ALIGN'){this.relayPhase='PRECISION_MATE';this.log('РЕЛЕ: DOCKING_ALIGN → PRECISION_MATE · согласование высоты M0');}
          if(p<.001&&Math.abs(agent.pose.theta)<.0035&&Math.abs(agent.lift.h-.16)<.001){this.dockingStable+=.1;if(this.dockingStable>=.3){this.relay.active=true;this.relayPhase='MATED';this.phase='EVACUATION';this.log(`РЕЛЕ: станция развёрнута на холме ${this.routing.nearest(this.relay.position)}, связность восстановлена; ЭВАКУАЦИЯ: Alpha следует через брод`);}}else this.dockingStable=0;
        }
      }else mgr.setTransportCommand({vc:{x:0,y:0},omegaC:0});
    }
    const alpha=this.fleet.team('Alpha')!;
    if(this.phase==='EVACUATION'){
      const p=this.fleet.measuredPayloadPose('Alpha');
      if(distance(p,this.map.victim)>2.5&&this.roofStage==='CARRY')this.navigate('Alpha',this.map.victim);
      else{
        alpha.setTransportCommand({vc:{x:0,y:0},omegaC:0});
        if(this.roofStage==='CARRY'){const nav=this.navigation.get('Alpha');if(nav)nav.done=true;this.roofStage='LOWER';alpha.setTargetHeight(.035);this.log('УКРЫТИЕ: совместное опускание носилок на грунт');}
        const spread=Math.max(...alpha.agents.map(a=>a.lift.h))-Math.min(...alpha.agents.map(a=>a.lift.h));
        if(this.roofStage==='LOWER'&&alpha.agents.every(a=>Math.abs(a.lift.h-.035)<.003)){this.roofStage='RAISE';alpha.setTargetHeight(.15);this.log('УКРЫТИЕ: подъём крыши, консенсус высоты на уклоне');}
        if(this.roofStage==='RAISE'&&spread<.001&&alpha.agents.every(a=>Math.abs(a.lift.h-.15)<.003)){this.roofStage='HOLD';this.deployed=true;}
        this.stableSeconds=this.deployed&&this.connected?this.stableSeconds+.1:0;
        if(this.stableSeconds>=5){this.phase='COMPLETE';this.log('ЗАВЕРШЕНО: укрытие развёрнуто; связь с пострадавшим стабильна 5 с');}
      }
    }else alpha.setTransportCommand({vc:{x:0,y:0},omegaC:0});
  }
}
