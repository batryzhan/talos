/**
 * TALOS — shared data contract between Agent A (src/robot, src/swarm) and
 * Agent B (src/platform, src/physics, src/missions, src/ui).
 *
 * ⚠ Shared file: change only by agreement of both agents (CLAUDE.md §2, AGENTS.md §1.1).
 *
 * Conventions (CLAUDE.md §4.5):
 *  - World frame: Z-up, metres, radians. Floor plane z = 0.
 *  - Robot body frame: +x forward, +y left, ω > 0 counter-clockwise (seen from above).
 *  - Wheel order everywhere: 0:FL, 1:FR, 2:RL, 3:RR (formula 14 rows 1..4).
 *  - Agent ids are 1..N.
 */

// ───────────────────────── timing ─────────────────────────

/** Local agent control loop rate (Hz). */
export const CONTROL_HZ = 50;
/** Radio / message exchange rate (Hz). */
export const RADIO_HZ = 20;

// ───────────────────────── primitives ─────────────────────────

export interface Vec2 { x: number; y: number }
export interface Pose2D { x: number; y: number; theta: number }
/** Planar twist. In the body frame unless stated otherwise. */
export interface Twist2D { vx: number; vy: number; omega: number }

export type WheelId = 'FL' | 'FR' | 'RL' | 'RR';
export const WHEEL_ORDER: readonly WheelId[] = ['FL', 'FR', 'RL', 'RR'];
/** Wheel angular rates ω_1..ω_4 (rad/s), order FL, FR, RL, RR. */
export type WheelRates = [number, number, number, number];

// ───────────────────────── agent state s_i (formula 2) ─────────────────────────

export type OperationMode =
  | 'READY'
  | 'APPROACH'
  | 'CONTACT'
  | 'LIFT'
  | 'TRANSPORT'
  | 'LOWER'
  | 'HOLD';

/** Active modes: a safety trigger in any of these sends the agent to HOLD. */
export const ACTIVE_MODES: readonly OperationMode[] = ['APPROACH', 'CONTACT', 'LIFT', 'TRANSPORT', 'LOWER'];

export type HealthFlag = 'OK' | 'WARN' | 'FAULT';

/** s_i = (p_i, θ_i, h_i, ḣ_i, b_i, m_i, q_i, t_i). */
export interface AgentState {
  id: number;
  /** p_i: robot centre on the floor plane (m, world). */
  p: Vec2;
  /** θ_i: heading (rad, CCW). */
  theta: number;
  /** h_i: Viper Slide extension (m), h ∈ [hMin, hMax]. */
  h: number;
  /** ḣ_i: lift vertical velocity (m/s). */
  hDot: number;
  /** b_i ∈ [0, 1]: battery state of charge. */
  b: number;
  /** m_i: FSM mode. */
  m: OperationMode;
  /** q_i ∈ [0, 1]: measurement quality. */
  q: number;
  /** t_i: local clock time of the measurement (s). */
  t: number;
}

// ───────────────────────── network packet (table 5) ─────────────────────────

export interface AgentMessage {
  id: number;            // unique agent id (1..N)
  task: string;          // current task / mission id
  epoch: number;         // group composition epoch (incremented on membership change)
  seq: number;           // packet sequence number (duplicate filtering)
  time: number;          // measurement time (agent local clock, s)
  mode: OperationMode;   // FSM mode
  health: HealthFlag;    // fault flag
  height: number;        // lift height h_i (m)
  heightVel: number;     // lift velocity ḣ_i (m/s)
  pose: Pose2D;          // planar pose
  quality: number;       // measurement quality [0..1]
  /** Measured reaction force F_i (N), or null ("NA") when the sensor is absent / uncalibrated. NEVER 0 for "no sensor". */
  force: number | null;
  battery: number;       // state of charge [0..1]
}

/** Why a receiver dropped a packet (CLAUDE.md §4.1). */
export type MessageRejectReason = 'stale-epoch' | 'duplicate-seq' | 'too-old' | 'height-out-of-range' | 'wrong-task';

// ───────────────────────── robot hardware parameters ─────────────────────────

/** Mecanum chassis geometry for formula 14. */
export interface MecanumGeometry {
  /** Wheel radius r (m). */
  r: number;
  /** Half wheelbase a (m): |x| of the wheel axles. */
  a: number;
  /** Half track b (m): |y| of the wheel contact points. */
  b: number;
  /** Wheel angular rate limit ω_max (rad/s). */
  omegaMax: number;
  /** Wheel angular acceleration limit (rad/s²) — traction / slew limit. */
  alphaMax: number;
}

/** Viper Slide drive (formula 15): F ≈ η·G·τ_m / r_s, P = F·v. */
export interface LiftDriveParams {
  /** Stroke limits (m). Packets with height ∉ [hMin, hMax] are rejected. */
  hMin: number;
  hMax: number;
  /** Gear ratio G. */
  gearRatio: number;
  /** Gearbox + rigging efficiency η. */
  efficiency: number;
  /** Motor stall torque τ_stall at the motor shaft (N·m), per motor. */
  motorStallTorque: number;
  /** Motor free speed (rad/s) at the motor shaft. */
  motorFreeSpeed: number;
  /** Motor stall / free current (A). */
  stallCurrent: number;
  freeCurrent: number;
  /** Number of motors driving the slide. */
  motors: number;
  /** Spool radius r_s (m). */
  spoolRadius: number;
  /** Moving mass of carriage + stages (kg). */
  carriageMass: number;
  /** Commanded lift speed limit (m/s), before load derating. */
  vMax: number;
  /** Lift acceleration limit (m/s²). */
  aMax: number;
}

// ───────────────────────── support contact (M1, robot ⇄ physics) ─────────────────────────

/** What a robot exposes to the physics engine each physics step. */
export interface SupportContactInput {
  agentId: number;
  /** Support pad centre in world XY (m). */
  pad: Vec2;
  /** World height of the pad top surface (m) = padBaseZ + h_i. */
  padZ: number;
  /** Vertical velocity of the pad (m/s) = ḣ_i. */
  padVel: number;
  /** Pad half size (m), square pad. */
  padHalfSize: number;
  /** Effective support stiffness k_i (N/m) and damping c_i (N·s/m) for F_i = k max(0,δ) + c δ̇ 𝟙(δ>0). */
  stiffness: number;
  damping: number;
  /** Allowed reaction force F_allow,i (N). */
  fAllow: number;
}

/** What the physics engine returns to each robot after the step. */
export interface SupportContactOutput {
  agentId: number;
  /** δ_i = padZ − z_payload(x_i, y_i) (m). δ ≤ 0 ⇒ contact lost. */
  delta: number;
  deltaDot: number;
  /** True reaction force F_i (N), ≥ 0. Robots expose it through their (possibly absent) force sensor. */
  force: number;
}

/** Rigid payload state owned by src/physics; read by the swarm for readiness / safety. */
export interface PayloadState {
  id: string;
  mass: number;
  /** Centre of mass projection r_c on the floor (world, m). */
  com: Vec2;
  /** Payload reference pose (world). */
  pose: Pose2D;
  /** Height of the payload underside at its reference point (m). */
  z: number;
  /** Least squares plane z = a + b·x + c·y fitted through the supports. */
  plane?: { a: number; b: number; c: number };
  /** Stability margin ρ (m): distance of r_c to the support polygon boundary; negative if outside. */
  rho?: number;
}

// ───────────────────────── swarm configuration / commands ─────────────────────────

/** A — independent (k_c = 0), B — centralized (full state, no loss), C — decentralized TALOS. */
export type ControllerKind = 'A' | 'B' | 'C';

export type TopologyKind = 'ring' | 'complete' | 'line';

export interface NetworkParams {
  topology: TopologyKind;
  /** Per-edge, per-radio-tick symmetric loss probability p ∈ [0, 1]. */
  lossP: number;
  /** Transport delay d (s). */
  delay: number;
  /** Max accepted packet age (s). */
  maxAge: number;
}

export interface LiftControlGains {
  /** Tracking gain k_p (1/s). */
  kp: number;
  /** Coupling gain k_c (1/s); forced to 0 for controller A. */
  kc: number;
}

export interface SafetyLimits {
  /** Max height spread max h − min h before HOLD (m). */
  maxHeightSkew: number;
  /** Neighbour silence timeout before HOLD (s). */
  neighborTimeout: number;
  /** Battery level that triggers HOLD. */
  minBattery: number;
  /** Required stability margin ρ_min (m). */
  rhoMin: number;
  /** Position tolerance to accept "at support point" (m) and heading tolerance (rad). */
  posTol: number;
  headingTol: number;
}

export interface SwarmConfig {
  seed: number;
  task: string;
  controller: ControllerKind;
  network: NetworkParams;
  gains: LiftControlGains;
  safety: SafetyLimits;
  /** Target lift height h* (m). */
  targetHeight: number;
}

/** Per-agent command produced by the swarm and applied by the platform / robot. */
export interface AgentCommand {
  agentId: number;
  mode: OperationMode;
  /** Wheel angular rate targets (rad/s), FL FR RL RR, already saturation-scaled. */
  wheelRates: WheelRates;
  /** Lift velocity command u_i (m/s). */
  liftVelocity: number;
  /** Position lock / brake engaged (HOLD). Power is never simply cut. */
  liftLock: boolean;
}

/** Faults injected by src/missions. */
export interface FaultInjection {
  /** Override of network loss probability. */
  lossP?: number;
  /** Agents whose radio is dead. */
  radioDead?: number[];
  /** Agents whose lift drive has failed (cannot move, brake still holds). */
  liftFault?: number[];
  /** Battery level overrides. */
  batteryOverride?: Record<number, number>;
}

/** Everything the platform hands to swarm.step(dt, world). */
export interface WorldState {
  /** Simulation time (s). */
  time: number;
  contacts: SupportContactOutput[];
  payload?: PayloadState;
  faults?: FaultInjection;
}

/** Group-level transport command (virtual platform, formula 16), world frame. */
export interface PayloadMotionCommand {
  /** Centre velocity v_c (m/s, world). */
  vc: Vec2;
  /** Angular velocity ω_c (rad/s). */
  omegaC: number;
}

/** Support assignment: where agent i must stand, as offset r_i in the payload frame. */
export interface SupportAssignment {
  agentId: number;
  /** r_i = (r_ix, r_iy) relative to payload centre, payload frame (m). */
  r: Vec2;
}

/** Result of one swarm.step. */
export interface SwarmStepOutput {
  time: number;
  commands: AgentCommand[];
  states: AgentState[];
  /** Height spread D = max h − min h (m). */
  heightSpread: number;
  /** Group-ready predicate A_ready (formula 18). */
  groupReady: boolean;
  /** HOLD triggers raised during this step. */
  holdReasons: { agentId: number; reason: string }[];
  /** Edges delivered in the last radio tick (unique, i<j) — for graph visualisation. */
  activeEdges: [number, number][];
}

// ───────────────────────── metrics / logs ─────────────────────────

export interface ConsensusSample { k: number; D: number; mean: number }

/** One row of TALOS_run_log (AGENTS.md §5). */
export interface RunLogRecord {
  run_id: string;
  seed: number;
  controller: ControllerKind;
  N: number;
  p: number;
  epoch: number;
  time: number;
  agent_id: number;
  state: OperationMode;
  command: number;
  E_h?: number;
  E_traj?: number;
  TSR?: number;
  SSR?: number;
}
