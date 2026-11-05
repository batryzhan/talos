/**
 * Support polygon P and stability margin ρ (formula 12) for swarm-side decisions
 * (hot-swap: may a member leave while the others hold the load?).
 *   ρ = min_{q∈∂P} ‖r_c − q‖  if r_c ∈ P,   negative distance if outside.
 * Kept independent from src/physics (Agent B) so the swarm can plan without the physics engine.
 */
import type { Vec2 } from '../contracts/types';

const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull, counter-clockwise (Andrew monotone chain). */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const lower: Vec2[] = [], upper: Vec2[] = [];
  for (const v of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], v) <= 0) lower.pop(); lower.push(v); }
  for (let i = p.length - 1; i >= 0; i--) { const v = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], v) <= 0) upper.pop(); upper.push(v); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Signed stability margin ρ of the centre of mass w.r.t. the support points (≤ 0 ⇒ tipping). */
export function stabilityMargin(points: readonly Vec2[], com: Vec2): number {
  const hull = convexHull(points);
  if (hull.length < 3) return -Infinity;
  let inside = true, d = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    if (cross(a, b, com) < 0) inside = false;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((com.x - a.x) * dx + (com.y - a.y) * dy) / (dx * dx + dy * dy)));
    d = Math.min(d, Math.hypot(com.x - a.x - t * dx, com.y - a.y - t * dy));
  }
  return inside ? d : -d;
}
