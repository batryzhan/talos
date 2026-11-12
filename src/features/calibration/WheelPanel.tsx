import { CircleAlert, CircleCheck, Cog } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSim } from '@/features/sim/simStore';
import { EQ1_ROWS, STRAFER_KINEMATICS, WHEEL_POSITIONS } from '@/core/calibration/chassisKinematics';
import type { CalibrationSnapshot } from '@/core/calibration/snapshot';
import { Kpi } from '@/features/workflow/common';

const W = 260, H = 210, CX = W / 2, CY = H / 2 + 4;
/** px per metre of chassis geometry. */
const K = 250;
/** Arrow length (px) at |ω| = ω_lim and per m/s of body speed. */
const RIM_PX = 56, THRUST_PX = 44, BODY_PX = 48;

/** Body (x forward, y left) → SVG (forward = up). */
const sx = (y: number): number => CX - y * K;
const sy = (x: number): number => CY - x * K;

function Arrow({ x, y, dx, dy, className, width = 2 }: { x: number; y: number; dx: number; dy: number; className?: string; width?: number }): JSX.Element | null {
  const len = Math.hypot(dx, dy);
  if (len < 1.5) return null;
  const ux = dx / len, uy = dy / len, head = Math.min(7, len * 0.6);
  const tx = x + dx, ty = y + dy;
  const p1 = `${tx - ux * head - uy * head * 0.55},${ty - uy * head + ux * head * 0.55}`;
  const p2 = `${tx - ux * head + uy * head * 0.55},${ty - uy * head - ux * head * 0.55}`;
  return (
    <g className={className}>
      <line x1={x} y1={y} x2={tx - ux * head * 0.6} y2={ty - uy * head * 0.6} stroke="currentColor" strokeWidth={width} strokeLinecap="round" />
      <polygon points={`${tx},${ty} ${p1} ${p2}`} fill="currentColor" />
    </g>
  );
}

/** Top view of the Strafer: rim-speed arrows, roller thrust at 45°, body velocity and yaw rate. */
function TopView({ c }: { c: CalibrationSnapshot }): JSX.Element {
  const t = useT();
  const lim = c.omegaLim;
  const bodyX = sx(0), bodyY = sy(0);
  const v = c.measured;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('cal.topView')}>
      {/* frame 432 × 360 mm */}
      <rect x={sx(0.18)} y={sy(0.216)} width={0.36 * K} height={0.432 * K} rx={6} className="fill-muted/60 stroke-border" strokeWidth={1.5} />
      <line x1={CX} y1={sy(0.2)} x2={CX} y2={sy(0.26)} className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="2 3" />
      <text x={CX} y={sy(0.27)} textAnchor="middle" className="fill-muted-foreground text-[9px]">+x</text>
      {c.wheels.map((w, i) => {
        const [bx, by] = WHEEL_POSITIONS[i];
        const x = sx(by), y = sy(bx);
        const ratio = Math.max(-1.25, Math.min(1.25, w.actual / lim));
        const side = by > 0 ? -1 : 1; // rim arrow drawn outside the wheel
        const tone = Math.abs(ratio) < 0.01 ? 'text-muted-foreground' : ratio > 0 ? 'text-info' : 'text-warning';
        const tdx = -EQ1_ROWS[i][0] * Math.SQRT1_2, tdy = -Math.SQRT1_2; // thrust (1, s_y)/√2 in SVG axes
        const labelX = x + side * 30;
        return (
          <g key={w.id}>
            <rect x={x - 0.019 * K} y={y - 0.07 * K} width={0.038 * K} height={0.14 * K} rx={3} className={cn('stroke-foreground/50', w.load > 0.98 ? 'fill-destructive/40' : 'fill-foreground/15')} strokeWidth={1} />
            {/* rollers at 45° */}
            {[-0.045, -0.015, 0.015, 0.045].map(o => (
              <line key={o} x1={x - 6} y1={y + o * K - 6 * EQ1_ROWS[i][0]} x2={x + 6} y2={y + o * K + 6 * EQ1_ROWS[i][0]} className="stroke-foreground/35" strokeWidth={1} />
            ))}
            <Arrow x={x + side * 13} y={y} dx={0} dy={-ratio * RIM_PX} className={tone} />
            <Arrow x={x} y={y} dx={tdx * ratio * THRUST_PX} dy={tdy * ratio * THRUST_PX} className="text-success/80" width={1.5} />
            <text x={labelX} y={y - 4} textAnchor={side < 0 ? 'end' : 'start'} className="fill-foreground font-mono text-[10px] font-semibold">{w.id}</text>
            <text x={labelX} y={y + 8} textAnchor={side < 0 ? 'end' : 'start'} className="fill-muted-foreground font-mono text-[9px] tabular-nums">{w.actual.toFixed(1)}</text>
          </g>
        );
      })}
      <Arrow x={bodyX} y={bodyY} dx={-v.vy * BODY_PX} dy={-v.vx * BODY_PX} className="text-foreground" width={2.5} />
      <circle cx={bodyX} cy={bodyY} r={3} className="fill-foreground" />
      {Math.abs(v.omega) > 0.02 && (
        <path
          d={`M ${bodyX + 16} ${bodyY} A 16 16 0 0 ${v.omega > 0 ? 0 : 1} ${bodyX} ${bodyY + (v.omega > 0 ? -16 : 16)}`}
          className="fill-none stroke-primary" strokeWidth={2}
        />
      )}
    </svg>
  );
}

const f = (v: number, d = 2): string => (Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : v.toFixed(d));
const deg = (rad: number): string => ((rad * 180) / Math.PI).toFixed(2);
const mm = (m: number): string => (m * 1000).toFixed(m < 0.01 ? 2 : 1);

function Check({ ok, label, value }: { ok: boolean; label: string; value: string }): JSX.Element {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground"><Icon className={cn('size-3.5 shrink-0', ok ? 'text-success' : 'text-warning')} aria-hidden /><span className="truncate">{label}</span></span>
      <span className="num shrink-0">{value}</span>
    </li>
  );
}

/** Live kinematics card of /calibration: top view, equations 1, 2, 7, brake test and calibration checks. */
export function WheelPanel(): JSX.Element | null {
  const t = useT();
  const c = useSim(s => s.calibration);
  if (!c) return null;
  const b = c.brake;
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle><Cog aria-hidden />{t('cal.wheels.title')}</CardTitle>
        <CardDescription className="w-full text-2xs">{t('cal.topView')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <TopView c={c} />
        <div className="space-y-0.5 rounded-md bg-muted/50 px-2 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground">
          <p>ω = 1/r·[1 ∓1 ∓L]·[v_x v_y ω]ᵀ · L = <span className="text-foreground">{STRAFER_KINEMATICS.L.toFixed(3)}</span> {t('unit.m')}</p>
          <p>s = max(1, max|ωᵢ|/ω_lim) · ω_lim = <span className="text-foreground">{c.omegaLim.toFixed(2)}</span></p>
          <p>d_stop = v·τ + v²/(2a_br)</p>
        </div>
        <dl className="grid grid-cols-2 gap-1.5">
          <Kpi label={t('cal.command')} value={`${f(c.command.vx)} / ${f(c.command.vy)}`} unit={t('unit.mps')} sub={`ω ${f(c.command.omega)} ${t('unit.radps')}`} />
          <Kpi label={t('cal.measured')} value={`${f(c.measured.vx)} / ${f(c.measured.vy)}`} unit={t('unit.mps')} sub={`ω ${f(c.measured.omega)} ${t('unit.radps')}`} />
          <Kpi label={t('cal.saturation')} value={c.s.toFixed(2)} tone={c.s > 1.001 ? 'warning' : 'success'} sub={c.s > 1.001 ? t('cal.saturation.active') : `max|ω| ${Math.max(...c.wheels.map(w => Math.abs(w.raw))).toFixed(1)}`} />
          <Kpi label={t('cal.dstop')} value={mm(c.dStop)} unit={t('unit.mm')} sub={t('cal.dstop.sub', { tau: Math.round(c.tau * 1000), a: c.aBrake.toFixed(0) })} />
        </dl>

        <div className="space-y-1.5">
          <h3 className="caption">{t('cal.brakeTest')}</h3>
          {b ? (
            <dl className="grid grid-cols-4 gap-1 text-center">
              {([['cal.brake.v', `${b.v.toFixed(2)}`], ['cal.brake.measured', mm(b.measured)], ['cal.brake.predicted', mm(b.predicted)], ['cal.brake.error', `${(b.error * 100).toFixed(1)}%`]] as const).map(([k, v]) => (
                <div key={k} className="rounded-md border px-1 py-1">
                  <dt className="truncate text-[10px] text-muted-foreground">{t(k)}</dt>
                  <dd className={cn('num text-xs', k === 'cal.brake.error' && (Math.abs(b.error) < 0.06 ? 'text-success' : 'text-warning'))}>{v}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="text-2xs text-muted-foreground">{t('cal.brake.none')}</p>}
        </div>

        <div className="space-y-1.5">
          <h3 className="caption">{t('cal.checks')}</h3>
          <ul className="space-y-1">
            <Check ok={c.headingDrift < 0.005} label={t('cal.check.heading')} value={`${deg(c.headingDrift)}°`} />
            <Check ok={c.crossTrack < 0.005} label={t('cal.check.cross')} value={`${mm(c.crossTrack)} ${t('unit.mm')}`} />
            <Check ok={c.centerDrift < 0.005} label={t('cal.check.center')} value={`${mm(c.centerDrift)} ${t('unit.mm')}`} />
            <Check ok={c.directionError < 0.01} label={t('cal.check.direction')} value={`${deg(c.directionError)}°`} />
          </ul>
          {c.s > 1.001 && (
            <p className="text-2xs text-warning">{t('cal.check.clip', { deg: deg(c.clipDirectionError), pct: `${Math.round(c.clipCurvatureError * 100)}%` })}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
