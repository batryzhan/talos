import * as T from 'three';

/**
 * Flat floor / wall label drawn once into a canvas texture (zone names on the site plan). No-op in
 * headless tests where there is no DOM canvas.
 */
export function floorLabel(text: string, x: number, y: number, z: number, width: number, color = '#d9dde3', rotation = 0, opacity = 0.85): T.Mesh | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = '600 64px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 512, 66);
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new T.Mesh(new T.PlaneGeometry(width, width / 8), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  mesh.position.set(x, y, z);
  mesh.rotation.z = rotation;
  mesh.renderOrder = 1;
  mesh.raycast = () => {};
  return mesh;
}
