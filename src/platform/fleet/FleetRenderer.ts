/**
 * Instanced renderer of a heterogeneous Strafer fleet: one draw call per chassis part and per module
 * part for the whole fleet. A robot whose module changes (hot-swap reserve taking over a role) simply
 * shows other part instances — capacity is the fleet size for every part.
 *
 * Shadows: only one invisible proxy box per robot casts (CLAUDE.md §2) — the detailed parts never
 * render into the shadow map.
 *
 * `sync` runs every frame and allocates nothing: matrices are composed into scratch objects and
 * written straight into the instance buffers.
 */
import * as T from 'three';
import type { SwarmAgent } from '../../core/agents/SwarmAgent';
import type { ModuleCapability } from '../../core/agents/taskModule';
import { STRAFER } from '../../core/agents/SwarmAgent';
import { logoTexture } from '../../robot/logo';
import { box, mecanumWheel, merge } from './geometry';
import { MODULE_HEIGHT, MODULE_PARTS, createPoseScratch, pose, type MaterialKey, type PartSpec, type PoseScratch } from './modules';

const HIDDEN = new T.Matrix4().makeScale(0, 0, 0);

function materials(): Record<MaterialKey, T.Material> {
  const std = (color: number, metalness: number, roughness: number, emissive = 0, ei = 0): T.MeshStandardMaterial =>
    new T.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity: ei });
  const glow = (color: number, k: number): T.MeshBasicMaterial => {
    const m = new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(k), toneMapped: false });
    return m;
  };
  return {
    graphite: std(0x2c3035, 0.55, 0.5),
    steel: std(0x8e959c, 0.85, 0.32),
    alu: std(0xc3c8cd, 0.8, 0.28),
    yellow: std(0xe0a71c, 0.35, 0.45),
    red: std(0xb8281f, 0.4, 0.42),
    black: std(0x141516, 0.4, 0.6),
    copper: std(0xb87333, 0.9, 0.3),
    blue: std(0x2a5ea8, 0.45, 0.4),
    orange: std(0xe4661c, 0.3, 0.5),
    glass: std(0x10161c, 0.2, 0.08, 0x0b2a3a, 0.6),
    coal: std(0x101114, 0.3, 0.22),
    rubber: std(0x1b1c1e, 0, 0.9),
    glowGreen: glow(0x2bff8a, 3),
    glowWhite: glow(0xfff4dc, 4),
    glowCyan: glow(0x4fd8ff, 3),
    glowAmber: glow(0xffa53a, 3),
  };
}

interface PartMesh { spec: PartSpec; mesh: T.InstancedMesh; capability: ModuleCapability | null; local: T.Matrix4 | null; wheel: number }

export interface FleetRendererOptions {
  /** Terrain: ground height is read from agent.z, tilt from agent.pitch / roll. */
  statusColors?: boolean;
}

export class FleetRenderer {
  readonly root = new T.Group();
  private readonly parts: PartMesh[] = [];
  private readonly mats = materials();
  private readonly k: PoseScratch = createPoseScratch();
  private readonly robot = new T.Matrix4();
  private readonly local = new T.Matrix4();
  private readonly world = new T.Matrix4();
  private readonly euler = new T.Euler();
  private readonly color = new T.Color();
  private readonly status: T.InstancedMesh;
  private readonly proxy: T.InstancedMesh;

  constructor(private readonly agents: readonly SwarmAgent[], capabilities: readonly ModuleCapability[]) {
    this.root.name = 'strafer-fleet';
    const n = agents.length;
    const chassisMat = new T.MeshStandardMaterial({ color: 0x1f2226, metalness: 0.7, roughness: 0.42 });
    const frame = merge([
      // goBILDA 1120 U-channel perimeter 432 × 360 mm, deck plate and motor gearboxes.
      box(0.432, 0.048, 0.048, 0, 0.156, 0.07), box(0.432, 0.048, 0.048, 0, -0.156, 0.07),
      box(0.048, 0.264, 0.048, 0.192, 0, 0.07), box(0.048, 0.264, 0.048, -0.192, 0, 0.07),
      box(0.36, 0.26, 0.008, 0, 0, 0.098),
      ...[[0.168, 0.1], [0.168, -0.1], [-0.168, 0.1], [-0.168, -0.1]].map(([x, y]) => box(0.05, 0.05, 0.09, x - Math.sign(x) * 0.06, y, 0.06)),
    ]);
    this.addPart({ material: 'graphite', geometry: () => frame }, chassisMat, null, -1, n);
    // TALOS mark on both outer faces of the side channels (tests / workers have no DOM → skipped).
    const logoMap = logoTexture();
    if (logoMap) {
      const side = (sy: 1 | -1): T.BufferGeometry => {
        const g = new T.PlaneGeometry(0.042, 0.042).toNonIndexed();
        g.rotateX(Math.PI / 2); // normal −y
        if (sy > 0) g.rotateZ(Math.PI);
        return g.translate(0, sy * 0.1806, 0.07);
      };
      const decal = merge([side(1), side(-1)]);
      const decalMat = new T.MeshStandardMaterial({ map: logoMap, transparent: true, alphaTest: 0.35, roughness: 0.6, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
      this.addPart({ material: 'graphite', geometry: () => decal }, decalMat, null, -1, n);
    }
    const wheelGeo = mecanumWheel();
    const wheelMat = new T.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.55 });
    const corners: [number, number][] = [[STRAFER.a, STRAFER.b], [STRAFER.a, -STRAFER.b], [-STRAFER.a, STRAFER.b], [-STRAFER.a, -STRAFER.b]];
    // Wheel order FL, FR, RL, RR (body +y is left).
    corners.forEach((_, i) => this.addPart({ material: 'rubber', geometry: () => wheelGeo }, wheelMat, null, i, n, corners));
    const statusGeo = box(0.12, 0.012, 0.02, -0.19, 0, 0.085);
    this.status = new T.InstancedMesh(statusGeo, new T.MeshBasicMaterial({ toneMapped: false }), n);
    this.status.frustumCulled = false;
    this.status.instanceColor = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.root.add(this.status);
    for (const cap of new Set(capabilities)) for (const spec of MODULE_PARTS[cap]) this.addPart(spec, this.mats[spec.material], cap, -1, n);
    this.proxy = new T.InstancedMesh(new T.BoxGeometry(0.45, 0.42, 1), new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), n);
    this.proxy.castShadow = true;
    this.proxy.frustumCulled = false;
    this.root.add(this.proxy);
  }

  private wheelCorners: [number, number][] = [];

  private addPart(spec: PartSpec, material: T.Material, capability: ModuleCapability | null, wheel: number, n: number, corners?: [number, number][]): void {
    if (corners) this.wheelCorners = corners;
    const mesh = new T.InstancedMesh(spec.geometry(), material, n);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    let local: T.Matrix4 | null = null;
    if (spec.local) { local = new T.Matrix4(); spec.local(this.k, local); }
    this.parts.push({ spec, mesh, capability, local, wheel });
    this.root.add(mesh);
  }

  /** Per-frame write of every instance (no allocation). */
  sync(time: number): void {
    const n = this.agents.length;
    for (let i = 0; i < n; i++) {
      const a = this.agents[i];
      this.euler.set(a.roll, a.pitch, a.theta, 'ZYX');
      this.robot.makeRotationFromEuler(this.euler);
      this.robot.setPosition(a.x, a.y, a.z);
      for (const p of this.parts) {
        if (p.capability !== null && p.capability !== a.module.capability) { p.mesh.setMatrixAt(i, HIDDEN); continue; }
        if (p.wheel >= 0) {
          const [cx, cy] = this.wheelCorners[p.wheel];
          pose(this.k, this.local, cx, cy, STRAFER.r, 0, a.wheelAngle[p.wheel]);
          this.world.multiplyMatrices(this.robot, this.local);
        } else if (p.spec.pose) {
          if (p.spec.pose(a, time, this.k, this.local) === false) { p.mesh.setMatrixAt(i, HIDDEN); continue; }
          this.world.multiplyMatrices(this.robot, this.local);
        } else if (p.local) this.world.multiplyMatrices(this.robot, p.local);
        else this.world.copy(this.robot);
        p.mesh.setMatrixAt(i, this.world);
      }
      // Status light: red HOLD / low battery, blue charging, amber working, green ready.
      if (a.hold) this.color.setRGB(3, 0.25, 0.2);
      else if (!a.active) this.color.setRGB(0.3, 0.8, 3);
      else if (a.battery < 0.25) this.color.setRGB(3, 0.6, 0.1);
      else if (a.working) this.color.setRGB(3, 1.8, 0.3);
      else this.color.setRGB(0.3, 2.6, 0.9);
      this.status.setMatrixAt(i, this.robot);
      this.status.setColorAt(i, this.color);
      const h = MODULE_HEIGHT[a.module.capability];
      this.local.makeScale(1, 1, h);
      this.local.setPosition(0, 0, h / 2);
      this.world.multiplyMatrices(this.robot, this.local);
      this.proxy.setMatrixAt(i, this.world);
    }
    for (const p of this.parts) p.mesh.instanceMatrix.needsUpdate = true;
    this.status.instanceMatrix.needsUpdate = true;
    if (this.status.instanceColor) this.status.instanceColor.needsUpdate = true;
    this.proxy.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const p of this.parts) p.mesh.geometry.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
