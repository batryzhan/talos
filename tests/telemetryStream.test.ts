import { describe, expect, it } from 'vitest';
import {
  FAULT_LOW_BATTERY, FAULT_NON_FINITE, FAULT_OVERCURRENT, FAULT_PACKET_GAP, PACKET_BYTES, RingChannel,
  TelemetryStream, createPacket, deserializePacket, serializePacket, triagePacket, type PacketSink,
} from '../src/simulation/engine/telemetryStream';
import { CONTROL_DIVIDER, CONTROL_DT, LoopClock, PHYSICS_DT, RADIO_DIVIDER, RADIO_DT } from '../src/simulation/engine/loopClock';
import { CONTROL_HZ, RADIO_HZ } from '../src/contracts/types';
import { Rng } from '../src/swarm/rng';

describe('loop separation', () => {
  it('physics 100 Hz, control 50 Hz, radio 20 Hz', () => {
    expect(PHYSICS_DT).toBe(0.01);
    expect(CONTROL_DT).toBe(1 / CONTROL_HZ);
    expect(RADIO_DT).toBe(1 / RADIO_HZ);
    expect([CONTROL_DIVIDER, RADIO_DIVIDER]).toEqual([2, 5]);
    const clock = new LoopClock();
    let control = 0, radio = 0;
    for (let k = 0; k < 100; k++) {
      if (clock.controlDue) control++;
      if (clock.radioDue) radio++;
      clock.advance();
    }
    expect(clock.time).toBeCloseTo(1, 12);
    expect([control, radio]).toEqual([50, 20]);
    expect(clock.radioTick).toBe(20);
  });
});

describe('packet serialisation', () => {
  it('round-trips a packet in 64 bytes', () => {
    const p = createPacket();
    Object.assign(p, { agentId: 513, latch: 4, flags: 6, seq: 4_000_000_000, time: 1234.5678901234, x: -3.25, y: 0.5, theta: 1.5, vx: 0.25, vy: -0.125, omega: 0.75, battery: 0.5, busVoltage: 11.5 });
    p.current.set([0.5, 1.25, 2.5, 7.75]);
    const view = new DataView(new ArrayBuffer(PACKET_BYTES * 2));
    serializePacket(p, view, PACKET_BYTES);
    const out = deserializePacket(view, PACKET_BYTES, createPacket());
    expect(out).toEqual(p);
    expect(new Uint8Array(view.buffer, 0, PACKET_BYTES).every(b => b === 0)).toBe(true); // nothing written before the offset
  });
});

describe('fault triage', () => {
  it('flags low battery, overcurrent, packet gaps and non-finite samples', () => {
    const p = createPacket();
    p.seq = 1;
    expect(triagePacket(p, 0)).toBe(0);
    p.battery = 0.25;
    expect(triagePacket(p, 0)).toBe(0);
    p.battery = 0.249;
    expect(triagePacket(p, 0)).toBe(FAULT_LOW_BATTERY);
    p.current[2] = -7.5; // above 80 % of the 9.2 A stall current, either direction
    expect(triagePacket(p, 0)).toBe(FAULT_LOW_BATTERY | FAULT_OVERCURRENT);
    p.battery = 1; p.current[2] = 7.3;
    p.seq = 12;
    expect(triagePacket(p, 11)).toBe(0);
    expect(triagePacket(p, 9)).toBe(FAULT_PACKET_GAP);
    p.x = NaN;
    expect(triagePacket(p, 11)).toBe(FAULT_NON_FINITE);
  });
});

describe('TelemetryStream', () => {
  it('keeps the newest samples per agent in a ring and stamps fault flags', () => {
    const s = new TelemetryStream(2, 4), p = createPacket(), out = createPacket();
    expect(s.read(0, 0, out)).toBe(false);
    for (let k = 1; k <= 6; k++) {
      p.agentId = 1; p.seq = k; p.x = k;
      expect(s.ingest(0, p)).toBe(0);
    }
    expect(s.count[0]).toBe(6);
    for (let back = 0; back < 4; back++) {
      expect(s.read(0, back, out)).toBe(true);
      expect(out.seq).toBe(6 - back);
      expect(out.x).toBe(6 - back);
    }
    expect(s.read(0, 4, out)).toBe(false); // overwritten
    expect(s.read(1, 0, out)).toBe(false); // other agent untouched

    p.agentId = 2; p.seq = 1; p.battery = 0.1;
    expect(s.ingest(1, p)).toBe(FAULT_LOW_BATTERY);
    p.seq = 5;
    expect(s.ingest(1, p)).toBe(FAULT_LOW_BATTERY | FAULT_PACKET_GAP);
    expect(s.faults[1]).toBe(FAULT_LOW_BATTERY | FAULT_PACKET_GAP);
    s.read(1, 0, out);
    expect(out.flags).toBe(FAULT_LOW_BATTERY | FAULT_PACKET_GAP);
  });
});

describe('RingChannel', () => {
  function run(nodes: number, p: number, delay: number, ticks: number, seed = 1): { channel: RingChannel; got: [number, number, number][] } {
    const channel = new RingChannel(nodes, p, delay, new Rng(seed));
    const stream = new TelemetryStream(nodes, 4), packet = createPacket(), out = createPacket();
    const got: [number, number, number][] = [];
    const sink: PacketSink = {
      onPacket(to, from, view, offset) { deserializePacket(view, offset, out); got.push([to, from, out.seq]); },
    };
    for (let tick = 0; tick < ticks; tick++) {
      for (let i = 0; i < nodes; i++) {
        packet.agentId = i + 1; packet.seq = tick + 1;
        stream.ingest(i, packet);
        channel.broadcast(tick, i, stream.view, stream.offsetOf(i));
      }
      channel.deliver(tick, sink);
    }
    return { channel, got };
  }

  it('delivers to both ring neighbours, in order, after the delay', () => {
    const { channel, got } = run(4, 0, 2, 5);
    expect(channel.dropped).toBe(0);
    expect(channel.sent).toBe(4 * 2 * 5);
    expect(got).toHaveLength(4 * 2 * 3); // ticks 0..2 arrive by tick 4
    expect(got.slice(0, 2)).toEqual([[1, 0, 1], [3, 0, 1]]);
    for (const [to, from, seq] of got) {
      expect([(from + 1) % 4, (from + 3) % 4]).toContain(to);
      expect(seq).toBeLessThanOrEqual(3);
    }
    expect(channel.deliveryRatio).toBe(1);
  });

  it('a pair has one link each way; a single node sends nothing', () => {
    expect(run(2, 0, 0, 3).got).toHaveLength(2 * 3);
    expect(run(1, 0, 0, 3).got).toHaveLength(0);
  });

  it('drops packets at the configured rate p ∈ {0, 0.1, 0.3}, reproducibly', () => {
    for (const p of [0, 0.1, 0.3]) {
      const a = run(6, p, 1, 2000, 7), b = run(6, p, 1, 2000, 7);
      expect(a.got).toEqual(b.got); // same seed → same losses
      const offered = a.channel.sent + a.channel.dropped;
      expect(offered).toBe(6 * 2 * 2000);
      expect(a.channel.dropped / offered).toBeCloseTo(p, 1);
      expect(Math.abs(a.channel.deliveryRatio - (1 - p))).toBeLessThan(0.02);
    }
  });
});
