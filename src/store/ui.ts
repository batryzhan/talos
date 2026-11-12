import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ThemeName } from '@/design/tokens';
import type { ControllerKind } from '@/contracts/types';

export type Lang = 'ru' | 'en';
export type CameraMode = 'orbit' | 'top' | 'auto';
/** What the camera follows and the telemetry table highlights. */
export type Selection = { kind: 'agent'; id: number } | { kind: 'team'; id: string } | null;

export const POWER_LIMITS = [0.25, 0.5, 0.75, 1] as const;

interface UiState {
  // Persisted interface preferences
  theme: ThemeName;
  lang: Lang;
  leftOpen: boolean;
  bottomOpen: boolean;
  overlay: boolean;
  // Per-session state
  rightOpen: boolean;
  mobileLeftOpen: boolean;
  camera: CameraMode;
  selection: Selection;
  hovered: number | null;
  controller: ControllerKind;
  lossP: number;
  routeLearning: boolean;
  setRouteLearning: (on:boolean) => void;
  powerLimit: number;
  paused: boolean;
  seed: number;
  /** Incremented to rebuild the engine with the same settings. */
  restartToken: number;

  setTheme: (theme: ThemeName) => void;
  setLang: (lang: Lang) => void;
  setLeftOpen: (open: boolean) => void;
  setMobileLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setBottomOpen: (open: boolean) => void;
  setOverlay: (on: boolean) => void;
  setCamera: (camera: CameraMode) => void;
  select: (selection: Selection) => void;
  hover: (id: number | null) => void;
  setController: (controller: ControllerKind) => void;
  setLossP: (p: number) => void;
  setPowerLimit: (limit: number) => void;
  setPaused: (paused: boolean) => void;
  restart: (seed: number) => void;
  /** Reset per-mission state when the route changes. */
  enterMission: () => void;
}

const sameSelection = (a: Selection, b: Selection): boolean =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

export const useUiStore = create<UiState>()(
  persist(
    set => ({
      theme: 'dark',
      lang: 'ru',
      leftOpen: true,
      bottomOpen: true,
      overlay: false,
      rightOpen: false,
      mobileLeftOpen: false,
      camera: 'orbit',
      selection: null,
      hovered: null,
      controller: 'C',
      lossP: 0,
      routeLearning: true,
      setRouteLearning: routeLearning => set({ routeLearning }),
      powerLimit: 1,
      paused: false,
      seed: 0,
      restartToken: 0,

      setTheme: theme => set({ theme }),
      setLang: lang => set({ lang }),
      setLeftOpen: leftOpen => set({ leftOpen }),
      setMobileLeftOpen: mobileLeftOpen => set({ mobileLeftOpen }),
      setRightOpen: rightOpen => set({ rightOpen }),
      setBottomOpen: bottomOpen => set({ bottomOpen }),
      setOverlay: overlay => set({ overlay }),
      setCamera: camera => set({ camera }),
      select: selection => set(s => (sameSelection(s.selection, selection) ? s : { selection })),
      hover: hovered => set(s => (s.hovered === hovered ? s : { hovered })),
      setController: controller => set({ controller }),
      setLossP: lossP => set({ lossP: Math.min(1, Math.max(0, lossP)) }),
      setPowerLimit: powerLimit => set({ powerLimit }),
      setPaused: paused => set({ paused }),
      restart: seed => set(s => ({ seed, restartToken: s.restartToken + 1, paused: false, selection: null })),
      enterMission: () => set({ selection: null, hovered: null, paused: false, camera: 'orbit' }),
    }),
    {
      name: 'talos-ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: s => ({ theme: s.theme, lang: s.lang, leftOpen: s.leftOpen, bottomOpen: s.bottomOpen, overlay: s.overlay }),
    },
  ),
);
