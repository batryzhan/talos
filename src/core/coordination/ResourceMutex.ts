/**
 * Shared-resource mutexes for narrow corridors and crossings (scientific documentation §2.5):
 * a lease has an owner, a TTL and the group epoch it was granted in. Expired leases and leases from
 * an older epoch are revoked, so a robot that dropped out (hot-swap, radio loss) never blocks a
 * crossing forever.
 */
export interface Lease { owner: number; epoch: number; expires: number }

export class ResourceMutex {
  private readonly leases = new Map<string, Lease>();
  granted = 0;
  denied = 0;

  constructor(readonly ttl = 6) {}

  /** Acquire or renew `resource` for `owner`. Returns true while the owner holds it. */
  acquire(resource: string, owner: number, epoch: number, now: number): boolean {
    const l = this.leases.get(resource);
    if (l && l.owner !== owner && l.expires > now && l.epoch >= epoch) { this.denied++; return false; }
    if (!l || l.owner !== owner) this.granted++;
    this.leases.set(resource, { owner, epoch, expires: now + this.ttl });
    return true;
  }

  release(resource: string, owner: number): void {
    if (this.leases.get(resource)?.owner === owner) this.leases.delete(resource);
  }

  releaseAll(owner: number): void {
    for (const [k, l] of this.leases) if (l.owner === owner) this.leases.delete(k);
  }

  holder(resource: string, now: number): number | null {
    const l = this.leases.get(resource);
    return l && l.expires > now ? l.owner : null;
  }

  /** Drop leases granted before `epoch` (group composition changed). */
  revokeBefore(epoch: number): void {
    for (const [k, l] of this.leases) if (l.epoch < epoch) this.leases.delete(k);
  }
}
