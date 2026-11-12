/**
 * /factory scene: production hall (batched static geometry) + the dynamic layer of the Swarm Agentic
 * Workflow — instanced Strafer fleet with task modules, plasma sparks, welding arcs and cooling
 * seams, the mechanics' diagnostic beams, machine status beacons, part buffers, the blocked-corridor
 * barrier and the S1 engineering overlay (route graph coloured by learned t̂_e).
 *
 * Everything per frame is pooled; `sync` allocates nothing.
 */
import * as T from 'three';
import { IndustrialEnvironment } from './IndustrialEnvironment';
import { FactoryMission } from '../missions/FactoryMission';
import { FleetRenderer } from './fleet/FleetRenderer';
import { toolTip } from './fleet/modules';
import { StreakPool } from './fx/StreakPool';
import { floorLabel } from './labels';
import type { MissionView } from './MissionView';

/** Static hall laid out from the mission's machines, jigs, bays and docks. */
export function buildFactoryHall(m: FactoryMission = new FactoryMission({ autoFaults: false })): T.Group {
  const e = new IndustrialEnvironment();
  e.box(0, 0, -0.2, 36, 29, 0.2, e.concrete);
  // Lane markings along the S1 graph edges (yellow), hatched narrow crossings at the centre.
  for (const edge of m.graph.edges) {
    const a = m.graph.node(edge.a), b = m.graph.node(edge.b);
    if (edge.a >= 100 || edge.b >= 100) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const horizontal = Math.abs(b.y - a.y) < 0.01;
    for (const off of [-0.8, 0.8]) e.box(cx + (horizontal ? 0 : off), cy + (horizontal ? off : 0), 0.001, horizontal ? len : 0.08, horizontal ? 0.08 : len, 0.004, e.yellow);
  }
  for (const y of [-9, 0, 9]) for (let i = -3; i <= 3; i++) e.box(i * 0.32, y, 0.002, 0.16, 1.5, 0.004, i % 2 ? e.yellow : e.dark);
  // Columns and roof trusses.
  for (const x of [-17, 17]) for (let y = -12; y <= 12; y += 6) {
    e.box(x, y, 0, 0.4, 0.5, 9); e.box(x, y, 0, 0.9, 1, 0.25, e.concrete);
    e.rod([x, y, 8.6], [-x, y, 8.6], 0.1);
    if (x < 0) for (let a = -17; a < 17; a += 2) e.rod([a, y, 8.6], [a + 2, y, 9.5], 0.045);
    if (x < 0) e.rod([-17, y, 9.5], [17, y, 9.5], 0.08);
  }
  for (const x of [-16.8, 16.8]) e.box(x, 0, 7.4, 0.45, 28, 0.55);
  // North and west walls (east side opens to the warehouse).
  e.box(0, 14.3, 0, 34.5, 0.3, 4.2, e.white);
  e.box(-17.3, 0, 0, 0.3, 28.6, 4.2, e.white);
  for (let x = -15; x <= 15; x += 5) e.box(x, 14.1, 2.2, 3, 0.1, 1.3, e.dark);

  // Cutting tables (CNC plasma, robot height): base, slatted bed, gantry, sheet on the bed.
  for (const tb of m.tables) {
    const { x, y } = tb.machine;
    e.box(x, y, 0, 1.7, 1.4, 0.26, e.dark);
    for (let k = -0.75; k <= 0.75; k += 0.12) e.box(x + k, y, 0.26, 0.025, 1.3, 0.04, e.steel);
    e.box(x, y, 0.3, 1.5, 1.2, 0.01, e.white);
    for (const sy of [-1, 1]) e.box(x - 0.3, y + sy * 0.72, 0, 0.12, 0.1, 0.78, e.yellow);
    e.box(x - 0.3, y, 0.78, 0.14, 1.56, 0.12, e.yellow);
    e.box(x - 0.3, y, 0.62, 0.1, 0.12, 0.16, e.dark);
    e.box(x - 1.05, y - 0.5, 0, 0.3, 0.4, 0.95, e.dark);
    e.box(x - 1.05, y - 0.5, 0.95, 0.32, 0.42, 0.03, e.red);
  }
  // Conveyor on the north wall with two drive units.
  e.box(0, 12.2, 0, 25, 1.1, 0.62, e.dark);
  for (let x = -12.2; x <= 12.2; x += 0.3) e.rod([x, 11.7, 0.66], [x, 12.7, 0.66], 0.035, e.steel);
  for (const mc of m.machines.filter(q => q.kind === 'conveyor')) { e.box(mc.x, 12.95, 0, 1.4, 0.7, 1.3, e.yellow); e.box(mc.x, 12.95, 1.3, 1.0, 0.5, 0.25, e.dark); }
  for (let x = -12; x <= 12; x += 2) e.box(x, 12.2, 0.66, 1.2, 0.95, 0.01, e.steel);
  // Welding jigs (robot height): base, fixture posts and a small frame sub-assembly.
  for (const j of m.jigs) {
    e.box(j.x, j.y, 0, 1.6, 1.1, 0.3, e.steel);
    e.box(j.x, j.y, 0.3, 1.5, 1.0, 0.03, e.dark);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) e.rod([j.x + sx * 0.7, j.y + sy * 0.45, 0.33], [j.x + sx * 0.7, j.y + sy * 0.45, 0.6], 0.025, e.yellow);
    for (const sy of [-1, 1]) e.rod([j.x - 0.8, j.y + sy * 0.35, 0.45], [j.x + 0.8, j.y + sy * 0.35, 0.45], 0.02, e.white);
    for (const sx of [-1, -0.35, 0.35, 1]) e.rod([j.x + sx * 0.8, j.y - 0.35, 0.45], [j.x + sx * 0.8, j.y + 0.35, 0.45], 0.018, e.white);
    for (const sy of [-1, 1]) { e.rod([j.x - 0.45, j.y + sy * 0.35, 0.45], [j.x - 0.2, j.y + sy * 0.3, 0.66], 0.015, e.white); e.rod([j.x - 0.2, j.y + sy * 0.3, 0.66], [j.x + 0.35, j.y + sy * 0.3, 0.66], 0.015, e.white); e.rod([j.x + 0.35, j.y + sy * 0.3, 0.66], [j.x + 0.6, j.y + sy * 0.35, 0.45], 0.015, e.white); }
  }
  // Finished-goods warehouse: pallet racking along the east side.
  for (let y = -10; y <= 10; y += 2.5) {
    for (const x of [13.6, 15.6]) e.rod([x, y, 0], [x, y, 4.2], 0.05, e.red);
    for (const z of [0.15, 1.5, 2.85]) { e.box(14.6, y + 1.25, z, 2.2, 0.08, 0.1, e.yellow); if (z > 1) e.box(14.6, y + 1.25, z + 0.1, 1.6, 1.8, 0.7, e.white); }
  }
  // Docks / service bays: floor plates and charger posts.
  for (const c of m.chargers) { e.box(c.x, c.y, 0.001, 0.9, 1, 0.012, e.yellow); e.box(c.x, c.y - 0.62, 0, 0.5, 0.18, 0.9, e.dark); }
  for (const b of m.bays) e.box(b.x, b.y, 0.001, 1, 1, 0.012, e.yellow);
  const root = e.finish();
  // Overhead lighting (few shadowless spots — the sun casts the shadows).
  for (const x of [-9, 0, 9]) for (const y of [-6, 6]) {
    const light = new T.SpotLight(0xffe9cb, 55, 20, 0.9, 0.7, 1.5);
    light.position.set(x, y, 8.4); light.target.position.set(x, y, 0);
    root.add(light, light.target);
    const lamp = new T.Mesh(new T.CylinderGeometry(0.28, 0.4, 0.15, 12), new T.MeshStandardMaterial({ color: 0xddd5be, emissive: 0xffe2ac, emissiveIntensity: 0.7 }));
    lamp.rotation.x = Math.PI / 2; lamp.position.copy(light.position); root.add(lamp);
  }
  const labels: [string, number, number, number][] = [
    ['РАСКРОЙ МЕТАЛЛА', -11.6, -7.3, Math.PI / 2], ['СТАПЕЛЬ A · СВАРКА', 0, 2.2, 0], ['СТАПЕЛЬ B · СВАРКА', 0, -2.2, 0],
    ['СКЛАД ГОТОВОЙ ПРОДУКЦИИ', 12.5, -11.5, Math.PI / 2], ['ЗАРЯДКА · РЕЗЕРВ', 0, -12.9, 0], ['СЕРВИС', -10.4, -11.8, 0],
  ];
  for (const [text, x, y, r] of labels) { const l = floorLabel(text, x, y, 0.012, 5, '#e7e2d3', r, 0.55); if (l) root.add(l); }
  return root;
}

const BEACON_OK = new T.Color(0.25, 2.2, 0.7), BEACON_BROKEN = new T.Color(4, 0.25, 0.15), BEACON_DIAG = new T.Color(0.3, 1.8, 4), BEACON_FIX = new T.Color(4, 2.2, 0.2);

export class FactoryView implements MissionView {
  readonly root = new T.Group();
  private readonly fleet: FleetRenderer;
  private readonly sparks = new StreakPool({ capacity: 1400, additive: true, gravity: 6, stretch: 0.03, thickness: 0.008, drag: 0.6, floor: () => 0.02 });
  private readonly arcs: T.Mesh[] = [];
  private readonly arcLights: T.PointLight[] = [];
  private readonly cutLights: T.PointLight[] = [];
  private readonly beams: T.Mesh[] = [];
  private readonly beacons: T.InstancedMesh;
  private readonly seams: T.Mesh[] = [];
  private readonly seamCool: number[] = [];
  private readonly stock: T.InstancedMesh;
  private readonly barrier = new T.Group();
  private readonly overlay = new T.Group();
  private readonly graphLines: T.LineSegments;
  private readonly graphColors: Float32Array;
  private readonly routeLines: T.LineSegments;
  private readonly routePos: Float32Array;
  private readonly v = new T.Vector3();
  private readonly m4 = new T.Matrix4();
  private readonly q = new T.Quaternion();
  private readonly s = new T.Vector3();
  private readonly c = new T.Color();
  private last = 0;
  private overlayTimer = 0;

  constructor(readonly mission: FactoryMission) {
    this.root.name = 'factory';
    this.root.add(buildFactoryHall(mission));
    this.fleet = new FleetRenderer(mission.agents, ['PLASMA_CUTTER', 'ARC_WELDER', 'REPAIR_DIAGNOSTIC', 'ROLLER_CARRIER', 'MULTI_SWAP']);
    this.root.add(this.fleet.root, this.sparks.mesh);
    const arcMat = new T.MeshBasicMaterial({ color: new T.Color(3.5, 4, 6), transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < mission.agents.length; i++) { const arc = new T.Mesh(new T.SphereGeometry(0.035, 10, 8), arcMat); arc.visible = false; this.arcs.push(arc); this.root.add(arc); }
    for (const j of mission.jigs) {
      const l = new T.PointLight(0xbcd8ff, 0, 6, 2); l.position.set(j.x, j.y, 0.9); this.arcLights.push(l); this.root.add(l);
      const seam = new T.Mesh(new T.BoxGeometry(1, 0.026, 0.026), new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      seam.position.set(j.x - 0.8, j.y + 0.35, 0.47); seam.visible = false; this.seams.push(seam); this.seamCool.push(0); this.root.add(seam);
    }
    for (let i = 0; i < 4; i++) { const l = new T.PointLight(0xff9a3c, 0, 6, 2); this.cutLights.push(l); this.root.add(l); }
    const beamGeo = new T.ConeGeometry(0.5, 1, 20, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
    const beamMat = new T.MeshBasicMaterial({ color: new T.Color(0.2, 1.4, 2.6), transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    for (let i = 0; i < 4; i++) { const b = new T.Mesh(beamGeo, beamMat); b.visible = false; this.beams.push(b); this.root.add(b); }
    this.beacons = new T.InstancedMesh(new T.CylinderGeometry(0.09, 0.09, 0.22, 12).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ toneMapped: false }), mission.machines.length);
    this.beacons.instanceColor = new T.InstancedBufferAttribute(new Float32Array(mission.machines.length * 3), 3);
    mission.machines.forEach((mc, i) => {
      const z = mc.kind === 'cutting' ? 1.09 : mc.kind === 'jig' ? 0.74 : 1.75;
      const y = mc.kind === 'conveyor' ? 12.95 : mc.kind === 'cutting' ? mc.y - 0.5 : mc.y + 0.45;
      const x = mc.kind === 'cutting' ? mc.x - 1.05 : mc.kind === 'jig' ? mc.x + 0.7 : mc.x;
      this.m4.makeTranslation(x, y, z); this.beacons.setMatrixAt(i, this.m4);
    });
    this.root.add(this.beacons);
    // Part buffers: blanks on outfeeds, jig inputs / outputs and warehouse stock (one draw call).
    this.stock = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.8, roughness: 0.35 }), 96);
    this.stock.instanceColor = new T.InstancedBufferAttribute(new Float32Array(96 * 3), 3);
    this.stock.castShadow = true; this.stock.frustumCulled = false;
    this.root.add(this.stock);
    // Barrier for the blocked corridor.
    const stripe = new T.MeshStandardMaterial({ color: 0xe8b21a, roughness: 0.6 }), black = new T.MeshStandardMaterial({ color: 0x18191b, roughness: 0.6 });
    for (let i = -2; i <= 2; i++) { const p = new T.Mesh(new T.BoxGeometry(0.3, 0.12, 0.9), i % 2 ? black : stripe); p.position.set(i * 0.3, 0, 0.45); this.barrier.add(p); }
    const bar = new T.Mesh(new T.BoxGeometry(1.6, 0.08, 0.12), stripe); bar.position.set(0, 0, 0.95); this.barrier.add(bar);
    const lamp = new T.Mesh(new T.SphereGeometry(0.07, 10, 8), new T.MeshBasicMaterial({ color: new T.Color(4, 0.3, 0.2), toneMapped: false })); lamp.position.set(0, 0, 1.1); this.barrier.add(lamp);
    this.barrier.visible = false;
    this.root.add(this.barrier);
    // Engineering overlay: S1 graph (edge colour = learned t̂_e / prior) and the carriers' routes.
    const edges = mission.graph.edges, gp = new Float32Array(edges.length * 6);
    edges.forEach((ed, i) => { const a = mission.graph.node(ed.a), b = mission.graph.node(ed.b); gp.set([a.x, a.y, 0.06, b.x, b.y, 0.06], i * 6); });
    this.graphColors = new Float32Array(edges.length * 6);
    const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.BufferAttribute(gp, 3)); gg.setAttribute('color', new T.BufferAttribute(this.graphColors, 3));
    this.graphLines = new T.LineSegments(gg, new T.LineBasicMaterial({ vertexColors: true, toneMapped: false, depthTest: false, transparent: true }));
    this.graphLines.renderOrder = 5;
    this.routePos = new Float32Array(mission.agents.length * 24 * 6);
    const rg = new T.BufferGeometry(); rg.setAttribute('position', new T.BufferAttribute(this.routePos, 3));
    this.routeLines = new T.LineSegments(rg, new T.LineBasicMaterial({ color: new T.Color(1.6, 1.1, 0.25), toneMapped: false, depthTest: false, transparent: true, opacity: 0.85 }));
    this.routeLines.renderOrder = 5; this.routeLines.frustumCulled = false; this.graphLines.frustumCulled = false;
    this.overlay.add(this.graphLines, this.routeLines);
    this.overlay.visible = false;
    this.root.add(this.overlay);
  }

  sync(time: number, overlay: boolean): void {
    const dt = Math.min(0.05, Math.max(0, time - this.last));
    this.last = time;
    const m = this.mission;
    this.fleet.sync(time);
    // Cutters: directed stream of sparks from the torch along the sheet, orange flicker light.
    let cut = 0;
    for (const a of m.agents) {
      const arc = this.arcs[a.id - 1];
      arc.visible = false;
      if (!a.working) continue;
      if (a.module.capability === 'PLASMA_CUTTER') {
        toolTip(a, this.v);
        const dx = Math.cos(a.theta), dy = Math.sin(a.theta);
        for (let k = 0; k < 7; k++) {
          const s = 2.2 + Math.random() * 3.5, sp = (Math.random() - 0.5) * 1.6;
          this.sparks.emit(this.v.x, this.v.y, this.v.z, (-dx + -dy * sp * 0.4) * s, (-dy + dx * sp * 0.4) * s, (Math.random() - 0.2) * 2, 0.35 + Math.random() * 0.45, 0.02, 4, 1.6 + Math.random(), 0.35);
        }
        if (cut < this.cutLights.length) { const l = this.cutLights[cut++]; l.position.copy(this.v); l.intensity = 2.5 + Math.random() * 2.5; }
        arc.visible = true; arc.position.copy(this.v); arc.scale.setScalar(0.7 + Math.random() * 0.6);
      } else if (a.module.capability === 'ARC_WELDER') {
        toolTip(a, this.v);
        arc.visible = Math.random() > 0.12; arc.position.copy(this.v); arc.scale.setScalar(0.9 + Math.random() * 1.6);
        if (Math.random() < 0.6) this.sparks.emit(this.v.x, this.v.y, this.v.z, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2, Math.random() * 1.6, 0.25 + Math.random() * 0.3, 0.012, 2.5, 3, 4);
      } else if (a.module.capability === 'REPAIR_DIAGNOSTIC' && a.task === 'REPAIRING_UNIT' && Math.random() < 0.35) {
        this.v.set(a.aimX + (Math.random() - 0.5) * 0.6, a.aimY + (Math.random() - 0.5) * 0.6, 0.9);
        this.sparks.emit(this.v.x, this.v.y, this.v.z, (Math.random() - 0.5), (Math.random() - 0.5), Math.random() * 1.5, 0.3, 0.01, 3, 2, 0.6);
      }
    }
    for (let i = cut; i < this.cutLights.length; i++) this.cutLights[i].intensity = 0;
    this.sparks.update(dt);
    // Welding: arc light flicker at each jig, the seam grows white-hot and cools to red.
    for (let i = 0; i < m.jigs.length; i++) {
      const j = m.jigs[i];
      const welding = j.phase === 'WELDING';
      this.arcLights[i].intensity = welding ? 3 + Math.random() * 5 : 0;
      if (welding) this.seamCool[i] = 1;
      else this.seamCool[i] = Math.max(0, this.seamCool[i] - dt / 5);
      const seam = this.seams[i], len = welding ? Math.max(0.02, j.progress) * 1.6 : this.seamCool[i] > 0 ? 1.6 : 0;
      seam.visible = len > 0;
      seam.scale.set(len, 1, 1);
      seam.position.x = j.x - 0.8 + len / 2;
      const heat = welding ? 1 : this.seamCool[i];
      (seam.material as T.MeshBasicMaterial).color.setRGB(0.5 + 3.5 * heat, 0.08 + (welding ? 2.6 : 0.6 * heat * heat), 0.05 + (welding ? 2 : 0));
    }
    // Mechanics: diagnostic cone toward the machine while diagnosing.
    let b = 0;
    for (const a of m.agents) {
      if (a.module.capability !== 'REPAIR_DIAGNOSTIC' || b >= this.beams.length) continue;
      const beam = this.beams[b++];
      beam.visible = a.task === 'DIAGNOSING';
      if (!beam.visible) continue;
      toolTip(a, this.v);
      beam.position.copy(this.v);
      const dx = a.aimX - this.v.x, dy = a.aimY - this.v.y, dz = a.aimZ - this.v.z, d = Math.hypot(dx, dy, dz);
      beam.lookAt(a.aimX + Math.sin(time * 5) * 0.5, a.aimY + Math.cos(time * 4) * 0.4, a.aimZ);
      beam.scale.set(0.9, 0.9, d);
    }
    for (; b < this.beams.length; b++) this.beams[b].visible = false;
    // Machine beacons.
    for (let i = 0; i < m.machines.length; i++) {
      const mc = m.machines[i];
      const col = mc.stage === 'OK' ? BEACON_OK : mc.stage === 'BROKEN' ? BEACON_BROKEN : mc.stage === 'DIAGNOSING' ? BEACON_DIAG : BEACON_FIX;
      const blink = mc.stage === 'BROKEN' ? (Math.sin(time * 10) > 0 ? 1 : 0.15) : 1;
      this.c.copy(col).multiplyScalar(blink);
      this.beacons.setColorAt(i, this.c);
    }
    this.beacons.instanceColor!.needsUpdate = true;
    this.syncStock();
    // Blocked corridor barrier.
    if (m.blockedEdge !== null) {
      const ed = m.graph.edge(m.blockedEdge), a = m.graph.node(ed.a), bb = m.graph.node(ed.b);
      this.barrier.visible = true;
      this.barrier.position.set((a.x + bb.x) / 2, (a.y + bb.y) / 2, 0);
      this.barrier.rotation.z = Math.atan2(bb.y - a.y, bb.x - a.x) + Math.PI / 2;
    } else this.barrier.visible = false;
    this.overlay.visible = overlay;
    this.overlayTimer += dt;
    if (overlay && this.overlayTimer > 0.2) { this.overlayTimer = 0; this.syncOverlay(); }
  }

  private syncStock(): void {
    const m = this.mission;
    let n = 0;
    const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number, r: number, g: number, bl: number): void => {
      if (n >= 96) return;
      this.v.set(x, y, z); this.s.set(sx, sy, sz); this.q.identity();
      this.m4.compose(this.v, this.q, this.s); this.stock.setMatrixAt(n, this.m4);
      this.c.setRGB(r, g, bl); this.stock.setColorAt(n, this.c); n++;
    };
    for (const tb of m.tables) for (let k = 0; k < tb.buffer; k++) put(tb.machine.x + 0.3, tb.machine.y - 1.0, 0.03 + k * 0.035, 0.42, 0.32, 0.03, 0.85, 0.88, 0.9);
    for (const j of m.jigs) {
      const s = j.y > 0 ? 1 : -1;
      for (let k = 0; k < j.input; k++) put(j.x + 1.0, j.y + s * 0.95, 0.03 + k * 0.035, 0.42, 0.32, 0.03, 0.85, 0.88, 0.9);
      for (let k = 0; k < j.output; k++) put(j.x - 1.0 - k * 0.55, j.y + s * 1.0, 0.13, 0.44, 0.3, 0.24, 0.25, 0.42, 0.75);
    }
    for (const bay of m.bays) for (let k = 0; k < Math.min(bay.stock, 10); k++) put(14.6 + (k % 2) * 0.6 - 0.3, bay.y + 0.5 - Math.floor(k / 2) % 3 * 0.55, 0.3 + Math.floor(k / 6) * 0.3, 0.5, 0.45, 0.28, 0.25, 0.42, 0.75);
    this.stock.count = n;
    this.stock.instanceMatrix.needsUpdate = true;
    this.stock.instanceColor!.needsUpdate = true;
  }

  private syncOverlay(): void {
    const m = this.mission, net = m.network, cols = this.graphColors;
    const edges = m.graph.edges;
    for (let i = 0; i < edges.length; i++) {
      const ed = edges[i];
      let r = 0.35, g = 0.75, bl = 1.6;
      if (ed.state.status === 'CLOSED') { r = 3; g = 0.25; bl = 0.2; }
      else {
        const ratio = net.fleetEstimate(ed.id, 1.3) / net.prior(ed, 1.3);
        if (ratio > 1.3) { r = 2.4; g = 1.4; bl = 0.2; } else if (ratio < 1.05) { r = 0.3; g = 1.8; bl = 0.8; }
      }
      for (let k = 0; k < 2; k++) { cols[i * 6 + k * 3] = r; cols[i * 6 + k * 3 + 1] = g; cols[i * 6 + k * 3 + 2] = bl; }
    }
    this.graphLines.geometry.attributes.color.needsUpdate = true;
    let n = 0;
    const pos = this.routePos, cap = pos.length / 6;
    for (const a of m.agents) {
      if (a.module.capability !== 'ROLLER_CARRIER' && a.module.capability !== 'REPAIR_DIAGNOSTIC') continue;
      let px = a.x, py = a.y;
      for (let k = a.wpIndex; k < a.wpX.length && n < cap; k++) {
        const o = n * 6;
        pos[o] = px; pos[o + 1] = py; pos[o + 2] = 0.08; pos[o + 3] = a.wpX[k]; pos[o + 4] = a.wpY[k]; pos[o + 5] = 0.08;
        px = a.wpX[k]; py = a.wpY[k]; n++;
      }
    }
    this.routeLines.geometry.setDrawRange(0, n * 2);
    this.routeLines.geometry.attributes.position.needsUpdate = true;
  }

  dispose(): void { this.fleet.dispose(); this.sparks.dispose(); }
}
