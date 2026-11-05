/**
 * goBILDA 140 mm Mecanum wheel (3213-3606-0003), procedural — replaces the 96 mm CAD wheels.
 *
 * Wheel-local frame: axle = +y, rim speed at the floor = +x for a positive rotation about +y
 * (same convention as the CAD wheels, TalosRobotAgent animates `rotation.y`).
 *
 *   rollers     16 barrel rollers, yellow polyurethane, axes at 45° to the axle, centre radius
 *               R_c = r − r_max so the contact envelope is exactly r = 70 mm
 *   bearings    one steel boss per roller end (bearing-supported rollers)
 *   side plates two zinc-plated steel discs, hub with the goBILDA 8 mm REX bore pattern
 *
 * Roller axis for wheel i at polar angle φ (position (R_c cos φ, 0, R_c sin φ)):
 *   a(φ) = (s_i · t(φ) + ŷ) / √2,  t(φ) = (−sin φ, 0, cos φ)
 * with s_i = MECANUM_SIGNS[i][0] (X configuration of formula 14). At the contact roller
 * (φ = −π/2) a = (s_i/√2, 1/√2, 0), which is what TalosRobotAgent.rigWheels checks.
 *
 * Geometry and materials are cached at module level and shared by every robot.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WheelId } from '../contracts/types';
import { WHEEL_ORDER } from '../contracts/types';
import { MECANUM_SIGNS } from './mecanum';
import { pbr } from './materials';
import { MECANUM_140 } from './straferSpec';

const W = MECANUM_140;
/** Roller centre radius (m). */
export const ROLLER_CENTRE_R = W.r - W.roller.rMax;

let rollerGeo: THREE.BufferGeometry | null = null;
const hubGeo: Record<string, THREE.BufferGeometry> = {};

/** Barrel roller, long axis = +y, centred on the origin. */
function rollerGeometry(): THREE.BufferGeometry {
  if (rollerGeo) return rollerGeo;
  const { rMax, rEnd, length: L } = W.roller;
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -L / 2)];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const y = -L / 2 + (L * i) / n;
    const u = (2 * y) / L;
    pts.push(new THREE.Vector2(rEnd + (rMax - rEnd) * (1 - u * u), y));
  }
  pts.push(new THREE.Vector2(0, L / 2));
  rollerGeo = new THREE.LatheGeometry(pts, 20);
  return rollerGeo;
}

/** Roller axis in the wheel frame for polar angle φ and roller-slope sign s. */
export function rollerAxis(phi: number, s: number): THREE.Vector3 {
  return new THREE.Vector3(-s * Math.sin(phi), 1, s * Math.cos(phi)).normalize();
}

/** Side plates + hub + bearing bosses for one roller-slope sign (merged, shared). */
function hubGeometry(s: number): THREE.BufferGeometry {
  const key = String(s);
  if (hubGeo[key]) return hubGeo[key];
  const parts: THREE.BufferGeometry[] = [];
  const plateY = W.width / 2 - W.sidePlate.t / 2;
  for (const sy of [1, -1]) {
    const p = new THREE.CylinderGeometry(W.sidePlate.r, W.sidePlate.r, W.sidePlate.t, 48);
    p.translate(0, sy * plateY, 0);
    parts.push(p);
  }
  const hub = new THREE.CylinderGeometry(W.hub.r, W.hub.r, W.width - 2 * W.sidePlate.t, 32);
  parts.push(hub);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < W.rollers; i++) {
    const phi = (2 * Math.PI * i) / W.rollers;
    const a = rollerAxis(phi, s);
    const c = new THREE.Vector3(ROLLER_CENTRE_R * Math.cos(phi), 0, ROLLER_CENTRE_R * Math.sin(phi));
    for (const e of [1, -1]) {
      const boss = new THREE.CylinderGeometry(0.0034, 0.0034, 0.003, 10);
      boss.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, a));
      const at = c.clone().addScaledVector(a, e * (W.roller.length / 2 + 0.0015));
      boss.translate(at.x, at.y, at.z);
      parts.push(boss);
    }
  }
  const nonIndexed = parts.map(g => { const q = g.index ? g.toNonIndexed() : g; return q; });
  const merged = mergeGeometries(nonIndexed, false);
  parts.forEach(g => g.dispose());
  if (!merged) throw new Error('MecanumWheel: hub merge failed');
  hubGeo[key] = merged;
  return merged;
}

export interface MecanumWheelRig {
  node: THREE.Group;
  id: WheelId;
}

/**
 * Build wheel `id` at its Strafer axle position. The returned group carries the userData contract
 * TalosRobotAgent.rigWheels expects ({ id, radius, axisXY }) and children `roller_*` whose
 * userData.axis is the roller axis in the wheel frame (rest pose = identity quaternion).
 */
export function buildMecanumWheel(id: WheelId, centreZ = W.r): THREE.Group {
  const i = WHEEL_ORDER.indexOf(id);
  const s = MECANUM_SIGNS[i][0];
  const sx = id[0] === 'F' ? 1 : -1;
  const sy = id[1] === 'L' ? 1 : -1;

  const wheel = new THREE.Group();
  wheel.name = `wheel_${id}`;
  wheel.position.set(sx * W.x, sy * W.y, centreZ);
  wheel.userData = { id, radius: W.r, axisXY: [s * Math.SQRT1_2, Math.SQRT1_2] };

  const hub = new THREE.Mesh(hubGeometry(s), pbr('steelPlate'));
  hub.name = `mecanum_hub_${id}`;
  hub.castShadow = true; hub.receiveShadow = true;
  wheel.add(hub);

  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < W.rollers; k++) {
    const phi = (2 * Math.PI * k) / W.rollers;
    const a = rollerAxis(phi, s);
    const r = new THREE.Group();
    r.name = `roller_${id}_${k}`;
    r.position.set(ROLLER_CENTRE_R * Math.cos(phi), 0, ROLLER_CENTRE_R * Math.sin(phi));
    r.userData.axis = [a.x, a.y, a.z];
    const m = new THREE.Mesh(rollerGeometry(), pbr('polyurethaneYellow'));
    m.name = `roller_cover_${id}_${k}`;
    m.quaternion.setFromUnitVectors(up, a); // rest alignment; the parent group spins about `a`
    m.castShadow = true; m.receiveShadow = true;
    r.add(m);
    wheel.add(r);
  }
  return wheel;
}

/** All four wheels, FL FR RL RR. */
export function buildMecanumWheels(centreZ = W.r): THREE.Group[] {
  return WHEEL_ORDER.map(id => buildMecanumWheel(id, centreZ));
}
