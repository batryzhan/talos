import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { XBOX_BUTTON_INDEX, XboxController, shapeStick, shapeTrigger, type PadLike } from '../src/input/XboxController';
import { GamepadSwarmBridge, simpleTargets } from '../src/input/gamepadBridge';
import { useXboxGamepad } from '../src/input/useXboxGamepad';
import type { XboxButton } from '../src/contracts/types';
import { TalosRobotAgent } from '../src/robot/TalosRobotAgent';
import { SwarmManager } from '../src/swarm/SwarmManager';

/** Mutable fake Xbox 360 pad (standard mapping). */
function fakePad() {
  const pad = {
    id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    timestamp: 0,
    vibrationActuator: { playEffect: vi.fn(async () => 'complete') },
  };
  const press = (b: XboxButton, v = 1) => { pad.buttons[XBOX_BUTTON_INDEX[b]] = { pressed: v > 0.5, value: v }; };
  const release = (b: XboxButton) => press(b, 0);
  return { pad, press, release };
}

function controller(p: ReturnType<typeof fakePad>, opts = {}) {
  let pads: (PadLike | null)[] = [p.pad];
  const c = new XboxController({ getGamepads: () => pads, agentIds: [1, 2, 3], teamIds: ['alpha'], now: () => 0, ...opts });
  return { c, unplug: () => { pads = [null]; } };
}

describe('response shaping', () => {
  it('radial deadzone 0.12, continuous at the edge, monotone, full scale at 1', () => {
    expect(shapeStick(0.1, 0.05, 0.12, 0.6)).toEqual({ x: 0, y: 0 });
    expect(Math.hypot(...Object.values(shapeStick(0.1201, 0, 0.12, 0.6)))).toBeLessThan(1e-3);
    expect(shapeStick(1, 0, 0.12, 0.6).x).toBeCloseTo(1, 12);
    let prev = 0;
    for (let v = 0.12; v <= 1; v += 0.01) { const y = shapeStick(v, 0, 0.12, 0.6).x; expect(y).toBeGreaterThanOrEqual(prev); prev = y; }
    // direction preserved, magnitude ≤ 1 on the diagonal
    const d = shapeStick(0.9, 0.9, 0.12, 0.6);
    expect(d.x).toBeCloseTo(d.y, 12);
    expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(1);
    expect(shapeTrigger(0.05, 0.12, 0.6)).toBe(0);
    expect(shapeTrigger(1, 0.12, 0.6)).toBeCloseTo(1, 12);
    expect(shapeStick(0.5, 0, 0.12, 0.6).x).toBeLessThan(shapeStick(0.5, 0, 0.12, 0).x); // softer near centre
  });
});

describe('XboxController', () => {
  it('maps LS up → +v_x, LS left → +v_y, RS left → +ω, RT − LT → lift', () => {
    const p = fakePad(), { c } = controller(p);
    p.pad.axes = [-1, -1, -1, 0]; // LS up-left, RS left (gamepad y is down-positive)
    p.press('RT', 1); p.press('LT', 0.2);
    const cmd = c.poll();
    expect(cmd.focus).toEqual({ kind: 'agent', agentId: 1 });
    expect(cmd.vx).toBeGreaterThan(0);
    expect(cmd.vy).toBeGreaterThan(0);
    expect(cmd.omega).toBeGreaterThan(0);
    expect(cmd.lift).toBeGreaterThan(0);
    const t = c.getSnapshot();
    expect(t.connected).toBe(true);
    expect(t.leftStickRaw).toEqual({ x: -1, y: 1 });
    expect(t.pressed).toEqual(expect.arrayContaining(['RT']));
  });

  it('button edges fire exactly once; X/Y/D-pad/START cycle state', () => {
    const p = fakePad(), { c } = controller(p);
    p.press('X');
    expect(c.poll().actions).toEqual([{ type: 'cycleController', controller: 'A' }]);
    expect(c.poll().actions).toEqual([]); // held → no repeat
    p.release('X'); c.poll(); p.press('X');
    expect(c.poll().actions[0]).toEqual({ type: 'cycleController', controller: 'B' });
    p.release('X');
    p.press('Y'); expect(c.poll().actions[0]).toEqual({ type: 'cycleCamera', camera: 'follow' }); p.release('Y');
    p.press('DPAD_DOWN'); c.poll(); p.release('DPAD_DOWN'); c.poll(); p.press('DPAD_DOWN'); c.poll(); p.release('DPAD_DOWN');
    expect(c.getSnapshot().powerLimit).toBe(0.5);
    p.press('DPAD_RIGHT'); expect(c.poll().actions[0]).toEqual({ type: 'scenario', scenario: 'factory' }); p.release('DPAD_RIGHT');
    p.press('START'); expect(c.poll().actions[0]).toEqual({ type: 'pause', paused: true }); p.release('START');
    p.press('BACK'); expect(c.poll().actions[0]).toEqual({ type: 'reset' });
  });

  it('LB/RB cycle robots #1..#N then the swarm team; power scales the command', () => {
    const p = fakePad(), { c } = controller(p);
    const rb = () => { p.press('RB'); const a = c.poll().actions; p.release('RB'); c.poll(); return a[0]; };
    expect(rb()).toEqual({ type: 'focus', focus: { kind: 'agent', agentId: 2 } });
    rb();
    expect(rb()).toEqual({ type: 'focus', focus: { kind: 'swarm', teamId: 'alpha' } });
    p.press('LB'); expect(c.poll().focus).toEqual({ kind: 'agent', agentId: 3 }); p.release('LB');
    p.pad.axes = [0, -1, 0, 0];
    const full = c.poll().vx;
    c.setState({ powerLimit: 0.25 });
    expect(c.poll().vx).toBeCloseTo(full * 0.25, 12);
  });

  it('B → emergencyHold action + dual-rumble; disconnect resets telemetry', async () => {
    const p = fakePad(), { c, unplug } = controller(p);
    p.press('B');
    expect(c.poll().actions).toEqual([{ type: 'emergencyHold' }]);
    await Promise.resolve();
    expect(p.pad.vibrationActuator.playEffect).toHaveBeenCalledWith('dual-rumble', expect.objectContaining({ strongMagnitude: 1 }));
    const listener = vi.fn();
    c.subscribe(listener);
    unplug();
    const cmd = c.poll();
    expect(cmd.vx).toBe(0);
    expect(c.getSnapshot().connected).toBe(false);
    expect(listener).toHaveBeenCalled();
    expect(await c.rumble('contact')).toBe(false);
  });

  it('swarm focus is camera-relative (world-frame v_c)', () => {
    const p = fakePad(), { c } = controller(p);
    c.setState({ focus: { kind: 'swarm', teamId: 'alpha' } });
    c.setCameraYaw(Math.PI / 2);
    p.pad.axes = [0, -1, 0, 0]; // stick up = "away from the camera"
    const cmd = c.poll();
    expect(cmd.vx).toBeCloseTo(0, 12);
    expect(cmd.vy).toBeCloseTo(c.opts.swarmMaxSpeed, 12);
  });
});

describe('GamepadSwarmBridge', () => {
  it('agent focus drives a free robot; swarm focus drives the team platform and h*', () => {
    const solo = new TalosRobotAgent({ id: 9 });
    const team = [1, 2, 3, 4].map(id => new TalosRobotAgent({ id, pose: { x: id, y: 0, theta: 0 } }));
    const mgr = new SwarmManager(team);
    const p = fakePad(), { c } = controller(p);
    c.setRoster([9, 1], ['swarm']);
    const bridge = new GamepadSwarmBridge(c, simpleTargets([solo, ...team], mgr));
    c.setState({ focus: { kind: 'agent', agentId: 9 } });
    p.pad.axes = [0, -1, 0, 0];
    bridge.apply(c.poll(), 0.016);
    for (let i = 0; i < 50; i++) solo.step(0.01);
    expect(solo.pose.x).toBeGreaterThan(0.05);

    c.setState({ focus: { kind: 'swarm', teamId: 'swarm' } });
    p.press('RT', 1);
    const h0 = mgr.targetHeight;
    bridge.apply(c.poll(), 0.5);
    expect(mgr.targetHeight).toBeGreaterThan(h0);
  });

  it('A starts the approach/lift, B holds the whole team, X switches the controller', () => {
    const team = [1, 2, 3, 4].map(id => new TalosRobotAgent({ id, pose: { x: id * 0.6, y: 0, theta: 0 } }));
    const mgr = new SwarmManager(team);
    mgr.assignSupports(team.map((a, i) => ({ agentId: a.id, r: { x: i * 0.6, y: 0 } })), { x: 0.6, y: 0, theta: 0 });
    const p = fakePad(), { c } = controller(p);
    c.setRoster([1, 2, 3, 4], ['swarm']);
    c.setState({ focus: { kind: 'swarm', teamId: 'swarm' } });
    const bridge = new GamepadSwarmBridge(c, simpleTargets(team, mgr));
    p.press('A'); bridge.apply(c.poll(), 0.016); p.release('A');
    expect(mgr.isLiftRequested).toBe(true);
    expect(team.every(a => a.mode === 'APPROACH')).toBe(true);
    for (let i = 0; i < 200; i++) mgr.step(0.01);
    p.press('X'); bridge.apply(c.poll(), 0.016); p.release('X'); c.poll();
    expect(mgr.config.controller).toBe('A');
    p.press('B'); bridge.apply(c.poll(), 0.016);
    mgr.step(0.02);
    expect(team.every(a => a.mode === 'HOLD')).toBe(true);
  });

  it('rumbles on contact rising edge and on HOLD entry', () => {
    let t = 0;
    const a = new TalosRobotAgent({ id: 1 });
    const p = fakePad(), { c } = controller(p);
    c.poll(); // attach the pad
    const bridge = new GamepadSwarmBridge(c, simpleTargets([a]), { now: () => t });
    a.applySupportContact({ agentId: 1, delta: -0.001, deltaDot: 0, force: 0 });
    bridge.watch([a]);
    a.applySupportContact({ agentId: 1, delta: 0.001, deltaDot: 0, force: 50 });
    t = 1000; bridge.watch([a]);
    expect(p.pad.vibrationActuator.playEffect).toHaveBeenLastCalledWith('dual-rumble', expect.objectContaining({ duration: 120 }));
    a.setMode('LIFT'); bridge.watch([a]);
    a.setMode('HOLD'); t = 3000; bridge.watch([a]);
    expect(p.pad.vibrationActuator.playEffect).toHaveBeenLastCalledWith('dual-rumble', expect.objectContaining({ duration: 450 }));
  });
});

describe('useXboxGamepad (React)', () => {
  it('renders the current telemetry snapshot', () => {
    const p = fakePad(), { c } = controller(p);
    c.poll();
    let seen: ReturnType<typeof useXboxGamepad> | null = null;
    const Probe = () => { seen = useXboxGamepad({ controller: c, poll: false }); return null; };
    renderToString(createElement(Probe));
    expect(seen!.connected).toBe(true);
    expect(seen!.id).toMatch(/Xbox 360/);
  });
});
