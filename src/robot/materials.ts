/**
 * Industrial TALOS — authored PBR identities (threejs-procedural-materials: "authored response bundles").
 *
 * Every surface is one identity whose colour / roughness / metalness / clearcoat describe the same
 * physical finish. Materials are cached at module level and SHARED by every robot instance, so a
 * 16–24 robot scene adds no per-robot material/shader cost. Mode / contact indicators are the only
 * per-robot materials (they change colour per agent).
 *
 * Debug views (acceptance gate): 'identity' paints each identity a flat false colour, 'roughness'
 * and 'metalness' show that channel as grey — toggled globally with setMaterialDebugView().
 */
import * as THREE from 'three';

export type MaterialIdentity =
  | 'aluminiumAnodized'   // T-slot extrusions, frame bars — matte clear anodize
  | 'blackAnodized'       // corner cubes, couplers, hubs
  | 'tealPowderCoat'      // #115e59 column brackets
  | 'compositePlate'      // black composite / rubberised cargo plate
  | 'rubberIsolator'      // plate isolators
  | 'polyurethaneYellow'  // mecanum roller covers #eab308
  | 'polyurethaneCore'    // roller cores (slightly deeper yellow)
  | 'steelFastener'       // screws, axles
  | 'nameplateBlack'      // matte black nameplate
  | 'logoTeal'            // logo outer triangle
  | 'logoWhite'           // logo inner triangle
  | 'absBlack'            // controller housing, battery case
  | 'portGrey'            // connectors
  | 'switchRed'           // battery switch
  | 'wireRed'
  | 'wireBlack'
  | 'trayBlack'           // electronics tray
  | 'steelPlate'          // zinc-plated steel mecanum side plates
  | 'loadCellAlloy'       // corner load-cell bodies (anodised aluminium alloy)
  | 'steelCable'          // lift cable (galvanised steel rope)
  | 'gearboxGold'         // 5203 Yellow Jacket planetary gearbox
  | 'motorCan';           // DC motor can

interface Bundle { color: number; roughness: number; metalness: number; clearcoat?: number; clearcoatRoughness?: number }

/** Response bundles grouped by perceptual role. Ranges keep separation without post-processing. */
export const PBR_BUNDLES: Record<MaterialIdentity, Bundle> = {
  aluminiumAnodized: { color: 0xb8bcc2, roughness: 0.48, metalness: 0.85 },
  blackAnodized: { color: 0x17181b, roughness: 0.42, metalness: 0.7 },
  tealPowderCoat: { color: 0x115e59, roughness: 0.55, metalness: 0.15, clearcoat: 0.25, clearcoatRoughness: 0.5 },
  compositePlate: { color: 0x101113, roughness: 0.78, metalness: 0.05 },
  rubberIsolator: { color: 0x0b0b0c, roughness: 0.95, metalness: 0 },
  polyurethaneYellow: { color: 0xeab308, roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.45 },
  polyurethaneCore: { color: 0xd99a06, roughness: 0.55, metalness: 0 },
  steelFastener: { color: 0x9ea3a8, roughness: 0.3, metalness: 1 },
  nameplateBlack: { color: 0x0e0f11, roughness: 0.88, metalness: 0.05 },
  logoTeal: { color: 0x14b8a6, roughness: 0.5, metalness: 0.1 },
  logoWhite: { color: 0xf1f5f9, roughness: 0.55, metalness: 0 },
  absBlack: { color: 0x1a1b1e, roughness: 0.62, metalness: 0.02 },
  portGrey: { color: 0x3b3f45, roughness: 0.5, metalness: 0.3 },
  switchRed: { color: 0xdc2626, roughness: 0.42, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.35 },
  wireRed: { color: 0xc81e1e, roughness: 0.45, metalness: 0 },
  wireBlack: { color: 0x121212, roughness: 0.5, metalness: 0 },
  trayBlack: { color: 0x1c1d20, roughness: 0.7, metalness: 0.3 },
  steelPlate: { color: 0x8c9196, roughness: 0.38, metalness: 1 },
  loadCellAlloy: { color: 0xa7adb4, roughness: 0.35, metalness: 0.9 },
  steelCable: { color: 0x6b7076, roughness: 0.45, metalness: 1 },
  gearboxGold: { color: 0xc9a227, roughness: 0.4, metalness: 0.85 },
  motorCan: { color: 0x202226, roughness: 0.5, metalness: 0.6 },
};

/** False colours for the 'identity' debug view. */
const DEBUG_COLORS: Record<MaterialIdentity, number> = {
  aluminiumAnodized: 0x9ca3af, blackAnodized: 0x1f2937, tealPowderCoat: 0x0d9488, compositePlate: 0x7c3aed,
  rubberIsolator: 0x4c1d95, polyurethaneYellow: 0xfacc15, polyurethaneCore: 0xca8a04, steelFastener: 0xe5e7eb,
  nameplateBlack: 0x2563eb, logoTeal: 0x06b6d4, logoWhite: 0xffffff, absBlack: 0xf97316, portGrey: 0xa3e635,
  switchRed: 0xef4444, wireRed: 0xf43f5e, wireBlack: 0x84cc16, trayBlack: 0x92400e,
  steelPlate: 0x64748b, loadCellAlloy: 0x22d3ee, steelCable: 0xfb923c, gearboxGold: 0xfde047, motorCan: 0x3f3f46,
};

export type MaterialDebugView = 'none' | 'identity' | 'roughness' | 'metalness';

const cache = new Map<MaterialIdentity, THREE.MeshPhysicalMaterial>();
let debugView: MaterialDebugView = 'none';

function applyView(id: MaterialIdentity, m: THREE.MeshPhysicalMaterial): void {
  const b = PBR_BUNDLES[id];
  if (debugView === 'none') {
    m.color.set(b.color); m.roughness = b.roughness; m.metalness = b.metalness;
    m.clearcoat = b.clearcoat ?? 0; m.clearcoatRoughness = b.clearcoatRoughness ?? 0;
  } else {
    const v = debugView === 'roughness' ? b.roughness : debugView === 'metalness' ? b.metalness : -1;
    if (v >= 0) m.color.setScalar(v); else m.color.set(DEBUG_COLORS[id]);
    m.roughness = 1; m.metalness = 0; m.clearcoat = 0;
  }
  m.needsUpdate = true;
}

/** Shared material for an identity (created on first use). */
export function pbr(id: MaterialIdentity): THREE.MeshPhysicalMaterial {
  let m = cache.get(id);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ name: `talos/${id}` });
    m.userData.identity = id;
    applyView(id, m);
    cache.set(id, m);
  }
  return m;
}

/** Switch every shared TALOS material into a debug view (or back with 'none'). */
export function setMaterialDebugView(view: MaterialDebugView): void {
  debugView = view;
  for (const [id, m] of cache) applyView(id, m);
}

export function getMaterialDebugView(): MaterialDebugView { return debugView; }

/** Per-robot emissive indicator (mode LED, contact sensors). Not shared: colour is per agent. */
export function indicatorMaterial(color: THREE.ColorRepresentation, intensity = 2.0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.35, metalness: 0 });
}

// ───────────────────────── nameplate lettering ─────────────────────────

let letteringMaterial: THREE.MeshStandardMaterial | null | undefined;

/**
 * "TALOS" lettering for the side nameplates (white on matte black) from a shared CanvasTexture.
 * Returns null where no DOM canvas exists (unit tests / workers); the geometric logo still renders.
 */
export function talosLetteringMaterial(): THREE.MeshStandardMaterial | null {
  if (letteringMaterial !== undefined) return letteringMaterial;
  if (typeof document === 'undefined') return (letteringMaterial = null);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  if (!g) return (letteringMaterial = null);
  g.fillStyle = '#0e0f11'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#f1f5f9';
  g.font = '800 92px "Segoe UI", Roboto, Arial, sans-serif';
  g.textBaseline = 'middle'; g.textAlign = 'center';
  const spaced = g as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in spaced) spaced.letterSpacing = '18px';
  g.fillText('TALOS', c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return (letteringMaterial = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.05 }));
}
