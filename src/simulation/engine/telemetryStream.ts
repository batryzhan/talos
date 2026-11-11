/**
 * Edge tier (CLAUDE.md §3.3): 50 Hz telemetry ingestion, binary packet serialisation, fast fault
 * triage, and a peer-to-peer ring channel with packet loss and delay for the 20 Hz radio exchange.
 *
 * Everything works on buffers allocated up front; ingest, triage, send and deliver do not allocate.
 *
 * Packet layout (64 bytes, little-endian):
 *   0  u16  agentId          16 f32 x          40 f32 current[0] (FL)
 *   2  u8   latch code       20 f32 y          44 f32 current[1] (FR)
 *   3  u8   fault flags      24 f32 theta      48 f32 current[2] (RL)
 *   4  u32  seq              28 f32 vx         52 f32 current[3] (RR)
 *   8  f64  time (s)         32 f32 vy         56 f32 battery
 *                            36 f32 omega      60 f32 bus voltage
 */
import { DRIVE_MOTOR_5203 } from '../../robot/straferSpec';
import type { Rng } from '../../swarm/rng';

export const PACKET_BYTES = 64;

export const FAULT_LOW_BATTERY = 1;
export const FAULT_OVERCURRENT = 2;
export const FAULT_PACKET_GAP = 4;
export const FAULT_NON_FINITE = 8;

/** Triage thresholds: battery below 25 %, motor current above 80 % of stall. */
export const TRIAGE_LIMITS = {
  battery: 0.25,
  current: 0.8 * DRIVE_MOTOR_5203.stallCurrent,
} as const;

export interface TelemetryPacket {
  agentId: number;
  /** Index into LATCH_STATUS_ORDER. */
  latch: number;
  flags: number;
  seq: number;
  time: number;
  x: number;
  y: number;
  theta: number;
  vx: number;
  vy: number;
  omega: number;
  /** Motor currents (A), order FL, FR, RL, RR. */
  current: Float32Array;
  battery: number;
  busVoltage: number;
}

export function createPacket(): TelemetryPacket {
  return {
    agentId: 0, latch: 0, flags: 0, seq: 0, time: 0, x: 0, y: 0, theta: 0, vx: 0, vy: 0, omega: 0,
    current: new Float32Array(4), battery: 1, busVoltage: DRIVE_MOTOR_5203.voltage,
  };
}

export function serializePacket(p: TelemetryPacket, view: DataView, offset: number): void {
  view.setUint16(offset, p.agentId, true);
  view.setUint8(offset + 2, p.latch);
  view.setUint8(offset + 3, p.flags);
  view.setUint32(offset + 4, p.seq, true);
  view.setFloat64(offset + 8, p.time, true);
  view.setFloat32(offset + 16, p.x, true);
  view.setFloat32(offset + 20, p.y, true);
  view.setFloat32(offset + 24, p.theta, true);
  view.setFloat32(offset + 28, p.vx, true);
  view.setFloat32(offset + 32, p.vy, true);
  view.setFloat32(offset + 36, p.omega, true);
  for (let j = 0; j < 4; j++) view.setFloat32(offset + 40 + 4 * j, p.current[j], true);
  view.setFloat32(offset + 56, p.battery, true);
  view.setFloat32(offset + 60, p.busVoltage, true);
}

export function deserializePacket(view: DataView, offset: number, out: TelemetryPacket): TelemetryPacket {
  out.agentId = view.getUint16(offset, true);
  out.latch = view.getUint8(offset + 2);
  out.flags = view.getUint8(offset + 3);
  out.seq = view.getUint32(offset + 4, true);
  out.time = view.getFloat64(offset + 8, true);
  out.x = view.getFloat32(offset + 16, true);
  out.y = view.getFloat32(offset + 20, true);
  out.theta = view.getFloat32(offset + 24, true);
  out.vx = view.getFloat32(offset + 28, true);
  out.vy = view.getFloat32(offset + 32, true);
  out.omega = view.getFloat32(offset + 36, true);
  for (let j = 0; j < 4; j++) out.current[j] = view.getFloat32(offset + 40 + 4 * j, true);
  out.battery = view.getFloat32(offset + 56, true);
  out.busVoltage = view.getFloat32(offset + 60, true);
  return out;
}

/**
 * Fast fault triage of one sample. `prevSeq` is the last sequence number seen from this agent
 * (0 before the first packet). Returns the fault bitmask.
 */
export function triagePacket(p: TelemetryPacket, prevSeq: number): number {
  let flags = 0;
  if (p.battery < TRIAGE_LIMITS.battery) flags |= FAULT_LOW_BATTERY;
  let finite = Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.theta) && Number.isFinite(p.battery);
  for (let j = 0; j < 4; j++) {
    const i = p.current[j];
    if (!Number.isFinite(i)) finite = false;
    else if ((i < 0 ? -i : i) > TRIAGE_LIMITS.current) flags |= FAULT_OVERCURRENT;
  }
  if (!finite) flags |= FAULT_NON_FINITE;
  if (prevSeq > 0 && p.seq !== prevSeq + 1) flags |= FAULT_PACKET_GAP;
  return flags;
}

/**
 * Per-agent ring buffer of serialised packets, written at 50 Hz. Agents are addressed by a dense
 * slot index 0..agents−1.
 */
export class TelemetryStream {
  readonly agents: number;
  readonly capacity: number;
  readonly view: DataView;
  /** Packets ingested per agent and the latest fault mask per agent. */
  readonly count: Uint32Array;
  readonly faults: Uint8Array;
  private readonly lastSeq: Uint32Array;

  constructor(agents: number, capacity = 64) {
    this.agents = agents;
    this.capacity = capacity;
    this.view = new DataView(new ArrayBuffer(agents * capacity * PACKET_BYTES));
    this.count = new Uint32Array(agents);
    this.faults = new Uint8Array(agents);
    this.lastSeq = new Uint32Array(agents);
  }

  /** Byte offset of the packet `back` samples before the newest one of `slot` (0 = newest). */
  offsetOf(slot: number, back = 0): number {
    const newest = (this.count[slot] + this.capacity - 1 - back) % this.capacity;
    return (slot * this.capacity + newest) * PACKET_BYTES;
  }

  /** Triage, stamp the fault flags into the packet and store it. Returns the fault mask. */
  ingest(slot: number, p: TelemetryPacket): number {
    const flags = triagePacket(p, this.lastSeq[slot]);
    p.flags = flags;
    this.lastSeq[slot] = p.seq;
    this.faults[slot] = flags;
    const index = this.count[slot] % this.capacity;
    serializePacket(p, this.view, (slot * this.capacity + index) * PACKET_BYTES);
    this.count[slot]++;
    return flags;
  }

  /** Read a stored packet into `out`. Returns false if that sample does not exist (yet). */
  read(slot: number, back: number, out: TelemetryPacket): boolean {
    if (back >= this.capacity || back >= this.count[slot]) return false;
    deserializePacket(this.view, this.offsetOf(slot, back), out);
    return true;
  }
}

/** Receiver of ring-channel deliveries. */
export interface PacketSink {
  onPacket(to: number, from: number, view: DataView, offset: number): void;
}

/**
 * Peer-to-peer radio over a ring of `nodes` slots. Each directed link drops a packet independently
 * with probability p; survivors arrive `delayTicks` radio ticks later, in send order.
 */
export class RingChannel {
  lossP: number;
  sent = 0;
  dropped = 0;
  delivered = 0;
  private readonly queueCap: number;
  private readonly store: Uint8Array;
  private readonly storeView: DataView;
  private readonly due: Int32Array;
  private readonly to: Int16Array;
  private readonly from: Int16Array;
  private head = 0;
  private size = 0;

  constructor(readonly nodes: number, lossP: number, readonly delayTicks: number, private readonly rng: Rng) {
    this.lossP = lossP;
    this.queueCap = Math.max(1, 2 * nodes * (delayTicks + 1));
    this.store = new Uint8Array(this.queueCap * PACKET_BYTES);
    this.storeView = new DataView(this.store.buffer);
    this.due = new Int32Array(this.queueCap);
    this.to = new Int16Array(this.queueCap);
    this.from = new Int16Array(this.queueCap);
  }

  /** Share of offered packets that got through, in [0, 1] (1 before any traffic). */
  get deliveryRatio(): number {
    const offered = this.sent + this.dropped;
    return offered > 0 ? this.sent / offered : 1;
  }

  /** Node `from` broadcasts the packet at `offset` in `src` to its two ring neighbours. */
  broadcast(tick: number, from: number, src: DataView, offset: number): void {
    const n = this.nodes;
    if (n < 2) return;
    this.enqueue(tick, from, (from + 1) % n, src, offset);
    if (n > 2) this.enqueue(tick, from, (from + n - 1) % n, src, offset);
  }

  /** Hand every packet due at `tick` to the sink, in send order. Returns how many were delivered. */
  deliver(tick: number, sink: PacketSink): number {
    let count = 0;
    while (this.size > 0 && this.due[this.head] <= tick) {
      sink.onPacket(this.to[this.head], this.from[this.head], this.storeView, this.head * PACKET_BYTES);
      this.head = (this.head + 1) % this.queueCap;
      this.size--;
      count++;
    }
    this.delivered += count;
    return count;
  }

  private enqueue(tick: number, from: number, to: number, src: DataView, offset: number): void {
    // Always draw, so the random stream does not depend on queue state.
    if (this.rng.bernoulli(this.lossP) || this.size >= this.queueCap) { this.dropped++; return; }
    const slot = (this.head + this.size) % this.queueCap, base = slot * PACKET_BYTES;
    for (let i = 0; i < PACKET_BYTES; i++) this.store[base + i] = src.getUint8(offset + i);
    this.due[slot] = tick + this.delayTicks;
    this.to[slot] = to;
    this.from[slot] = from;
    this.size++;
    this.sent++;
  }
}
