import { describe, expect, it } from 'vitest';
import { LOG_COLUMNS, csvField, exportFilename, toCsv, toJson } from '../../src/features/log/export';
import type { RunLogRecord } from '../../src/contracts/types';

const record = (over: Partial<RunLogRecord> = {}): RunLogRecord => ({
  run_id: '2026-11-12T10:00:00.000Z', seed: 7, controller: 'C', N: 8, p: 0.1, epoch: 2,
  time: 1.5, agent_id: 3, state: 'TRANSPORT', command: 0.012, E_h: 0.0004, E_traj: 0.02,
  ...over,
});

describe('run log CSV export', () => {
  it('writes the header in the research-log column order', () => {
    const csv = toCsv([]);
    expect(csv).toBe(`${LOG_COLUMNS.join(',')}\r\n`);
    expect(LOG_COLUMNS.slice(0, 3)).toEqual(['run_id', 'seed', 'controller']);
  });

  it('writes one CRLF-terminated line per record with empty cells for missing fields', () => {
    const lines = toCsv([record(), record({ agent_id: 4, E_h: undefined })]).split('\r\n');
    expect(lines).toHaveLength(4); // header + 2 rows + trailing empty
    expect(lines[1]).toBe('2026-11-12T10:00:00.000Z,7,C,8,0.1,2,1.5,3,TRANSPORT,0.012,0.0004,0.02,,');
    expect(lines[2].split(',')[10]).toBe('');
    expect(lines[3]).toBe('');
  });

  it('quotes fields containing separators, quotes or line breaks (RFC 4180)', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField(undefined)).toBe('');
    expect(csvField(Number.NaN)).toBe('');
    const line = toCsv([record({ run_id: 'run, "quoted"' })]).split('\r\n')[1];
    expect(line.startsWith('"run, ""quoted""",7,')).toBe(true);
  });

  it('round-trips through JSON', () => {
    const rows = [record(), record({ agent_id: 9 })];
    expect(JSON.parse(toJson(rows))).toEqual(rows);
  });

  it('names the file after mission, seed and UTC time', () => {
    expect(exportFilename('factory', 42, 'csv', new Date('2026-11-12T10:15:30.123Z'))).toBe('talos-factory-seed42-20261112T101530.csv');
  });
});
