import type { Vector3 } from 'three';
import type { Engine } from '@/platform/Engine';
import type { Selection } from '@/store/ui';

/**
 * Allocation-free accessors over both robot representations (lift-team agents with rigs, or the
 * workflow missions' instanced Strafer fleets) for per-frame use in the viewport.
 */
export interface MutablePose { x: number; y: number; theta: number }

export interface MutablePoseZ extends MutablePose { z: number }

export function robotCount(e: Engine): number {
  return e.workflow ? e.workflow.agents.length : e.agents.length;
}

export function robotIdAt(e: Engine, index: number): number {
  return e.workflow ? e.workflow.agents[index].id : e.agents[index].id;
}

export function robotIndexOf(e: Engine, id: number): number {
  const list = e.workflow ? e.workflow.agents : e.agents;
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return i;
  return -1;
}

/** Pose and ground height of robot `index`. */
export function readRobotPose(e: Engine, index: number, out: MutablePoseZ): boolean {
  if (index < 0) return false;
  if (e.workflow) {
    const a = e.workflow.agents[index];
    if (!a) return false;
    out.x = a.x; out.y = a.y; out.theta = a.theta; out.z = a.z;
    return true;
  }
  const a = e.agents[index];
  if (!a) return false;
  out.x = a.pose.x; out.y = a.pose.y; out.theta = a.pose.theta; out.z = a.groundZ;
  return true;
}

/**
 * Tracks the world point (and framing radius) of the current selection. Team membership is
 * refreshed at most once a second (it only changes during hot-swap), so the per-frame path
 * only reads poses.
 */
export class SelectionTracker {
  private members: { x: number; y: number }[] = [];
  private refreshedAt = -Infinity;
  private key = '';
  private readonly pose: MutablePoseZ = { x: 0, y: 0, theta: 0, z: 0 };

  /** Writes the centre into `out`; returns the framing radius, or −1 when nothing to track. */
  update(e: Engine, sel: Selection, now: number, out: Vector3): number {
    if (!sel || !e.ready) return -1;
    if (sel.kind === 'agent') {
      if (!readRobotPose(e, robotIndexOf(e, sel.id), this.pose)) return -1;
      out.set(this.pose.x, this.pose.y, this.pose.z + 0.25);
      return 1.4;
    }
    const key = `t${sel.id}`;
    if (key !== this.key || now - this.refreshedAt > 1) {
      // Positions are read through live objects: workflow agents expose x / y, lift agents a pose.
      this.members = e.workflow ? e.workflow.members(sel.id) : (e.fleet.team(sel.id)?.agents ?? []).map(a => a.pose);
      this.key = key;
      this.refreshedAt = now;
    }
    const n = this.members.length;
    if (!n) return -1;
    let x = 0, y = 0;
    for (let i = 0; i < n; i++) { x += this.members[i].x; y += this.members[i].y; }
    x /= n; y /= n;
    let r = 0;
    for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(this.members[i].x - x, this.members[i].y - y));
    out.set(x, y, e.groundAt(x, y) + 0.3);
    return Math.min(r, 30) + 1.4;
  }
}
