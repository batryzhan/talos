/**
 * Lazy loaders of the workflow missions: each mission and its scene are split into their own chunk
 * and fetched only when that route opens.
 */
import type { WorkflowMission } from '../missions/workflow/WorkflowMission';
import type { MissionView } from './MissionView';

export interface WorkflowRuntime { mission: WorkflowMission; view: MissionView }

type OnEvent = (text: string, t: number) => void;

export async function createWorkflow(mode: number, seed: number, onEvent: OnEvent): Promise<WorkflowRuntime> {
  if (mode === 2) {
    const [{ FactoryMission }, { FactoryView }] = await Promise.all([import('../missions/FactoryMission'), import('./FactoryEnvironment')]);
    const mission = new FactoryMission({ seed, onEvent });
    return { mission, view: new FactoryView(mission) };
  }
  if (mode === 3) {
    const [{ WildfireMission }, { WildfireView }] = await Promise.all([import('../missions/WildfireMission'), import('./WildfireEnvironment')]);
    const mission = new WildfireMission({ seed, onEvent });
    return { mission, view: new WildfireView(mission) };
  }
  if (mode === 4) {
    const [{ MiningMission }, { MiningView }] = await Promise.all([import('../missions/MiningMission'), import('./UndergroundEnvironment')]);
    const mission = new MiningMission({ seed, onEvent });
    return { mission, view: new MiningView(mission) };
  }
  throw new Error(`mode ${mode} is not a workflow mission`);
}

/** Engine modes driven by a workflow mission (factory, rescue, mining). */
export const isWorkflowMode = (mode: number): boolean => mode >= 2 && mode <= 4;
