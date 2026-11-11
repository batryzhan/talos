/**
 * SCADA card for the metamorphic swarm: lock confirmation, aggregate current, per-chassis power,
 * consensus residual D(k), latch stress, route and bridge state.
 *
 * The simulation mutates one snapshot object in place, so this card polls it at 5 Hz instead of
 * subscribing; nothing here runs in the physics or render loop.
 */
import { useEffect, useState } from 'react';
import { stressLevel } from '../../core/metamorphic/docking';
import type { MetamorphicScene } from '../../simulation/environments/MetamorphicScene';
import type { StressLevel } from '../../types/metamorphic';

const REFRESH_MS = 200;
const CONSENSUS_THRESHOLD = 0.01;

const LEVEL_CLASS: Record<StressLevel, string> = { NOMINAL: 'ready', ELEVATED: 'warn', CRITICAL: 'fault' };

function fixed(v: number, digits: number): string {
  return Number.isFinite(v) ? v.toFixed(digits) : '∞';
}

export function MacroTelemetry({ scene }: { scene: MetamorphicScene }): JSX.Element {
  const [, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame(n => n + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const h = scene.hud, level = stressLevel(h.peakStress);
  const lock = h.locked
    ? { text: 'STRUCTURAL_LOCK CONFIRMED', cls: 'ready' }
    : h.dockStatus.some(d => d !== 'DISCONNECTED')
      ? { text: `ASSEMBLING ${h.lockedCount}/${h.required}`, cls: 'warn' }
      : { text: 'SOLO · LATCHES OPEN', cls: '' };
  const converged = h.locked && h.residual <= CONSENSUS_THRESHOLD;

  return (
    <>
      <div className="rates">
        <span>PHYSICS <b>100 Hz</b></span>
        <span>CONTROL <b>50 Hz</b></span>
        <span>RADIO <b>20 Hz</b></span>
      </div>

      <h3>MACRO-ENTITY {h.formation.replace('x', '×')}</h3>
      <p role="status" className={lock.cls}>{lock.text}</p>
      <table>
        <tbody>
          <tr><th scope="row">Σ I / A</th><td>{fixed(h.totalCurrent, 2)}</td></tr>
          <tr>
            <th scope="row">D(k) / A</th>
            <td className={h.locked ? (converged ? 'ready' : 'warn') : ''}>
              {h.locked ? `${fixed(h.residual, 4)} · k=${h.consensusSteps}` : '—'}
            </td>
          </tr>
          <tr><th scope="row">Saturation s</th><td className={h.saturation > 1 ? 'warn' : ''}>{fixed(h.saturation, 3)}</td></tr>
          <tr><th scope="row">Latch load</th><td className={LEVEL_CLASS[level]}>{fixed(h.peakStress * 100, 0)}% · {level}</td></tr>
          <tr>
            <th scope="row">S1 route</th>
            <td className={h.routeStatus === 'FOUND' ? 'ready' : 'fault'}>
              {h.routeStatus === 'FOUND' ? `d = ${fixed(h.routeCost, 2)} m` : 'd = ∞'}
            </td>
          </tr>
          <tr><th scope="row">Bridge</th><td className={h.bridgeStatus === 'HOLDING' ? 'ready' : ''}>{h.bridgeStatus}</td></tr>
          <tr>
            <th scope="row">Quorum / epoch</th>
            <td className={h.quorumStatus === 'STABLE' ? 'ready' : h.quorumStatus === 'LOST' ? 'fault' : 'warn'}>{h.quorumStatus} / {h.epoch}</td>
          </tr>
          <tr><th scope="row">Radio p / delivered</th><td>{h.lossP} / {fixed(h.delivery * 100, 1)}%</td></tr>
          <tr><th scope="row">Control focus</th><td>{h.focus === 'macro' ? 'MACRO-ENTITY' : 'SOLO CHASSIS'}</td></tr>
        </tbody>
      </table>

      <h3>CHASSIS</h3>
      <table>
        <thead><tr><th>ID</th><th>ROLE</th><th>LATCH</th><th>P / W</th></tr></thead>
        <tbody>
          {h.dockStatus.map((status, i) => (
            <tr key={i}>
              <th scope="row">{String(i + 1).padStart(2, '0')}</th>
              <td>{scene.orchestrator.roleOf(i + 1)}</td>
              <td className={status === 'STRUCTURAL_LOCK' ? 'ready' : status === 'DISCONNECTED' ? '' : 'warn'}>{status}</td>
              <td>{fixed(h.chassisPower[i], 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {scene.dag && (
        <>
          <h3>MISSION DAG</h3>
          <table>
            <tbody>
              {scene.dag.tasks.map(task => (
                <tr key={task.id}>
                  <th scope="row">{task.id} · {task.type}</th>
                  <td className={task.status === 'DONE' ? 'ready' : ''}>{task.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
