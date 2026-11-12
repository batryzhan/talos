import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Engine } from '@/platform/Engine';
import { perf } from './perf';

/**
 * Advances the engine's fixed 10 ms physics step by the frame time (the step size never depends on
 * the frame rate) and syncs robot rigs. Mounted first, so the camera and overlay see this frame's poses.
 */
export function SimulationDriver({ engine }: { engine: Engine }): null {
  useFrame((_, delta) => engine.advance(delta));
  return null;
}

/** Frame-rate probe: averages over 0.5 s into the shared `perf` object (no React state). */
export function FrameProbe(): null {
  const acc = useRef({ time: 0, frames: 0 });
  useFrame((_, delta) => {
    const a = acc.current;
    a.time += delta;
    a.frames += 1;
    if (a.time >= 0.5) {
      perf.fps = a.frames / a.time;
      perf.frameMs = (a.time * 1000) / a.frames;
      a.time = 0;
      a.frames = 0;
    }
  });
  return null;
}
