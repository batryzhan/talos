/**
 * Frame statistics written by the viewport's frame probe and read by the 4 Hz telemetry poll.
 * A plain mutable object: the render loop must not touch React state.
 */
export const perf = { fps: 60, frameMs: 1000 / 60 };
