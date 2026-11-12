/**
 * /mining scene: procedural underground mine (CLAUDE.md §4.3) — rocky drifts with arched roofs,
 * steel / timber supports every 8 m, rails in the haulage drifts, coal and quartz-ore veins at the
 * faces, the shaft with its cage and the receiving bunker — rendered as a cut-away (roof faces are
 * back-face culled from above) in near darkness.
 *
 * Cinematic LiDAR: the rock material carries a shader layer driven by the scanners' poses — running
 * neon-green contour bands and a 1 m scan grid inside each scanner's forward cone, a persistent faint
 * grid on surveyed drifts, and red hazard contours over cracks and collapses. On top of that each
 * scanner fires a fan of green laser rays whose hits feed an additive point cloud, and carries a
 * spotlight with a soft volumetric cone. Everything per frame is pooled (no allocation).
 */
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FACE_NODES, MAIN_EDGES, MiningMission, SHAFT } from '../missions/MiningMission';
import { FleetRenderer } from './fleet/FleetRenderer';
import { MOUNT, toolTip } from './fleet/modules';
import { StreakPool } from './fx/StreakPool';
import { floorLabel } from './labels';
import type { MissionView } from './MissionView';

const H = 3.2;
const WALL = 2.0;
const SCANNERS = 6;
const HAZARDS = 6;
const RAYS = 40;
const CLOUD = 12000;
const RANGE = 14;

const hash = (x: number, y: number, z: number): number => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
const widthOf = (edge: number): number => (MAIN_EDGES.has(edge) ? 4.4 : 3.6);
const chamberRadius = (node: number): number => (node === SHAFT.id ? 7 : FACE_NODES.includes(node as never) ? 0 : node >= 19 ? 2.2 : 3.6);

/** Arched drift cross-section (lateral, height) from the left floor corner to the right one. */
function profile(w: number): [number, number][] {
  const p: [number, number][] = [[-w / 2, 0], [-w / 2 - 0.08, WALL * 0.5], [-w / 2, WALL]];
  for (let k = 1; k < 8; k++) { const a = Math.PI - (k / 8) * Math.PI; p.push([Math.cos(a) * w / 2, WALL + Math.sin(a) * (H - WALL)]); }
  p.push([w / 2, WALL], [w / 2 + 0.08, WALL * 0.5], [w / 2, 0]);
  return p;
}

const LASER_PARS = /* glsl */`
uniform float uTime;
uniform float uVisor;
uniform vec4 uScan[${SCANNERS}];
uniform float uScanOn[${SCANNERS}];
uniform vec4 uHaz[${HAZARDS}];
uniform float uEdge[32];
varying vec3 vWPos;
varying float vEdge;
float gridLine(float v) { float d = abs(fract(v + 0.5) - 0.5); return 1.0 - smoothstep(0.012, 0.045, d); }
`;

const LASER_FRAG = /* glsl */`
{
  float grid = max(max(gridLine(vWPos.x), gridLine(vWPos.y)), gridLine(vWPos.z * 1.5 + 0.37));
  vec3 laser = vec3(0.0);
  int ei = int(vEdge + 0.5);
  float st = ei >= 0 && ei < 32 ? uEdge[ei] : 0.0;
  if (st > 1.5) laser += vec3(1.8, 0.08, 0.05) * grid * (0.55 + 0.45 * sin(uTime * 6.0));
  else if (st > 0.5) laser += vec3(0.02, 0.42, 0.17) * grid * (0.35 + 0.65 * uVisor);
  for (int i = 0; i < ${SCANNERS}; i++) {
    if (uScanOn[i] < 0.5) continue;
    vec4 s = uScan[i];
    vec3 d3 = vWPos - s.xyz;
    float d = length(d3);
    if (d > 16.0) continue;
    vec2 dir = normalize(d3.xy + vec2(1e-5));
    float cone = smoothstep(0.05, 0.55, dot(dir, vec2(cos(s.w), sin(s.w))));
    float w = fract(d * 0.42 - uTime * 1.5);
    float band = smoothstep(0.84, 0.97, w) * (1.0 - smoothstep(0.97, 1.0, w));
    float fall = 1.0 - d / 16.0;
    laser += vec3(0.07, 2.6, 0.95) * (band * 2.4 + grid * 0.7) * cone * fall * (1.0 + 1.2 * uVisor);
  }
  for (int i = 0; i < ${HAZARDS}; i++) {
    vec4 h = uHaz[i];
    if (h.w <= 0.0) continue;
    float d = length(vWPos - h.xyz);
    if (d > h.w) continue;
    float w = fract(d * 0.7 - uTime * 2.0);
    laser += vec3(3.2, 0.16, 0.1) * (grid * 1.1 + smoothstep(0.82, 0.98, w) * 1.6) * (1.0 - d / h.w);
  }
  outgoingLight = outgoingLight * (1.0 - 0.65 * uVisor) + laser;
}
`;

export class MiningView implements MissionView {
  readonly root = new T.Group();
  private readonly fleet: FleetRenderer;
  private readonly uniforms = {
    uTime: { value: 0 }, uVisor: { value: 0 },
    uScan: { value: Array.from({ length: SCANNERS }, () => new T.Vector4()) },
    uScanOn: { value: new Array<number>(SCANNERS).fill(0) },
    uHaz: { value: Array.from({ length: HAZARDS }, () => new T.Vector4()) },
    uEdge: { value: new Array<number>(32).fill(0) },
  };
  private readonly rays: T.LineSegments;
  private readonly rayPos = new Float32Array(SCANNERS * RAYS * 6);
  private readonly rayCol = new Float32Array(SCANNERS * RAYS * 6);
  private readonly cloud: T.Points;
  private readonly cloudPos = new Float32Array(CLOUD * 3);
  private readonly cloudBirth = new Float32Array(CLOUD).fill(-100);
  private readonly cloudRed = new Float32Array(CLOUD);
  private cloudNext = 0;
  private readonly cloudUniforms = { uTime: { value: 0 }, uVisor: { value: 0 } };
  private readonly spots: T.SpotLight[] = [];
  private readonly cones: T.Mesh[] = [];
  private readonly drillLights: T.PointLight[] = [];
  private readonly sparks = new StreakPool({ capacity: 1200, additive: true, gravity: 7, stretch: 0.025, thickness: 0.008, drag: 0.8 });
  private readonly chips = new StreakPool({ capacity: 1400, opacity: 1, gravity: 9.81, stretch: 0.004, thickness: 0.04, drag: 0.3, toneMapped: true, floor: () => 0.02 });
  private readonly rubble: T.InstancedMesh;
  private readonly heap: T.Mesh;
  private readonly cage: T.Mesh;
  private readonly overlay = new T.Group();
  private readonly graphLines: T.LineSegments;
  private readonly graphCol: Float32Array;
  private readonly routes: T.LineSegments;
  private readonly routePos = new Float32Array(18 * 24 * 6);
  private readonly v = new T.Vector3();
  private readonly m4 = new T.Matrix4();
  private readonly q = new T.Quaternion();
  private readonly s = new T.Vector3();
  private last = 0;
  private frame = 0;
  private overlayTimer = 0;

  constructor(readonly mission: MiningMission) {
    this.root.name = 'mine';
    const g = mission.graph;
    // ── rock shell: drifts + end walls (outward normals, drawn back-sided → cut-away), floors ──
    const shell: T.BufferGeometry[] = [], floors: T.BufferGeometry[] = [];
    for (const e of g.edges) {
      const a = g.node(e.a), b = g.node(e.b), w = widthOf(e.id);
      const L = e.length, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, nx = -uy, ny = ux;
      const s0 = Math.max(0, chamberRadius(e.a) - 0.6), s1 = L - Math.max(0, chamberRadius(e.b) - 0.6);
      const prof = profile(w), steps = Math.max(2, Math.ceil((s1 - s0) / 0.9));
      const pos: number[] = [], col: number[] = [], idx: number[] = [], edgeAttr: number[] = [];
      const face = FACE_NODES.includes(e.b as never);
      for (let k = 0; k <= steps; k++) {
        const s = s0 + (s1 - s0) * k / steps;
        for (let p = 0; p < prof.length; p++) {
          const [lat, z] = prof[p];
          const cx = a.x + ux * s, cy = a.y + uy * s;
          const jag = (p === 0 || p === prof.length - 1 ? 0 : 1) * (hash(cx, cy, p) - 0.5) * 0.34;
          const out = 1 + jag / Math.max(1, Math.hypot(lat, z - 1));
          pos.push(cx + nx * lat * out, cy + ny * lat * out, z * (z > 0 ? out : 1));
          const coal = face && s > L - 6 && z > 0.5 && z < 1.7;
          const tone = 0.13 + hash(cx * 0.7, cy * 0.7, z * 2) * 0.07;
          if (coal) col.push(0.03, 0.03, 0.035); else col.push(tone * 1.15, tone, tone * 0.85);
          edgeAttr.push(e.id);
        }
      }
      const P = prof.length;
      for (let k = 0; k < steps; k++) for (let p = 0; p < P - 1; p++) {
        const i0 = k * P + p, i1 = i0 + 1, j0 = i0 + P, j1 = j0 + 1;
        idx.push(i0, j0, i1, i1, j0, j1);
      }
      // Face end wall (fan), facing out of the drift.
      if (face) {
        const base = pos.length / 3, cx = a.x + ux * s1, cy = a.y + uy * s1;
        pos.push(cx + ux * 0.3, cy + uy * 0.3, 1.4); col.push(0.04, 0.04, 0.045); edgeAttr.push(e.id);
        for (let p = 0; p < P; p++) { const [lat, z] = prof[p]; pos.push(cx + nx * lat, cy + ny * lat, z); col.push(0.05, 0.05, 0.055); edgeAttr.push(e.id); }
        for (let p = 0; p < P - 1; p++) idx.push(base, base + 1 + p, base + 2 + p);
        idx.push(base, base + P, base + 1);
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      geo.setAttribute('aEdge', new T.Float32BufferAttribute(edgeAttr, 1));
      geo.setIndex(idx);
      shell.push(geo.toNonIndexed());
      geo.dispose();
      // Floor strip.
      const fl = new T.PlaneGeometry(s1 - s0 + 0.6, w, Math.ceil(s1 - s0), 2);
      fl.rotateZ(Math.atan2(uy, ux));
      fl.translate(a.x + ux * (s0 + s1) / 2, a.y + uy * (s0 + s1) / 2, 0.005);
      this.floorAttrs(fl, e.id);
      floors.push(fl);
    }
    for (const n of g.nodes) {
      const r = chamberRadius(n.id);
      if (r <= 0) continue;
      const disc = new T.CircleGeometry(r + 0.4, 28).translate(n.x, n.y, 0.004);
      this.floorAttrs(disc, this.edgeNear(n.id));
      floors.push(disc);
    }
    const rock = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.05, flatShading: true, side: T.BackSide });
    const floorMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    for (const m of [rock, floorMat]) m.onBeforeCompile = shader => this.inject(shader);
    const shellGeo = mergeGeometries(shell)!; shell.forEach(x => x.dispose()); shellGeo.computeVertexNormals();
    const floorGeo = mergeGeometries(floors.map(f => f.index ? f.toNonIndexed() : f))!; floors.forEach(x => x.dispose());
    const shellMesh = new T.Mesh(shellGeo, rock), floorMesh = new T.Mesh(floorGeo, floorMat);
    shellMesh.receiveShadow = floorMesh.receiveShadow = true;
    this.root.add(shellMesh, floorMesh);
    this.root.add(this.supports());
    this.root.add(this.veins());
    // ── shaft, cage, bunker, charging bay ──
    const steel = new T.MeshStandardMaterial({ color: 0x6d757c, metalness: 0.8, roughness: 0.35 }), yellow = new T.MeshStandardMaterial({ color: 0xd9a21c, metalness: 0.3, roughness: 0.5 });
    const shaft = new T.Mesh(new T.CylinderGeometry(1.9, 1.9, 16, 20, 1, true).rotateX(Math.PI / 2).translate(-4.6, 4.6, 8), new T.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.9, side: T.BackSide }));
    this.root.add(shaft);
    for (const [dx, dy] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { const p = new T.Mesh(new T.BoxGeometry(0.16, 0.16, 16).translate(-4.6 + dx * 0.8, 4.6 + dy * 0.8, 8), steel); this.root.add(p); }
    this.cage = new T.Mesh(new T.BoxGeometry(2.1, 2.1, 2.4).translate(0, 0, 1.2), yellow);
    this.cage.position.set(-4.6, 4.6, 0);
    this.root.add(this.cage);
    const dump = mission.dumpPoint;
    const bunker = new T.Group();
    const funnel = new T.Mesh(new T.CylinderGeometry(1.5, 0.5, 1.1, 4, 1, true).rotateY(Math.PI / 4).rotateX(Math.PI / 2).translate(0, 0, -0.4), new T.MeshStandardMaterial({ color: 0x4b5156, metalness: 0.7, roughness: 0.5, side: T.DoubleSide }));
    bunker.add(funnel);
    for (let i = -3; i <= 3; i++) bunker.add(new T.Mesh(new T.BoxGeometry(2.1, 0.05, 0.06).translate(0, i * 0.3, 0.02), yellow));
    this.heap = new T.Mesh(new T.ConeGeometry(1.1, 0.8, 9).rotateX(Math.PI / 2).translate(0, 0, -0.5), new T.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.25, metalness: 0.2, flatShading: true }));
    bunker.add(this.heap);
    bunker.position.set(dump.x + 1.6, dump.y - 1.2, 0);
    this.root.add(bunker);
    const ch = mission.chargerPoint;
    for (let i = 0; i < 3; i++) {
      const post = new T.Mesh(new T.BoxGeometry(0.3, 0.2, 0.9).translate(0, 0, 0.45), steel); post.position.set(ch.x + (i - 1) * 0.8 - 0.6, ch.y - 1.2, 0); this.root.add(post);
      const led = new T.Mesh(new T.BoxGeometry(0.2, 0.02, 0.06), new T.MeshBasicMaterial({ color: new T.Color(0.3, 1.2, 3), toneMapped: false })); led.position.set(post.position.x, ch.y - 1.09, 0.75); this.root.add(led);
    }
    const lamp = new T.PointLight(0xffc88a, 18, 16, 1.6); lamp.position.set(0, 0, 3); this.root.add(lamp);
    for (const [text, x, y] of [['СТВОЛ · БУНКЕР', 0, -7.4], ['ЗАРЯДНАЯ КАМЕРА', -9, -9.8]] as const) { const l = floorLabel(text, x, y, 0.02, 6, '#c9d3cd', 0, 0.5); if (l) this.root.add(l); }
    mission.faces.forEach(f => { const l = floorLabel(f.name.toUpperCase(), f.x - f.dirX * 4.5, f.y - f.dirY * 4.5, 0.02, 3.6, '#9fe0bf', Math.atan2(f.dirY, f.dirX) - Math.PI / 2, 0.5); if (l) this.root.add(l); });
    // ── fleet and effects ──
    this.fleet = new FleetRenderer(mission.agents, ['LIDAR_ILLUMINATOR', 'ROTARY_EXCAVATOR', 'ORE_HOPPER_CART']);
    this.root.add(this.fleet.root, this.sparks.mesh, this.chips.mesh);
    const rg = new T.BufferGeometry();
    rg.setAttribute('position', new T.BufferAttribute(this.rayPos, 3)); rg.setAttribute('color', new T.BufferAttribute(this.rayCol, 3));
    this.rays = new T.LineSegments(rg, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.rays.frustumCulled = false;
    this.root.add(this.rays);
    const cg = new T.BufferGeometry();
    cg.setAttribute('position', new T.BufferAttribute(this.cloudPos, 3));
    cg.setAttribute('aBirth', new T.BufferAttribute(this.cloudBirth, 1));
    cg.setAttribute('aRed', new T.BufferAttribute(this.cloudRed, 1));
    this.cloud = new T.Points(cg, new T.ShaderMaterial({
      uniforms: this.cloudUniforms, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: `uniform float uTime; uniform float uVisor; attribute float aBirth; attribute float aRed; varying float vA; varying float vRed;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float age = uTime - aBirth; vA = age < 0.0 ? 0.0 : max(0.0, 1.0 - age / 3.2); vRed = aRed;
          gl_PointSize = (2.0 + 2.0 * uVisor) * (24.0 / max(1.0, -mv.z)) + 1.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying float vRed; void main() { vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = vA * smoothstep(0.5, 0.0, d);
        vec3 col = mix(vec3(0.1, 2.6, 1.0), vec3(3.0, 0.2, 0.12), vRed); gl_FragColor = vec4(col * a, a); }`,
    }));
    this.cloud.frustumCulled = false;
    this.root.add(this.cloud);
    const coneGeo = new T.ConeGeometry(1.5, 4.5, 24, 1, true).translate(0, -2.25, 0).rotateX(-Math.PI / 2);
    const coneMat = new T.MeshBasicMaterial({ color: new T.Color(0.9, 0.95, 1), transparent: true, opacity: 0.035, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    for (let i = 0; i < SCANNERS; i++) {
      const spot = new T.SpotLight(0xf3f6ff, 70, 30, 0.6, 0.55, 1.4);
      this.root.add(spot, spot.target);
      this.spots.push(spot);
      const cone = new T.Mesh(coneGeo, coneMat); cone.raycast = () => {}; this.cones.push(cone); this.root.add(cone);
    }
    for (let i = 0; i < 6; i++) { const l = new T.PointLight(0xff8a2a, 0, 7, 2); this.drillLights.push(l); this.root.add(l); }
    this.rubble = new T.InstancedMesh(new T.DodecahedronGeometry(0.45, 0), new T.MeshStandardMaterial({ color: 0x3b3733, roughness: 1, flatShading: true }), HAZARDS * 36);
    this.rubble.count = 0; this.rubble.castShadow = true;
    this.root.add(this.rubble);
    // ── engineering overlay: drift graph by survey state, routes ──
    const gp = new Float32Array(g.edges.length * 6);
    g.edges.forEach((e, i) => { const a = g.node(e.a), b = g.node(e.b); gp.set([a.x, a.y, 0.12, b.x, b.y, 0.12], i * 6); });
    this.graphCol = new Float32Array(g.edges.length * 6);
    const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.BufferAttribute(gp, 3)); gg.setAttribute('color', new T.BufferAttribute(this.graphCol, 3));
    this.graphLines = new T.LineSegments(gg, new T.LineBasicMaterial({ vertexColors: true, toneMapped: false, depthTest: false, transparent: true }));
    const rtg = new T.BufferGeometry(); rtg.setAttribute('position', new T.BufferAttribute(this.routePos, 3));
    this.routes = new T.LineSegments(rtg, new T.LineBasicMaterial({ color: new T.Color(2.2, 1.5, 0.3), toneMapped: false, depthTest: false, transparent: true }));
    for (const l of [this.graphLines, this.routes]) { l.frustumCulled = false; l.renderOrder = 6; this.overlay.add(l); }
    this.overlay.visible = false;
    this.root.add(this.overlay);
  }

  private edgeNear(node: number): number {
    return this.mission.graph.edges.find(e => e.a === node || e.b === node)?.id ?? 0;
  }

  /** Floor vertex colours (gravel) and edge ids for the shader. */
  private floorAttrs(g: T.BufferGeometry, edge: number): void {
    const p = g.getAttribute('position'), col = new Float32Array(p.count * 3), ed = new Float32Array(p.count).fill(edge);
    for (let i = 0; i < p.count; i++) { const t = 0.16 + hash(p.getX(i), p.getY(i), 3) * 0.05; col[i * 3] = t * 1.1; col[i * 3 + 1] = t; col[i * 3 + 2] = t * 0.88; }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setAttribute('aEdge', new T.BufferAttribute(ed, 1));
  }

  private inject(shader: T.WebGLProgramParametersWithUniforms): void {
    Object.assign(shader.uniforms, this.uniforms);
    shader.vertexShader = 'attribute float aEdge;\nvarying vec3 vWPos;\nvarying float vEdge;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvEdge = aEdge;');
    shader.fragmentShader = LASER_PARS + shader.fragmentShader.replace('#include <opaque_fragment>', LASER_FRAG + '\n#include <opaque_fragment>');
  }

  /** Steel arches in the haulage drifts, timber sets elsewhere (every 8 m), rails with sleepers. */
  private supports(): T.Group {
    const g = this.mission.graph, steel: T.BufferGeometry[] = [], wood: T.BufferGeometry[] = [], rail: T.BufferGeometry[] = [];
    const rodTo = (out: T.BufferGeometry[], a: T.Vector3, b: T.Vector3, r: number): void => {
      const v = b.clone().sub(a), geo = new T.CylinderGeometry(r, r, v.length(), 6);
      geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize()));
      geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      out.push(geo.toNonIndexed()); geo.dispose();
    };
    for (const e of g.edges) {
      const a = g.node(e.a), b = g.node(e.b), w = widthOf(e.id) - 0.25, L = e.length, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, nx = -uy, ny = ux;
      const main = MAIN_EDGES.has(e.id);
      const s0 = Math.max(0, chamberRadius(e.a)) + 1, s1 = L - Math.max(0, chamberRadius(e.b)) - 1;
      for (let s = s0; s <= s1; s += 8) {
        const cx = a.x + ux * s, cy = a.y + uy * s, prof = profile(w);
        if (main || e.b >= 13) {
          for (let p = 0; p < prof.length - 1; p++) rodTo(steel, new T.Vector3(cx + nx * prof[p][0], cy + ny * prof[p][0], prof[p][1]), new T.Vector3(cx + nx * prof[p + 1][0], cy + ny * prof[p + 1][0], prof[p + 1][1]), 0.07);
        } else {
          for (const sgn of [-1, 1]) { const bx = new T.BoxGeometry(0.22, 0.22, WALL + 0.4).translate(cx + nx * sgn * (w / 2 - 0.1), cy + ny * sgn * (w / 2 - 0.1), (WALL + 0.4) / 2); wood.push(bx.toNonIndexed()); bx.dispose(); }
          const cap = new T.BoxGeometry(w, 0.24, 0.24).rotateZ(Math.atan2(ny, nx)).translate(cx, cy, WALL + 0.45); wood.push(cap.toNonIndexed()); cap.dispose();
        }
      }
      if (main) {
        for (const off of [-0.55, 0.55]) { const r = new T.BoxGeometry(s1 - s0 + 2, 0.07, 0.08).rotateZ(Math.atan2(uy, ux)).translate(a.x + ux * (s0 + s1) / 2 + nx * off, a.y + uy * (s0 + s1) / 2 + ny * off, 0.11); rail.push(r.toNonIndexed()); r.dispose(); }
        for (let s = s0; s <= s1; s += 0.8) { const sl = new T.BoxGeometry(0.2, 1.5, 0.07).rotateZ(Math.atan2(uy, ux)).translate(a.x + ux * s, a.y + uy * s, 0.04); wood.push(sl.toNonIndexed()); sl.dispose(); }
      }
    }
    const group = new T.Group();
    const add = (parts: T.BufferGeometry[], m: T.Material): void => { if (!parts.length) return; const geo = mergeGeometries(parts)!; parts.forEach(x => x.dispose()); const mesh = new T.Mesh(geo, m); mesh.receiveShadow = true; group.add(mesh); };
    add(steel, new T.MeshStandardMaterial({ color: 0x5e656b, metalness: 0.85, roughness: 0.38 }));
    add(wood, new T.MeshStandardMaterial({ color: 0x5b4330, roughness: 0.9 }));
    add(rail, new T.MeshStandardMaterial({ color: 0x9aa0a5, metalness: 0.9, roughness: 0.25 }));
    return group;
  }

  /** Glinting coal / quartz-ore inclusions in the face walls and along the drifts. */
  private veins(): T.InstancedMesh {
    const m = this.mission, cap = 520;
    const mesh = new T.InstancedMesh(new T.OctahedronGeometry(0.09, 0), new T.MeshStandardMaterial({ color: 0xd9c48a, metalness: 0.9, roughness: 0.15, emissive: 0x6b5a26, emissiveIntensity: 0.6 }), cap);
    let n = 0;
    const put = (x: number, y: number, z: number, s: number): void => { if (n >= cap) return; this.m4.makeScale(s, s, s * 1.4); this.m4.setPosition(x, y, z); mesh.setMatrixAt(n++, this.m4); };
    for (const f of m.faces) for (let i = 0; i < 70; i++) {
      const lat = (hash(f.x, i, 1) - 0.5) * 3.2, z = 0.4 + hash(i, f.y, 2) * 2.2, back = hash(i, i, f.id) * 1.4;
      put(f.x - f.dirX * back - f.dirY * lat * (back < 0.4 ? 1 : 0) + (back >= 0.4 ? -f.dirY * Math.sign(lat) * 1.75 : 0), f.y - f.dirY * back + f.dirX * lat * (back < 0.4 ? 1 : 0) + (back >= 0.4 ? f.dirX * Math.sign(lat) * 1.75 : 0), z, 0.6 + hash(i, 3, f.id) * 1.4);
    }
    mesh.count = n;
    return mesh;
  }

  sync(time: number, overlay: boolean): void {
    const dt = Math.min(0.05, Math.max(0, time - this.last));
    this.last = time;
    this.frame++;
    const m = this.mission, U = this.uniforms;
    this.fleet.sync(time);
    U.uTime.value = time;
    const visor = m.lidarVisor ? 1 : 0;
    U.uVisor.value += (visor - U.uVisor.value) * Math.min(1, dt * 4);
    this.cloudUniforms.uTime.value = time;
    this.cloudUniforms.uVisor.value = U.uVisor.value;
    for (const e of m.graph.edges) U.uEdge.value[e.id] = e.state.status === 'CLOSED' ? 2 : m.scanned[e.id] ? 1 : 0;
    for (let i = 0; i < HAZARDS; i++) { const c = m.collapses[i]; U.uHaz.value[i].set(c ? c.x : 0, c ? c.y : 0, 1.2, c ? 7 : 0); }
    // Scanners: shader layer, spotlights, volumetric cones, laser fan and point cloud.
    let si = 0, ri = 0;
    for (const a of m.agents) {
      if (a.module.capability !== 'LIDAR_ILLUMINATOR') continue;
      if (si >= SCANNERS) break;
      const on = a.active && !a.hold;
      toolTip(a, this.v);
      const ox = this.v.x, oy = this.v.y, oz = this.v.z;
      const look = a.hasRoute ? a.theta : Math.atan2(a.aimY - a.y, a.aimX - a.x);
      U.uScan.value[si].set(ox, oy, oz, look);
      U.uScanOn.value[si] = on ? 1 : 0;
      const spot = this.spots[si], cone = this.cones[si];
      spot.visible = on; cone.visible = on;
      spot.intensity = 70 * (1 - 0.35 * U.uVisor.value);
      spot.position.set(ox + Math.cos(look) * 0.2, oy + Math.sin(look) * 0.2, a.z + MOUNT + 0.12);
      spot.target.position.set(ox + Math.cos(look) * 8, oy + Math.sin(look) * 8, 0.3);
      spot.target.updateMatrixWorld();
      cone.position.copy(spot.position);
      cone.lookAt(spot.target.position);
      if (!on) { si++; continue; }
      const red = a.task === 'SCANNING_COLLAPSE' || a.task === 'TO_COLLAPSE';
      const edge = m.edgeAt(a.x, a.y), e = m.graph.edge(edge), na = m.graph.node(e.a), nb = m.graph.node(e.b);
      const L = e.length, ux = (nb.x - na.x) / L, uy = (nb.y - na.y) / L, nx = -uy, ny = ux;
      const v0 = (ox - na.x) * nx + (oy - na.y) * ny, s0 = (ox - na.x) * ux + (oy - na.y) * uy;
      const inChamber = s0 < chamberRadius(e.a) || s0 > L - chamberRadius(e.b);
      const half = inChamber ? 6 : widthOf(edge) / 2, faceEnd = FACE_NODES.includes(e.b as never);
      const sweep = Math.sin(time * 1.7 + si) * 0.35;
      for (let r = 0; r < RAYS; r++) {
        const yaw = look + sweep + ((r % 10) / 9 - 0.5) * 1.7, pitch = [-0.38, -0.14, 0.1, 0.34][r / 10 | 0];
        const cp = Math.cos(pitch), dx = Math.cos(yaw) * cp, dy = Math.sin(yaw) * cp, dz = Math.sin(pitch);
        const dv = dx * nx + dy * ny, du = dx * ux + dy * uy;
        let t = RANGE;
        if (dv > 1e-4) t = Math.min(t, (half - v0) / dv); else if (dv < -1e-4) t = Math.min(t, (-half - v0) / dv);
        if (dz < -1e-4) t = Math.min(t, -oz / dz); else if (dz > 1e-4) t = Math.min(t, (H * 0.92 - oz) / dz);
        if (faceEnd && du > 1e-4) t = Math.min(t, (L - s0 - 0.2) / du);
        t = Math.max(0.2, t);
        const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t, o = ri * 6;
        this.rayPos[o] = ox; this.rayPos[o + 1] = oy; this.rayPos[o + 2] = oz;
        this.rayPos[o + 3] = hx; this.rayPos[o + 4] = hy; this.rayPos[o + 5] = hz;
        const k = 0.35 + 0.65 * U.uVisor.value;
        if (red) { this.rayCol[o] = 0.2 * k; this.rayCol[o + 1] = 0.01; this.rayCol[o + 2] = 0.01; this.rayCol[o + 3] = 2.6; this.rayCol[o + 4] = 0.12; this.rayCol[o + 5] = 0.08; }
        else { this.rayCol[o] = 0.0; this.rayCol[o + 1] = 0.12 * k; this.rayCol[o + 2] = 0.05 * k; this.rayCol[o + 3] = 0.15; this.rayCol[o + 4] = 2.2 + k; this.rayCol[o + 5] = 0.8; }
        ri++;
        if ((r + this.frame) % 3 === 0) {
          const c = this.cloudNext;
          this.cloudNext = (c + 1) % CLOUD;
          this.cloudPos[c * 3] = hx; this.cloudPos[c * 3 + 1] = hy; this.cloudPos[c * 3 + 2] = hz;
          this.cloudBirth[c] = time; this.cloudRed[c] = red || this.nearCollapse(hx, hy) ? 1 : 0;
        }
      }
      si++;
    }
    for (; si < SCANNERS; si++) { U.uScanOn.value[si] = 0; this.spots[si].visible = false; this.cones[si].visible = false; }
    this.rays.geometry.setDrawRange(0, ri * 2);
    this.rays.geometry.attributes.position.needsUpdate = true;
    this.rays.geometry.attributes.color.needsUpdate = true;
    const cg = this.cloud.geometry;
    cg.attributes.position.needsUpdate = true; cg.attributes.aBirth.needsUpdate = true; cg.attributes.aRed.needsUpdate = true;
    // Drills: orange sparks and rock chips at the cutter head; carts tip coal into the bunker.
    let di = 0;
    for (const a of m.agents) {
      if (a.module.capability === 'ROTARY_EXCAVATOR') {
        const l = this.drillLights[di++];
        if (!a.working) { if (l) l.intensity = 0; continue; }
        toolTip(a, this.v);
        if (l) { l.position.set(this.v.x, this.v.y, this.v.z + 0.4); l.intensity = 6 + Math.random() * 8; }
        for (let k = 0; k < 4; k++) this.sparks.emit(this.v.x, this.v.y, this.v.z + 0.15, -Math.cos(a.theta) * (1 + Math.random() * 2) + (Math.random() - 0.5) * 2, -Math.sin(a.theta) * (1 + Math.random() * 2) + (Math.random() - 0.5) * 2, Math.random() * 2.2, 0.3 + Math.random() * 0.3, 0.012, 4, 1.8, 0.4);
        if (Math.random() < 0.7) this.chips.emit(this.v.x, this.v.y, this.v.z + 0.1, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, Math.random() * 1.5, 1.2, 0.03, 0.12, 0.11, 0.1);
      } else if (a.module.capability === 'ORE_HOPPER_CART' && a.task === 'DUMPING_ORE' && a.dump > 0.5 && Math.random() < 0.8) {
        const c = Math.cos(a.theta), s = Math.sin(a.theta);
        this.chips.emit(a.x + c * 0.5, a.y + s * 0.5, a.z + 0.45, c * 0.8 + (Math.random() - 0.5) * 0.4, s * 0.8 + (Math.random() - 0.5) * 0.4, 0.2, 1, 0.035, 0.05, 0.05, 0.06);
      }
    }
    this.sparks.update(dt);
    this.chips.update(dt);
    // Collapse rubble piles.
    let rb = 0;
    for (const c of m.collapses) {
      const e = m.graph.edge(c.edge), a = m.graph.node(e.a), b = m.graph.node(e.b), L = e.length, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
      for (let k = 0; k < 36 && rb < this.rubble.instanceMatrix.count; k++) {
        const lat = (hash(c.edge, k, 1) - 0.5) * 3.6, along = (hash(k, c.edge, 2) - 0.5) * 3, z = hash(k, k, c.edge) * 1.6 * (1 - Math.abs(lat) / 2.2);
        this.v.set(c.x + ux * along - uy * lat, c.y + uy * along + ux * lat, Math.max(0.2, z));
        this.q.setFromAxisAngle(this.s.set(0.3, 0.7, 0.6).normalize(), k);
        const sc = 0.6 + hash(k, 5, c.edge) * 1.2;
        this.s.set(sc, sc * 0.8, sc * 0.7);
        this.m4.compose(this.v, this.q, this.s);
        this.rubble.setMatrixAt(rb++, this.m4);
      }
    }
    this.rubble.count = rb;
    this.rubble.instanceMatrix.needsUpdate = true;
    // Cage shuttles; the bunker heap grows with the delivered tonnage.
    this.cage.position.z = 6 + Math.sin(time * 0.25) * 6;
    const fill = Math.min(1, m.deliveredKg / 3000);
    this.heap.scale.set(0.3 + fill * 0.8, 0.3 + fill * 0.8, 0.2 + fill * 1.1);
    this.overlay.visible = overlay;
    this.overlayTimer += dt;
    if (overlay && this.overlayTimer > 0.25) { this.overlayTimer = 0; this.syncOverlay(); }
  }

  private nearCollapse(x: number, y: number): boolean {
    const c = this.mission.collapses;
    for (let i = 0; i < c.length; i++) if (Math.hypot(c[i].x - x, c[i].y - y) < 7) return true;
    return false;
  }

  private syncOverlay(): void {
    const m = this.mission, col = this.graphCol;
    for (const e of m.graph.edges) {
      const closed = e.state.status === 'CLOSED', scanned = m.scanned[e.id] === 1;
      const r = closed ? 3 : scanned ? 0.2 : 0.35, g = closed ? 0.2 : scanned ? 2.4 : 0.38, b = closed ? 0.15 : scanned ? 0.9 : 0.4;
      for (let k = 0; k < 2; k++) { col[e.id * 6 + k * 3] = r; col[e.id * 6 + k * 3 + 1] = g; col[e.id * 6 + k * 3 + 2] = b; }
    }
    this.graphLines.geometry.attributes.color.needsUpdate = true;
    let n = 0;
    const cap = this.routePos.length / 6;
    for (const a of m.agents) {
      let px = a.x, py = a.y;
      for (let k = a.wpIndex; k < a.wpX.length && n < cap; k++, n++) {
        const o = n * 6;
        this.routePos[o] = px; this.routePos[o + 1] = py; this.routePos[o + 2] = 0.15;
        this.routePos[o + 3] = a.wpX[k]; this.routePos[o + 4] = a.wpY[k]; this.routePos[o + 5] = 0.15;
        px = a.wpX[k]; py = a.wpY[k];
      }
    }
    this.routes.geometry.setDrawRange(0, n * 2);
    this.routes.geometry.attributes.position.needsUpdate = true;
  }

  dispose(): void { this.fleet.dispose(); this.sparks.dispose(); this.chips.dispose(); }
}
