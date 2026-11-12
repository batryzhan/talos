/**
 * Procedural 3D task modules mounted on the shared Strafer chassis (robot-local frame: +x forward,
 * +y left, Z-up, metres; z = MOUNT is the chassis deck). One `PartSpec` becomes one InstancedMesh
 * for the whole fleet; animated parts write their local pose into a scratch matrix every frame.
 */
import * as T from 'three';
import type { SwarmAgent } from '../../core/agents/SwarmAgent';
import type { ModuleCapability } from '../../core/agents/taskModule';
import { box, cylX, cylY, cylZ, merge, rod, sphere } from './geometry';

export const MOUNT = 0.105;

export interface PoseScratch { e: T.Euler; q: T.Quaternion; v: T.Vector3; s: T.Vector3; a: T.Matrix4; b: T.Matrix4 }

export function createPoseScratch(): PoseScratch {
  return { e: new T.Euler(), q: new T.Quaternion(), v: new T.Vector3(), s: new T.Vector3(), a: new T.Matrix4(), b: new T.Matrix4() };
}

/** out = T(x,y,z)·Rz(rz)·Ry(ry)·Rx(rx)·S(sx,sy,sz). */
export function pose(k: PoseScratch, out: T.Matrix4, x: number, y: number, z: number, rz = 0, ry = 0, rx = 0, sx = 1, sy = 1, sz = 1): T.Matrix4 {
  k.e.set(rx, ry, rz, 'ZYX');
  k.q.setFromEuler(k.e);
  k.v.set(x, y, z);
  k.s.set(sx, sy, sz);
  return out.compose(k.v, k.q, k.s);
}

export type MaterialKey = 'graphite' | 'steel' | 'alu' | 'yellow' | 'red' | 'black' | 'copper' | 'blue' | 'orange' | 'glass' | 'coal' | 'rubber' | 'glowGreen' | 'glowWhite' | 'glowCyan' | 'glowAmber';

export interface PartSpec {
  material: MaterialKey;
  geometry: () => T.BufferGeometry;
  /** Static local transform (identity if absent and no `pose`). */
  local?: (k: PoseScratch, out: T.Matrix4) => void;
  /** Animated local transform; return false to hide the instance this frame. */
  pose?: (a: SwarmAgent, t: number, k: PoseScratch, out: T.Matrix4) => boolean | void;
}

const Z = MOUNT;
/** Yaw of the agent's aim point relative to its body. */
export function aimYaw(a: SwarmAgent): number {
  return Math.atan2(a.aimY - a.y, a.aimX - a.x) - a.theta;
}

// ─────────────────────────── factory ───────────────────────────

/** Arm frame shared by cutter parts: turret yaw toward the aim point, arm pitched down while working. */
function cutterArm(a: SwarmAgent, t: number, k: PoseScratch, out: T.Matrix4, extra: (k: PoseScratch, m: T.Matrix4) => void): void {
  const yaw = aimYaw(a) * (a.working ? 1 : 0.3), pitch = a.working ? 0.12 + 0.02 * Math.sin(t * 3.1 + a.id) : -0.15;
  pose(k, k.a, -0.05, 0, Z + 0.43, yaw, pitch);
  extra(k, k.b);
  out.multiplyMatrices(k.a, k.b);
}

const PLASMA_CUTTER: PartSpec[] = [
  { material: 'graphite', geometry: () => merge([box(0.24, 0.22, 0.34, -0.05, 0, Z + 0.17), box(0.3, 0.26, 0.03, -0.05, 0, Z + 0.015)]) },
  { material: 'yellow', geometry: () => merge([box(0.246, 0.226, 0.05, -0.05, 0, Z + 0.27), box(0.06, 0.03, 0.2, 0.08, 0.1, Z + 0.1), box(0.06, 0.03, 0.2, 0.08, -0.1, Z + 0.1)]) },
  { material: 'steel', geometry: () => cylZ(0.085, 0.06, 0, 0, 0, 20), pose: (a, _t, k, out) => { pose(k, out, -0.05, 0, Z + 0.37, aimYaw(a) * (a.working ? 1 : 0.3)); } },
  { material: 'yellow', geometry: () => box(0.44, 0.075, 0.075, 0.22, 0, 0), pose: (a, t, k, out) => cutterArm(a, t, k, out, (k2, m) => m.identity()) },
  { material: 'black', geometry: () => merge([cylZ(0.032, 0.13, 0, 0, -0.06, 12), cylZ(0.012, 0.05, 0, 0, -0.145, 8, 0.004)]), pose: (a, t, k, out) => cutterArm(a, t, k, out, (k2, m) => pose(k2, m, 0.44, 0, 0)) },
  { material: 'steel', geometry: () => merge([cylY(0.085, 0.012, 0, 0, 0, 24), box(0.17, 0.02, 0.05, 0, -0.012, 0.06)]), pose: (a, t, k, out) => cutterArm(a, t, k, out, (k2, m) => pose(k2, m, 0.3, 0.07, -0.03)) },
  { material: 'alu', geometry: () => cylY(0.07, 0.006, 0, 0, 0, 28), pose: (a, t, k, out) => cutterArm(a, t, k, out, (k2, m) => pose(k2, m, 0.3, 0.082, -0.03, 0, a.spin)) },
];

const ARC_WELDER: PartSpec[] = [
  { material: 'graphite', geometry: () => merge([cylZ(0.11, 0.05, 0, 0, Z + 0.025, 20), cylZ(0.065, 0.14, 0, 0, Z + 0.12, 16)]) },
  { material: 'copper', geometry: () => merge([cylY(0.07, 0.05, 0, 0, 0, 20)]), pose: (a, _t, k, out) => { pose(k, out, -0.13, 0.12, Z + 0.11, 0, a.spin * 0.3); } },
  { material: 'blue', geometry: () => box(0.06, 0.06, 0.34, 0, 0, 0.17), pose: (a, t, k, out) => welderUpper(a, t, k, out, false) },
  { material: 'blue', geometry: () => box(0.05, 0.05, 0.3, 0, 0, 0.15), pose: (a, t, k, out) => welderFore(a, t, k, out, 0) },
  { material: 'black', geometry: () => merge([cylZ(0.022, 0.09, 0, 0, 0.045, 10), cylZ(0.018, 0.05, 0, 0, 0.11, 10, 0.006)]), pose: (a, t, k, out) => welderFore(a, t, k, out, 0.3) },
  { material: 'steel', geometry: () => sphere(0.045), pose: (a, t, k, out) => welderUpper(a, t, k, out, true) },
];

function welderShoulder(a: SwarmAgent, t: number, k: PoseScratch): number {
  const weave = a.working ? 0.08 * Math.sin(t * 9 + a.id * 1.7) : 0;
  pose(k, k.a, 0, 0, Z + 0.2, aimYaw(a) + weave * 0.6, a.working ? 0.55 : 0.2);
  return weave;
}
function welderUpper(a: SwarmAgent, t: number, k: PoseScratch, out: T.Matrix4, elbow: boolean): void {
  welderShoulder(a, t, k);
  out.copy(k.a);
  if (elbow) { pose(k, k.b, 0, 0, 0.34); out.multiply(k.b); }
}
function welderFore(a: SwarmAgent, t: number, k: PoseScratch, out: T.Matrix4, along: number): void {
  const weave = welderShoulder(a, t, k);
  pose(k, k.b, 0, 0, 0.34, 0, a.working ? 1.45 + weave : 1.9);
  out.multiplyMatrices(k.a, k.b);
  if (along) { pose(k, k.b, 0, 0, along); out.multiply(k.b); }
}

const REPAIR_DIAGNOSTIC: PartSpec[] = [
  { material: 'alu', geometry: () => merge([
    rod([-0.14, -0.12, Z], [-0.14, -0.12, Z + 0.34], 0.012), rod([-0.14, 0.12, Z], [-0.14, 0.12, Z + 0.34], 0.012),
    rod([0.02, -0.12, Z], [0.02, -0.12, Z + 0.34], 0.012), rod([0.02, 0.12, Z], [0.02, 0.12, Z + 0.34], 0.012),
    box(0.2, 0.28, 0.02, -0.06, 0, Z + 0.35), box(0.2, 0.28, 0.02, -0.06, 0, Z + 0.17),
  ]) },
  { material: 'blue', geometry: () => merge([box(0.16, 0.2, 0.12, -0.07, 0, Z + 0.07), box(0.08, 0.18, 0.06, -0.07, 0, Z + 0.24)]) },
  { material: 'steel', geometry: () => merge([box(0.24, 0.035, 0.035, 0.12, 0, 0), box(0.03, 0.06, 0.05, 0.25, 0.02, 0), box(0.03, 0.06, 0.05, 0.25, -0.02, 0)]),
    pose: (a, t, k, out) => { pose(k, out, 0.04, 0.1, Z + 0.3, aimYaw(a) * 0.5, a.working ? 0.35 + 0.1 * Math.sin(t * 2.3) : 0.6); } },
  { material: 'steel', geometry: () => merge([box(0.24, 0.035, 0.035, 0.12, 0, 0), box(0.03, 0.06, 0.05, 0.25, 0.02, 0), box(0.03, 0.06, 0.05, 0.25, -0.02, 0)]),
    pose: (a, t, k, out) => { pose(k, out, 0.04, -0.1, Z + 0.3, aimYaw(a) * 0.5, a.working ? 0.4 + 0.1 * Math.sin(t * 2.9 + 1) : 0.6); } },
  { material: 'yellow', geometry: () => merge([cylX(0.022, 0.12, 0.06, 0, 0, 10), box(0.03, 0.07, 0.016, 0.12, 0, 0)]),
    pose: (a, _t, k, out) => { pose(k, k.a, 0.04, -0.1, Z + 0.3, aimYaw(a) * 0.5, 0.4); pose(k, k.b, 0.25, 0, 0, 0, 0, a.spin * 3); out.multiplyMatrices(k.a, k.b); } },
  { material: 'glowCyan', geometry: () => merge([sphere(0.035, 0, 0, 0), cylZ(0.012, 0.12, 0, 0, -0.07, 8)]),
    pose: (a, t, k, out) => { pose(k, out, -0.06, 0, Z + 0.5, aimYaw(a) + (a.working ? 0.4 * Math.sin(t * 4) : t * 0.8)); } },
];

const ROLLER_CARRIER: PartSpec[] = [
  { material: 'graphite', geometry: () => merge([box(0.42, 0.36, 0.03, 0, 0, Z + 0.015), box(0.42, 0.02, 0.06, 0, 0.17, Z + 0.05), box(0.42, 0.02, 0.06, 0, -0.17, Z + 0.05)]) },
  { material: 'alu', geometry: () => merge(Array.from({ length: 7 }, (_, i) => cylY(0.018, 0.32, -0.18 + i * 0.06, 0, Z + 0.05, 10))) },
  { material: 'red', geometry: () => merge([box(0.03, 0.05, 0.05, 0.2, 0.12, Z + 0.07), box(0.03, 0.05, 0.05, 0.2, -0.12, Z + 0.07), box(0.03, 0.05, 0.05, -0.2, 0.12, Z + 0.07), box(0.03, 0.05, 0.05, -0.2, -0.12, Z + 0.07)]) },
  // Cut sheet blanks (1–2), stacked on the rollers.
  { material: 'steel', geometry: () => box(0.4, 0.3, 0.03, 0, 0, 0), pose: (a, _t, k, out) => {
    if (a.cargoKind !== 1 || a.cargo <= 0) return false;
    const n = a.cargo > 0.5 ? 2 : 1;
    pose(k, out, 0, 0, Z + 0.085 + 0.016 * (n - 1), 0, 0, 0, 1, 1, n);
  } },
  // Welded sub-assembly: a small frame.
  { material: 'blue', geometry: () => merge([box(0.44, 0.04, 0.04, 0, 0.13, 0), box(0.44, 0.04, 0.04, 0, -0.13, 0), box(0.04, 0.3, 0.04, 0.2, 0, 0), box(0.04, 0.3, 0.04, -0.2, 0, 0), box(0.04, 0.3, 0.04, 0, 0, 0.0), rod([-0.2, 0.13, 0.02], [0, 0, 0.16], 0.015), rod([0.2, -0.13, 0.02], [0, 0, 0.16], 0.015)]),
    pose: (a, _t, k, out) => { if (a.cargoKind !== 2 || a.cargo <= 0) return false; pose(k, out, 0, 0, Z + 0.1); } },
];

const MULTI_SWAP: PartSpec[] = [
  { material: 'alu', geometry: () => merge([box(0.38, 0.32, 0.025, 0, 0, Z + 0.012), cylZ(0.05, 0.05, 0.12, 0, Z + 0.05, 16)]) },
  { material: 'graphite', geometry: () => merge([box(0.18, 0.12, 0.12, -0.07, 0.08, Z + 0.085), box(0.18, 0.12, 0.12, -0.07, -0.08, Z + 0.085)]) },
  { material: 'glowGreen', geometry: () => merge([box(0.182, 0.01, 0.02, -0.07, 0.141, Z + 0.11), box(0.182, 0.01, 0.02, -0.07, -0.141, Z + 0.11), sphere(0.018, 0.12, 0, Z + 0.09)]) },
];

// ─────────────────────────── wildfire ───────────────────────────

const WATER_CANNON: PartSpec[] = [
  { material: 'red', geometry: () => merge([cylX(0.15, 0.3, -0.02, 0, Z + 0.15, 24), sphere(0.15, 0.13, 0, Z + 0.15, 20, 12).scale(1, 1, 1), sphere(0.15, -0.17, 0, Z + 0.15, 20, 12)]) },
  { material: 'graphite', geometry: () => merge([box(0.4, 0.34, 0.04, 0, 0, Z + 0.02), box(0.06, 0.32, 0.06, 0.12, 0, Z + 0.07), box(0.06, 0.32, 0.06, -0.15, 0, Z + 0.07), cylZ(0.02, 0.05, -0.15, 0.09, Z + 0.33, 8), cylZ(0.02, 0.05, -0.15, -0.09, Z + 0.33, 8)]) },
  { material: 'steel', geometry: () => cylZ(0.06, 0.05, 0, 0, 0, 16), pose: (a, _t, k, out) => { pose(k, out, 0.02, 0, Z + 0.32, aimYaw(a)); } },
  { material: 'steel', geometry: () => merge([cylX(0.026, 0.26, 0.13, 0, 0, 12), cylX(0.034, 0.05, 0.27, 0, 0, 12, 0.022)]),
    pose: (a, _t, k, out) => { pose(k, out, 0.02, 0, Z + 0.37, aimYaw(a), a.working ? -0.62 : -0.1); } },
  { material: 'glowAmber', geometry: () => merge([sphere(0.022, 0.15, 0.1, Z + 0.3), sphere(0.022, 0.15, -0.1, Z + 0.3)]) },
];

const TRENCH_BLADE: PartSpec[] = [
  { material: 'graphite', geometry: () => merge([box(0.3, 0.3, 0.12, -0.04, 0, Z + 0.06), box(0.12, 0.04, 0.04, 0.17, 0.12, Z + 0.03), box(0.12, 0.04, 0.04, 0.17, -0.12, Z + 0.03)]) },
  { material: 'yellow', geometry: () => merge([box(0.04, 0.56, 0.14, 0, 0, 0.07), box(0.04, 0.56, 0.06, -0.02, 0, 0.17).rotateY(-0.35), box(0.06, 0.04, 0.2, -0.03, 0.27, 0.1), box(0.06, 0.04, 0.2, -0.03, -0.27, 0.1)]),
    pose: (a, _t, k, out) => { pose(k, out, 0.3, 0, a.working ? 0.0 : 0.06); } },
  { material: 'black', geometry: () => merge(Array.from({ length: 5 }, (_, i) => box(0.042, 0.06, 0.14, 0.001, -0.24 + i * 0.12, 0.07))), pose: (a, _t, k, out) => { pose(k, out, 0.3, 0, a.working ? 0.0 : 0.06); } },
  { material: 'steel', geometry: () => merge([cylY(0.05, 0.4, 0, 0, 0, 10), ...Array.from({ length: 8 }, (_, i) => box(0.02, 0.4, 0.13, 0, 0, 0).rotateY(i * Math.PI / 8))]),
    pose: (a, _t, k, out) => { pose(k, out, -0.06, 0, Z + 0.17, 0, a.spin * 2); } },
  { material: 'glowAmber', geometry: () => sphere(0.025, -0.15, 0, Z + 0.15) },
];

const THERMAL_RELAY: PartSpec[] = [
  { material: 'graphite', geometry: () => merge([box(0.34, 0.3, 0.1, -0.02, 0, Z + 0.05), cylZ(0.05, 0.3, -0.04, 0, Z + 0.25, 16)]) },
  { material: 'alu', geometry: () => cylZ(0.04, 0.6, 0, 0, 0.3, 14), pose: (a, _t, k, out) => { pose(k, out, -0.04, 0, Z + 0.4 + a.extension * 0.5 - 0.3, 0, 0, 0, 1, 1, 0.55 + 0.45 * a.extension); } },
  { material: 'steel', geometry: () => cylZ(0.03, 0.6, 0, 0, 0.3, 12), pose: (a, _t, k, out) => { pose(k, out, -0.04, 0, Z + 0.45 + a.extension * 1.05 - 0.3, 0, 0, 0, 1, 1, 0.5 + 0.5 * a.extension); } },
  { material: 'glass', geometry: () => merge([sphere(0.07, 0, 0, 0.0, 16, 12), box(0.05, 0.05, 0.04, 0.06, 0, 0)]), pose: (a, t, k, out) => { pose(k, out, -0.04, 0, Z + 0.62 + a.extension * 1.25, t * 1.6 + a.id); } },
  { material: 'steel', geometry: () => merge([box(0.5, 0.02, 0.02, 0, 0, 0), cylZ(0.008, 0.3, 0.22, 0, 0.15, 6), cylZ(0.008, 0.3, -0.22, 0, 0.15, 6)]), pose: (a, _t, k, out) => { pose(k, out, -0.04, 0, Z + 0.72 + a.extension * 1.25); } },
  { material: 'glowCyan', geometry: () => sphere(0.03, 0, 0, 0, 10, 8), pose: (a, t, k, out) => {
    const on = a.extension > 0.9 ? 0.6 + 0.6 * Math.max(0, Math.sin(t * 6 + a.id)) : 0.6;
    pose(k, out, -0.04, 0, Z + 0.78 + a.extension * 1.25, 0, 0, 0, on, on, on);
  } },
];

const TANKER_REFILL: PartSpec[] = [
  { material: 'alu', geometry: () => merge([cylX(0.17, 0.34, -0.02, 0, Z + 0.18, 24), sphere(0.17, 0.15, 0, Z + 0.18, 20, 12), sphere(0.17, -0.19, 0, Z + 0.18, 20, 12)]) },
  { material: 'graphite', geometry: () => merge([box(0.42, 0.36, 0.03, 0, 0, Z + 0.015), box(0.05, 0.38, 0.05, 0.1, 0, Z + 0.4).rotateX(0), box(0.05, 0.38, 0.05, -0.12, 0, Z + 0.4)]) },
  { material: 'orange', geometry: () => cylY(0.07, 0.06, 0, 0, 0, 20), pose: (a, _t, k, out) => { pose(k, out, 0.13, 0.17, Z + 0.37, 0, a.spin * 0.5); } },
  { material: 'blue', geometry: () => box(0.09, 0.1, 0.08, -0.14, -0.15, Z + 0.4) },
  { material: 'glowCyan', geometry: () => box(0.02, 0.06, 0.03, -0.095, -0.15, Z + 0.41) },
];

// ─────────────────────────── mine ───────────────────────────

const LIDAR_ILLUMINATOR: PartSpec[] = [
  { material: 'graphite', geometry: () => merge([box(0.3, 0.28, 0.12, -0.04, 0, Z + 0.06), cylZ(0.03, 0.34, -0.02, 0, Z + 0.29, 12)]) },
  { material: 'black', geometry: () => merge([cylZ(0.06, 0.07, 0, 0, 0, 20), cylZ(0.045, 0.03, 0, 0, 0.05, 20)]), pose: (a, t, k, out) => { pose(k, out, -0.02, 0, Z + 0.49, t * 12 + a.id); } },
  { material: 'glowGreen', geometry: () => cylZ(0.0605, 0.012, 0, 0, 0, 24), pose: (_a, _t, k, out) => { pose(k, out, -0.02, 0, Z + 0.49); } },
  { material: 'steel', geometry: () => merge([box(0.06, 0.1, 0.07, 0.14, 0.11, Z + 0.21), box(0.06, 0.1, 0.07, 0.14, -0.11, Z + 0.21), box(0.04, 0.3, 0.03, 0.1, 0, Z + 0.18)]) },
  { material: 'glowWhite', geometry: () => merge([box(0.012, 0.085, 0.055, 0.175, 0.11, Z + 0.21), box(0.012, 0.085, 0.055, 0.175, -0.11, Z + 0.21)]) },
];

const ROTARY_EXCAVATOR: PartSpec[] = [
  { material: 'yellow', geometry: () => merge([box(0.32, 0.3, 0.14, -0.06, 0, Z + 0.07), box(0.08, 0.2, 0.1, 0.12, 0, Z + 0.12)]) },
  { material: 'yellow', geometry: () => box(0.42, 0.11, 0.1, 0.21, 0, 0), pose: (a, _t, k, out) => { pose(k, out, 0.1, 0, Z + 0.2, 0, a.working ? 0.32 + 0.05 * a.extension : 0.05); } },
  { material: 'steel', geometry: () => merge([cylY(0.085, 0.2, 0, 0, 0, 12), ...Array.from({ length: 10 }, (_, i) => box(0.03, 0.2, 0.03, 0.09, 0, 0).rotateY(i * Math.PI / 5)), ...Array.from({ length: 6 }, (_, i) => cylX(0.012, 0.05, 0.11, -0.07 + (i % 3) * 0.07, 0, 6, 0.002).rotateY(i * Math.PI / 3))]),
    pose: (a, _t, k, out) => { pose(k, k.a, 0.1, 0, Z + 0.2, 0, a.working ? 0.32 + 0.05 * a.extension : 0.05); pose(k, k.b, 0.44, 0, 0, 0, a.spin * 2.2); out.multiplyMatrices(k.a, k.b); } },
  { material: 'alu', geometry: () => merge([rod([-0.05, 0.07, Z + 0.1], [0.2, 0.07, Z + 0.24], 0.015), rod([-0.05, -0.07, Z + 0.1], [0.2, -0.07, Z + 0.24], 0.015)]) },
  { material: 'steel', geometry: () => merge([cylX(0.04, 0.34, 0, 0, 0, 10), ...Array.from({ length: 7 }, (_, i) => box(0.012, 0.09, 0.02, -0.15 + i * 0.05, 0, 0).rotateX(i * 0.9))]),
    pose: (a, _t, k, out) => { pose(k, out, -0.02, 0.2, Z + 0.06, 0, 0, a.spin * 3); } },
];

const ORE_HOPPER_CART: PartSpec[] = [
  { material: 'graphite', geometry: () => merge([box(0.42, 0.36, 0.03, 0, 0, Z + 0.015), box(0.04, 0.3, 0.07, -0.2, 0, Z + 0.06)]) },
  { material: 'steel', geometry: () => merge([box(0.46, 0.38, 0.02, 0.23, 0, 0.01), box(0.02, 0.42, 0.2, 0.0, 0, 0.11).rotateY(0.15), box(0.02, 0.42, 0.2, 0.46, 0, 0.11).rotateY(-0.0), box(0.48, 0.02, 0.2, 0.23, 0.2, 0.11), box(0.48, 0.02, 0.2, 0.23, -0.2, 0.11), box(0.5, 0.03, 0.03, 0.23, 0.215, 0.215), box(0.5, 0.03, 0.03, 0.23, -0.215, 0.215)]),
    pose: (a, _t, k, out) => { pose(k, out, -0.23, 0, Z + 0.04, 0, -a.dump * 0.9); } },
  { material: 'coal', geometry: () => merge([new T.DodecahedronGeometry(0.17, 1).scale(1.25, 1, 0.7), new T.DodecahedronGeometry(0.08, 0).translate(0.12, 0.08, 0.06), new T.DodecahedronGeometry(0.07, 0).translate(-0.1, -0.09, 0.05)]),
    pose: (a, _t, k, out) => {
      if (a.cargo <= 0.01 || a.dump > 0.6) return false;
      const f = Math.min(1, a.cargo);
      pose(k, k.a, -0.23, 0, Z + 0.04, 0, -a.dump * 0.9);
      pose(k, k.b, 0.23, 0, 0.02 + 0.13 * f, 0, 0, 0, 0.4 + 0.6 * f, 0.4 + 0.6 * f, 0.15 + 0.85 * f);
      out.multiplyMatrices(k.a, k.b);
    } },
];

export const MODULE_PARTS: Record<ModuleCapability, PartSpec[]> = {
  PLASMA_CUTTER, ARC_WELDER, REPAIR_DIAGNOSTIC, ROLLER_CARRIER, MULTI_SWAP,
  WATER_CANNON, TRENCH_BLADE, THERMAL_RELAY, TANKER_REFILL,
  LIDAR_ILLUMINATOR, ROTARY_EXCAVATOR, ORE_HOPPER_CART,
};

/** Overall module height above the floor (m), for the shadow proxy and labels. */
export const MODULE_HEIGHT: Record<ModuleCapability, number> = {
  PLASMA_CUTTER: 0.62, ARC_WELDER: 0.62, REPAIR_DIAGNOSTIC: 0.6, ROLLER_CARRIER: 0.22, MULTI_SWAP: 0.25,
  WATER_CANNON: 0.5, TRENCH_BLADE: 0.32, THERMAL_RELAY: 0.85, TANKER_REFILL: 0.52,
  LIDAR_ILLUMINATOR: 0.62, ROTARY_EXCAVATOR: 0.42, ORE_HOPPER_CART: 0.4,
};

/** Module-local tool tip (robot frame) for effects: torch, nozzle, drill head… */
export function toolTip(a: SwarmAgent, out: T.Vector3): T.Vector3 {
  const c = Math.cos(a.theta), s = Math.sin(a.theta);
  let lx = 0.35, ly = 0, lz = MOUNT + 0.3;
  switch (a.module.capability) {
    case 'PLASMA_CUTTER': { const yaw = aimYaw(a); lx = -0.05 + Math.cos(yaw) * 0.437; ly = Math.sin(yaw) * 0.437; lz = MOUNT + 0.205; break; }
    case 'ARC_WELDER': { const yaw = aimYaw(a); lx = Math.cos(yaw) * 0.45; ly = Math.sin(yaw) * 0.45; lz = MOUNT + 0.36; break; }
    case 'WATER_CANNON': { const yaw = aimYaw(a); lx = 0.02 + Math.cos(yaw) * 0.27; ly = Math.sin(yaw) * 0.27; lz = MOUNT + 0.52; break; }
    case 'ROTARY_EXCAVATOR': lx = 0.6; lz = MOUNT + 0.06; break;
    case 'REPAIR_DIAGNOSTIC': lx = -0.06; lz = MOUNT + 0.5; break;
    case 'LIDAR_ILLUMINATOR': lx = -0.02; lz = MOUNT + 0.5; break;
    case 'TRENCH_BLADE': lx = 0.34; lz = 0.05; break;
    case 'THERMAL_RELAY': lx = -0.04; lz = MOUNT + 0.78 + a.extension * 1.25; break;
  }
  return out.set(a.x + c * lx - s * ly, a.y + s * lx + c * ly, a.z + lz);
}
