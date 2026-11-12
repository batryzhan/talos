import type { Object3D } from 'three';

/** Three.js side of a workflow mission: scene graph root plus a per-frame, allocation-free sync. */
export interface MissionView {
  readonly root: Object3D;
  /** Copy simulation state onto the scene; `overlay` toggles the engineering layer. */
  sync(time: number, overlay: boolean): void;
  dispose(): void;
}
