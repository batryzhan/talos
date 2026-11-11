import { describe, expect, it } from 'vitest';
import {
  SwarmOrchestrator, completeTask, decomposeMission, quorumOf, readyTasks, topologicalOrder,
} from '../src/core/swarm/orchestrator';
import { S1Graph } from '../src/core/routing/s1Graph';
import { DOCK_PITCH } from '../src/core/kinematics/compositeSolver';
import type { MissionDag, SwarmRole } from '../src/types/orchestrator';

function cutGraph(): S1Graph {
  const g = new S1Graph();
  g.addNode(0, 0, 0); g.addNode(1, 2, 0); g.addNode(2, 2 + 2 * DOCK_PITCH.x, 0); g.addNode(3, 6, 0);
  g.addEdge(0, 1); g.addEdge(1, 2, { status: 'CLOSED', reason: 'CHASM' }); g.addEdge(2, 3);
  return g;
}

const roster = (roles: SwarmRole[]): { id: number; role: SwarmRole }[] => roles.map((role, i) => ({ id: i + 1, role }));

describe('mission decomposition', () => {
  it('adds a bridge task only when the route is cut', () => {
    const cut = decomposeMission({ type: 'MACRO_TRANSPORT', from: 0, to: 3, formation: '2x2', payloadKg: 30 }, cutGraph());
    expect(cut.tasks.map(t => t.type)).toEqual(['ROUTE_CHECK', 'DEPLOY_BRIDGE', 'FORM_MACRO', 'TRANSPORT', 'RELEASE']);

    const open = cutGraph();
    open.openEdge(1);
    const direct = decomposeMission({ type: 'TRANSIT', from: 0, to: 3 }, open);
    expect(direct.tasks.map(t => t.type)).toEqual(['ROUTE_CHECK', 'TRANSPORT', 'RELEASE']);
  });

  it('is a DAG: transport waits for both the bridge and the macro-chassis', () => {
    const dag = decomposeMission({ type: 'MACRO_TRANSPORT', from: 0, to: 3, formation: '2x2', payloadKg: 30 }, cutGraph());
    const order = topologicalOrder(dag);
    expect(order).toHaveLength(5);
    const at = (type: string): number => order.indexOf(dag.tasks.find(t => t.type === type)!.id);
    expect(at('ROUTE_CHECK')).toBe(0);
    expect(at('TRANSPORT')).toBeGreaterThan(at('DEPLOY_BRIDGE'));
    expect(at('TRANSPORT')).toBeGreaterThan(at('FORM_MACRO'));
    expect(at('RELEASE')).toBe(4);

    expect(readyTasks(dag).map(t => t.type)).toEqual(['ROUTE_CHECK']);
    expect(completeTask(dag, 4)).toBe(false); // dependencies not done
    expect(completeTask(dag, 1)).toBe(true);
    expect(readyTasks(dag).map(t => t.type)).toEqual(['DEPLOY_BRIDGE', 'FORM_MACRO']); // independent → parallel
  });

  it('detects cycles and dangling dependencies', () => {
    const dag: MissionDag = {
      directive: { type: 'TRANSIT', from: 0, to: 1 },
      tasks: [
        { id: 1, type: 'ROUTE_CHECK', from: 0, to: 1, deps: [2], status: 'PENDING' },
        { id: 2, type: 'RELEASE', deps: [1], status: 'PENDING' },
      ],
    };
    expect(() => topologicalOrder(dag)).toThrow(/cycle/);
    dag.tasks[0].deps = [9];
    expect(() => topologicalOrder(dag)).toThrow(/unknown task/);
  });
});

describe('quorum', () => {
  it('needs a strict majority, so two partitions can never both act', () => {
    expect(quorumOf(1, 6, 6).status).toBe('STABLE');
    expect(quorumOf(1, 6, 4).status).toBe('DEGRADED');
    expect(quorumOf(1, 6, 3).status).toBe('LOST'); // an even split leaves no side in charge
    for (let n = 1; n <= 9; n++) {
      for (let a = 0; a <= n; a++) {
        const both = quorumOf(1, n, a).status !== 'LOST' && quorumOf(1, n, n - a).status !== 'LOST';
        expect(both && a !== n && a !== 0).toBe(false);
      }
    }
  });

  it('bumps the epoch on a membership change and freezes without a majority', () => {
    const o = new SwarmOrchestrator(cutGraph(), roster(['WORKER', 'WORKER', 'WORKER', 'WORKER', 'RESERVE', 'RESERVE']));
    o.observe(6, 1, false);
    o.tick(1);
    expect(o.quorum).toEqual({ status: 'DEGRADED', epoch: 2, members: 6, alive: 5 });
    expect(o.events.at(-1)).toEqual({ type: 'quorum-reset', t: 1, epoch: 2, alive: 5 });
    o.tick(2);
    expect(o.epoch).toBe(2); // no change → no new epoch

    o.observe(5, 1, false); o.observe(4, 1, false);
    o.tick(3);
    expect(o.quorum.status).toBe('LOST');
    expect(o.mayAct).toBe(false);
    expect(o.allocateBridge(0, 3, 3)).toEqual({ status: 'NO_SPAN' }); // a minority may not restructure

    o.observe(4, 1, true);
    o.tick(4);
    expect(o.quorum).toMatchObject({ status: 'DEGRADED', epoch: 3 });
    expect(o.mayAct).toBe(true);
  });
});

describe('battery hot-swap', () => {
  it('swaps a worker below 25 % for the best-charged reserve, once', () => {
    const o = new SwarmOrchestrator(cutGraph(), roster(['WORKER', 'WORKER', 'RESERVE', 'RESERVE']));
    o.observe(3, 0.6, true); o.observe(4, 0.9, true);
    o.observe(2, 0.25, true);
    o.tick(1);
    expect(o.events).toHaveLength(0); // exactly at the limit is still fine

    o.observe(2, 0.249, true);
    o.tick(2);
    expect(o.events).toEqual([{ type: 'hot-swap', t: 2, outId: 2, inId: 4, role: 'WORKER' }]);
    expect(o.roleOf(2)).toBe('RESERVE');
    expect(o.roleOf(4)).toBe('WORKER');
    o.tick(3);
    expect(o.events).toHaveLength(1);
  });

  it('reports a blocked swap once when no reserve is fit', () => {
    const o = new SwarmOrchestrator(cutGraph(), roster(['WORKER', 'RESERVE']));
    o.observe(1, 0.1, true); o.observe(2, 0.2, true);
    o.tick(1); o.tick(2);
    expect(o.events).toEqual([{ type: 'hot-swap-blocked', t: 1, outId: 1 }]);
    expect(o.roleOf(1)).toBe('WORKER');
  });
});

describe('role allocation on topological collapse', () => {
  it('spends reserves first and turns them into structure nodes', () => {
    const o = new SwarmOrchestrator(cutGraph(), roster(['WORKER', 'WORKER', 'WORKER', 'WORKER', 'RESERVE', 'RESERVE']));
    const plan = o.allocateBridge(0, 3, 5, 4);
    expect(plan).toMatchObject({ status: 'PLANNED', agentIds: [5, 6] });
    expect(o.idsWithRole('STRUCTURE_NODE')).toEqual([5, 6]);
    expect(o.idsWithRole('WORKER')).toEqual([1, 2, 3, 4]);
    expect(o.events.at(-1)).toMatchObject({ type: 'bridge-allocated', agentIds: [5, 6] });
    o.releaseStructure([5, 6]);
    expect(o.idsWithRole('RESERVE')).toEqual([5, 6]);
  });

  it('draws on spare workers, and rejects when the squad is too small', () => {
    const o = new SwarmOrchestrator(cutGraph(), roster(['WORKER', 'WORKER', 'WORKER', 'RESERVE']));
    expect(o.allocateBridge(0, 3, 0, 2)).toMatchObject({ status: 'PLANNED', agentIds: [4, 3] });

    const small = new SwarmOrchestrator(cutGraph(), roster(['WORKER', 'WORKER', 'RESERVE']));
    expect(small.allocateBridge(0, 3, 0, 2)).toMatchObject({ status: 'INSUFFICIENT_AGENTS', required: 2, available: 1 });
    expect(small.events.at(-1)).toEqual({ type: 'bridge-rejected', t: 0, reason: 'INSUFFICIENT_AGENTS' });
    expect(small.idsWithRole('STRUCTURE_NODE')).toEqual([]);
  });
});
