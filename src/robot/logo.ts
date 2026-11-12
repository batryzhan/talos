import * as THREE from 'three';

/** URL of the white-on-transparent TALOS mark (public/logo.png). */
export const LOGO_URL = `${import.meta.env.BASE_URL}logo.png`;

let cached: THREE.Texture | null | undefined;

/** Shared logo texture for robot decals; null where there is no DOM (unit tests / workers). */
export function logoTexture(): THREE.Texture | null {
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined') return (cached = null);
  const t = new THREE.TextureLoader().load(LOGO_URL);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return (cached = t);
}
