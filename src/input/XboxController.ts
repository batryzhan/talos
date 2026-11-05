/**
 * Xbox 360 controller driver over the Web Gamepad API (CLAUDE.md v2 §3).
 *
 *  - polling via navigator.getGamepads() (injectable for tests), W3C "standard" mapping
 *  - radial deadzone 0.12 on sticks, scalar deadzone on triggers, smooth response curve
 *    out = (1 − k)·n + k·n³  (n = magnitude rescaled past the deadzone → continuous at the edge)
 *  - edge-detected button actions (A lift, B emergency HOLD, X controller A/B/C, Y camera,
 *    LB/RB focus robot #1..#N / swarm team, D-pad power & scenario, START pause, BACK reset)
 *  - dual-rumble feedback for contact (δ_i > 0) and HOLD
 *  - observable snapshot (GamepadTelemetry) for React via subscribe / getSnapshot
 */
import type {
  CameraMode, ControllerKind, GamepadAction, GamepadCommand, GamepadFocus, GamepadTelemetry,
  ScenarioId, Vec2, XboxButton,
} from '../contracts/types';

/** W3C standard-mapping indices (Xbox 360 labels). */
export const XBOX_BUTTON_INDEX: Readonly<Record<XboxButton, number>> = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11,
  DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15, GUIDE: 16,
};
export const XBOX_AXIS = { LX: 0, LY: 1, RX: 2, RY: 3 } as const;

export const POWER_STEPS = [0.25, 0.5, 0.75, 1] as const;
export const CONTROLLER_CYCLE: readonly ControllerKind[] = ['A', 'B', 'C'];
export const CAMERA_CYCLE: readonly CameraMode[] = ['orbit', 'follow', 'centroid', 'topdown'];
export const SCENARIO_CYCLE: readonly ScenarioId[] = ['construction', 'factory', 'lab'];

/** Minimal structural view of the Gamepad API objects (lets tests pass plain objects). */
export interface PadButtonLike { pressed: boolean; value: number }
export interface HapticLike {
  playEffect(type: 'dual-rumble', params: { startDelay?: number; duration: number; weakMagnitude: number; strongMagnitude: number }): Promise<unknown>;
}
export interface PadLike {
  id: string;
  index: number;
  connected: boolean;
  mapping: string;
  axes: readonly number[];
  buttons: readonly PadButtonLike[];
  timestamp?: number;
  vibrationActuator?: HapticLike | null;
}

export interface XboxControllerOptions {
  deadzone?: number;
  /** Cubic share of the response curve: 0 = linear, 1 = pure cubic. */
  expo?: number;
  /** Full-stick limits for one robot (before the power limit). */
  maxSpeed?: number;      // m/s
  maxTurn?: number;       // rad/s
  maxLiftRate?: number;   // m/s
  /** Virtual-platform limits for a whole team (formula 16). */
  swarmMaxSpeed?: number;
  swarmMaxTurn?: number;
  agentIds?: number[];
  teamIds?: string[];
  getGamepads?: () => readonly (PadLike | null)[];
  now?: () => number;
}

type Tunables = Required<Omit<XboxControllerOptions, 'getGamepads' | 'now' | 'agentIds' | 'teamIds'>>;

const ZERO2: Vec2 = { x: 0, y: 0 };

/** Radial deadzone + smooth response. Returns the shaped vector (|v| ≤ 1). */
export function shapeStick(x: number, y: number, deadzone: number, expo: number): Vec2 {
  const mag = Math.hypot(x, y);
  if (!(mag > deadzone)) return { x: 0, y: 0 };
  const n = Math.min(1, (mag - deadzone) / (1 - deadzone));
  const curved = (1 - expo) * n + expo * n * n * n;
  return { x: (x / mag) * curved, y: (y / mag) * curved };
}

/** Scalar deadzone + the same response curve for triggers, [0, 1]. */
export function shapeTrigger(v: number, deadzone: number, expo: number): number {
  if (!(v > deadzone)) return 0;
  const n = Math.min(1, (v - deadzone) / (1 - deadzone));
  return (1 - expo) * n + expo * n * n * n;
}

export class XboxController {
  readonly opts: Tunables;
  private readonly getPads: () => readonly (PadLike | null)[];
  private readonly now: () => number;
  private agentIds: number[];
  private teamIds: string[];
  private prevPressed = new Set<XboxButton>();
  private pad: PadLike | null = null;
  private snapshot: GamepadTelemetry;
  private readonly listeners = new Set<() => void>();
  private readonly commandListeners = new Set<(cmd: GamepadCommand) => void>();
  private rafId: number | null = null;
  private pollUsers = 0;
  private cameraYaw = 0;
  private lastCommand: GamepadCommand;

  constructor(options: XboxControllerOptions = {}) {
    this.opts = {
      deadzone: options.deadzone ?? 0.12,
      expo: options.expo ?? 0.6,
      maxSpeed: options.maxSpeed ?? 1.2,
      maxTurn: options.maxTurn ?? 2.5,
      maxLiftRate: options.maxLiftRate ?? 0.08,
      swarmMaxSpeed: options.swarmMaxSpeed ?? 0.25,
      swarmMaxTurn: options.swarmMaxTurn ?? 0.35,
    };
    this.getPads = options.getGamepads
      ?? (() => (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? (navigator.getGamepads() as unknown as (PadLike | null)[]) : []));
    this.now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.agentIds = [...(options.agentIds ?? [1])];
    this.teamIds = [...(options.teamIds ?? [])];
    const focus: GamepadFocus = this.agentIds.length
      ? { kind: 'agent', agentId: this.agentIds[0] }
      : { kind: 'swarm', teamId: this.teamIds[0] ?? 'swarm' };
    this.snapshot = {
      connected: false, id: null, mapping: '', leftStick: ZERO2, rightStick: ZERO2, leftStickRaw: ZERO2, rightStickRaw: ZERO2,
      leftTrigger: 0, rightTrigger: 0, pressed: [], focus, controller: 'C', camera: 'orbit', scenario: 'construction',
      powerLimit: 1, paused: false, rumbleSupported: false, timestamp: 0,
    };
    this.lastCommand = { focus, vx: 0, vy: 0, omega: 0, lift: 0, cameraTilt: 0, actions: [] };
  }

  // ───────────────────────── configuration ─────────────────────────

  /** Robots and teams the bumpers cycle through. Keeps the current focus if still valid. */
  setRoster(agentIds: number[], teamIds: string[] = []): void {
    this.agentIds = [...agentIds];
    this.teamIds = [...teamIds];
    const f = this.snapshot.focus;
    const valid = f.kind === 'agent' ? this.agentIds.includes(f.agentId) : this.teamIds.includes(f.teamId);
    if (!valid) this.publish({ focus: this.focusList()[0] ?? f });
  }

  /** Camera yaw (rad): swarm-focus stick input is interpreted camera-relative. */
  setCameraYaw(yaw: number): void { this.cameraYaw = yaw; }

  /** Sync state chosen elsewhere in the UI (keeps HUD and pad consistent). */
  setState(s: Partial<Pick<GamepadTelemetry, 'controller' | 'camera' | 'scenario' | 'powerLimit' | 'paused' | 'focus'>>): void {
    this.publish(s);
  }

  // ───────────────────────── polling ─────────────────────────

  private pickPad(): PadLike | null {
    const pads = this.getPads().filter((p): p is PadLike => !!p && p.connected);
    return pads.find(p => p.mapping === 'standard') ?? pads[0] ?? null;
  }

  private focusList(): GamepadFocus[] {
    return [
      ...this.agentIds.map((agentId): GamepadFocus => ({ kind: 'agent', agentId })),
      ...this.teamIds.map((teamId): GamepadFocus => ({ kind: 'swarm', teamId })),
    ];
  }

  private cycleFocus(step: 1 | -1): GamepadFocus {
    const list = this.focusList();
    if (!list.length) return this.snapshot.focus;
    const f = this.snapshot.focus;
    const i = list.findIndex(x =>
      (x.kind === 'agent' && f.kind === 'agent' && x.agentId === f.agentId) ||
      (x.kind === 'swarm' && f.kind === 'swarm' && x.teamId === f.teamId));
    return list[(Math.max(0, i) + step + list.length) % list.length];
  }

  /** Read the pad once: update telemetry, decode button edges into actions, return the command. */
  poll(): GamepadCommand {
    const pad = this.pickPad();
    this.pad = pad;
    const s = this.snapshot;
    if (!pad) {
      this.prevPressed.clear();
      if (s.connected) {
        this.publish({
          connected: false, id: null, mapping: '', leftStick: ZERO2, rightStick: ZERO2, leftStickRaw: ZERO2, rightStickRaw: ZERO2,
          leftTrigger: 0, rightTrigger: 0, pressed: [], rumbleSupported: false, timestamp: this.now(),
        });
      }
      return (this.lastCommand = { focus: s.focus, vx: 0, vy: 0, omega: 0, lift: 0, cameraTilt: 0, actions: [] });
    }

    const { deadzone: dz, expo } = this.opts;
    const ax = (i: number) => pad.axes[i] ?? 0;
    const btn = (b: XboxButton) => pad.buttons[XBOX_BUTTON_INDEX[b]];
    const isDown = (b: XboxButton) => { const x = btn(b); return !!x && (x.pressed || x.value > 0.5); };

    // Gamepad y axes are down-positive; telemetry uses UP-positive.
    const lsRaw = { x: ax(XBOX_AXIS.LX), y: -ax(XBOX_AXIS.LY) };
    const rsRaw = { x: ax(XBOX_AXIS.RX), y: -ax(XBOX_AXIS.RY) };
    const ls = shapeStick(lsRaw.x, lsRaw.y, dz, expo);
    const rs = shapeStick(rsRaw.x, rsRaw.y, dz, expo);
    const lt = shapeTrigger(btn('LT')?.value ?? 0, dz, expo);
    const rt = shapeTrigger(btn('RT')?.value ?? 0, dz, expo);

    const pressed = (Object.keys(XBOX_BUTTON_INDEX) as XboxButton[]).filter(isDown);
    const before = this.prevPressed; // snapshot BEFORE updating, edges compare against it
    const edge = (b: XboxButton) => pressed.includes(b) && !before.has(b);
    this.prevPressed = new Set(pressed);

    // ── edge actions ──
    const actions: GamepadAction[] = [];
    const next: Partial<GamepadTelemetry> = {};
    if (edge('A')) actions.push({ type: 'confirmLift' });
    if (edge('B')) { actions.push({ type: 'emergencyHold' }); void this.rumble('hold'); }
    if (edge('X')) {
      const controller = CONTROLLER_CYCLE[(CONTROLLER_CYCLE.indexOf(s.controller) + 1) % CONTROLLER_CYCLE.length];
      next.controller = controller; actions.push({ type: 'cycleController', controller });
    }
    if (edge('Y')) {
      const camera = CAMERA_CYCLE[(CAMERA_CYCLE.indexOf(s.camera) + 1) % CAMERA_CYCLE.length];
      next.camera = camera; actions.push({ type: 'cycleCamera', camera });
    }
    if (edge('RB') || edge('LB')) {
      const focus = this.cycleFocus(edge('RB') ? 1 : -1);
      next.focus = focus; actions.push({ type: 'focus', focus });
    }
    if (edge('DPAD_UP') || edge('DPAD_DOWN')) {
      const i = POWER_STEPS.indexOf(s.powerLimit as (typeof POWER_STEPS)[number]);
      const j = Math.min(POWER_STEPS.length - 1, Math.max(0, (i < 0 ? POWER_STEPS.length - 1 : i) + (edge('DPAD_UP') ? 1 : -1)));
      next.powerLimit = POWER_STEPS[j]; actions.push({ type: 'power', powerLimit: POWER_STEPS[j] });
    }
    if (edge('DPAD_LEFT') || edge('DPAD_RIGHT')) {
      const k = SCENARIO_CYCLE.length, i = SCENARIO_CYCLE.indexOf(s.scenario);
      const scenario = SCENARIO_CYCLE[(i + (edge('DPAD_RIGHT') ? 1 : -1) + k) % k];
      next.scenario = scenario; actions.push({ type: 'scenario', scenario });
    }
    if (edge('START')) { next.paused = !s.paused; actions.push({ type: 'pause', paused: !s.paused }); }
    if (edge('BACK')) actions.push({ type: 'reset' });

    const focus = next.focus ?? s.focus;
    const power = next.powerLimit ?? s.powerLimit;
    this.publish({
      ...next, connected: true, id: pad.id, mapping: pad.mapping,
      leftStick: ls, rightStick: rs, leftStickRaw: lsRaw, rightStickRaw: rsRaw,
      leftTrigger: lt, rightTrigger: rt, pressed,
      rumbleSupported: typeof pad.vibrationActuator?.playEffect === 'function',
      timestamp: pad.timestamp ?? this.now(),
    });

    // ── continuous command ── LS up → +x forward, LS left → +y strafe left, RS left → +ω (CCW)
    let vx: number, vy: number, omega: number;
    if (focus.kind === 'agent') {
      vx = ls.y * this.opts.maxSpeed * power;
      vy = -ls.x * this.opts.maxSpeed * power;
      omega = -rs.x * this.opts.maxTurn * power;
    } else {
      // virtual platform v_c in the WORLD frame, stick interpreted camera-relative
      const fx = ls.y, fy = -ls.x, c = Math.cos(this.cameraYaw), sn = Math.sin(this.cameraYaw);
      vx = (c * fx - sn * fy) * this.opts.swarmMaxSpeed * power;
      vy = (sn * fx + c * fy) * this.opts.swarmMaxSpeed * power;
      omega = -rs.x * this.opts.swarmMaxTurn * power;
    }
    const lift = (rt - lt) * this.opts.maxLiftRate * power;
    return (this.lastCommand = { focus, vx, vy, omega, lift, cameraTilt: rs.y, actions });
  }

  get command(): GamepadCommand { return this.lastCommand; }

  /** dual-rumble: short light pulse on contact (δ_i > 0), long heavy pulse on HOLD. */
  async rumble(kind: 'contact' | 'hold'): Promise<boolean> {
    const act = this.pad?.vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return false;
    const p = kind === 'hold'
      ? { startDelay: 0, duration: 450, weakMagnitude: 0.8, strongMagnitude: 1.0 }
      : { startDelay: 0, duration: 120, weakMagnitude: 0.6, strongMagnitude: 0.15 };
    try { await act.playEffect('dual-rumble', p); return true; } catch { return false; }
  }

  // ───────────────────────── observable (React) ─────────────────────────

  getSnapshot = (): GamepadTelemetry => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(patch: Partial<GamepadTelemetry>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  /** rAF polling loop, ref-counted (several consumers may request it). Returns a stop function. */
  startPolling(onCommand?: (cmd: GamepadCommand) => void): () => void {
    this.pollUsers++;
    if (onCommand) this.commandListeners.add(onCommand);
    if (this.rafId === null && typeof requestAnimationFrame === 'function') {
      const loop = () => {
        const cmd = this.poll();
        for (const cb of this.commandListeners) cb(cmd);
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      if (onCommand) this.commandListeners.delete(onCommand);
      if (--this.pollUsers <= 0) {
        this.pollUsers = 0;
        if (this.rafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    };
  }
}
