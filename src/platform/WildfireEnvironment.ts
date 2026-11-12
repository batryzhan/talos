/**
 * /rescue scene: procedural mountain forest with a river and ford, the live wildfire (shader flames,
 * rising smoke, warm flickering light), parabolic water jets from the firefighters, mineral
 * firebreaks, burnt snags, relay masts and the engineering overlay (radio links, routes, S1 closures).
 *
 * Terrain colours, trees and flames refresh when the fire automaton changes (≤ 4 Hz); per-frame work
 * is particle stepping and uniform updates only.
 */
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BASE_CAMP, FIRE_MAP, FORD } from '../core/fire/FireTerrain';
import { CellState } from '../core/fire/FireGrid';
import { Rng } from '../swarm/rng';
import type { WildfireMission } from '../missions/WildfireMission';
import { FleetRenderer } from './fleet/FleetRenderer';
import { toolTip } from './fleet/modules';
import { StreakPool } from './fx/StreakPool';
import { FlameField, SmokeField } from './fx/Billboards';
import { floorLabel } from './labels';
import type { MissionView } from './MissionView';

function conifer(): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const g = new T.ConeGeometry(1.25 * (1 - i * 0.18), 2.2 - i * 0.25, 7, 1);
    g.rotateX(Math.PI / 2); g.rotateZ(i * 0.47); g.translate(0, 0, 1.7 + i * 0.95);
    parts.push(g);
  }
  const trunk = new T.CylinderGeometry(0.07, 0.16, 2.2, 6).rotateX(Math.PI / 2).translate(0, 0, 1.1);
  parts.push(trunk);
  const merged = mergeGeometries(parts.map(g => g.toNonIndexed()));
  parts.forEach(g => g.dispose());
  if (!merged) throw new Error('tree merge failed');
  return merged;
}

const C_GRASS = new T.Color(0x6f7d4a), C_FOREST = new T.Color(0x3f4a2c), C_ROCK = new T.Color(0x8b877a), C_SAND = new T.Color(0xb59b6a);
const C_BED = new T.Color(0x5a5a4a), C_BURNT = new T.Color(0x1d1b19), C_EMBER = new T.Color(0x5a2410), C_BREAK = new T.Color(0x9a7a50), C_WET = new T.Color(0x2c3328);

export class WildfireView implements MissionView {
  readonly root = new T.Group();
  private readonly fleet: FleetRenderer;
  private readonly ground: T.Mesh;
  private readonly baseColors: Float32Array;
  private readonly vertexCell: Int32Array;
  private readonly colors: T.BufferAttribute;
  private readonly trees: T.InstancedMesh;
  private readonly treeCell: Int32Array;
  private readonly treeMatrix: T.Matrix4[] = [];
  private readonly treeBase: T.Color[] = [];
  private readonly flames = new FlameField(1800);
  private readonly smoke = new SmokeField(900);
  private readonly water = new StreakPool({ capacity: 2600, opacity: 0.85, gravity: 9.81, stretch: 0.03, thickness: 0.03, drag: 0.15, toneMapped: true });
  private readonly mist = new StreakPool({ capacity: 900, additive: true, gravity: -0.4, stretch: 0.02, thickness: 0.08, drag: 1.4 });
  private readonly dirt = new StreakPool({ capacity: 500, opacity: 0.9, gravity: 9.81, stretch: 0.01, thickness: 0.05, drag: 0.5, toneMapped: true });
  private readonly lights: T.PointLight[] = [];
  private readonly overlay = new T.Group();
  private readonly radio: T.LineSegments;
  private readonly radioPos = new Float32Array(400 * 6);
  private readonly radioCol = new Float32Array(400 * 6);
  private readonly routes: T.LineSegments;
  private readonly routePos = new Float32Array(24 * 40 * 6);
  private readonly closed: T.LineSegments;
  private readonly closedPos = new Float32Array(300 * 6);
  private readonly v = new T.Vector3();
  private readonly c = new T.Color();
  private version = -1;
  private last = 0;
  private overlayTimer = 0;
  private smokeAcc = 0;

  constructor(readonly mission: WildfireMission) {
    this.root.name = 'wildfire';
    const t = mission.terrain, n = FIRE_MAP.n - 1;
    // Terrain mesh with vertex colours (meadow, forest floor, rock, sand bars).
    const geo = new T.PlaneGeometry(FIRE_MAP.size, FIRE_MAP.size, n, n);
    const pos = geo.attributes.position;
    this.baseColors = new Float32Array(pos.count * 3);
    this.vertexCell = new Int32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      this.vertexCell[i] = mission.grid.index(Math.min(69.9, x), Math.min(69.9, y));
      pos.setZ(i, t.heightAt(x, y));
      const slope = t.slopeAt(x, y), off = Math.abs(t.riverOffset(x, y));
      this.c.copy(off < 3.4 ? C_BED : off < 5.5 || t.isFord(x, y) ? C_SAND : slope > 0.75 ? C_ROCK : C_GRASS);
      if (off >= 5.5 && slope <= 0.75) this.c.lerp(C_FOREST, t.forestAt(x, y));
      this.c.multiplyScalar(0.93 + 0.08 * Math.sin(x * 0.7 + y * 0.31) * Math.cos(y * 0.5));
      this.c.toArray(this.baseColors, i * 3);
    }
    geo.computeVertexNormals();
    this.colors = new T.BufferAttribute(new Float32Array(this.baseColors), 3);
    this.colors.setUsage(T.DynamicDrawUsage);
    geo.setAttribute('color', this.colors);
    this.ground = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 }));
    this.ground.receiveShadow = true;
    this.root.add(this.ground);
    // River surface (ribbon along the centre line).
    const rv: number[] = [], ri: number[] = [];
    for (let x = -70, k = 0; x <= 70; x += 2, k++) {
      const y = t.riverY(x);
      rv.push(x, y - 3.6, -0.12, x, y + 3.6, -0.12);
      if (k > 0) { const a = (k - 1) * 2; ri.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const rg = new T.BufferGeometry(); rg.setAttribute('position', new T.Float32BufferAttribute(rv, 3)); rg.setIndex(ri); rg.computeVertexNormals();
    const river = new T.Mesh(rg, new T.MeshStandardMaterial({ color: 0x3a6d84, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.8 }));
    river.receiveShadow = true;
    this.root.add(river);
    // Forest: conifers on forested cells, two-colour variation; one draw call.
    const rng = new Rng(t.seed + 77), cap = 1500, dummy = new T.Object3D();
    this.trees = new T.InstancedMesh(conifer(), new T.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), cap);
    this.treeCell = new Int32Array(cap);
    let count = 0;
    for (let attempt = 0; attempt < 40000 && count < cap; attempt++) {
      const x = rng.uniform(-68, 68), y = rng.uniform(-68, 68);
      if (rng.random() > t.forestAt(x, y) * 0.9 || t.slopeAt(x, y) > 0.9 || Math.abs(t.riverOffset(x, y)) < 6) continue;
      if (Math.hypot(x - BASE_CAMP.x, y - BASE_CAMP.y) < 14) continue;
      // Keep the lattice trails (S1 edges) visually clear.
      if (Math.abs(x / 8 - Math.round(x / 8)) < 0.12 || Math.abs(y / 8 - Math.round(y / 8)) < 0.12) continue;
      dummy.position.set(x, y, t.heightAt(x, y) - 0.1);
      dummy.rotation.set(0, 0, rng.uniform(0, 6.28));
      dummy.scale.setScalar(rng.uniform(0.75, 1.35));
      dummy.updateMatrix();
      this.trees.setMatrixAt(count, dummy.matrix);
      this.treeMatrix.push(dummy.matrix.clone());
      const base = new T.Color().setHSL(rng.uniform(0.26, 0.34), 0.32, rng.uniform(0.16, 0.26));
      this.treeBase.push(base);
      this.trees.setColorAt(count, base);
      this.treeCell[count] = mission.grid.index(x, y);
      count++;
    }
    this.trees.count = count;
    this.trees.castShadow = true; this.trees.receiveShadow = true;
    this.root.add(this.trees);
    // Base camp: tents, containers, mast; ford marker.
    const camp = new T.Group();
    const tent = new T.MeshStandardMaterial({ color: 0xc77b2e, roughness: 0.8 }), steel = new T.MeshStandardMaterial({ color: 0x8b9298, metalness: 0.6, roughness: 0.4 });
    for (const [x, y] of [[-4, 3], [-1, 3.5], [4, 2]]) { const m = new T.Mesh(new T.ConeGeometry(1.4, 1.8, 4).rotateX(Math.PI / 2).translate(0, 0, 0.9), tent); m.position.set(BASE_CAMP.x + x, BASE_CAMP.y + y, t.heightAt(BASE_CAMP.x + x, BASE_CAMP.y + y)); m.castShadow = true; camp.add(m); }
    for (const [x, y] of [[5, -3], [8, -3]]) { const m = new T.Mesh(new T.BoxGeometry(2.4, 1.2, 1.2).translate(0, 0, 0.6), new T.MeshStandardMaterial({ color: 0x4a6e8c, roughness: 0.6 })); m.position.set(BASE_CAMP.x + x, BASE_CAMP.y + y, t.heightAt(BASE_CAMP.x + x, BASE_CAMP.y + y)); m.castShadow = true; camp.add(m); }
    const mast = new T.Mesh(new T.CylinderGeometry(0.06, 0.12, 6, 8).rotateX(Math.PI / 2).translate(0, 0, 3), steel);
    mast.position.set(BASE_CAMP.x, BASE_CAMP.y, t.heightAt(BASE_CAMP.x, BASE_CAMP.y)); camp.add(mast);
    const beacon = new T.Mesh(new T.SphereGeometry(0.18, 10, 8), new T.MeshBasicMaterial({ color: new T.Color(0.4, 3, 1.6), toneMapped: false }));
    beacon.position.set(BASE_CAMP.x, BASE_CAMP.y, mast.position.z + 6.1); camp.add(beacon);
    this.root.add(camp);
    for (const [text, x, y, w] of [['БАЗА · ЗАРЯДКА', BASE_CAMP.x, BASE_CAMP.y - 6, 8], ['БРОД', FORD.x, t.riverY(FORD.x) - 6, 4]] as const) {
      const l = floorLabel(text, x, y, t.heightAt(x, y) + 0.15, w, '#f0e6c8', 0, 0.75); if (l) this.root.add(l);
    }
    this.fleet = new FleetRenderer(mission.agents, ['WATER_CANNON', 'TRENCH_BLADE', 'THERMAL_RELAY', 'TANKER_REFILL']);
    this.root.add(this.fleet.root, this.flames.mesh, this.smoke.mesh, this.water.mesh, this.mist.mesh, this.dirt.mesh);
    for (let i = 0; i < 4; i++) { const l = new T.PointLight(0xff7a2a, 0, 40, 1.6); this.lights.push(l); this.root.add(l); }
    // Overlay.
    const radioGeo = new T.BufferGeometry();
    radioGeo.setAttribute('position', new T.BufferAttribute(this.radioPos, 3)); radioGeo.setAttribute('color', new T.BufferAttribute(this.radioCol, 3));
    this.radio = new T.LineSegments(radioGeo, new T.LineBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, depthTest: false }));
    const routeGeo = new T.BufferGeometry(); routeGeo.setAttribute('position', new T.BufferAttribute(this.routePos, 3));
    this.routes = new T.LineSegments(routeGeo, new T.LineBasicMaterial({ color: new T.Color(2, 1.4, 0.3), toneMapped: false, transparent: true, depthTest: false }));
    const closedGeo = new T.BufferGeometry(); closedGeo.setAttribute('position', new T.BufferAttribute(this.closedPos, 3));
    this.closed = new T.LineSegments(closedGeo, new T.LineBasicMaterial({ color: new T.Color(3, 0.3, 0.2), toneMapped: false, transparent: true, depthTest: false }));
    for (const l of [this.radio, this.routes, this.closed]) { l.frustumCulled = false; l.renderOrder = 6; this.overlay.add(l); }
    this.overlay.visible = false;
    this.root.add(this.overlay);
  }

  sync(time: number, overlay: boolean): void {
    const dt = Math.min(0.05, Math.max(0, time - this.last));
    this.last = time;
    const m = this.mission, g = m.grid;
    this.fleet.sync(time);
    this.flames.uniforms.uTime.value = time;
    if (g.version !== this.version) { this.version = g.version; this.refreshFire(); }
    // Smoke columns from the hottest cells, drifting downwind.
    this.smokeAcc += dt * Math.min(70, g.burningCount * 0.6);
    while (this.smokeAcc >= 1 && g.burningCount > 0) {
      this.smokeAcc -= 1;
      const k = g.burning[Math.floor(Math.random() * g.burningCount)], I = g.intensity[k];
      const w = g.windSpeed * 0.35;
      this.smoke.emit(g.cx(k) + (Math.random() - 0.5) * 2, g.cy(k) + (Math.random() - 0.5) * 2, g.height[k] + 2 + I * 3, g.windX * w, g.windY * w, 1.2 + I * 1.5, 7 + Math.random() * 4, 1.6 + I * 1.4);
    }
    this.smoke.update(dt);
    // Warm light from the largest fronts.
    for (let i = 0; i < this.lights.length; i++) {
      const at = m.attacks[i], l = this.lights[i];
      if (!at || at.lastSeen <= 0) { l.intensity = 0; continue; }
      l.position.set(at.x, at.y, m.terrain.heightAt(at.x, at.y) + 4);
      l.intensity = Math.min(900, 60 + at.lastSeen * 6) * (0.8 + 0.2 * Math.sin(time * 13 + i) * Math.sin(time * 7.3));
    }
    // Water jets: ballistic droplets from each nozzle onto its target cell, mist at the impact.
    for (const a of m.agents) {
      if (a.module.capability === 'TRENCH_BLADE' && a.working && Math.random() < 0.5) {
        this.dirt.emit(a.x + Math.cos(a.theta) * 0.4, a.y + Math.sin(a.theta) * 0.4, a.z + 0.1, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5, 0.8, 0.03, 0.32, 0.24, 0.15);
      }
      if (a.module.capability !== 'WATER_CANNON' || !a.working) continue;
      toolTip(a, this.v);
      const tx = a.aimX, ty = a.aimY, tz = a.aimZ + 0.3;
      const d = Math.hypot(tx - this.v.x, ty - this.v.y), T0 = Math.min(1.6, Math.max(0.55, d / 9));
      for (let k = 0; k < 6; k++) {
        const j = 1 + (Math.random() - 0.5) * 0.08, s = (Math.random() - 0.5) * 0.4;
        const vx = (tx - this.v.x) / T0 * j + s, vy = (ty - this.v.y) / T0 * j - s, vz = ((tz - this.v.z) + 0.5 * 9.81 * T0 * T0) / T0 * j;
        this.water.emit(this.v.x, this.v.y, this.v.z, vx, vy, vz, T0 * 1.05, 0.02, 0.78, 0.9, 1.0);
      }
      if (Math.random() < 0.8) this.mist.emit(tx + (Math.random() - 0.5) * 1.6, ty + (Math.random() - 0.5) * 1.6, tz, (Math.random() - 0.5), (Math.random() - 0.5), 0.6 + Math.random(), 1.1, 0.05, 0.45, 0.5, 0.55);
    }
    this.water.update(dt);
    this.mist.update(dt);
    this.dirt.update(dt);
    this.overlay.visible = overlay;
    this.overlayTimer += dt;
    if (overlay && this.overlayTimer > 0.3) { this.overlayTimer = 0; this.refreshOverlay(); }
  }

  /** Terrain colours, tree states and flame instances from the fire automaton. */
  private refreshFire(): void {
    const m = this.mission, g = m.grid, t = m.terrain, col = this.colors.array as Float32Array;
    for (let v = 0; v < this.vertexCell.length; v++) {
      const k = this.vertexCell[v];
      const s = k < 0 ? CellState.UNBURNT : g.state[k];
      let r = this.baseColors[v * 3], gg = this.baseColors[v * 3 + 1], b = this.baseColors[v * 3 + 2];
      if (s === CellState.BURNT) { r = C_BURNT.r; gg = C_BURNT.g; b = C_BURNT.b; }
      else if (s === CellState.BURNING) { const I = g.intensity[k]; r = C_EMBER.r * (1 + I * 2.5); gg = C_EMBER.g * (1 + I); b = C_EMBER.b; }
      else if (s === CellState.EXTINGUISHED) { r = C_WET.r; gg = C_WET.g; b = C_WET.b; }
      else if (s === CellState.FIREBREAK) { r = C_BREAK.r; gg = C_BREAK.g; b = C_BREAK.b; }
      else if (k >= 0 && g.wet[k] > 0.05) { const w = Math.min(1, g.wet[k]); r *= 1 - 0.4 * w; gg *= 1 - 0.3 * w; b *= 1 - 0.2 * w; }
      col[v * 3] = r; col[v * 3 + 1] = gg; col[v * 3 + 2] = b;
    }
    this.colors.needsUpdate = true;
    // Trees: burning ones glow orange, burnt ones become charcoal snags, firebreak felled.
    for (let i = 0; i < this.trees.count; i++) {
      const k = this.treeCell[i], s = k < 0 ? CellState.UNBURNT : g.state[k];
      if (s === CellState.FIREBREAK) { this.trees.setMatrixAt(i, HIDDEN); continue; }
      this.trees.setMatrixAt(i, this.treeMatrix[i]);
      if (s === CellState.BURNT) this.c.setRGB(0.03, 0.028, 0.025);
      else if (s === CellState.BURNING) this.c.setRGB(0.35 + g.intensity[k] * 0.4, 0.09, 0.02);
      else if (s === CellState.EXTINGUISHED) this.c.setRGB(0.07, 0.07, 0.05);
      else this.c.copy(this.treeBase[i]);
      this.trees.setColorAt(i, this.c);
    }
    this.trees.instanceMatrix.needsUpdate = true;
    if (this.trees.instanceColor) this.trees.instanceColor.needsUpdate = true;
    // Flames: one billboard per burning cell (taller in forest), jittered deterministically.
    this.flames.begin();
    for (let b = 0; b < g.burningCount; b++) {
      const k = g.burning[b], I = g.intensity[k], forest = t.forestAt(g.cx(k), g.cy(k));
      const jx = ((k * 7919) % 100) / 100 - 0.5, jy = ((k * 104729) % 100) / 100 - 0.5;
      this.flames.add(g.cx(k) + jx, g.cy(k) + jy, g.height[k] - 0.1, 1.6 + I * 1.6, (0.8 + I * 2.2) * (1 + forest * 1.6), 0.45 + I * 0.55);
      if (forest > 0.6 && I > 0.5) this.flames.add(g.cx(k) - jx * 0.8, g.cy(k) - jy, g.height[k] + 2.2, 1.2 + I, 2 + I * 2.6, I * 0.8);
    }
    this.flames.end();
  }

  private refreshOverlay(): void {
    const m = this.mission, links = m.links;
    let n = 0;
    for (let i = 0; i + 4 < links.length && n < 400; i += 5, n++) {
      const x0 = links[i], y0 = links[i + 1], x1 = links[i + 2], y1 = links[i + 3], relay = links[i + 4] === 1;
      const o = n * 6;
      this.radioPos[o] = x0; this.radioPos[o + 1] = y0; this.radioPos[o + 2] = m.terrain.heightAt(x0, y0) + 2;
      this.radioPos[o + 3] = x1; this.radioPos[o + 4] = y1; this.radioPos[o + 5] = m.terrain.heightAt(x1, y1) + 2;
      for (let q = 0; q < 2; q++) { this.radioCol[o + q * 3] = relay ? 0.4 : 0.35; this.radioCol[o + q * 3 + 1] = relay ? 1.4 : 2.2; this.radioCol[o + q * 3 + 2] = relay ? 2.8 : 0.8; }
    }
    this.radio.geometry.setDrawRange(0, n * 2);
    this.radio.geometry.attributes.position.needsUpdate = true;
    this.radio.geometry.attributes.color.needsUpdate = true;
    let r = 0;
    const cap = this.routePos.length / 6;
    for (const a of m.agents) {
      let px = a.x, py = a.y;
      for (let k = a.wpIndex; k < a.wpX.length && r < cap; k++, r++) {
        const o = r * 6;
        this.routePos[o] = px; this.routePos[o + 1] = py; this.routePos[o + 2] = m.terrain.heightAt(px, py) + 0.4;
        this.routePos[o + 3] = a.wpX[k]; this.routePos[o + 4] = a.wpY[k]; this.routePos[o + 5] = m.terrain.heightAt(a.wpX[k], a.wpY[k]) + 0.4;
        px = a.wpX[k]; py = a.wpY[k];
      }
    }
    this.routes.geometry.setDrawRange(0, r * 2);
    this.routes.geometry.attributes.position.needsUpdate = true;
    let c = 0;
    for (const id of m.hazardClosed) {
      if (c >= 300) break;
      const e = m.graph.edge(id), a = m.graph.node(e.a), b = m.graph.node(e.b), o = c * 6;
      this.closedPos[o] = a.x; this.closedPos[o + 1] = a.y; this.closedPos[o + 2] = m.terrain.heightAt(a.x, a.y) + 0.6;
      this.closedPos[o + 3] = b.x; this.closedPos[o + 4] = b.y; this.closedPos[o + 5] = m.terrain.heightAt(b.x, b.y) + 0.6;
      c++;
    }
    this.closed.geometry.setDrawRange(0, c * 2);
    this.closed.geometry.attributes.position.needsUpdate = true;
  }

  dispose(): void { this.fleet.dispose(); this.flames.dispose(); this.smoke.dispose(); this.water.dispose(); this.mist.dispose(); this.dirt.dispose(); }
}

const HIDDEN = new T.Matrix4().makeScale(0, 0, 0);
