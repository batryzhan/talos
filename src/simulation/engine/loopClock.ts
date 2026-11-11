/**
 * Fixed-rate loop separation (CLAUDE.md §6.1): the world physics runs every 10 ms; the agent
 * control loop and the radio exchange are integer subdivisions of that tick. Rendering is driven
 * separately by requestAnimationFrame and never advances this clock.
 */
import { CONTROL_HZ, RADIO_HZ } from '../../contracts/types';

export const PHYSICS_HZ = 100;
export const PHYSICS_DT = 1 / PHYSICS_HZ;
/** Physics ticks per control step (2) and per radio step (5). */
export const CONTROL_DIVIDER = PHYSICS_HZ / CONTROL_HZ;
export const RADIO_DIVIDER = PHYSICS_HZ / RADIO_HZ;
export const CONTROL_DT = 1 / CONTROL_HZ;
export const RADIO_DT = 1 / RADIO_HZ;

export class LoopClock {
  /** Physics ticks elapsed. */
  tick = 0;

  /** Simulation time (s), derived from the tick count so it never drifts. */
  get time(): number {
    return this.tick * PHYSICS_DT;
  }

  /** True on physics ticks where the 50 Hz control loop runs. */
  get controlDue(): boolean {
    return this.tick % CONTROL_DIVIDER === 0;
  }

  /** True on physics ticks where the 20 Hz radio exchange runs. */
  get radioDue(): boolean {
    return this.tick % RADIO_DIVIDER === 0;
  }

  get radioTick(): number {
    return Math.floor(this.tick / RADIO_DIVIDER);
  }

  advance(): void {
    this.tick++;
  }

  reset(): void {
    this.tick = 0;
  }
}
