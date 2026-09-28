import { configureTextBuilder } from 'troika-three-text';

/**
 * Serve 3D text from a bundled font. Without this, troika resolves every glyph
 * through cdn.jsdelivr.net at runtime, and the whole WebXR scene fails to render
 * offline (e.g. in the Electron build) or when the CDN is blocked.
 * Keep 3D strings within Inter's Latin coverage so no CDN fallback is needed.
 * Must run before the first <Text> renders.
 */
if (typeof window !== 'undefined') {
  configureTextBuilder({ defaultFontURL: '/fonts/Inter-Regular.woff' });
}

export {};
