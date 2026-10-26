/**
 * lib/gems/catalog.ts — the stones and metals every gem-set object in the wallet is made of
 * (the coins here, and the Iced-Out XR watches in their private module).
 *
 * Pure data: optics per stone (IOR, dispersion, body colour, absorption) and finishes per metal.
 */

export type GemKind = 'diamond' | 'canary' | 'amethyst' | 'ruby' | 'sapphire' | 'emerald' | 'carbonado';

export interface MetalFinish {
    /** Linear-space base colour (metal F0). */
    color: [number, number, number];
    roughness: number;
    /** Brushed (anisotropic) surfaces where true. */
    brushed: boolean;
    /** Dark body + clearcoat (ceramic / obsidian / carbon). */
    clearcoat: number;
    metalness: number;
}

export const METALS: Record<string, MetalFinish> = {
    yellowGold: { color: [1.0, 0.68, 0.27], roughness: 0.14, brushed: false, clearcoat: 0, metalness: 1 },
    whiteGold: { color: [0.86, 0.84, 0.8], roughness: 0.12, brushed: false, clearcoat: 0, metalness: 1 },
    platinum: { color: [0.8, 0.79, 0.77], roughness: 0.1, brushed: false, clearcoat: 0, metalness: 1 },
    roseGold: { color: [0.97, 0.56, 0.44], roughness: 0.14, brushed: false, clearcoat: 0, metalness: 1 },
    titanium: { color: [0.52, 0.5, 0.48], roughness: 0.3, brushed: true, clearcoat: 0, metalness: 1 },
    carbon: { color: [0.025, 0.026, 0.028], roughness: 0.35, brushed: false, clearcoat: 1, metalness: 0.2 },
    obsidian: { color: [0.018, 0.018, 0.02], roughness: 0.2, brushed: false, clearcoat: 1, metalness: 0.6 },
    damascus: { color: [0.95, 0.6, 0.22], roughness: 0.22, brushed: true, clearcoat: 0, metalness: 1 },
    rubber: { color: [0.02, 0.02, 0.022], roughness: 0.75, brushed: false, clearcoat: 0, metalness: 0 },
};


export interface GemOptics {
    ior: number;
    /** Spread of IOR across R→B (dispersion, "fire"). */
    dispersion: number;
    /** sRGB body colour seen through the stone. */
    body: string;
    /** Beer-Lambert absorption per unit path (0 = water-clear). */
    absorb: number;
    /** 0…1: carbonado-style opaque black body that only reflects. */
    opaque: number;
}

export const GEMS: Record<GemKind, GemOptics> = {
    diamond: { ior: 2.418, dispersion: 0.044, body: '#ffffff', absorb: 0, opaque: 0 },
    canary: { ior: 2.418, dispersion: 0.044, body: '#ffd21a', absorb: 1.6, opaque: 0 },
    amethyst: { ior: 1.544, dispersion: 0.013, body: '#9b3df0', absorb: 2.4, opaque: 0 },
    ruby: { ior: 1.762, dispersion: 0.018, body: '#e0102f', absorb: 2.8, opaque: 0 },
    sapphire: { ior: 1.762, dispersion: 0.018, body: '#7cc8ff', absorb: 1.4, opaque: 0 },
    emerald: { ior: 1.577, dispersion: 0.014, body: '#12c36a', absorb: 2.6, opaque: 0 },
    carbonado: { ior: 2.418, dispersion: 0.044, body: '#0b0b0d', absorb: 9, opaque: 0.85 },
};

