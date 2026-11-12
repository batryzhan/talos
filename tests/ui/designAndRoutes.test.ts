import { describe, expect, it } from 'vitest';
import { THEMES, TOKEN_NAMES, oklchToLinearSrgb, parseOklch } from '../../src/design/tokens';
import { legacyModeRoute, MISSIONS, NAV_ITEMS } from '../../src/app/missions';
import { ru } from '../../src/i18n/ru';
import { en } from '../../src/i18n/en';
import { translate, translatePlural } from '../../src/i18n';

const toSrgb8 = (c: number): number => Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);

describe('design tokens', () => {
  it('converts OKLCH to sRGB (indigo-500 #6366f1, zinc background #0a0a0b)', () => {
    const indigo = oklchToLinearSrgb(0.585, 0.204, 277).map(toSrgb8);
    expect(indigo[0]).toBeCloseTo(0x63, -0.5);
    expect(indigo[1]).toBeCloseTo(0x66, -0.5);
    expect(indigo[2]).toBeCloseTo(0xf1, -0.5);
    const bg = parseOklch(THEMES.dark.background);
    expect(oklchToLinearSrgb(bg.l, bg.c, bg.h).map(toSrgb8)).toEqual([10, 10, 11]);
  });

  it('defines every token in both themes, with alpha only on borders', () => {
    for (const theme of ['dark', 'light'] as const) {
      for (const name of TOKEN_NAMES) {
        const v = parseOklch(THEMES[theme][name]);
        expect([v.l, v.c, v.h].every(Number.isFinite), `${theme}.${name}`).toBe(true);
        if (v.alpha !== 1) expect(['border', 'input']).toContain(name);
      }
    }
  });
});

describe('routes', () => {
  it('redirects ?mode=0..4 to the five missions and the historic ?mode=5 to /rescue', () => {
    expect(legacyModeRoute('?mode=0')).toBe('/calibration');
    expect(legacyModeRoute('?mode=1')).toBe('/construction');
    expect(legacyModeRoute('?mode=2')).toBe('/factory');
    expect(legacyModeRoute('?mode=3')).toBe('/rescue');
    expect(legacyModeRoute('?mode=4')).toBe('/mining');
    expect(legacyModeRoute('?mode=5')).toBe('/rescue');
    expect(legacyModeRoute('?mode=6')).toBeNull();
    expect(legacyModeRoute('?mode=9')).toBeNull();
    expect(legacyModeRoute('?mode=x')).toBeNull();
    expect(legacyModeRoute('')).toBeNull();
  });

  it('has one nav tab per mode with a unique path', () => {
    expect(NAV_ITEMS.map(i => i.path)).toEqual(['/calibration', '/construction', '/factory', '/rescue', '/mining', '/benchmark']);
    expect(MISSIONS.map(m => m.mode)).toEqual([0, 1, 2, 3, 4]);
  });

  it('has no metamorphic route, label or translation left', () => {
    expect(NAV_ITEMS.some(i => i.path.includes('metamorph'))).toBe(false);
    for (const dict of [ru, en]) for (const [k, v] of Object.entries(dict)) { expect(k).not.toMatch(/metamorph|^macro\./i); expect(v).not.toMatch(/метаморф|metamorph/i); }
  });
});

describe('i18n', () => {
  it('ships the same keys in Russian and English, none empty', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
    for (const [k, v] of Object.entries(en)) expect(v.length, k).toBeGreaterThan(0);
  });

  it('interpolates placeholders', () => {
    expect(translate('ru', 'controls.restart')).toBe('Перезапустить сценарий');
    expect(translate('en', 'bench.progress', { done: 25, total: 1300 })).toBe('25 of 1300 runs');
  });

  it('picks Russian and English plural forms', () => {
    expect([1, 2, 5, 11, 21, 22].map(n => translatePlural('ru', 'telemetry.count', n))).toEqual(['1 робот', '2 робота', '5 роботов', '11 роботов', '21 робот', '22 робота']);
    expect([1, 20].map(n => translatePlural('en', 'telemetry.count', n))).toEqual(['1 robot', '20 robots']);
  });

  it('uses no bracketed terminal-style labels', () => {
    for (const v of [...Object.values(ru), ...Object.values(en)]) expect(v).not.toMatch(/\[\d+\s*\/\//);
  });
});
