import {buildConstruction} from '../platform/IndustrialEnvironment';
import type {SubSwarmAssignment} from '../contracts/types';
export interface MissionPlan {count:number;teams:SubSwarmAssignment[];chargers:{x:number;y:number}[];reserves:number[]}
export function team(teamId:string,ids:number[],x:number,y:number,mass:number,sx:number,sy:number):SubSwarmAssignment {
 return {teamId,role:'carrier',task:teamId,agentIds:ids,payloadId:teamId,mass,com:ids.length===1?{x:0,y:0}:{x:.12,y:.04},payloadPose:{x,y,theta:0},targetHeight:.1,supports:ids.map((agentId,i)=>({agentId,r:ids.length===1?{x:0,y:0}:{x:(Math.floor(i/2)-(ids.length/2-1)/2)*sx,y:(i%2?1:-1)*sy}}))};
}
export class HeavyConstructionSim implements MissionPlan {
 // Eight carriers share an eccentric payload; auxiliary teams clear the corridor.
 // Masses remain within the calibrated 400 N/support laboratory hardware envelope.
 buildEnvironment=buildConstruction;
 readonly route=[{x:1,y:-1.5},{x:8.5,y:-1.5},{x:9,y:8}];
 count=16;chargers=[];reserves=[];
 teams=[team('Alpha',[1,2,3,4,5,6,7,8],-5,1,48,.9,.65),team('Beta',[9,10,11,12],-4,-3,20,2,.5),...Array.from({length:4},(_,i)=>team(`Gamma-${i+1}`,[13+i],-3+i*1.5,5,2,1,1))];
}
