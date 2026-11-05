/**
 * Industrial TALOS — lower chassis dressing on top of the goBILDA Strafer .glb.
 *
 * The .glb already provides the perforated goBILDA 1120 U-channel perimeter (432 × 360 mm, side
 * channels |y| 0.132…0.180, end channels); we keep it, lift it by CHASSIS_LIFT (140 mm wheels on the
 * same axles → 46 mm clearance) and give it the matte-anodized identity. Added here:
 *  - side nameplates on the outer faces of the side channels (|y| = 0.180): matte
 *    black, 4 screws, teal/white triangle logo and "TALOS" lettering
 *  - electronics bay on a black tray resting on the rail tops (z = 0.072) between the column
 *    brackets: control hub with a row of ports and a status LED, battery pack with a red power
 *    switch, red/black wiring laid on the tray
 *
 * Datums: CHASSIS_TOP_Z and the side-plate face come from straferSpec.ts (CAD + Δr).
 */
import * as THREE from 'three';
import { Assembly, beveledBox, cable, extrudeZ, screwHead } from './geometryKit';
import { indicatorMaterial, pbr, talosLetteringMaterial } from './materials';
import { CHASSIS_TOP_Z } from './ViperSlideRig';
import { CHASSIS_LIFT, FRAME } from './straferSpec';

/** Outer face of the CAD side plates (|y|) and their z range. */
export const SIDE_PLATE = { y: FRAME.hy, z0: 0.0301 + CHASSIS_LIFT, z1: 0.0661 + CHASSIS_LIFT } as const;

export const BAY = {
  tray: { x0: -0.112, x1: 0.112, hy: 0.165, t: 0.003 },
  /** REV Control Hub REV-31-1595: 143 × 103 × 31 mm (long side across the robot). */
  hub: { x0: 0.006, x1: 0.109, hy: 0.0715, h: 0.031 },
  battery: { x0: -0.106, x1: -0.016, y0: -0.13, y1: -0.05, h: 0.04 },
  switchBase: { x0: -0.085, x1: -0.055, y0: 0.05, y1: 0.08, h: 0.012 },
  wireR: 0.0025,
} as const;
export const TRAY_TOP_Z = CHASSIS_TOP_Z + BAY.tray.t;

export const NAMEPLATE = { hx: 0.085, z0: 0.034 + CHASSIS_LIFT, z1: 0.062 + CHASSIS_LIFT, t: 0.003 } as const;

export interface ChassisOptions { compile?: boolean }

export class TalosChassis {
  readonly root = new THREE.Group();
  readonly assembly = new Assembly('chassis');
  private readonly ledMat = indicatorMaterial(0x3fb950, 2.4);

  constructor(opts: ChassisOptions = {}) {
    this.root.name = 'talos_chassis_dressing';
    this.build();
    if (opts.compile ?? true) this.assembly.compile();
    this.root.add(this.assembly.groups.static);
    this.addLettering();
  }

  private build(): void {
    const A = this.assembly;
    const z = TRAY_TOP_Z;

    // ── tray: rests on both rail tops and the centre channel ──
    A.add('bay_tray', beveledBox(BAY.tray.x1 - BAY.tray.x0, 2 * BAY.tray.hy, BAY.tray.t, { radius: 0.006, bevel: 0.0005 }), 'trayBlack', 'static', [(BAY.tray.x0 + BAY.tray.x1) / 2, 0, CHASSIS_TOP_Z]);

    // ── control hub with a row of ports on its top face and a status LED ──
    const hub = BAY.hub, hubW = hub.x1 - hub.x0;
    A.add('control_hub', beveledBox(hubW, 2 * hub.hy, hub.h, { radius: 0.005, bevel: 0.001 }), 'absBlack', 'static', [(hub.x0 + hub.x1) / 2, 0, z], ['bay_tray', 'wire_black_0', 'wire_red_1']);
    for (let i = 0; i < 8; i++) {
      const y = -0.052 + i * 0.0148;
      A.add(`hub_port_${i}`, beveledBox(0.007, 0.01, 0.003, { radius: 0.001, bevel: 0.0003 }), 'portGrey', 'static', [hub.x1 - 0.012, y, z + hub.h - 0.0005], ['control_hub']);
    }
    for (let i = 0; i < 4; i++) {
      A.add(`hub_servo_port_${i}`, beveledBox(0.012, 0.006, 0.003, { radius: 0.001, bevel: 0.0003 }), 'portGrey', 'static', [hub.x0 + 0.02 + i * 0.018, -hub.hy + 0.012, z + hub.h - 0.0005], ['control_hub']);
    }
    A.add('hub_led', beveledBox(0.008, 0.008, 0.0025, { radius: 0.002, bevel: 0.0003 }), this.ledMat, 'static', [hub.x0 + 0.02, hub.hy - 0.015, z + hub.h - 0.0005], ['control_hub']);

    // ── battery pack (right side, −y) ──
    const bat = BAY.battery;
    A.add('battery', beveledBox(bat.x1 - bat.x0, bat.y1 - bat.y0, bat.h, { radius: 0.006, bevel: 0.0012 }), 'absBlack', 'static', [(bat.x0 + bat.x1) / 2, (bat.y0 + bat.y1) / 2, z], ['bay_tray', 'wire_red_0', 'wire_black_0']);
    A.add('battery_label', beveledBox(bat.x1 - bat.x0 - 0.02, bat.y1 - bat.y0 - 0.02, 0.0008, { radius: 0.003, bevel: 0.0002 }), 'tealPowderCoat', 'static', [(bat.x0 + bat.x1) / 2, (bat.y0 + bat.y1) / 2, z + bat.h - 0.0002], ['battery']);

    // ── red power switch on a black base (left side, +y) ──
    const sw = BAY.switchBase;
    A.add('switch_base', beveledBox(sw.x1 - sw.x0, sw.y1 - sw.y0, sw.h, { radius: 0.003, bevel: 0.0006 }), 'absBlack', 'static', [(sw.x0 + sw.x1) / 2, (sw.y0 + sw.y1) / 2, z], ['bay_tray', 'switch_rocker', 'wire_red_0', 'wire_red_1']);
    const rocker = new THREE.Shape();
    rocker.moveTo(-0.007, -0.0); rocker.lineTo(0.007, 0); rocker.lineTo(0.007, 0.006); rocker.lineTo(-0.007, 0.0095); rocker.closePath();
    const rg = extrudeZ(rocker, 0.018, 0.0005);
    rg.translate(0, 0, -0.009);
    rg.rotateX(Math.PI / 2); // profile in x–z, width along y
    A.add('switch_rocker', rg, 'switchRed', 'static', [(sw.x0 + sw.x1) / 2, (sw.y0 + sw.y1) / 2, z + sw.h - 0.0005], ['switch_base']);

    // ── wiring laid on the tray (tube centre at tray + r). Lanes keep red/black from crossing. ──
    const wz = z + BAY.wireR;
    // red: battery + → power switch (lane x = −0.011)
    A.add('wire_red_0', cable([[-0.02, -0.075, z + 0.012], [-0.011, -0.075, wz], [-0.011, -0.02, wz], [-0.011, 0.035, wz], [-0.035, 0.06, wz], [sw.x1 - 0.004, 0.065, z + 0.006]], BAY.wireR, wz), 'wireRed', 'static', [0, 0, 0], ['battery', 'switch_base']);
    // red: power switch → control hub (around the switch's +y side)
    A.add('wire_red_1', cable([[sw.x1 - 0.004, 0.074, z + 0.006], [-0.035, 0.092, wz], [-0.008, 0.095, wz], [hub.x0 + 0.004, 0.06, z + 0.012]], BAY.wireR, wz), 'wireRed', 'static', [0, 0, 0], ['switch_base', 'control_hub']);
    // black: battery − → control hub (lane x = −0.003, leaves the battery south of the red lead)
    A.add('wire_black_0', cable([[-0.02, -0.11, z + 0.012], [-0.003, -0.105, wz], [-0.003, -0.07, wz], [-0.003, -0.05, wz], [hub.x0 + 0.004, -0.045, z + 0.012]], BAY.wireR, wz), 'wireBlack', 'static', [0, 0, 0], ['battery', 'control_hub']);
    // motor leads along the rail inner faces (red/black pairs to the front motors)
    // (separate lanes x = 0.094 / 0.106 — the pair never crosses; both stay on the tray, x ≤ 0.112)
    const rm = BAY.wireR * 0.8, wzm = z + rm;
    for (const sy of [1, -1]) {
      const s = sy > 0 ? 'L' : 'R';
      A.add(`wire_motor_red_${s}`, cable([[0.1, sy * 0.064, z + 0.012], [0.106, sy * 0.08, wzm], [0.106, sy * 0.115, wzm], [0.106, sy * 0.15, wzm]], rm, wzm), 'wireRed', 'static', [0, 0, 0], ['control_hub']);
      A.add(`wire_motor_black_${s}`, cable([[0.09, sy * 0.064, z + 0.012], [0.094, sy * 0.08, wzm], [0.094, sy * 0.115, wzm], [0.094, sy * 0.15, wzm]], rm, wzm), 'wireBlack', 'static', [0, 0, 0], ['control_hub']);
    }

    // ── side nameplates with the triangle logo ──
    for (const sy of [1, -1] as const) {
      const side = sy > 0 ? 'L' : 'R';
      const yFace = sy * SIDE_PLATE.y;
      const plateGeo = beveledBox(2 * NAMEPLATE.hx, NAMEPLATE.z1 - NAMEPLATE.z0, NAMEPLATE.t, { radius: 0.004, bevel: 0.0005 });
      // box spans z∈[0,t] → rotate so thickness runs along ±y, outward from the side plate
      plateGeo.rotateX(sy > 0 ? -Math.PI / 2 : Math.PI / 2);
      A.add(`nameplate_${side}`, plateGeo, 'nameplateBlack', 'static', [0, yFace, (NAMEPLATE.z0 + NAMEPLATE.z1) / 2]);
      const outer = new THREE.Vector3(0, sy, 0);
      const yOut = yFace + sy * NAMEPLATE.t;
      for (const [x, zz] of [[-NAMEPLATE.hx + 0.007, NAMEPLATE.z0 + 0.006], [NAMEPLATE.hx - 0.007, NAMEPLATE.z0 + 0.006], [-NAMEPLATE.hx + 0.007, NAMEPLATE.z1 - 0.006], [NAMEPLATE.hx - 0.007, NAMEPLATE.z1 - 0.006]]) {
        A.add(`nameplate_screw_${side}_${x > 0 ? 'f' : 'r'}${zz > 0.05 ? 't' : 'b'}`, screwHead(outer, 0.0026, 0.001), 'steelFastener', 'static', [x, yOut, zz], [`nameplate_${side}`]);
      }
      // logo: teal downward triangle with a white inner triangle (▼), on the rear part of the plate
      // (reading direction: +x is to the viewer's right on the −y side, to the left on the +y side)
      const logoX = sy < 0 ? -NAMEPLATE.hx + 0.024 : NAMEPLATE.hx - 0.024;
      const tri = (s: number) => { const t = new THREE.Shape(); t.moveTo(-s, s * 0.8); t.lineTo(s, s * 0.8); t.lineTo(0, -s * 0.9); t.closePath(); return t; };
      const zc = (NAMEPLATE.z0 + NAMEPLATE.z1) / 2;
      const outerTri = extrudeZ(tri(0.011), 0.0006, 0.0001);
      outerTri.rotateX(sy > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (sy > 0) outerTri.rotateY(Math.PI); // keep ▼ pointing down when viewed from +y
      A.add(`logo_teal_${side}`, outerTri, 'logoTeal', 'static', [logoX, yOut, zc], [`nameplate_${side}`]);
      const innerTri = extrudeZ(tri(0.0055), 0.0003, 0.00005);
      innerTri.rotateX(sy > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (sy > 0) innerTri.rotateY(Math.PI);
      A.add(`logo_white_${side}`, innerTri, 'logoWhite', 'static', [logoX, yOut + sy * 0.0006, zc + 0.0015], [`logo_teal_${side}`]);
    }
  }

  /** "TALOS" lettering decal (browser only — needs a canvas). */
  private addLettering(): void {
    const mat = talosLetteringMaterial();
    if (!mat) return;
    for (const sy of [1, -1] as const) {
      const g = new THREE.PlaneGeometry(0.11, 0.0275);
      g.rotateX(Math.PI / 2);          // normal −y, texture up +z
      if (sy > 0) g.rotateZ(Math.PI);  // normal +y, text still reads left→right from outside
      const m = new THREE.Mesh(g, mat);
      m.name = `nameplate_lettering_${sy > 0 ? 'L' : 'R'}`;
      const textX = sy < 0 ? 0.014 : -0.014;
      m.position.set(textX, sy * (SIDE_PLATE.y + NAMEPLATE.t + 0.0003), (NAMEPLATE.z0 + NAMEPLATE.z1) / 2);
      this.root.add(m);
    }
  }

  setStatusColor(color: THREE.ColorRepresentation): void {
    this.ledMat.emissive.set(color);
  }

  dispose(): void {
    this.assembly.dispose();
    this.ledMat.dispose();
  }
}

/** Recolour a cloned Strafer .glb: yellow PU rollers on black hubs, matte-anodized channels. */
export function dressStraferModel(model: THREE.Object3D): void {
  model.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const inRoller = hasAncestor(mesh, n => n.name.startsWith('roller_'));
    const inWheel = hasAncestor(mesh, n => n.name.startsWith('wheel_'));
    const remap = (m: THREE.Material): THREE.Material => {
      const name = m.name;
      if (inRoller) {
        if (name === 'rubber') return pbr('polyurethaneYellow');
        if (name === 'rollerGray') return pbr('polyurethaneCore');
        return pbr('steelFastener');
      }
      if (inWheel) return name === 'steel' ? pbr('steelFastener') : pbr('blackAnodized'); // hub plates
      if (name === 'aluminum') return pbr('aluminiumAnodized');
      return m;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(remap) : remap(mesh.material);
  });
}

function hasAncestor(o: THREE.Object3D, pred: (n: THREE.Object3D) => boolean): boolean {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) if (pred(n)) return true;
  return false;
}
