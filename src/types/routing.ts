/**
 * S1 routing contracts (scientific documentation §2.5): a bidirectional weighted graph of corridors /
 * drifts / trails whose edges can be closed at run time (blocked corridor, roof collapse, fire front).
 * Primitive contracts are re-exported from src/contracts, never duplicated.
 */
export type { Pose2D, Vec2 } from '../contracts/types';

export type S1EdgeStatus = 'OPEN' | 'CLOSED';

/** Why an edge is closed. */
export type S1ClosureReason = 'BLOCKED' | 'COLLAPSE' | 'HAZARD' | 'DYNAMIC_CUT';

export type S1EdgeState =
  | { status: 'OPEN' }
  | { status: 'CLOSED'; reason: S1ClosureReason };

export interface S1Node {
  id: number;
  x: number;
  y: number;
}

export interface S1Edge {
  id: number;
  a: number;
  b: number;
  /** Geometric length (m); never below the Euclidean node distance, so A* stays admissible. */
  length: number;
  state: S1EdgeState;
}

export type S1Algorithm = 'dijkstra' | 'astar';

export type S1Route =
  | { status: 'FOUND'; cost: number; nodes: number[]; edges: number[] }
  | { status: 'UNREACHABLE'; cost: number };
