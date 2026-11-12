import { useSyncExternalStore } from 'react';
import { XboxController } from '@/input/XboxController';
import type { GamepadTelemetry } from '@/contracts/types';

let instance: XboxController | null = null;

/** One gamepad driver for the whole app (it survives mission changes). */
export function getPad(): XboxController {
  instance ??= new XboxController();
  return instance;
}

/**
 * Subscribe to one primitive slice of the gamepad snapshot. The component re-renders only when that
 * slice changes, not on every poll.
 */
export function usePadValue<T extends string | number | boolean | null>(select: (s: GamepadTelemetry) => T): T {
  const pad = getPad();
  return useSyncExternalStore(pad.subscribe, () => select(pad.getSnapshot()));
}

/** Full snapshot (sticks, triggers, buttons) for the gamepad visualisation. */
export function usePadSnapshot(): GamepadTelemetry {
  const pad = getPad();
  return useSyncExternalStore(pad.subscribe, pad.getSnapshot);
}
