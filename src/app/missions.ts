import { Blocks, Factory, FlaskConical, HardHat, MountainSnow, ScanLine, type LucideIcon } from 'lucide-react';
import type { MessageKey } from '@/i18n/ru';

export type MissionId = 'calibration' | 'construction' | 'factory' | 'metamorphic' | 'rescue';
export type RouteId = MissionId | 'benchmark';
/** Engine mode numbers (historic `?mode=` values). */
export type EngineMode = 0 | 1 | 2 | 4 | 5;

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
  /** Key light strength — the factory is an indoor hall with dimmer light. */
  sun: number;
  hemisphere: number;
}

export const MISSIONS: readonly MissionDef[] = [
  {
    id: 'calibration', mode: 0, path: '/calibration', icon: ScanLine,
    label: 'nav.calibration', hint: 'nav.calibration.hint', description: 'scenario.calibration',
    camera: { position: [-9.6, -8.4, 2.4], target: [-7, -5, 0.15] }, fog: [18, 60], sun: 2.6, hemisphere: 1.1,
  },
  {
    id: 'construction', mode: 1, path: '/construction', icon: HardHat,
    label: 'nav.construction', hint: 'nav.construction.hint', description: 'scenario.construction',
    camera: { position: [14, -22, 16], target: [0, 2, 0] }, fog: [45, 110], sun: 2.6, hemisphere: 1.2,
  },
  {
    id: 'factory', mode: 2, path: '/factory', icon: Factory,
    label: 'nav.factory', hint: 'nav.factory.hint', description: 'scenario.factory',
    camera: { position: [12, -18, 13], target: [-1, 1, 0] }, fog: [30, 90], sun: 0.9, hemisphere: 0.8,
  },
  {
    id: 'metamorphic', mode: 4, path: '/metamorphic', icon: Blocks,
    label: 'nav.metamorphic', hint: 'nav.metamorphic.hint', description: 'scenario.metamorphic',
    camera: { position: [-2.5, -7.5, 6], target: [-0.5, 0, 0] }, fog: [20, 70], sun: 2.6, hemisphere: 1.1,
  },
  {
    id: 'rescue', mode: 5, path: '/rescue', icon: MountainSnow,
    label: 'nav.rescue', hint: 'nav.rescue.hint', description: 'scenario.rescue',
    camera: { position: [64, -85, 76], target: [0, 6, 0] }, fog: [105, 220], sun: 2.8, hemisphere: 1.15,
  },
];

export interface NavItem { id: RouteId; path: string; icon: LucideIcon; label: MessageKey; hint: MessageKey }

export const NAV_ITEMS: readonly NavItem[] = [
  ...MISSIONS.map(m => ({ id: m.id, path: m.path, icon: m.icon, label: m.label, hint: m.hint })),
  { id: 'benchmark', path: '/benchmark', icon: FlaskConical, label: 'nav.benchmark', hint: 'nav.benchmark.hint' },
];

/** Historic `?mode=N` → readable route (0 calibration, 1 construction, 2 factory, 3 benchmark, 4 metamorphic). */
const LEGACY_ROUTES = ['/calibration', '/construction', '/factory', '/benchmark', '/metamorphic', '/rescue'] as const;

export function legacyModeRoute(search: string): string | null {
  const raw = new URLSearchParams(search).get('mode');
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return LEGACY_ROUTES[Number(raw)] ?? null;
}

export const DEFAULT_ROUTE = '/calibration';
