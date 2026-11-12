import { Factory, FlaskConical, Flame, HardHat, Pickaxe, ScanLine, type LucideIcon } from 'lucide-react';
import type { MessageKey } from '@/i18n/ru';

export type MissionId = 'calibration' | 'construction' | 'factory' | 'rescue' | 'mining';
export type RouteId = MissionId | 'benchmark';
/** Engine mode numbers (also the `?mode=` values of old links). */
export type EngineMode = 0 | 1 | 2 | 3 | 4;

type Vec3 = readonly [number, number, number];

export interface MissionDef {
  id: MissionId;
  mode: EngineMode;
  path: `/${MissionId}`;
  icon: LucideIcon;
  label: MessageKey;
  hint: MessageKey;
  description: MessageKey;
  /** Initial camera (Z-up world). */
  camera: { position: Vec3; target: Vec3 };
  /** Fog start / end (m); indoor scenes fade sooner. */
  fog: readonly [number, number];
  /** Key light strength — the factory is an indoor hall with dimmer light, the mine is dark. */
  sun: number;
  hemisphere: number;
  /** Background / fog colour (hex); omitted → theme viewport colour. */
  sky?: number;
  /** Image-based lighting: HDR warehouse (with offline fallback), procedural studio, or none (mine). */
  ibl: 'warehouse' | 'studio' | 'none';
  /** Key light position and half-extent of its shadow camera (m). */
  sunPosition: Vec3;
  shadowExtent: number;
  /** Camera dolly limit (m). */
  maxDistance: number;
}

export const MISSIONS: readonly MissionDef[] = [
  {
    id: 'calibration', mode: 0, path: '/calibration', icon: ScanLine,
    label: 'nav.calibration', hint: 'nav.calibration.hint', description: 'scenario.calibration',
    camera: { position: [-8.4, -7.7, 2.3], target: [-6.4, -4.8, 0.1] }, fog: [18, 60], sun: 2.6, hemisphere: 1.1,
    ibl: 'warehouse', sunPosition: [10, -18, 32], shadowExtent: 25, maxDistance: 90,
  },
  {
    id: 'construction', mode: 1, path: '/construction', icon: HardHat,
    label: 'nav.construction', hint: 'nav.construction.hint', description: 'scenario.construction',
    camera: { position: [14, -22, 16], target: [0, 2, 0] }, fog: [45, 110], sun: 2.6, hemisphere: 1.2,
    ibl: 'warehouse', sunPosition: [10, -18, 32], shadowExtent: 25, maxDistance: 90,
  },
  {
    id: 'factory', mode: 2, path: '/factory', icon: Factory,
    label: 'nav.factory', hint: 'nav.factory.hint', description: 'scenario.factory',
    camera: { position: [11, -21, 15], target: [0, -0.5, 0] }, fog: [34, 95], sun: 0.75, hemisphere: 0.7,
    ibl: 'warehouse', sunPosition: [10, -18, 32], shadowExtent: 24, maxDistance: 90,
  },
  {
    id: 'rescue', mode: 3, path: '/rescue', icon: Flame,
    label: 'nav.rescue', hint: 'nav.rescue.hint', description: 'scenario.rescue',
    camera: { position: [-34, -66, 42], target: [4, -8, 0] }, fog: [90, 230], sun: 2.1, hemisphere: 0.9,
    sky: 0x8f8679, ibl: 'studio', sunPosition: [-45, -55, 60], shadowExtent: 85, maxDistance: 200,
  },
  {
    id: 'mining', mode: 4, path: '/mining', icon: Pickaxe,
    label: 'nav.mining', hint: 'nav.mining.hint', description: 'scenario.mining',
    camera: { position: [-22, -46, 38], target: [-4, -8, 0] }, fog: [60, 170], sun: 0.7, hemisphere: 1.6,
    sky: 0x1b2026, ibl: 'none', sunPosition: [10, -18, 60], shadowExtent: 70, maxDistance: 170,
  },
];

export interface NavItem { id: RouteId; path: string; icon: LucideIcon; label: MessageKey; hint: MessageKey }

export const NAV_ITEMS: readonly NavItem[] = [
  ...MISSIONS.map(m => ({ id: m.id, path: m.path, icon: m.icon, label: m.label, hint: m.hint })),
  { id: 'benchmark', path: '/benchmark', icon: FlaskConical, label: 'nav.benchmark', hint: 'nav.benchmark.hint' },
];

/**
 * `?mode=N` → readable route: 0 calibration, 1 construction, 2 factory, 3 rescue, 4 mining.
 * `?mode=5` is the historic field-team link and also lands on /rescue.
 */
const MODE_ROUTES: readonly string[] = ['/calibration', '/construction', '/factory', '/rescue', '/mining', '/rescue'];

export function legacyModeRoute(search: string): string | null {
  const raw = new URLSearchParams(search).get('mode');
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return MODE_ROUTES[Number(raw)] ?? null;
}

export const DEFAULT_ROUTE = '/calibration';
