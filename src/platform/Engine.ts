import * as T from 'three';
import {TalosRobotAgent,loadStraferModel} from '../robot/TalosRobotAgent';
import {XboxController} from '../input/XboxController';
import {SwarmFleet} from '../swarm/SwarmFleet';
import {HeavyConstructionSim,type MissionPlan} from '../missions/HeavyConstructionSim';
import {SmartFactorySim} from '../missions/SmartFactorySim';
import {PayloadPhysics,equilibrium,stability} from '../physics/M1';
import {MetamorphicScene} from '../simulation/environments/MetamorphicScene';
import type {GamepadCommand,GamepadFocus,PayloadState,RunLogRecord,SupportContactOutput,SubSwarmAssignment} from '../contracts/types';

import type {SearchRescueSim} from '../missions/SearchRescueSim';
import type {WildernessEnvironment} from './WildernessEnvironment';

export interface Load {spec:SubSwarmAssignment;physics:PayloadPhysics;mesh:T.Mesh;size:{x:number;y:number}}
export type EnginePhase='loading'|'ready'|'error';
/** One journal line; `seq` is monotonic so UIs can diff without comparing strings. */
export interface EngineEvent {seq:number;t:number;text:string}

const HISTORY_CAP=400;
/** Elements that keep their own keyboard semantics (typing, sliders, tabs…): the simulator ignores keys there. */
const OWN_KEYS='input,textarea,select,button,[contenteditable],[role=slider],[role=tab],[role=switch],[role=combobox],[role=menuitem],[role=option],[role=radio]';

/**
 * Simulation host for one mission: fleet, payload physics, mission scripts and the Three.js scene
 * graph of the world. Rendering (renderer, camera, controls, post-processing, engineering overlay)
 * lives in the React Three Fiber viewport, which mounts `scene` and calls `advance()` every frame.
 */
export class Engine {
 /** World root (Z-up). Mounted by the viewport; owns robots, payloads and the mission environment. */
 readonly scene=new T.Scene();
 diagnostics=false;
 agents:TalosRobotAgent[]=[];fleet!:SwarmFleet;loads:Load[]=[];contacts:SupportContactOutput[]=[];logs:RunLogRecord[]=[];keys=new Set<string>();time=0;acc=0;disposed=false;ready=false;mode:number;status='Загрузка модели…';events:string[]=[];plan!:MissionPlan;seed:number;runId=new Date().toISOString();swapTriggered=false;routeIndex=0;debris:T.Mesh[]=[];cleared=new Set<number>();stopPad:()=>void;
 /** Lifecycle for the UI: GLB download → ready, or error with a message. */
 phase:EnginePhase='loading';loadProgress=0;error:string|null=null;
 /** Journal with monotonic sequence numbers (newest last, capped). */
 readonly history:EngineEvent[]=[];private eventSeq=0;
 /** Radio loss probability injected into every team (0 = configured network). */
 private loss=0;
 /** Mode 4 — Metamorphic Swarm: owns its own fixed-step simulation and instanced visuals. */
 metamorphic?:MetamorphicScene;
 rescue?:SearchRescueSim;
 wilderness?:WildernessEnvironment;
 /** Optional listener element: Tab cycles teams only while focus is inside it (keeps Tab for UI navigation elsewhere). */
 keyboardScope:HTMLElement|null=null;
 constructor(public pad:XboxController,mode:number,seed=0){this.mode=mode;this.seed=seed;T.Object3D.DEFAULT_UP.set(0,0,1);this.scene.up.set(0,0,1);
 this.architecture();this.stopPad=pad.startPolling(c=>this.command(c));addEventListener('keydown',this.keydown);addEventListener('keyup',this.keyup);addEventListener('blur',this.blur);void this.init();}
 box(x:number,y:number,z:number,sx:number,sy:number,sz:number,color:number,emissive=0){const mesh=new T.Mesh(new T.BoxGeometry(sx,sy,sz),new T.MeshStandardMaterial({color,roughness:.65,metalness:.25,emissive:color,emissiveIntensity:emissive}));mesh.position.set(x,y,z+sz/2);mesh.castShadow=true;mesh.receiveShadow=true;this.scene.add(mesh);return mesh;}
 architecture(){
 if(this.mode===4){this.metamorphic=new MetamorphicScene({seed:this.seed});this.metamorphic.onLog=line=>this.record(line);this.scene.add(this.metamorphic.root);this.events=this.metamorphic.events;return;}
 if(this.mode===1){this.scene.add(new HeavyConstructionSim().buildEnvironment());for(let i=0;i<8;i++)this.debris.push(this.box(-3+i*.8,7,0,.4,.45,.2,0xa4937f));}
 else if(this.mode===2)this.scene.add(new SmartFactorySim().buildEnvironment());
 // Modes 0/3: the laboratory floor and grid are drawn by the viewport.
 }
 async init(){try{
 if(this.mode===5){
 const [{SearchRescueSim},{WildernessEnvironment}]=await Promise.all([import('../missions/SearchRescueSim'),import('./WildernessEnvironment')]);
 const model=await loadStraferModel(undefined,(loaded,total)=>{this.loadProgress=total>0?loaded/total:0;});if(this.disposed)return;
 this.rescue=new SearchRescueSim({seed:this.seed,model,onEvent:(text,t)=>this.emit(text,t)});
 this.rescue.lossP=this.loss;this.wilderness=new WildernessEnvironment(this.rescue);this.scene.add(this.wilderness.root);
 this.agents=this.rescue.agents;this.fleet=this.rescue.fleet;this.agents.forEach(a=>{a.root.visible=false;this.scene.add(a.root);});
 this.plan={count:14,teams:this.rescue.teams,chargers:this.fleet.chargers.map(c=>c.pos),reserves:[13,14]};
 this.pad.setRoster([],this.fleet.teamIds);this.pad.setState({focus:{kind:'swarm',teamId:'Alpha'}});this.status='Полевой отряд · автоматический поиск и эвакуация';this.markReady();return;
 }

 // Metamorphic mode draws instanced chassis and needs neither the GLB model nor lift teams.
 if(this.metamorphic){this.plan={count:0,teams:[],reserves:[],chargers:[]};this.fleet=new SwarmFleet([],{seed:this.seed});this.pad.setRoster(Array.from({length:MetamorphicScene.ROBOTS},(_,i)=>i+1),['MACRO']);this.pad.setState({focus:{kind:'swarm',teamId:'MACRO'}});this.status='Готово · seed '+this.seed+' · A/Enter — сборка, B/Space — расцепка';this.markReady();return;}
 const model=await loadStraferModel(undefined,(loaded,total)=>{this.loadProgress=total>0?loaded/total:0;});if(this.disposed)return;this.loadProgress=1;this.plan=this.mode===2?new SmartFactorySim():new HeavyConstructionSim();if(this.mode===0||this.mode===3)this.plan={count:this.mode===0?1:4,teams:[],reserves:[],chargers:[]};
 this.agents=Array.from({length:this.plan.count},(_,i)=>new TalosRobotAgent({id:i+1,model,forceSensor:'calibrated',stiffness:20000,damping:200,pose:{x:-7+(i%5),y:-5+Math.floor(i/5),theta:0}}));this.agents.forEach(a=>this.scene.add(a.root));this.fleet=new SwarmFleet(this.agents,{seed:this.seed,chargers:this.plan.chargers});
 for(const spec of this.plan.teams){spec.supports.forEach(s=>{const a=this.agents[s.agentId-1];a.reset({x:spec.payloadPose.x+s.r.x,y:spec.payloadPose.y+s.r.y,theta:0});});const mgr=this.fleet.dispatch(spec);const size={x:Math.max(1,...spec.supports.map(s=>Math.abs(s.r.x)*2+.7)),y:Math.max(1,...spec.supports.map(s=>Math.abs(s.r.y)*2+.6))};const inputs=mgr.getSupportContactInputs(),com={x:spec.payloadPose.x+(spec.com?.x??0),y:spec.payloadPose.y+(spec.com?.y??0)};const eq=equilibrium(inputs,spec.mass!,com);const state:PayloadState={id:spec.teamId,mass:spec.mass!,com,pose:{...spec.payloadPose},z:eq.plane.a+eq.plane.b*com.x+eq.plane.c*com.y,rho:stability(inputs.flatMap(s=>inputs.length===1?[-1,1].flatMap(x=>[-1,1].map(y=>({x:s.pad.x+x*s.padHalfSize,y:s.pad.y+y*s.padHalfSize}))):[s.pad]),com).rho};const physics=new PayloadPhysics(state,size);physics.pitch=eq.plane.b;physics.roll=eq.plane.c;const mesh=this.box(state.pose.x,state.pose.y,state.z,size.x,size.y,.14,spec.teamId==='Alpha'?0xa59c8c:0x697278);this.loads.push({spec,physics,mesh,size});this.contacts.push(...eq.contacts);if(inputs.length<3)mgr.setSafety({rhoMin:-1});if(eq.contacts.some((c,i)=>c.force>inputs[i].fAllow)||state.rho!<0){this.emit(`${spec.teamId}: Rejected Before Start`);}else{this.fleet.startTeam(spec.teamId);mgr.startTransport();}}
 this.fleet.setReserves(this.plan.reserves);if(this.mode===2)this.fleet.dock({baseTeam:'Chassis',moverTeam:'Module',matePose:{x:-2.8,y:0,theta:0}});this.pad.setRoster(this.mode===0?[1]:[],this.fleet.teamIds);this.pad.setState({focus:this.mode===0?{kind:'agent',agentId:1}:{kind:'swarm',teamId:this.fleet.teamIds[0]??'lab'}});this.status='Готово · seed '+this.seed;this.markReady();}catch(e){this.status=String(e);this.error=e instanceof Error?e.message:String(e);this.phase='error';}}
 private markReady(){this.ready=true;this.phase='ready';this.loadProgress=1;}
 keydown=(e:KeyboardEvent)=>{const target=e.target instanceof Element?e.target:null;if(target?.closest(OWN_KEYS))return;if(e.code==='Tab'&&!(this.keyboardScope&&target&&this.keyboardScope.contains(target)))return;if(e.metaKey||e.ctrlKey||e.altKey)return;if(['Space','Tab'].includes(e.code))e.preventDefault();this.keys.add(e.code);if(e.repeat)return;const s=this.pad.getSnapshot();if(e.code==='Space')this.hold();if(e.code==='Enter')this.lift();if(e.code==='KeyC')this.pad.setState({camera:s.camera==='orbit'?'centroid':s.camera==='centroid'?'topdown':'orbit'});if(e.code==='KeyM')this.pad.setState({controller:s.controller==='A'?'B':s.controller==='B'?'C':'A'});if(this.metamorphic&&this.ready){if(e.code==='KeyY'||e.code==='Tab')this.pad.setState({focus:s.focus.kind==='agent'?{kind:'swarm',teamId:'MACRO'}:{kind:'agent',agentId:1}});if(e.code==='KeyP')this.metamorphic.cycleLoss();if(e.code==='KeyK')this.metamorphic.injectSlip();return;}
 if(e.code==='Tab'&&this.ready){const ids=this.fleet.teamIds;this.pad.setState({focus:{kind:'swarm',teamId:ids[(ids.indexOf(s.focus.kind==='swarm'?s.focus.teamId:'')+1)%ids.length]??'Alpha'}});}};
 keyup=(e:KeyboardEvent)=>this.keys.delete(e.code);blur=()=>this.keys.clear();
 hold(){if(!this.ready)return;if(this.rescue){this.rescue.hold();return;}if(this.metamorphic){this.metamorphic.release();void this.pad.rumble('hold');return;}this.fleet.teamIds.forEach(id=>this.fleet.team(id)!.emergencyHold('operator B'));this.agents.forEach(a=>a.setMode('HOLD'));this.emit('operator: emergency HOLD');void this.pad.rumble('hold');}
 lift(){if(!this.ready)return;if(this.rescue){this.rescue.requestDeploy();return;}if(this.metamorphic){this.metamorphic.assemble();return;}this.fleet.teamIds.forEach(id=>this.fleet.team(id)!.requestLift());if(this.mode===0)this.agents[0].setLiftCommand(.05);this.emit('operator: lift requested');}
 command(c:GamepadCommand){for(const a of c.actions){if(a.type==='emergencyHold')this.hold();if(a.type==='confirmLift')this.lift();} }
 /** Radio loss probability p ∈ [0, 1] applied to every team (or the metamorphic ring channel). */
 get lossP():number{return this.rescue?this.rescue.lossP:this.metamorphic?this.metamorphic.channel.lossP:this.loss;}
 setLossP(p:number){const v=Math.min(1,Math.max(0,p));this.loss=v;if(this.rescue)this.rescue.lossP=v;else if(this.metamorphic)this.metamorphic.channel.lossP=v;else this.loss=v;}
 /** True when any robot holds (operator or safety HOLD). */
 get holding():boolean{return this.agents.some(a=>a.mode==='HOLD');}
 /**
  * Advance the fixed 10 ms physics step by the frame time and sync visuals. Called once per frame
  * by the viewport; the step size never depends on the frame rate.
  */
 advance(elapsed:number){if(this.disposed)return;const dt=Math.min(.05,elapsed);if(this.ready&&!this.pad.getSnapshot().paused){this.acc+=dt;while(this.acc>=.01){this.step(.01);this.acc-=.01;}}this.sync();}
 step(dt:number){this.time+=dt;const snap=this.pad.getSnapshot(),c=this.pad.command,k=snap.powerLimit;const axis=(a:string,b:string)=>Number(this.keys.has(a))-Number(this.keys.has(b));const vx=c.vx+axis('KeyW','KeyS')*.25*k,vy=c.vy+axis('KeyA','KeyD')*.25*k,omega=c.omega+axis('KeyQ','KeyE')*.3*k,lift=c.lift+axis('KeyZ','KeyX')*.05;const manual=Math.abs(vx)+Math.abs(vy)+Math.abs(omega)>.001;
 if(this.rescue){this.rescue.controller=snap.controller;this.rescue.step(dt);this.contacts=this.rescue.contacts;
 if(Math.round(this.time*100)%10===0)for(const a of this.agents){const mgr=this.fleet.team(this.teamOf(a.id)??'');this.logs.push({run_id:this.runId,seed:this.seed,controller:snap.controller,N:mgr?.ids.length??1,p:this.lossP,epoch:mgr?.currentEpoch??0,time:this.time,agent_id:a.id,state:a.mode,command:a.lift.hDot,E_h:mgr?.getMetrics().E_h??undefined});}
 return;}
 if(this.metamorphic){this.metamorphic.step(vx,vy,omega,snap.focus);return;}
 if(this.mode===0){const a=this.agents[0];a.setTwistCommand({vx,vy,omega});a.setLiftCommand(lift,a.mode==='HOLD');a.step(dt);return;}
 for(const id of this.fleet.teamIds){const mgr=this.fleet.team(id)!;mgr.setController(snap.controller);const focused=snap.focus.kind==='swarm'&&snap.focus.teamId===id;if(focused&&lift)mgr.setTargetHeight(Math.max(0,Math.min(.3,mgr.targetHeight+lift*dt)));if(this.mode===1){const beta=id==='Beta';const t=this.time;mgr.setTransportCommand(focused&&manual?{vc:{x:vx,y:vy},omegaC:omega}:{vc:{x:id.startsWith('Gamma')?.015:.05,y:beta?.025*Math.cos(t*.25):id==='Alpha'?.03*Math.sin(t*.2):0},omegaC:beta?.015*Math.cos(t*.25):0});}}
 if(this.mode===1){for(let i=0;i<4;i++){const id=`Gamma-${i+1}`,mgr=this.fleet.team(id);if(!mgr)continue;const debris=this.debris[i*2],p=mgr.payloadReference;const clear=this.cleared.has(i);const goal=clear?{x:-5+i*1.4,y:8}:{x:debris.position.x,y:debris.position.y};const dx=goal.x-p.x,dy=goal.y-p.y,dist=Math.hypot(dx,dy);mgr.setTransportCommand({vc:{x:dx/Math.max(1,dist)*.15,y:dy/Math.max(1,dist)*.15},omegaC:0});if(!clear&&dist<.15&&mgr.agents.every(a=>a.mode==='TRANSPORT')){const mass=2,force=mass*9.81;if(force<mgr.agents[0].fAllow){this.cleared.add(i);this.emit(`${id}: scan concrete, mass ${mass} kg checked · corridor cleared`);debris.visible=false;this.debris[i*2+1].visible=false;}}}
 const mgr=this.fleet.team('Alpha')!,p=mgr.payloadReference;const manualAlpha=snap.focus.kind==='swarm'&&snap.focus.teamId==='Alpha'&&manual;if(!manualAlpha){const route=(this.plan as HeavyConstructionSim).route,goal=route[this.routeIndex];const dx=goal.x-p.x,dy=goal.y-p.y,d=Math.hypot(dx,dy);if(d<.08&&this.routeIndex<route.length-1)this.routeIndex++;mgr.setTransportCommand({vc:{x:d<.04?0:dx/Math.max(1,d)*.12,y:d<.04?0:dy/Math.max(1,d)*.12},omegaC:0});}}
 if(this.mode===2&&!this.swapTriggered&&this.time>12){this.agents[10].setBattery(.249);this.swapTriggered=true;this.emit('Демонстрация hot-swap: заряд #11 снижен до 24.9%');}
 const payloads=Object.fromEntries(this.loads.map(l=>[l.spec.teamId,l.physics.state]));const out=this.fleet.step(dt,{time:this.time,contacts:this.contacts,payloads,faults:this.loss>0?{lossP:this.loss}:undefined});for(const e of out.events)this.emit(`${e.teamId?`${e.teamId} · `:''}${e.kind}: ${e.detail}`,e.t);this.contacts=[];
 for(const l of this.loads){const mgr=this.fleet.team(l.spec.teamId)!;const pose=this.fleet.measuredPayloadPose(l.spec.teamId);l.physics.state.pose=pose;const cm=l.spec.com!;l.physics.state.com={x:pose.x+Math.cos(pose.theta)*cm.x-Math.sin(pose.theta)*cm.y,y:pose.y+Math.sin(pose.theta)*cm.x+Math.cos(pose.theta)*cm.y};const result=l.physics.step(dt,mgr.getSupportContactInputs());this.contacts.push(...result.contacts);result.contacts.forEach(c=>this.fleet.agent(c.agentId)?.applySupportContact(c));if(Math.round(this.time*100)%10===0){const m=mgr.getMetrics();mgr.agents.forEach(a=>this.logs.push({run_id:this.runId,seed:this.seed,controller:snap.controller,N:mgr.ids.length,p:this.loss,epoch:mgr.currentEpoch,time:this.time,agent_id:a.id,state:a.mode,command:a.lift.hDot,E_h:m.E_h??undefined,E_traj:m.E_traj??undefined}));}}
 // Intersection reservation: sorting robots take turns through a common crossing.
 for(let i=0;i<this.loads.length;i++){const l=this.loads[i];if(!l.spec.teamId.startsWith('Sort'))continue;const mgr=this.fleet.team(l.spec.teamId)!;const slot=Math.floor(this.time/12)%4,index=i-3,phase=Math.floor(this.time/48)%2,p=mgr.payloadReference,goal=phase?{x:-6+index*3,y:-.5}:{x:-7+index*4,y:8};const dx=goal.x-p.x,dy=goal.y-p.y,d=Math.hypot(dx,dy);mgr.setTransportCommand({vc:{x:slot===index?dx/Math.max(1,d)*.18:0,y:slot===index?dy/Math.max(1,d)*.18:0},omegaC:0});}
 }
 /** Copy simulation state onto the scene graph (robot rigs, payload meshes, metamorphic instances). */
 sync(){this.wilderness?.sync(this.time,this.diagnostics);this.metamorphic?.sync(this.time);for(const a of this.agents)a.syncVisuals();for(const l of this.loads){const p=l.physics.state;l.mesh.position.set(p.pose.x,p.pose.y,p.z+.07);l.mesh.rotation.set(Math.atan(l.physics.roll),-Math.atan(l.physics.pitch),p.pose.theta);}}
 /** World point the camera should track for a gamepad focus; false while nothing is available. */
 focusPoint(focus:GamepadFocus,out:T.Vector3):boolean{if(!this.ready)return false;if(this.metamorphic){this.metamorphic.focusTarget(focus,out);return true;}if(focus.kind==='agent'){const a=this.fleet.agent(focus.agentId);if(!a)return false;out.set(a.pose.x,a.pose.y,a.groundZ+.2);return true;}const p=this.fleet.team(focus.teamId)?.payloadReference;if(!p)return false;out.set(p.x,p.y,(this.rescue?.map.heightAt(p.x,p.y)??0)+.3);return true;}
 /** Team an agent currently serves (teams change during hot-swap), or undefined for reserves. */
 teamOf(agentId:number):string|undefined{for(const id of this.fleet?.teamIds??[])if(this.fleet.team(id)!.has(agentId))return id;return undefined;}
 private emit(text:string,t=this.time){this.events.push(`${t.toFixed(1)} ${text}`);if(this.events.length>10)this.events.splice(0,this.events.length-10);this.record(text,t);}
 private record(text:string,t=this.metamorphic?.clock.time??this.time){this.history.push({seq:++this.eventSeq,t,text:text.replace(/^\d+\.\d\s/,'')});if(this.history.length>HISTORY_CAP)this.history.splice(0,this.history.length-HISTORY_CAP);}
 dispose(){this.disposed=true;this.stopPad();removeEventListener('keydown',this.keydown);removeEventListener('keyup',this.keyup);removeEventListener('blur',this.blur);this.scene.traverse(o=>{const m=o as T.Mesh;m.geometry?.dispose();m.customDepthMaterial?.dispose();if(m.material)(Array.isArray(m.material)?m.material:[m.material]).forEach(x=>{const material=x as T.MeshStandardMaterial;material.map?.dispose();material.bumpMap?.dispose();x.dispose();});});this.scene.clear();}
}
