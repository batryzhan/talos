/**
 * Operation FSM (CLAUDE.md §4.6, formulas 1, 18, fig. 5):
 *   READY → APPROACH → CONTACT → LIFT → TRANSPORT → LOWER → READY
 * Any active state (APPROACH, CONTACT, LIFT, TRANSPORT, LOWER) → HOLD on a safety trigger.
 * HOLD is left only by an explicit recovery: HOLD → LOWER (controlled descent) or HOLD → READY.
 */
import type { OperationMode } from '../contracts/types';
import { ACTIVE_MODES } from '../contracts/types';

export const TRANSITIONS: Readonly<Record<OperationMode, readonly OperationMode[]>> = {
  READY: ['APPROACH'],
  APPROACH: ['CONTACT', 'READY', 'HOLD'],
  CONTACT: ['LIFT', 'APPROACH', 'HOLD', 'LOWER'],
  LIFT: ['TRANSPORT', 'LOWER', 'HOLD'],
  TRANSPORT: ['LOWER', 'HOLD'],
  LOWER: ['READY', 'HOLD'],
  HOLD: ['LOWER', 'READY'],
};

export function isActive(m: OperationMode): boolean {
  return ACTIVE_MODES.includes(m);
}

export function canTransition(from: OperationMode, to: OperationMode): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface FsmTransition { t: number; from: OperationMode; to: OperationMode; reason: string }

export class AgentFsm {
  mode: OperationMode = 'READY';
  readonly history: FsmTransition[] = [];
  holdReason: string | null = null;

  /** Guarded transition. Returns false (and changes nothing) if not allowed. */
  go(to: OperationMode, t: number, reason = ''): boolean {
    if (to === this.mode || !canTransition(this.mode, to)) return false;
    this.history.push({ t, from: this.mode, to, reason });
    this.mode = to;
    this.holdReason = to === 'HOLD' ? reason : null;
    return true;
  }

  /** Safety trigger: from any active state straight to HOLD. */
  trip(t: number, reason: string): boolean {
    if (!isActive(this.mode)) return false;
    return this.go('HOLD', t, reason);
  }

  reset(): void {
    this.mode = 'READY';
    this.holdReason = null;
  }
}

/** Formula 18: A_ready = ⋂_i {membership, calibration, charge, task confirmed} (+ at support point, contact). */
export interface ReadinessReport {
  agentId: number;
  epochOk: boolean;
  taskOk: boolean;
  calibrated: boolean;
  batteryOk: boolean;
  atSupportPoint: boolean;
  contactOk: boolean;
}

export function readinessFailures(r: ReadinessReport): string[] {
  const f: string[] = [];
  if (!r.epochOk) f.push('epoch');
  if (!r.taskOk) f.push('task');
  if (!r.calibrated) f.push('calibration');
  if (!r.batteryOk) f.push('battery');
  if (!r.atSupportPoint) f.push('position');
  if (!r.contactOk) f.push('contact');
  return f;
}

/** A_ready plus the stability-margin gate ρ ≥ ρ_min (r_c inside the support polygon). */
export function groupReady(reports: readonly ReadinessReport[], rho: number | undefined, rhoMin: number): boolean {
  if (reports.length === 0) return false;
  if (rho !== undefined && !(rho >= rhoMin)) return false;
  return reports.every(r => readinessFailures(r).length === 0);
}
