import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color } from 'three';
import type { Engine } from '@/platform/Engine';
import { useUiStore } from '@/store/ui';
import { EQ1_ROWS, STRAFER_KINEMATICS, WHEEL_POSITIONS, stoppingDistance } from '@/core/calibration/chassisKinematics';
import { scenePalette, type ScenePalette } from './palette';
import { LinePool, type LinePoolHandle } from './LinePool';

const LINES = 360;
const Z = 0.03;
/** Arrow length (m) at |ω| = ω_lim, and per m/s of body speed. */
const RIM_M = 0.42, THRUST_M = 0.32, BODY_M = 0.7;
const ARC_SEGMENTS = 14;

interface Writer { pool: LinePoolHandle; i: number }

function seg(w: Writer, x0: number, y0: number, x1: number, y1: number, c: Color, z = Z): void {
  w.pool.set(w.i++, x0, y0, z, x1, y1, z, c);
}

/** Shaft + two head strokes, world frame. */
function arrow(w: Writer, x: number, y: number, dx: number, dy: number, c: Color): void {
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return;
  const ux = dx / len, uy = dy / len, h = Math.min(0.07, len * 0.45);
  const tx = x + dx, ty = y + dy;
  seg(w, x, y, tx, ty, c);
  seg(w, tx, ty, tx - ux * h - uy * h * 0.55, ty - uy * h + ux * h * 0.55, c);
  seg(w, tx, ty, tx - ux * h + uy * h * 0.55, ty - uy * h - ux * h * 0.55, c);
}

/**
 * /calibration engineering layer, always on: per-wheel rim speed (blue forward / amber reverse),
 * roller thrust at 45° (green), measured body velocity and yaw rate (foreground), the equation-7
 * stopping point (red bar), the path trail and the home pose. One fat-line pool, no allocation per frame.
 */
export function CalibrationOverlay({ engine }: { engine: Engine }): JSX.Element {
  const theme = useUiStore(s => s.theme);
  const palette: ScenePalette = scenePalette(theme);
  const pool = useRef<LinePoolHandle>(null);
  const writer = useMemo<Writer>(() => ({ pool: null as unknown as LinePoolHandle, i: 0 }), []);
  const trailColor = useMemo(() => new Color(), []);

  useFrame(() => {
    const p = pool.current, cal = engine.calibration, a = engine.agents[0];
    if (!p || !cal || !a) return;
    writer.pool = p; writer.i = 0;
    const lim = STRAFER_KINEMATICS.omegaLim;
    const x = a.pose.x, y = a.pose.y, th = a.pose.theta, c = Math.cos(th), s = Math.sin(th);

    for (let i = 0; i < 4; i++) {
      const [bx, by] = WHEEL_POSITIONS[i];
      const wx = x + c * bx - s * by, wy = y + s * bx + c * by;
      const ratio = Math.max(-1.25, Math.min(1.25, a.wheelRates[i] / lim));
      if (Math.abs(ratio) < 0.004) continue;
      // Rim speed: along the wheel (body +x), offset outboard.
      const off = by > 0 ? 0.075 : -0.075, ox = -s * off, oy = c * off;
      arrow(writer, wx + ox, wy + oy, c * ratio * RIM_M, s * ratio * RIM_M, ratio > 0 ? palette.info : palette.warning);
      // Roller thrust: (1, s_y)/√2 in the body frame.
      const tx = Math.SQRT1_2 * ratio * THRUST_M, ty = EQ1_ROWS[i][0] * Math.SQRT1_2 * ratio * THRUST_M;
      arrow(writer, wx, wy, c * tx - s * ty, s * tx + c * ty, palette.success);
    }

    // Body velocity (odometry) and yaw-rate arc.
    const t = a.twist, vwx = c * t.vx - s * t.vy, vwy = s * t.vx + c * t.vy, speed = Math.hypot(vwx, vwy);
    arrow(writer, x, y, vwx * BODY_M, vwy * BODY_M, palette.foreground);
    if (Math.abs(t.omega) > 0.02) {
      const r = 0.34, sweep = Math.max(-2.6, Math.min(2.6, t.omega * 1.2));
      for (let k = 0; k < ARC_SEGMENTS; k++) {
        const a0 = th + (sweep * k) / ARC_SEGMENTS, a1 = th + (sweep * (k + 1)) / ARC_SEGMENTS;
        seg(writer, x + r * Math.cos(a0), y + r * Math.sin(a0), x + r * Math.cos(a1), y + r * Math.sin(a1), palette.primary);
      }
      const ae = th + sweep, ex = x + r * Math.cos(ae), ey = y + r * Math.sin(ae), dir = Math.sign(sweep);
      arrow(writer, ex - dir * -Math.sin(ae) * 0.06, ey - dir * Math.cos(ae) * 0.06, dir * -Math.sin(ae) * 0.06, dir * Math.cos(ae) * 0.06, palette.primary);
    }

    // Equation 7: where the chassis would stop if the command dropped now.
    if (speed > 0.03) {
      const d = stoppingDistance(speed, cal.tau, cal.aBrake), ux = vwx / speed, uy = vwy / speed;
      const sx = x + ux * d, sy = y + uy * d;
      seg(writer, x, y, sx, sy, palette.destructive, Z * 0.5);
      seg(writer, sx - uy * 0.22, sy + ux * 0.22, sx + uy * 0.22, sy - ux * 0.22, palette.destructive);
    }

    // Home pose (cross) and the path trail.
    const o = cal.origin;
    seg(writer, o.x - 0.12, o.y, o.x + 0.12, o.y, palette.muted);
    seg(writer, o.x, o.y - 0.12, o.x, o.y + 0.12, palette.muted);
    const n = cal.trailCount, cap = cal.trail.length / 2;
    for (let k = 1; k < n && writer.i < LINES; k++) {
      const i0 = (cal.trailHead - n + k - 1 + cap) % cap, i1 = (i0 + 1) % cap;
      trailColor.copy(palette.primary).multiplyScalar(0.25 + (0.75 * k) / n);
      seg(writer, cal.trail[i0 * 2], cal.trail[i0 * 2 + 1], cal.trail[i1 * 2], cal.trail[i1 * 2 + 1], trailColor, Z * 0.3);
    }
    p.commit(writer.i);
  });

  return <LinePool ref={pool} limit={LINES} lineWidth={2.2} />;
}
