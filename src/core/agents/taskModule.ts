/**
 * Task module layer (scientific documentation §1.10–1.12): every robot carries the same Strafer
 * chassis and one swappable target module (moduleId, capability, state, completionConfirmation).
 *
 * Module commands are idempotent: a command carries (actionId, epoch); a repeated actionId or a
 * command from an older group epoch is ignored, so retransmissions after packet loss never trigger
 * the tool twice.
 */

export type ModuleCapability =
  // factory
  | 'PLASMA_CUTTER' | 'ARC_WELDER' | 'REPAIR_DIAGNOSTIC' | 'ROLLER_CARRIER' | 'MULTI_SWAP'
  // wildfire
  | 'WATER_CANNON' | 'TRENCH_BLADE' | 'THERMAL_RELAY' | 'TANKER_REFILL'
  // mine
  | 'LIDAR_ILLUMINATOR' | 'ROTARY_EXCAVATOR' | 'ORE_HOPPER_CART';

export type ModuleState = 'IDLE' | 'ARMED' | 'ACTIVE' | 'SAFE' | 'FAULT';

export interface TaskModule {
  moduleId: string;
  capability: ModuleCapability;
  state: ModuleState;
  /** The last ACTIVE run finished and was confirmed by the module. */
  completionConfirmation: boolean;
  /** Highest actionId applied, and the epoch it was applied in. */
  lastActionId: number;
  lastEpoch: number;
  /** Applied / ignored command counters (for tests and telemetry). */
  applied: number;
  ignored: number;
}

export type ModuleAction = 'ARM' | 'START' | 'COMPLETE' | 'SAFE' | 'RESET';

export interface ModuleCommand { actionId: number; epoch: number; action: ModuleAction }

export type CommandResult = 'applied' | 'duplicate' | 'stale-epoch' | 'rejected';

export function createModule(moduleId: string, capability: ModuleCapability): TaskModule {
  return { moduleId, capability, state: 'IDLE', completionConfirmation: false, lastActionId: 0, lastEpoch: 0, applied: 0, ignored: 0 };
}

const NEXT: Record<ModuleAction, readonly ModuleState[]> = {
  ARM: ['IDLE', 'SAFE'],
  START: ['ARMED'],
  COMPLETE: ['ACTIVE'],
  SAFE: ['IDLE', 'ARMED', 'ACTIVE', 'FAULT'],
  RESET: ['SAFE', 'FAULT', 'IDLE'],
};

const TARGET: Record<ModuleAction, ModuleState> = { ARM: 'ARMED', START: 'ACTIVE', COMPLETE: 'IDLE', SAFE: 'SAFE', RESET: 'IDLE' };

/**
 * Apply a module command at most once. Within an epoch actionIds must increase; a new epoch accepts
 * any actionId (the sender restarted its counter after the group changed).
 */
export function applyModuleCommand(m: TaskModule, cmd: ModuleCommand): CommandResult {
  if (cmd.epoch < m.lastEpoch) { m.ignored++; return 'stale-epoch'; }
  if (cmd.epoch === m.lastEpoch && cmd.actionId <= m.lastActionId) { m.ignored++; return 'duplicate'; }
  m.lastEpoch = cmd.epoch;
  m.lastActionId = cmd.actionId;
  if (!NEXT[cmd.action].includes(m.state)) { m.ignored++; return 'rejected'; }
  m.state = TARGET[cmd.action];
  if (cmd.action === 'START') m.completionConfirmation = false;
  if (cmd.action === 'COMPLETE') m.completionConfirmation = true;
  m.applied++;
  return 'applied';
}

/** Monotonic per-sender action counter. */
export class ActionCounter {
  private next = 1;
  issue(epoch: number, action: ModuleAction): ModuleCommand { return { actionId: this.next++, epoch, action }; }
}
