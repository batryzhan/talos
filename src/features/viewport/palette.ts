import { Color, LinearSRGBColorSpace } from 'three';
import { tokenLinearRgb, type ThemeName, type TokenName } from '@/design/tokens';

/** Scene colours derived from the same OKLCH tokens as the panels. */
export interface ScenePalette {
  viewport: Color;
  grid: Color;
  gridMajor: Color;
  foreground: Color;
  muted: Color;
  primary: Color;
  success: Color;
  warning: Color;
  destructive: Color;
  info: Color;
}

const cache = new Map<ThemeName, ScenePalette>();

function color(theme: ThemeName, name: TokenName): Color {
  const [r, g, b] = tokenLinearRgb(theme, name);
  return new Color().setRGB(r, g, b, LinearSRGBColorSpace);
}

export function scenePalette(theme: ThemeName): ScenePalette {
  let p = cache.get(theme);
  if (!p) {
    p = {
      viewport: color(theme, 'viewport'),
      grid: color(theme, 'viewport-grid'),
      gridMajor: color(theme, 'muted-foreground'),
      foreground: color(theme, 'foreground'),
      muted: color(theme, 'muted-foreground'),
      primary: color(theme, 'primary'),
      success: color(theme, 'success'),
      warning: color(theme, 'warning'),
      destructive: color(theme, 'destructive'),
      info: color(theme, 'info'),
    };
    cache.set(theme, p);
  }
  return p;
}
