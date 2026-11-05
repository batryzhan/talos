/**
 * GamepadSwarmBridge — routes XboxController commands to a robot or a whole team, and plays the
 * dual-rumble feedback (contact δ_i > 0 rising edge, any agent entering HOLD).
 *
 * Focus semantics (CLAUDE.md v2 §3):
 *  - agent focus: LS → (v_x, v_y), RS-x → ω, RT/LT → lift u_i. A robot that is an ACTIVE member of a
 *    team is driven by its swarm; the sticks are ignored for it (B still holds its whole team).
 *  - swarm focus: LS/RS → virtual platform (v_c, ω_c) of the team (formula 16), RT/LT retune h*.
 * Buttons: A — confirm A_ready / LIFT (→ TRANSPORT once lifted), B — EMERGENCY HOLD, X — controller
 * A/B/C. Camera, scenario, power, pause and reset are forwarded to `onUiAction` (platform / UI).
 */
import type { ControllerKind, GamepadAction, GamepadCommand } from '../contracts/types';
import type { TalosRobotAgent } from '../robot/TalosRobotAgent';
import type { SwarmFleet } from '../swarm/SwarmFleet';
import type { SwarmManager } from '../swarm/SwarmManager';
import type { XboxController } from './XboxController';

export interface BridgeTargets {
  agent(id: number): TalosRobotAgent | undefined;
  team(id: string): SwarmManager | undefined;
  /** Team the agent currently belongs to, if any. */
  teamOfAgent(id: number): SwarmManager | undefined;
  /** All teams (for X when the focus is a single robot). */
  teams(): SwarmManager[];
}

/** Targets for a SwarmFleet. */
export function fleetTargets(fleet: SwarmFleet): BridgeTargets {
  return {
    agent: id => fleet.agent(id),
    team: id => fleet.team(id),
    teamOfAgent: id => fleet.teamIds.map(t => fleet.team(t)!).find(m => m.has(id)),
    teams: () => fleet.teamIds.map(t => fleet.team(t)!),
  };
}

/** Targets for the single-robot polygon (P1), optionally with one swarm manager under id 'swarm'. */
export function simpleTargets(agents: TalosRobotAgent[], manager?: SwarmManager, teamId = 'swarm'): BridgeTargets {
  return {
    agent: id => agents.find(a => a.id === id),
    team: id => (id === teamId ? manager : undefined),
    teamOfAgent: id => (manager?.has(id) ? manager : undefined),
    teams: () => (manager ? [manager] : []),
  };
}

export interface GamepadBridgeOptions {
  onUiAction?: (a: GamepadAction) => void;
  /** Minimum interval between rumbles of the same kind (ms). */
  contactRumbleGapMs?: number;
  holdRumbleGapMs?: number;
  now?: () => number;
}

export class GamepadSwarmBridge {
  private readonly prevContact = new Map<number, boolean>();
  private readonly prevMode = new Map<number, string>();
  private lastContactRumble = -Infinity;
  private lastHoldRumble = -Infinity;
  private readonly now: () => number;

  constructor(private readonly pad: XboxController, private readonly targets: BridgeTargets, private readonly opts: GamepadBridgeOptions = {}) {
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  /** Apply one decoded command (call once per poll with the elapsed time dt in seconds). */
  apply(cmd: GamepadCommand, dt: number): void {
    const f = cmd.focus;
    if (f.kind === 'agent') {
      const a = this.targets.agent(f.agentId);
      const team = this.targets.teamOfAgent(f.agentId);
      const swarmOwns = !!team && a !== undefined && a.mode !== 'READY';
      if (a && !swarmOwns) {
        a.setTwistCommand({ vx: cmd.vx, vy: cmd.vy, omega: cmd.omega });
        a.setLiftCommand(cmd.lift);
      }
    } else {
      const team = this.targets.team(f.teamId);
      if (team) {
        team.setTransportCommand({ vc: { x: cmd.vx, y: cmd.vy }, omegaC: cmd.omega });
        if (cmd.lift !== 0 && dt > 0) {
          const p = team.agents[0]?.liftParams;
          const lo = (p?.hMin ?? 0) + 0.01, hi = (p?.hMax ?? 0.16) - 0.005;
          team.setTargetHeight(Math.min(hi, Math.max(lo, team.targetHeight + cmd.lift * dt)));
        }
      }
    }
    for (const act of cmd.actions) this.action(act, cmd);
  }

  private focusedTeam(cmd: GamepadCommand): SwarmManager | undefined {
    return cmd.focus.kind === 'swarm' ? this.targets.team(cmd.focus.teamId) : this.targets.teamOfAgent(cmd.focus.agentId);
  }

  private action(act: GamepadAction, cmd: GamepadCommand): void {
    switch (act.type) {
      case 'confirmLift': {
        const team = this.focusedTeam(cmd);
        if (!team) break;
        const agents = team.agents;
        if (agents.every(a => a.mode === 'READY')) team.beginApproach();
        const lifted = agents.length > 0 && agents.every(a => a.mode === 'LIFT' && Math.abs(a.lift.h - team.targetHeight) < 0.003);
        if (lifted) team.startTransport(); else team.requestLift();
        break;
      }
      case 'emergencyHold': {
        const team = this.focusedTeam(cmd);
        if (team) team.emergencyHold('gamepad B: EMERGENCY HOLD');
        else if (cmd.focus.kind === 'agent') {
          const a = this.targets.agent(cmd.focus.agentId);
          a?.setMode('HOLD'); // active position hold + zero wheels, never power-off
        }
        this.lastHoldRumble = this.now(); // the pad already rumbled on B
        break;
      }
      case 'cycleController': {
        const team = this.focusedTeam(cmd);
        const list = team ? [team] : this.targets.teams();
        for (const t of list) t.setController(act.controller as ControllerKind);
        break;
      }
      default:
        this.opts.onUiAction?.(act);
    }
  }

  /** Haptics from simulation state: call once per frame after the swarm step. */
  watch(agents: Iterable<TalosRobotAgent>): void {
    const t = this.now();
    let contactEdge = false, holdEdge = false;
    for (const a of agents) {
      const c = a.inContact === true;
      if (c && this.prevContact.get(a.id) === false) contactEdge = true;
      this.prevContact.set(a.id, c);
      const m = a.mode;
      const pm = this.prevMode.get(a.id);
      if (m === 'HOLD' && pm !== undefined && pm !== 'HOLD') holdEdge = true;
      this.prevMode.set(a.id, m);
    }
    if (holdEdge && t - this.lastHoldRumble >= (this.opts.holdRumbleGapMs ?? 500)) {
      this.lastHoldRumble = t;
      void this.pad.rumble('hold');
    } else if (contactEdge && t - this.lastContactRumble >= (this.opts.contactRumbleGapMs ?? 150)) {
      this.lastContactRumble = t;
      void this.pad.rumble('contact');
    }
  }
}
