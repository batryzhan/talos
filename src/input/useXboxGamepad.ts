/**
 * React hook over XboxController (CLAUDE.md v2 §3): live GamepadTelemetry for the Xbox 360 HUD.
 *
 *   const pad = useXboxGamepad({ onCommand: cmd => bridge.apply(cmd, dt) });
 *   <XboxGamepadHUD telemetry={pad} />
 *
 * Uses useSyncExternalStore (tear-free with concurrent rendering). The controller keeps polling
 * through requestAnimationFrame while at least one hook (or other consumer) is mounted.
 * Pass a shared `controller` when the simulation loop also needs the same instance.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GamepadCommand, GamepadTelemetry } from '../contracts/types';
import { XboxController, type XboxControllerOptions } from './XboxController';

let sharedController: XboxController | null = null;

/** Process-wide controller (one physical pad drives the whole app). */
export function getSharedXboxController(options?: XboxControllerOptions): XboxController {
  if (!sharedController) sharedController = new XboxController(options);
  return sharedController;
}

export interface UseXboxGamepadOptions {
  controller?: XboxController;
  /** Called every poll (≈ display rate) with the decoded command. */
  onCommand?: (cmd: GamepadCommand) => void;
  /** Start the rAF polling loop (default true). Disable if the sim loop calls controller.poll(). */
  poll?: boolean;
}

export function useXboxGamepad(options: UseXboxGamepadOptions = {}): GamepadTelemetry {
  const controller = options.controller ?? getSharedXboxController();
  const onCommandRef = useRef(options.onCommand);
  onCommandRef.current = options.onCommand;
  const poll = options.poll ?? true;

  useEffect(() => {
    if (!poll) return undefined;
    return controller.startPolling(cmd => onCommandRef.current?.(cmd));
  }, [controller, poll]);

  // Chrome only exposes a pad after a button press; re-poll on (dis)connect for an immediate HUD update.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const kick = () => { controller.poll(); };
    window.addEventListener('gamepadconnected', kick);
    window.addEventListener('gamepaddisconnected', kick);
    return () => {
      window.removeEventListener('gamepadconnected', kick);
      window.removeEventListener('gamepaddisconnected', kick);
    };
  }, [controller]);

  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
