import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { Color, InterleavedBuffer } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export interface LinePoolHandle {
  /** Write segment `i` (no allocation). */
  set(i: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: Color): void;
  /** Collapse segments [from, limit) and upload the frame's changes. */
  commit(from: number): void;
}

/**
 * Fixed-capacity screen-space fat lines (one draw call). Same primitive as drei `Segments`
 * (LineSegments2 + LineMaterial), but the instance buffers are allocated once and written in
 * place — drei's `Segments` rebuilds both buffers every frame, which allocates and leaks GPU buffers.
 */
export const LinePool = forwardRef<LinePoolHandle, { limit: number; lineWidth: number; opacity?: number }>(
  ({ limit, lineWidth, opacity = 1 }, ref) => {
    const size = useThree(s => s.size);
    const res = useMemo(() => {
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(new Float32Array(limit * 6));
      geometry.setColors(new Float32Array(limit * 6));
      const material = new LineMaterial({ vertexColors: true, linewidth: lineWidth, transparent: opacity < 1, opacity, worldUnits: false });
      material.toneMapped = false;
      material.depthTest = false; // overlay layer: always on top, like a CAD / GIS annotation layer
      const line = new LineSegments2(geometry, material);
      line.frustumCulled = false;
      line.renderOrder = 3;
      const positions = (geometry.getAttribute('instanceStart') as unknown as { data: InterleavedBuffer }).data;
      const colors = (geometry.getAttribute('instanceColorStart') as unknown as { data: InterleavedBuffer }).data;
      return { geometry, material, line, positions, colors };
    }, [limit, lineWidth, opacity]);

    useLayoutEffect(() => { res.material.resolution.set(size.width, size.height); }, [res, size]);
    useLayoutEffect(() => () => { res.geometry.dispose(); res.material.dispose(); }, [res]);

    useImperativeHandle(ref, () => ({
      set(i, x0, y0, z0, x1, y1, z1, c) {
        if (i >= limit) return;
        const p = res.positions.array as Float32Array, q = res.colors.array as Float32Array, o = i * 6;
        p[o] = x0; p[o + 1] = y0; p[o + 2] = z0; p[o + 3] = x1; p[o + 4] = y1; p[o + 5] = z1;
        q[o] = c.r; q[o + 1] = c.g; q[o + 2] = c.b; q[o + 3] = c.r; q[o + 4] = c.g; q[o + 5] = c.b;
      },
      commit(from) {
        (res.positions.array as Float32Array).fill(0, from * 6);
        res.positions.needsUpdate = true;
        res.colors.needsUpdate = true;
      },
    }), [res, limit]);

    return <primitive object={res.line} />;
  },
);
LinePool.displayName = 'LinePool';
