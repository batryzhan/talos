import { describe, expect, it } from 'vitest';
import { SEED_MAX, parseSeed } from '../../src/features/controls/seed';

describe('parseSeed', () => {
  it('accepts whole numbers in range, trimming spaces', () => {
    expect(parseSeed('0')).toEqual({ ok: true, value: 0 });
    expect(parseSeed(' 42 ')).toEqual({ ok: true, value: 42 });
    expect(parseSeed(String(SEED_MAX))).toEqual({ ok: true, value: SEED_MAX });
    expect(parseSeed('007')).toEqual({ ok: true, value: 7 });
  });

  it('rejects empty input', () => {
    expect(parseSeed('')).toEqual({ ok: false, error: 'empty' });
    expect(parseSeed('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects non-integers, negatives and exponent notation', () => {
    for (const raw of ['-1', '1.5', '1e3', 'abc', '12a', '+3', '0x10']) {
      expect(parseSeed(raw)).toEqual({ ok: false, error: 'integer' });
    }
  });

  it('rejects values above the 32-bit signed range', () => {
    expect(parseSeed(String(SEED_MAX + 1))).toEqual({ ok: false, error: 'range' });
    expect(parseSeed('99999999999999999999')).toEqual({ ok: false, error: 'range' });
  });
});
