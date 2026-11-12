/** Largest accepted seed (signed 32-bit range, what the RNG seeds with). */
export const SEED_MAX = 2_147_483_647;

export type SeedError = 'empty' | 'integer' | 'range';
export type SeedParse = { ok: true; value: number } | { ok: false; error: SeedError };

/** Validate the seed field: a whole number 0 … 2 147 483 647 (surrounding spaces allowed). */
export function parseSeed(raw: string): SeedParse {
  const s = raw.trim();
  if (s === '') return { ok: false, error: 'empty' };
  if (!/^\d+$/.test(s)) return { ok: false, error: 'integer' };
  const value = Number(s);
  if (!Number.isSafeInteger(value) || value > SEED_MAX) return { ok: false, error: 'range' };
  return { ok: true, value };
}
