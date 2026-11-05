/**
 * TALOS hardware specification — single source of truth for every dimension of the robot.
 * Robot local frame: Z-up, metres, +x forward, +y left. Pure data, no three.js.
 *
 * Sources
 *  - goBILDA Strafer® Chassis Kit — 3209-0001-0004 STEP assembly → public/robot.glb
 *    (probed: frame x ±0.216, side-channel outer faces y ±0.180, rail top 48 mm above the frame
 *    bottom, wheel centres (±0.168, ±0.208), wheel faces |y| 0.189…0.227).
 *  - goBILDA 140 mm Mecanum Wheel Set (3213-3606-0003): 16 bearing-supported PU rollers at 45°,
 *    steel side plates, same width/offset as the 96 mm set, 46 mm ground clearance on the Strafer.
 *  - goBILDA 5203 Yellow Jacket 26.9:1 (5203-2402-0027): 223 rpm free, 38.0 kg·cm stall @ 12 V,
 *    9.2 A stall, 0.25 A free, 8 mm REX output.
 *  - goBILDA 1120 U-Channel: 48 × 48 mm section, 24 mm hole pitch.
 *
 * Note on hole counts: goBILDA channel length = holes × 24 mm, so the 432 mm frame length is an
 * 18-hole span and the 360 mm width a 15-hole span. Dimensions (mm) are authoritative here.
 */

/** goBILDA 1120 U-Channel section (m). */
export const CHANNEL_1120 = { section: 0.048, holePitch: 0.024 } as const;

/** Strafer frame envelope (m). */
export const FRAME = {
  length: 0.432,
  width: 0.36,
  /** Half extents of the U-channel perimeter. */
  hx: 0.216,
  hy: 0.18,
  /** Frame bottom above the floor with 140 mm wheels. */
  groundClearance: 0.046,
  /** Channel height (bottom → rail top). */
  height: 0.048,
} as const;

/** Corner node centre: where the side channel meets the end channel (48 mm square). */
export const CORNER_NODE = {
  x: FRAME.hx - CHANNEL_1120.section / 2, // 0.192
  y: FRAME.hy - CHANNEL_1120.section / 2, // 0.156
} as const;

/** 140 mm Mecanum wheel (goBILDA 3213-3606-0003). */
export const MECANUM_140 = {
  diameter: 0.14,
  r: 0.07,
  /** Overall width incl. steel side plates (same as the 96 mm set on the CAD). */
  width: 0.038,
  rollers: 16,
  rollerAngle: Math.PI / 4,
  /** Barrel roller: max radius, end radius, length along its own axis. */
  roller: { rMax: 0.0125, rEnd: 0.0068, length: 0.04 },
  /** Steel side plates reach the roller-axle bearing bosses (radius ≈ 59.5 mm). */
  sidePlate: { r: 0.06, t: 0.0025 },
  hub: { r: 0.024 },
  /** Wheel centre in the robot frame (|x|, |y|) — from the CAD axle positions. */
  x: 0.168,
  y: 0.208,
} as const;

/** CAD wheel radius (96 mm set in the STEP export). */
export const CAD_WHEEL_R = 0.048;
/** The 140 mm wheels mount on the same axles, so the whole frame rises by Δr. */
export const CHASSIS_LIFT = MECANUM_140.r - CAD_WHEEL_R; // 0.022
/** Frame bottom / rail top in the CAD export (wheel r = 48 mm). */
export const CAD_FRAME_BOTTOM_Z = 0.024;
export const CAD_RAIL_TOP_Z = 0.072;

/** Rail top of the U-channel perimeter with 140 mm wheels. */
export const RAIL_TOP_Z = CAD_RAIL_TOP_Z + CHASSIS_LIFT;         // 0.094
export const FRAME_BOTTOM_Z = CAD_FRAME_BOTTOM_Z + CHASSIS_LIFT; // 0.046 = ground clearance

/** goBILDA 5203 Yellow Jacket 26.9:1 drive motor. */
export const DRIVE_MOTOR_5203 = {
  ratio: 26.9,
  freeRpm: 223,
  stallTorque: 38.0 * 0.0980665, // 38.0 kg·cm → 3.727 N·m at the output
  stallCurrent: 9.2,
  freeCurrent: 0.25,
  voltage: 12,
} as const;

/** Wheel free speed (rad/s) = 223 rpm. */
export const DRIVE_OMEGA_FREE = (DRIVE_MOTOR_5203.freeRpm * 2 * Math.PI) / 60; // 23.35 rad/s

/** Full robot footprint incl. wheels (half extents, m). Wheels overhang the frame in x. */
export const ROBOT_FOOTPRINT = {
  halfX: MECANUM_140.x + MECANUM_140.r,          // 0.238
  halfY: MECANUM_140.y + MECANUM_140.width / 2,  // 0.227
} as const;
