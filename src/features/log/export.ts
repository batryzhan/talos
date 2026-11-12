import type { RunLogRecord } from '@/contracts/types';

/** Column order of the run log export (matches the research log schema). */
export const LOG_COLUMNS: readonly (keyof RunLogRecord)[] = [
  'run_id', 'seed', 'controller', 'N', 'p', 'epoch', 'time', 'agent_id', 'state', 'command', 'E_h', 'E_traj', 'TSR', 'SSR',
];

/** RFC 4180 field: quote when it contains a comma, quote, CR or LF; double inner quotes. */
export function csvField(value: unknown): string {
  if (value === undefined || value === null) return '';
  const s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly RunLogRecord[], columns: readonly (keyof RunLogRecord)[] = LOG_COLUMNS): string {
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map(k => csvField(r[k])).join(','));
  return lines.join('\r\n') + '\r\n';
}

export function toJson(rows: readonly RunLogRecord[]): string {
  return JSON.stringify(rows, null, 2);
}

/** `talos-construction-seed42-20261112T101500.csv` */
export function exportFilename(mission: string, seed: number, ext: 'csv' | 'json', now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');
  return `talos-${mission}-seed${seed}-${stamp}.${ext}`;
}
