/**
 * Radio layer (CLAUDE.md §4.1–4.2): 20 Hz broadcast to graph neighbours, symmetric per-edge loss p
 * (one draw per unique edge per radio tick, both directions share it), transport delay d, and the
 * receiver-side filters: stale epoch, duplicate seq, age > maxAge, height ∉ [hMin, hMax], wrong task.
 */
import type { AgentMessage, MessageRejectReason, NetworkParams } from '../contracts/types';
import { buildEdges, type Edge } from './graph';
import type { Rng } from './rng';

interface InFlight { to: number; msg: AgentMessage; deliverAt: number }

export interface NeighborEntry {
  msg: AgentMessage;
  /** Receiver time when the packet arrived (s). */
  receivedAt: number;
}

/** Per-agent receive table with the mandatory packet filters. */
export class NeighborTable {
  readonly entries = new Map<number, NeighborEntry>();
  private lastSeq = new Map<number, number>();
  readonly rejected: Record<MessageRejectReason, number> = {
    'stale-epoch': 0, 'duplicate-seq': 0, 'too-old': 0, 'height-out-of-range': 0, 'wrong-task': 0,
  };

  constructor(
    readonly ownerId: number,
    private readonly limits: { hMin: number; hMax: number; maxAge: number },
  ) {}

  /** Validate and store. Returns null on accept, or the reject reason. */
  receive(msg: AgentMessage, now: number, ctx: { epoch: number; task: string }): MessageRejectReason | null {
    let reason: MessageRejectReason | null = null;
    if (msg.task !== ctx.task) reason = 'wrong-task';
    else if (msg.epoch < ctx.epoch) reason = 'stale-epoch';
    else if (msg.seq <= (this.lastSeq.get(msg.id) ?? 0)) reason = 'duplicate-seq';
    else if (now - msg.time > this.limits.maxAge) reason = 'too-old';
    else if (!(msg.height >= this.limits.hMin && msg.height <= this.limits.hMax)) reason = 'height-out-of-range';
    if (reason) { this.rejected[reason]++; return reason; }
    this.lastSeq.set(msg.id, msg.seq);
    this.entries.set(msg.id, { msg, receivedAt: now });
    return null;
  }

  /** Entries whose last packet is not older than `maxSilence` seconds. */
  fresh(now: number, maxSilence: number): NeighborEntry[] {
    const out: NeighborEntry[] = [];
    for (const e of this.entries.values()) if (now - e.msg.time <= maxSilence) out.push(e);
    return out;
  }

  /** Drop everything (e.g. on epoch change). */
  clear(): void {
    this.entries.clear();
    this.lastSeq.clear();
  }
}

/** Broadcast medium over a fixed topology. Agent ids are 1..N, graph vertices 0..N−1. */
export class RadioNetwork {
  readonly edges: Edge[];
  private queue: InFlight[] = [];
  /** Edges (agent ids, i<j) that delivered in the last tick. */
  lastActiveEdges: [number, number][] = [];
  sent = 0;
  dropped = 0;

  constructor(readonly n: number, public params: NetworkParams, private readonly rng: Rng) {
    this.edges = buildEdges(n, params.topology);
  }

  /**
   * One radio tick: every agent broadcasts `outbox[id]` (undefined = radio dead / silent).
   * One loss draw per unique edge (symmetric). `lossP` overrides params.lossP (fault injection).
   */
  broadcast(now: number, outbox: Map<number, AgentMessage>, lossP = this.params.lossP): void {
    this.lastActiveEdges = [];
    for (const [a, b] of this.edges) {
      const up = !this.rng.bernoulli(lossP);  // always draw → same stream regardless of silence
      const ia = a + 1, ib = b + 1;
      const ma = outbox.get(ia), mb = outbox.get(ib);
      if (!up) { if (ma) this.dropped++; if (mb) this.dropped++; continue; }
      if (ma) { this.queue.push({ to: ib, msg: ma, deliverAt: now + this.params.delay }); this.sent++; }
      if (mb) { this.queue.push({ to: ia, msg: mb, deliverAt: now + this.params.delay }); this.sent++; }
      if (ma || mb) this.lastActiveEdges.push([ia, ib]);
    }
  }

  /** Pop every packet due at `now`, in send order. */
  deliver(now: number): InFlight[] {
    const due: InFlight[] = [];
    const keep: InFlight[] = [];
    for (const f of this.queue) (f.deliverAt <= now + 1e-12 ? due : keep).push(f);
    this.queue = keep;
    return due;
  }

  /** Graph neighbours (agent ids) of agent `id` in the loss-free topology. */
  neighborsOf(id: number): number[] {
    const v = id - 1, out: number[] = [];
    for (const [a, b] of this.edges) { if (a === v) out.push(b + 1); else if (b === v) out.push(a + 1); }
    return out;
  }
}
