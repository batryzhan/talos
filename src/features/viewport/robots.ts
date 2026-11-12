import type { Vector3 } from 'three';
import type { Engine } from '@/platform/Engine';
import type { TalosRobotAgent } from '@/robot/TalosRobotAgent';
import { MetamorphicScene } from '@/simulation/environments/MetamorphicScene';
import type { GamepadFocus } from '@/contracts/types';
import type { Selection } from '@/store/ui';

/**
 * Allocation-free accessors over both robot representations (agents with rigs, or the metamorphic
 * scene's packed pose array) for per-frame use in the viewport.
 */
export interface MutablePose { x: number; y: number; theta: number }

export function robotCount(e: Engine): number {
  return e.metamorphic ? MetamorphicScene.ROBOTS : e.agents.length;
}

export function robotIdAt(e: Engine, index: number): number {
  return e.metamorphic ? index + 1 : e.agents[index].id;
}

export function robotIndexOf(e: Engine, id: number): number {
  if (e.metamorphic) return id >= 1 && id <= MetamorphicScene.ROBOTS ? id - 1 : -1;
  for (let i = 0; i < e.agents.length; i++) if (e.agents[i].id === id) return i;
  return -1;
}

export function readRobotPose(e: Engine, index: number, out: MutablePose): boolean {
  if (index < 0) return false;
  if (e.metamorphic) {
    const p = e.metamorphic.pose, o = index * 3;
    if (o + 2 >= p.length) return false;
    out.x = p[o]; out.y = p[o + 1]; out.theta = p[o + 2];
    return true;
  }
  const a = e.agents[index];
  if (!a) return false;
  out.x = a.pose.x; out.y = a.pose.y; out.theta = a.pose.theta;
  return true;
}

/**
 * Tracks the world point (and framing radius) of the current selection. Team membership is
 * refreshed at most once a second (it only changes during hot-swap), so the per-frame path
 * only reads poses.
 */
export class SelectionTracker {
  private members: TalosRobotAgent[] = [];
  private refreshedAt = -Infinity;
  private key = '';
  private readonly focus: { swarm: GamepadFocus; agent: GamepadFocus } = {
    swarm: { kind: 'swarm', teamId: 'MACRO' },
    agent: { kind: 'agent', agentId: 1 },
  };
  private readonly pose: MutablePose = { x: 0, y: 0, theta: 0 };

  /** Writes the centre into `out`; returns the framing radius, or −1 when nothing to track. */
  update(e: Engine, sel: Selection, now: number, out: Vector3): number {
    if (!sel || !e.ready) return -1;
    if (sel.kind === 'agent') {
      if (!readRobotPose(e, robotIndexOf(e, sel.id), this.pose)) return -1;
      out.set(this.pose.x, this.pose.y, (e.rescue?.map.heightAt(this.pose.x,this.pose.y)??0)+0.25);
      return 1.4;
    }
    if (e.metamorphic) {
      this.focus.swarm = sel.id === 'MACRO' ? this.focus.swarm : { kind: 'swarm', teamId: sel.id };
      e.metamorphic.focusTarget(this.focus.swarm, out);
      return 2.2;
    }
    const key = `t${sel.id}`;
    if (key !== this.key || now - this.refreshedAt > 1) {
      this.members = e.fleet.team(sel.id)?.agents ?? [];
      this.key = key;
      this.refreshedAt = now;
    }
    const n = this.members.length;
    if (!n) return -1;
    let x = 0, y = 0;
    for (let i = 0; i < n; i++) { x += this.members[i].pose.x; y += this.members[i].pose.y; }
    x /= n; y /= n;
    let r = 0;
    for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(this.members[i].pose.x - x, this.members[i].pose.y - y));
    out.set(x, y, (e.rescue?.map.heightAt(x,y)??0)+0.3);
    return r + 1.4;
  }
}
