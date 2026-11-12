/**
 * Metamorphic Swarm environment (CLAUDE.md §5.3) — imperative Three.js, driven by Engine.
 *
 * Six Strafers: four dock into a 2×2 macro-chassis, two deploy as a bridge across a chasm that cuts
 * the S1 route from the yard to the goal. The simulation is planar and kinematic.
 *
 * Loops (CLAUDE.md §6.1):
 *   step()   — one 10 ms physics tick; runs the 50 Hz control loop every 2nd tick and the 20 Hz
 *              radio exchange every 5th tick.
 *   sync()   — render-rate visual update; reads state only.
 * Neither allocates: all vectors, matrices, colours and typed arrays are created in the constructor.
 * Topology events (mission start, lock, bridge engage, release) do allocate; they are not per-tick.
 */
import * as T from 'three';
import type { GamepadFocus, Pose2D, Twist2D } from '../../contracts/types';
import { CompositeSolver, DOCK_PITCH, WHEELS_PER_CHASSIS } from '../../core/kinematics/compositeSolver';
import { BridgeDeployment } from '../../core/metamorphic/bridgeInfrastructure';
import { DockingController, latchLoadRatio, positionError } from '../../core/metamorphic/docking';
import { findLatchPairs, validateStructure } from '../../core/metamorphic/structure';
import { S1Graph } from '../../core/routing/s1Graph';
import { SwarmOrchestrator, completeTask, decomposeMission } from '../../core/swarm/orchestrator';
import { DRIVE_MOTOR_5203, DRIVE_OMEGA_FREE, FRAME, FRAME_BOTTOM_Z, MECANUM_140 } from '../../robot/straferSpec';
import { STRAFER_GEOMETRY } from '../../robot/TalosRobotAgent';
import { Rng } from '../../swarm/rng';
import type { MacroTelemetrySnapshot } from '../../types/macroEntity';
import { LATCH_STATUS_ORDER, type S1Route } from '../../types/metamorphic';
import type { MissionDag, MissionTask } from '../../types/orchestrator';
import { CONTROL_DT, LoopClock, PHYSICS_DT } from '../engine/loopClock';
import { RingChannel, TelemetryStream, createPacket, type PacketSink } from '../engine/telemetryStream';

const FORM = 4;
const BRIDGE = 2;
const N = FORM + BRIDGE;
const MAX_LATCHES = 4 + (BRIDGE - 1);
const MAX_ROUTE_NODES = 8;

/** S1 node ids. */
const NODE_YARD = 0, NODE_WEST = 1, NODE_EAST = 2, NODE_GOAL = 3, NODE_NORTH_WEST = 4, NODE_NORTH_EAST = 5;
const CHASM_X0 = 1.0;
const CHASM_LENGTH = BRIDGE * DOCK_PITCH.x;
const PAYLOAD_KG = 30;

const M0_EPS = 0.2;
const M0_THRESHOLD = 0.01;
const LOSS_STEPS = [0, 0.1, 0.3] as const;

/** Motor model: torque constant (N·m/A), rolling load share of stall current, battery capacity. */
const KT = DRIVE_MOTOR_5203.stallTorque / DRIVE_MOTOR_5203.stallCurrent;
const ROLLING_LOAD = 0.25;
const BATTERY_AH = 3;

const BODY_HEIGHT = 0.06;
const BODY_Z = FRAME_BOTTOM_Z + BODY_HEIGHT / 2;
const BODY_TOP = FRAME_BOTTOM_Z + BODY_HEIGHT;
const WHEEL_SX = [1, 1, -1, -1] as const;
const WHEEL_SY = [1, -1, 1, -1] as const;

/** Chassis tint per latch status (index = LATCH_STATUS_ORDER), plus the bridge-node tint. */
const STATUS_HEX = [0x8a929a, 0xd29922, 0xe3b341, 0x58a6ff, 0x2ea043] as const;
const BRIDGE_HEX = 0x39c5cf;

const LATCH_VERTEX = /* glsl */ `
attribute float aStress;
varying float vStress;
varying vec3 vNormal;
void main() {
  vStress = aStress;
  vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const LATCH_FRAGMENT = /* glsl */ `
uniform float uTime;
varying float vStress;
varying vec3 vNormal;
vec3 ramp(float s) {
  vec3 green = vec3(0.08, 0.62, 0.20), yellow = vec3(0.90, 0.72, 0.06), red = vec3(0.92, 0.10, 0.08);
  return s < 0.5 ? mix(green, yellow, s * 2.0) : mix(yellow, red, (s - 0.5) * 2.0);
}
void main() {
  float s = clamp(vStress, 0.0, 1.0);
  float light = 0.55 + 0.45 * max(dot(normalize(vNormal), normalize(vec3(0.3, 0.4, 0.85))), 0.0);
  float pulse = 1.0 + 0.35 * step(0.85, s) * sin(uTime * 12.0);
  gl_FragColor = vec4(ramp(s) * light * pulse, 1.0);
}`;

export interface MetamorphicOptions {
  seed?: number;
  /** Radio loss probability; one of 0, 0.1, 0.3. */
  lossP?: number;
  /** Radio transport delay in 20 Hz ticks. */
  delayTicks?: number;
}

export class MetamorphicScene implements PacketSink {
  /** Number of robots: ids 1..4 form the macro-chassis, 5..6 are the bridge reserve. */
  static readonly ROBOTS = N;

  readonly root = new T.Group();
  readonly graph = new S1Graph();
  readonly orchestrator: SwarmOrchestrator;
  readonly clock = new LoopClock();
  readonly macro = new CompositeSolver(STRAFER_GEOMETRY, FORM);
  readonly docks: DockingController[] = [];
  readonly stream = new TelemetryStream(N);
  readonly channel: RingChannel;
  readonly hud: MacroTelemetrySnapshot;
  /** Robot poses [x, y, θ] × N (world frame). Robots 0..3 form the macro-chassis, 4..5 the bridge. */
  readonly pose = new Float64Array(N * 3);
  readonly macroPose: Pose2D = { x: 0, y: 0, theta: 0 };
  /** Latch load ratios, [0, 1]; also the instanced `aStress` attribute. */
  readonly stress = new Float32Array(MAX_LATCHES);
  readonly events: string[] = [];
  /** Optional journal sink: receives every logged line (without the time prefix). */
  onLog: ((line: string) => void) | null = null;
  dag: MissionDag | null = null;
  bridge: BridgeDeployment | null = null;
  route: S1Route = { status: 'UNREACHABLE', cost: Infinity };
  macroFormed = false;

  // ── simulation state ──
  private readonly solo = new CompositeSolver(STRAFER_GEOMETRY, 1);
  private readonly rng: Rng;
  private readonly ports: Pose2D[] = [];
  private readonly bodyTwist = new Float64Array(N * 3);
  private readonly wheelRate = new Float64Array(N * WHEELS_PER_CHASSIS);
  private readonly battery = new Float64Array(N).fill(1);
  private readonly seq = new Uint32Array(N);
  private readonly macroTwist: Twist2D = { vx: 0, vy: 0, omega: 0 };
  private readonly fightSeed = new Float64Array(FORM * WHEELS_PER_CHASSIS);
  private readonly linkMask = new Uint8Array(FORM * WHEELS_PER_CHASSIS);
  private readonly latchPairs = new Uint8Array(FORM * (FORM - 1) + 2);
  private readonly bridgeRobots = new Int8Array(BRIDGE).fill(-1);
  private readonly mover: Pose2D = { x: 0, y: 0, theta: 0 };
  private readonly packet = createPacket();
  private latchCount = 0;
  private bridgeCount = 0;
  private fightMean = 0;
  private soloSaturation = 1;
  private anchorTheta = 0;
  private graphVersion = -1;
  private routeDirty = true;

  // ── visuals ──
  private readonly chassisMesh: T.InstancedMesh;
  private readonly wheelMesh: T.InstancedMesh;
  private readonly latchMesh: T.InstancedMesh;
  private readonly latchMaterial: T.ShaderMaterial;
  private readonly stressAttr: T.InstancedBufferAttribute;
  private readonly edgeLines: T.LineSegments;
  private readonly routeLine: T.Line;
  private readonly statusColors: T.Color[] = STATUS_HEX.map(hex => new T.Color(hex));
  private readonly bridgeColor = new T.Color(BRIDGE_HEX);
  private readonly scratchColor = new T.Color();
  private readonly scratchMatrix = new T.Matrix4();
  private readonly scratchPos = new T.Vector3();
  private readonly scratchQuat = new T.Quaternion();
  private readonly scratchScale = new T.Vector3(1, 1, 1);
  private readonly unitScale = new T.Vector3(1, 1, 1);
  private readonly zAxis = new T.Vector3(0, 0, 1);
  private visualVersion = -1;

  constructor(options: MetamorphicOptions = {}) {
    this.rng = new Rng(options.seed ?? 0);
    this.channel = new RingChannel(N, options.lossP ?? 0.1, options.delayTicks ?? 1, this.rng.fork());

    // S1 graph: the direct route crosses a chasm, the detour is blocked by debris.
    const g = this.graph, x1 = CHASM_X0 + CHASM_LENGTH;
    g.addNode(NODE_YARD, -3, 0); g.addNode(NODE_WEST, CHASM_X0, 0); g.addNode(NODE_EAST, x1, 0);
    g.addNode(NODE_GOAL, x1 + 3, 0); g.addNode(NODE_NORTH_WEST, CHASM_X0, 3); g.addNode(NODE_NORTH_EAST, x1, 3);
    g.addEdge(NODE_YARD, NODE_WEST);
    g.addEdge(NODE_WEST, NODE_EAST, { status: 'CLOSED', reason: 'CHASM' });
    g.addEdge(NODE_EAST, NODE_GOAL);
    g.addEdge(NODE_WEST, NODE_NORTH_WEST);
    g.addEdge(NODE_NORTH_WEST, NODE_NORTH_EAST, { status: 'CLOSED', reason: 'BLOCKED' });
    g.addEdge(NODE_NORTH_EAST, NODE_EAST);

    this.orchestrator = new SwarmOrchestrator(g, Array.from({ length: N }, (_, i) => ({
      id: i + 1, role: i < FORM ? 'WORKER' as const : 'RESERVE' as const,
    })));

    this.macro.setFormation('2x2');
    for (let i = 0; i < N; i++) {
      this.docks.push(new DockingController());
      this.ports.push({ x: 0, y: 0, theta: 0 });
    }
    this.resetPoses();

    this.hud = {
      formation: '2x2', locked: false, lockedCount: 0, required: FORM,
      dockStatus: Array.from({ length: N }, () => 'DISCONNECTED' as const),
      totalCurrent: 0, chassisPower: new Float64Array(N), residual: 0, consensusSteps: 0, saturation: 1,
      peakStress: 0, routeStatus: 'UNREACHABLE', routeCost: Infinity, bridgeStatus: 'IDLE',
      quorumStatus: 'STABLE', epoch: 1, lossP: this.channel.lossP, delivery: 1, focus: 'macro',
    };

    // ── static environment ──
    const yard = g.node(NODE_YARD), goal = g.node(NODE_GOAL), midX = (yard.x + goal.x) / 2;
    const floor = new T.Mesh(new T.PlaneGeometry(goal.x - yard.x + 6, 10), new T.MeshStandardMaterial({ color: 0x686b6a, roughness: 0.9 }));
    floor.position.set(midX, 1, 0);
    floor.receiveShadow = true;
    const chasm = new T.Mesh(new T.BoxGeometry(CHASM_LENGTH, 10, 0.012), new T.MeshStandardMaterial({ color: 0x14171a, roughness: 1 }));
    chasm.position.set(CHASM_X0 + CHASM_LENGTH / 2, 1, 0.006);
    const debris = new T.Mesh(new T.BoxGeometry(0.5, 0.7, 0.35), new T.MeshStandardMaterial({ color: 0xa4937f, roughness: 0.8 }));
    debris.position.set(CHASM_X0 + CHASM_LENGTH / 2, 3, 0.175);
    debris.castShadow = true;
    this.root.add(floor, chasm, debris);

    const nodeGeometry = new T.CylinderGeometry(0.07, 0.07, 0.01, 20).rotateX(Math.PI / 2);
    const nodeMaterial = new T.MeshBasicMaterial({ color: 0xc9d1d9 });
    for (const n of g.nodes) {
      const marker = new T.Mesh(nodeGeometry, nodeMaterial);
      marker.position.set(n.x, n.y, 0.02);
      this.root.add(marker);
    }

    const edgeGeometry = new T.BufferGeometry(), edgeCount = g.edges.length;
    const edgePos = new Float32Array(edgeCount * 6);
    g.edges.forEach((e, i) => {
      const a = g.node(e.a), b = g.node(e.b);
      edgePos.set([a.x, a.y, 0.018, b.x, b.y, 0.018], i * 6);
    });
    edgeGeometry.setAttribute('position', new T.BufferAttribute(edgePos, 3));
    edgeGeometry.setAttribute('color', new T.BufferAttribute(new Float32Array(edgeCount * 6), 3));
    this.edgeLines = new T.LineSegments(edgeGeometry, new T.LineBasicMaterial({ vertexColors: true }));

    const routeGeometry = new T.BufferGeometry();
    routeGeometry.setAttribute('position', new T.BufferAttribute(new Float32Array(MAX_ROUTE_NODES * 3), 3));
    routeGeometry.setDrawRange(0, 0);
    this.routeLine = new T.Line(routeGeometry, new T.LineBasicMaterial({ color: 0x2ea043 }));
    this.routeLine.frustumCulled = false;
    this.root.add(this.edgeLines, this.routeLine);

    // ── instanced robots ──
    this.chassisMesh = new T.InstancedMesh(
      new T.BoxGeometry(FRAME.length, FRAME.width, BODY_HEIGHT),
      new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.35 }), N,
    );
    this.wheelMesh = new T.InstancedMesh(
      new T.CylinderGeometry(MECANUM_140.r, MECANUM_140.r, MECANUM_140.width, 18),
      new T.MeshStandardMaterial({ color: 0x24282d, roughness: 0.8 }), N * WHEELS_PER_CHASSIS,
    );
    for (const mesh of [this.chassisMesh, this.wheelMesh]) {
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    }
    for (let i = 0; i < N; i++) this.chassisMesh.setColorAt(i, this.statusColors[0]);
    this.chassisMesh.instanceColor!.setUsage(T.DynamicDrawUsage);

    // Latches: unit box standing on z = 0; stress drives both the colour and the bar height.
    const latchGeometry = new T.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    this.stressAttr = new T.InstancedBufferAttribute(this.stress, 1);
    this.stressAttr.setUsage(T.DynamicDrawUsage);
    latchGeometry.setAttribute('aStress', this.stressAttr);
    this.latchMaterial = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, vertexShader: LATCH_VERTEX, fragmentShader: LATCH_FRAGMENT,
    });
    this.latchMesh = new T.InstancedMesh(latchGeometry, this.latchMaterial, MAX_LATCHES);
    this.latchMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.latchMesh.frustumCulled = false;
    this.latchMesh.count = 0;
    this.root.add(this.chassisMesh, this.wheelMesh, this.latchMesh);

    this.refreshRoute();
    this.sync(0);
  }

  // ───────────────────────── operator commands ─────────────────────────

  /**
   * Start (or restart) the mission: decompose it, allocate a bridge squad if the route is cut, and
   * engage every docking controller. Ignored while a mission is still docked or docking.
   */
  assemble(): void {
    const t = this.clock.time;
    if (this.dag && this.docks.some(d => d.status !== 'DISCONNECTED')) return;
    this.dag = decomposeMission({ type: 'MACRO_TRANSPORT', from: NODE_YARD, to: NODE_GOAL, formation: '2x2', payloadKg: PAYLOAD_KG }, this.graph);
    this.finishTask('ROUTE_CHECK');

    // Formation ports: the 2×2 grid around the current centroid of the four workers.
    let cx = 0, cy = 0;
    for (let i = 0; i < FORM; i++) { cx += this.pose[i * 3]; cy += this.pose[i * 3 + 1]; }
    cx /= FORM; cy /= FORM;
    this.macro.setFormation('2x2');
    const c = Math.cos(this.anchorTheta), s = Math.sin(this.anchorTheta);
    for (let i = 0; i < FORM; i++) {
      const ox = this.macro.chassis[i * 3] - this.macro.centroid.x, oy = this.macro.chassis[i * 3 + 1] - this.macro.centroid.y;
      const port = this.ports[i];
      port.x = cx + c * ox - s * oy; port.y = cy + s * ox + c * oy; port.theta = this.anchorTheta;
      this.docks[i].engage(t);
    }

    const plan = this.orchestrator.allocateBridge(NODE_YARD, NODE_GOAL, t, FORM);
    this.bridgeCount = 0;
    if (plan.status === 'PLANNED') {
      this.bridge = new BridgeDeployment(this.graph, plan);
      this.bridge.begin();
      this.bridgeCount = Math.min(BRIDGE, plan.agentIds.length);
      for (let k = 0; k < this.bridgeCount; k++) {
        const robot = plan.agentIds[k] - 1, port = this.ports[robot], slot = plan.slots[k];
        this.bridgeRobots[k] = robot;
        port.x = slot.x; port.y = slot.y; port.theta = slot.theta;
        this.docks[robot].engage(t);
      }
      this.log(`bridge squad ${plan.agentIds.map(id => `#${id}`).join(' ')} → edge ${plan.edgeId} (${plan.gapLength.toFixed(2)} m)`);
    } else {
      this.log(`bridge: ${plan.status}`);
    }
    this.log('mission start: 2×2 macro-chassis, yard → goal');
  }

  /** Emergency release: open every latch, withdraw the bridge, stop. */
  release(): void {
    const t = this.clock.time;
    for (let i = 0; i < N; i++) this.docks[i].release(t);
    if (this.bridge) {
      this.bridge.release();
      this.orchestrator.releaseStructure(this.bridge.agentIds);
    }
    if (this.macroFormed) this.anchorTheta = this.macroPose.theta;
    this.macroFormed = false;
    this.latchCount = 0;
    this.stress.fill(0);
    this.macroTwist.vx = 0; this.macroTwist.vy = 0; this.macroTwist.omega = 0;
    this.bodyTwist.fill(0);
    this.wheelRate.fill(0);
    this.log('release: latches open, bridge withdrawn');
  }

  /** Cycle the radio loss probability through 0 → 0.1 → 0.3. */
  cycleLoss(): number {
    const i = LOSS_STEPS.findIndex(p => Math.abs(p - this.channel.lossP) < 1e-9);
    this.channel.lossP = LOSS_STEPS[(i + 1) % LOSS_STEPS.length];
    this.log(`radio loss p = ${this.channel.lossP}`);
    return this.channel.lossP;
  }

  /** Inject a fresh roller-slip disturbance into the locked cluster (restarts torque balancing). */
  injectSlip(): void {
    if (!this.macroFormed) return;
    this.seedFight();
    this.log('roller slip injected: torque balancing restarted');
  }

  /** Camera focus point for the current control focus. */
  focusTarget(focus: GamepadFocus, out: T.Vector3): void {
    if (focus.kind === 'agent' && focus.agentId >= 1 && focus.agentId <= N) {
      const o = (focus.agentId - 1) * 3;
      out.set(this.pose[o], this.pose[o + 1], 0.2);
      return;
    }
    let x = 0, y = 0;
    for (let i = 0; i < FORM; i++) { x += this.pose[i * 3]; y += this.pose[i * 3 + 1]; }
    out.set(x / FORM, y / FORM, 0.2);
  }

  // ───────────────────────── fixed-step simulation ─────────────────────────

  /**
   * One 10 ms physics tick. (vx, vy, omega) is the operator command: a body twist for agent focus,
   * a world-frame velocity plus yaw rate for swarm (macro) focus.
   */
  step(vx: number, vy: number, omega: number, focus: GamepadFocus): void {
    if (this.clock.controlDue) this.control(vx, vy, omega, focus);
    this.integrate();
    if (this.clock.radioDue) this.radio();
    this.hud.focus = focus.kind === 'agent' ? 'solo' : 'macro';
    this.clock.advance();
  }

  /** 50 Hz: docking automata, command arbitration, inverse kinematics, telemetry sampling. */
  private control(vx: number, vy: number, omega: number, focus: GamepadFocus): void {
    const t = this.clock.time, mover = this.mover;
    let ready = 0, peakSolo = 1;
    for (let i = 0; i < N; i++) {
      const o = i * 3, dock = this.docks[i];
      mover.x = this.pose[o]; mover.y = this.pose[o + 1]; mover.theta = this.pose[o + 2];
      const status = dock.update(mover, this.ports[i], t, CONTROL_DT);
      if (i < FORM && status === 'LATCHED' && dock.lockReady) ready++;
      if (i < FORM && this.macroFormed) continue; // driven by the macro solver below

      let cx = 0, cy = 0, cw = 0;
      if (status === 'APPROACHING' || status === 'ALIGNING') {
        cx = dock.command.vx; cy = dock.command.vy; cw = dock.command.omega;
      } else if (status === 'DISCONNECTED' && focus.kind === 'agent' && focus.agentId === i + 1) {
        cx = vx; cy = vy; cw = omega;
      }
      const s = this.solo.solveIK(cx, cy, cw);
      if (s > peakSolo) peakSolo = s;
      const twist = this.solo.solveFK();
      this.bodyTwist[o] = twist.vx; this.bodyTwist[o + 1] = twist.vy; this.bodyTwist[o + 2] = twist.omega;
      for (let j = 0; j < WHEELS_PER_CHASSIS; j++) this.wheelRate[i * WHEELS_PER_CHASSIS + j] = this.solo.rates[j];
    }
    this.soloSaturation = peakSolo;

    if (!this.macroFormed && ready === FORM) this.lockMacro(t);

    if (this.macroFormed) {
      let mx = 0, my = 0, mw = 0;
      if (focus.kind === 'swarm') {
        const c = Math.cos(this.macroPose.theta), s = Math.sin(this.macroPose.theta);
        mx = c * vx + s * vy; my = -s * vx + c * vy; mw = omega;
      }
      this.macro.solveIK(mx, my, mw);
      this.macro.solveFK(this.macro.rates, this.macroTwist);
      const wheels = FORM * WHEELS_PER_CHASSIS;
      for (let k = 0; k < wheels; k++) this.wheelRate[k] = this.macro.rates[k];
      const goal = this.graph.node(NODE_GOAL);
      if (Math.hypot(this.macroPose.x - goal.x, this.macroPose.y - goal.y) < 0.3) this.finishTask('TRANSPORT');
    }

    const bridge = this.bridge;
    if (bridge && bridge.status === 'DEPLOYING') {
      let seated = 0;
      for (let k = 0; k < this.bridgeCount; k++) {
        const robot = this.bridgeRobots[k], dock = this.docks[robot], o = robot * 3;
        bridge.reportSlot(k, positionError(dock.error), dock.error.theta, Math.hypot(this.bodyTwist[o], this.bodyTwist[o + 1]));
        if (dock.status === 'LATCHED' && dock.lockReady) seated++;
      }
      if (seated === this.bridgeCount && bridge.tryEngage()) {
        for (let k = 0; k < this.bridgeCount; k++) this.docks[this.bridgeRobots[k]].confirmLock(t);
        this.finishTask('DEPLOY_BRIDGE');
        this.log(`bridge holding: brakes engaged, PASSABLE_STRUCTURE ≤ ${bridge.maxLoadKg} kg`);
      }
    }

    this.sample(t);
  }

  /** All four workers are latched: validate the cluster, then lock it into one rigid body. */
  private lockMacro(t: number): void {
    let cx = 0, cy = 0;
    for (let i = 0; i < FORM; i++) { cx += this.pose[i * 3]; cy += this.pose[i * 3 + 1]; }
    cx /= FORM; cy /= FORM;
    const theta = this.pose[2], c = Math.cos(theta), s = Math.sin(theta);
    this.macro.setCount(FORM);
    for (let i = 0; i < FORM; i++) {
      const dx = this.pose[i * 3] - cx, dy = this.pose[i * 3 + 1] - cy;
      this.macro.setChassis(i, c * dx + s * dy, -s * dx + c * dy, this.pose[i * 3 + 2] - theta);
    }
    this.macro.rebuild();
    const verdict = validateStructure(this.macro);
    if (verdict.status === 'INVALID') {
      for (let i = 0; i < FORM; i++) this.docks[i].fault(t, 'validation-failed');
      this.log(`lock rejected: ${verdict.reason}`);
      return;
    }
    for (let i = 0; i < FORM; i++) this.docks[i].confirmLock(t);
    this.macroPose.x = cx; this.macroPose.y = cy; this.macroPose.theta = theta;
    this.macroFormed = true;
    this.latchCount = findLatchPairs(this.macro, this.latchPairs);
    this.seedFight();
    this.finishTask('FORM_MACRO');
    this.log(`STRUCTURAL_LOCK: 2×2 macro-chassis, ${verdict.latches} latches, 16 wheels`);
  }

  /**
   * Roller-slip disturbance: adjacent chassis push against each other (checkerboard bias) plus
   * per-wheel noise. This is the initial state of the M0 torque-balancing consensus.
   */
  private seedFight(): void {
    for (let i = 0; i < FORM; i++) {
      const sign = ((i >> 1) + (i & 1)) % 2 === 0 ? 1 : -1, bias = sign * this.rng.uniform(3.2, 4.0);
      for (let j = 0; j < WHEELS_PER_CHASSIS; j++) this.fightSeed[i * WHEELS_PER_CHASSIS + j] = bias + this.rng.uniform(-1, 1);
    }
    this.macro.loadCurrents(this.fightSeed);
    let sum = 0;
    for (let k = 0; k < this.fightSeed.length; k++) sum += this.fightSeed[k];
    this.fightMean = sum / this.fightSeed.length;
  }

  /** 100 Hz: integrate poses (midpoint heading). Locked workers follow the macro body rigidly. */
  private integrate(): void {
    const dt = PHYSICS_DT;
    if (this.macroFormed) {
      const m = this.macroPose, tw = this.macroTwist, mid = m.theta + 0.5 * tw.omega * dt;
      const c = Math.cos(mid), s = Math.sin(mid);
      m.x += (c * tw.vx - s * tw.vy) * dt;
      m.y += (s * tw.vx + c * tw.vy) * dt;
      m.theta += tw.omega * dt;
      const ct = Math.cos(m.theta), st = Math.sin(m.theta), ch = this.macro.chassis, cen = this.macro.centroid;
      for (let i = 0; i < FORM; i++) {
        const ox = ch[i * 3] - cen.x, oy = ch[i * 3 + 1] - cen.y;
        this.pose[i * 3] = m.x + ct * ox - st * oy;
        this.pose[i * 3 + 1] = m.y + st * ox + ct * oy;
        this.pose[i * 3 + 2] = m.theta + ch[i * 3 + 2];
      }
    }
    for (let i = this.macroFormed ? FORM : 0; i < N; i++) {
      const o = i * 3, w = this.bodyTwist[o + 2], mid = this.pose[o + 2] + 0.5 * w * dt;
      const c = Math.cos(mid), s = Math.sin(mid);
      this.pose[o] += (c * this.bodyTwist[o] - s * this.bodyTwist[o + 1]) * dt;
      this.pose[o + 1] += (s * this.bodyTwist[o] + c * this.bodyTwist[o + 1]) * dt;
      this.pose[o + 2] += w * dt;
    }
  }

  /** 50 Hz edge tier: motor currents, battery, one telemetry packet per robot. */
  private sample(t: number): void {
    const p = this.packet, span = DRIVE_MOTOR_5203.stallCurrent - DRIVE_MOTOR_5203.freeCurrent;
    let total = 0;
    for (let i = 0; i < N; i++) {
      const o = i * 3, locked = i < FORM && this.macroFormed;
      let sum = 0;
      for (let j = 0; j < WHEELS_PER_CHASSIS; j++) {
        const k = i * WHEELS_PER_CHASSIS + j, w = this.wheelRate[k];
        let amps = DRIVE_MOTOR_5203.freeCurrent + ROLLING_LOAD * span * ((w < 0 ? -w : w) / DRIVE_OMEGA_FREE);
        if (locked) {
          const fight = this.macro.current[k] - this.fightMean;
          amps += fight < 0 ? -fight : fight;
        }
        p.current[j] = amps;
        sum += amps;
      }
      total += sum;
      this.hud.chassisPower[i] = DRIVE_MOTOR_5203.voltage * sum;
      this.battery[i] = Math.max(0, this.battery[i] - (sum * CONTROL_DT) / (BATTERY_AH * 3600));

      p.agentId = i + 1;
      p.latch = LATCH_STATUS_ORDER.indexOf(this.docks[i].status);
      p.seq = ++this.seq[i];
      p.time = t;
      p.x = this.pose[o]; p.y = this.pose[o + 1]; p.theta = this.pose[o + 2];
      if (locked) { p.vx = this.macroTwist.vx; p.vy = this.macroTwist.vy; p.omega = this.macroTwist.omega; }
      else { p.vx = this.bodyTwist[o]; p.vy = this.bodyTwist[o + 1]; p.omega = this.bodyTwist[o + 2]; }
      p.battery = this.battery[i];
      this.stream.ingest(i, p);
    }
    this.hud.totalCurrent = total;
  }

  /** 20 Hz: ring radio exchange, one M0 balancing step, latch stress, strategic oversight. */
  private radio(): void {
    const tick = this.clock.radioTick, t = this.clock.time, hud = this.hud;
    for (let i = 0; i < N; i++) {
      if (this.stream.count[i] > 0) this.channel.broadcast(tick, i, this.stream.view, this.stream.offsetOf(i));
      this.orchestrator.observe(i + 1, this.battery[i], true);
    }
    this.channel.deliver(tick, this);
    this.orchestrator.tick(t);

    let peak = 0;
    if (this.macroFormed) {
      const wheels = FORM * WHEELS_PER_CHASSIS;
      if (this.macro.residual > M0_THRESHOLD) {
        // The consensus messages ride the same lossy links: one draw per motor-ring edge.
        for (let e = 0; e < wheels; e++) this.linkMask[e] = this.rng.bernoulli(this.channel.lossP) ? 0 : 1;
        this.macro.balanceStep(M0_EPS, this.linkMask);
      }
      for (let n = 0; n < this.latchCount; n++) {
        const a = this.latchPairs[n * 2] * WHEELS_PER_CHASSIS, b = this.latchPairs[n * 2 + 1] * WHEELS_PER_CHASSIS;
        let diff = 0;
        for (let j = 0; j < WHEELS_PER_CHASSIS; j++) diff += this.macro.current[a + j] - this.macro.current[b + j];
        const ratio = latchLoadRatio((KT * diff) / STRAFER_GEOMETRY.r, 0);
        this.stress[n] = ratio;
        if (ratio > peak) peak = ratio;
      }
    }
    // Bridge latch: holding load, higher while the macro-chassis is on the span.
    const bridge = this.bridge;
    if (bridge && bridge.status === 'HOLDING' && this.bridgeCount > 1) {
      const onSpan = this.macroFormed && this.macroPose.x > CHASM_X0 - 0.3 && this.macroPose.x < CHASM_X0 + CHASM_LENGTH + 0.3
        && Math.abs(this.macroPose.y) < 0.6;
      const ratio = onSpan ? 0.1 + 0.65 * (PAYLOAD_KG / bridge.maxLoadKg) : 0.1;
      this.stress[this.latchCount] = ratio;
      if (ratio > peak) peak = ratio;
    }

    if (this.graph.version !== this.graphVersion) this.refreshRoute();

    let lockedCount = 0;
    for (let i = 0; i < N; i++) {
      const status = this.docks[i].status;
      hud.dockStatus[i] = status;
      if (i < FORM && status === 'STRUCTURAL_LOCK') lockedCount++;
    }
    hud.lockedCount = lockedCount;
    hud.locked = this.macroFormed;
    hud.residual = this.macroFormed ? this.macro.residual : 0;
    hud.consensusSteps = this.macroFormed ? this.macro.balanceSteps : 0;
    hud.saturation = this.macroFormed && this.macro.saturation > this.soloSaturation ? this.macro.saturation : this.soloSaturation;
    hud.peakStress = peak;
    hud.bridgeStatus = bridge ? bridge.status : 'IDLE';
    hud.quorumStatus = this.orchestrator.quorum.status;
    hud.epoch = this.orchestrator.epoch;
    hud.lossP = this.channel.lossP;
    hud.delivery = this.channel.deliveryRatio;
  }

  /** PacketSink: neighbour telemetry arrives here. Delivery statistics live on the channel. */
  onPacket(_to: number, _from: number, _view: DataView, _offset: number): void {
    // Nothing to do per packet: this scene only needs the delivery ratio.
  }

  /** Topology changed: replan the mission route (event rate). */
  private refreshRoute(): void {
    this.graphVersion = this.graph.version;
    this.route = this.graph.shortestPath(NODE_YARD, NODE_GOAL, { algorithm: 'astar', payloadKg: PAYLOAD_KG });
    this.hud.routeStatus = this.route.status;
    this.hud.routeCost = this.route.cost;
    this.routeDirty = true;
  }

  private finishTask(type: MissionTask['type']): void {
    const dag = this.dag;
    if (!dag) return;
    for (let i = 0; i < dag.tasks.length; i++) {
      const task = dag.tasks[i];
      if (task.type === type) {
        if (task.status !== 'DONE') completeTask(dag, task.id);
        return;
      }
    }
  }

  private log(line: string): void {
    this.events.push(`${this.clock.time.toFixed(1)} ${line}`);
    if (this.events.length > 8) this.events.shift();
    this.onLog?.(line);
  }

  private resetPoses(): void {
    const yard = this.graph.node(NODE_YARD);
    for (let i = 0; i < FORM; i++) {
      const ox = this.macro.chassis[i * 3] - this.macro.centroid.x, oy = this.macro.chassis[i * 3 + 1] - this.macro.centroid.y;
      const k = 1 + 0.9 / Math.hypot(ox, oy);
      this.pose[i * 3] = yard.x + ox * k;
      this.pose[i * 3 + 1] = yard.y + oy * k;
      this.pose[i * 3 + 2] = (i % 2 === 0 ? 1 : -1) * 0.35;
    }
    // Reserves wait on either side of the route, level with the chasm.
    for (let k = 0; k < BRIDGE; k++) {
      const o = (FORM + k) * 3, side = k % 2 === 0 ? -1 : 1;
      this.pose[o] = CHASM_X0 + (k + 0.5) * DOCK_PITCH.x;
      this.pose[o + 1] = side * 1.6;
      this.pose[o + 2] = -side * 0.4;
    }
  }

  // ───────────────────────── render-rate visuals ─────────────────────────

  /** Push the simulation state into the instanced meshes. `time` is seconds, for the stress pulse. */
  sync(time: number): void {
    const m = this.scratchMatrix, pos = this.scratchPos, q = this.scratchQuat, a = STRAFER_GEOMETRY.a, b = STRAFER_GEOMETRY.b;
    for (let i = 0; i < N; i++) {
      const o = i * 3, x = this.pose[o], y = this.pose[o + 1], th = this.pose[o + 2];
      const c = Math.cos(th), s = Math.sin(th);
      q.setFromAxisAngle(this.zAxis, th);
      pos.set(x, y, BODY_Z);
      m.compose(pos, q, this.unitScale);
      this.chassisMesh.setMatrixAt(i, m);
      const status = this.docks[i].status;
      const color = i >= FORM && status === 'STRUCTURAL_LOCK' ? this.bridgeColor : this.statusColors[LATCH_STATUS_ORDER.indexOf(status)];
      this.chassisMesh.setColorAt(i, color);
      for (let j = 0; j < WHEELS_PER_CHASSIS; j++) {
        const lx = WHEEL_SX[j] * a, ly = WHEEL_SY[j] * b;
        pos.set(x + c * lx - s * ly, y + s * lx + c * ly, MECANUM_140.r);
        m.compose(pos, q, this.unitScale);
        this.wheelMesh.setMatrixAt(i * WHEELS_PER_CHASSIS + j, m);
      }
    }
    this.chassisMesh.instanceMatrix.needsUpdate = true;
    this.chassisMesh.instanceColor!.needsUpdate = true;
    this.wheelMesh.instanceMatrix.needsUpdate = true;

    let latches = 0;
    if (this.macroFormed) {
      for (let n = 0; n < this.latchCount; n++) this.placeLatch(latches++, this.latchPairs[n * 2], this.latchPairs[n * 2 + 1]);
    }
    if (this.bridge && this.bridge.status === 'HOLDING' && this.bridgeCount > 1) {
      this.placeLatch(latches++, this.bridgeRobots[0], this.bridgeRobots[1]);
    }
    this.latchMesh.count = latches;
    this.latchMesh.instanceMatrix.needsUpdate = true;
    this.stressAttr.needsUpdate = true;
    this.latchMaterial.uniforms.uTime.value = time;

    if (this.visualVersion !== this.graph.version || this.routeDirty) this.refreshGraphVisuals();
  }

  /** Latch `slot` between robots a and b: a bar across the joint whose height is the stress vector. */
  private placeLatch(slot: number, a: number, b: number): void {
    const ax = this.pose[a * 3], ay = this.pose[a * 3 + 1], bx = this.pose[b * 3], by = this.pose[b * 3 + 1];
    this.scratchQuat.setFromAxisAngle(this.zAxis, Math.atan2(by - ay, bx - ax));
    this.scratchPos.set((ax + bx) / 2, (ay + by) / 2, BODY_TOP);
    this.scratchScale.set(0.14, 0.1, 0.02 + 0.2 * this.stress[slot]);
    this.scratchMatrix.compose(this.scratchPos, this.scratchQuat, this.scratchScale);
    this.latchMesh.setMatrixAt(slot, this.scratchMatrix);
  }

  /** Recolour the S1 edges and redraw the route. Runs only when the topology changed. */
  private refreshGraphVisuals(): void {
    this.visualVersion = this.graph.version;
    this.routeDirty = false;
    const colors = this.edgeLines.geometry.getAttribute('color') as T.BufferAttribute, c = this.scratchColor;
    this.graph.edges.forEach((e, i) => {
      const state = e.state;
      c.setHex(state.status === 'OPEN' ? 0x9aa4ad : state.status === 'PASSABLE_STRUCTURE' ? BRIDGE_HEX : state.reason === 'CHASM' ? 0xda3633 : 0xb0651d);
      colors.setXYZ(i * 2, c.r, c.g, c.b);
      colors.setXYZ(i * 2 + 1, c.r, c.g, c.b);
    });
    colors.needsUpdate = true;

    const positions = this.routeLine.geometry.getAttribute('position') as T.BufferAttribute;
    let count = 0;
    if (this.route.status === 'FOUND') {
      for (const id of this.route.nodes) {
        if (count >= MAX_ROUTE_NODES) break;
        const n = this.graph.node(id);
        positions.setXYZ(count++, n.x, n.y, 0.03);
      }
    }
    positions.needsUpdate = true;
    this.routeLine.geometry.setDrawRange(0, count);
  }
}
