import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// DOM-only shims for component tests (files opting into `@vitest-environment jsdom`).
if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());

  // Radix Select / Slider use pointer capture and scrollIntoView, which jsdom lacks.
  const proto = Element.prototype as Element & {
    hasPointerCapture?: (id: number) => boolean;
    releasePointerCapture?: (id: number) => void;
    setPointerCapture?: (id: number) => void;
  };
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  proto.setPointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;

  window.ResizeObserver ??= class {
    observe(): void { /* noop */ }
    unobserve(): void { /* noop */ }
    disconnect(): void { /* noop */ }
  };
  window.matchMedia ??= (query: string): MediaQueryList => ({
    matches: false, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false,
  });
}
