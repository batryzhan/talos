import {buildFactory} from '../platform/IndustrialEnvironment';
import {team,type MissionPlan} from './HeavyConstructionSim';
export class SmartFactorySim implements MissionPlan {
 buildEnvironment=buildFactory;
 count=20;chargers=[{x:-7,y:-6},{x:-5,y:-6},{x:-3,y:-6}];reserves=[15,16];
 teams=[team('Chassis',[1,2,3,4,5,6],0,2,30,1,.6),team('Module',[7,8,9,10],-5,2,16,.8,.5),team('Conveyor',[11,12,13,14],3,-3,16,1,.5),...Array.from({length:4},(_,i)=>team(`Sort-${i+1}`,[17+i],-6+i*3,-.5,2,1,1))];
}
