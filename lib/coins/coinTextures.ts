/**
 * lib/coins/coinTextures.ts — engraving, texturing and the baked post-process.
 *
 * Each face is painted as a height field in plain JavaScript (deterministic,
 * no canvas, no fonts, no downloads), then post-processed into PBR maps:
 *
 *   pattern   circuit traces, rose-engine guilloché, grid, sunburst, carbon
 *             twill, dot matrix, swirl or ripples, kept clear of a polished
 *             moat round the emblem
 *   legend    the network and ticker engraved round the field
 *   normal    5×5 Sobel of the height field
 *   occlusion cavity darkening (height vs its blur) + the emblem's soft
 *             contact shadow, lit from above
 *   grade     contrast curve and a radial vignette into the rim
 *   glow      inlaid light lines, bloomed (three blurs added back), for the
 *             emissive channel — bloom that works in WebXR, where screen-
 *             space post-processing does not
 *
 * The painting is split into steps that yield to the frame loop, so a coin's
 * textures never stall a headset frame for long.
 */

import {
    DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType,
} from 'three';
import { COIN_METALS, type CoinSpec, type FieldPattern } from './catalog';
import { BACK_FIELD_R, FIELD_R } from './coinGeometry';
import { bitcoinSignSdf, glyphSdf, advance, hasGlyph, textSdf } from './glyphs';
import { blur, circle, place, Raster, segment, union, type Sdf2 } from './sdf2d';

export interface FaceMaps {
    /** sRGB albedo (enamel colour, or a grey that modulates the metal colour). */
    map: DataTexture;
    /** Tangent-space normal map. */
    normalMap: DataTexture;
    /** R: ambient occlusion, G: roughness (absolute). */
    ormMap: DataTexture;
    /** Bloomed glow (sRGB), when the face has inlaid light. */
    emissiveMap: DataTexture | null;
}

export interface CoinMaps {
    front: FaceMaps;
    back: FaceMaps;
}

export interface TextureOptions {
    /** Front face size in pixels (the reverse is half). */
    size?: number;
    /** Called between steps; return a promise to yield (e.g. to the next frame). */
    yieldStep?: () => Promise<void> | void;
}

// ── random, deterministic ────────────────────────────────────────────────────

function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hashString(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

const fract = (x: number) => x - Math.floor(x);
const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

// ── a coarse distance grid (soft features need no per-pixel SDF) ─────────────

/** Signed distance sampled on an n×n grid over [-extent, extent]², read back bilinearly. */
export class DistanceGrid {
    private readonly g: Float32Array;
    constructor(s: Sdf2, readonly extent: number, readonly n = 144) {
        this.g = new Float32Array(n * n);
        const cell = (2 * extent) / (n - 1);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.g[j * n + i] = s.d(-extent + i * cell, -extent + j * cell);
    }
    d(x: number, y: number): number {
        const n = this.n, f = (n - 1) / (2 * this.extent);
        const u = Math.min(n - 1.001, Math.max(0, (x + this.extent) * f)), v = Math.min(n - 1.001, Math.max(0, (y + this.extent) * f));
        const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * n + i;
        return (this.g[k] * (1 - a) + this.g[k + 1] * a) * (1 - b) + (this.g[k + n] * (1 - a) + this.g[k + n + 1] * a) * b;
    }
}

// ── layers ───────────────────────────────────────────────────────────────────

interface Layers {
    /** Height: 0 field, negative engraved, positive raised (≈ ±1). */
    h: Raster;
    /** Glow lines (0…1). */
    glow: Raster;
    /** Roughness offset over the finish (frosting, grooves). */
    rough: Raster;
}

const GROOVE = (d: number, w: number) => (d < w ? -(1 - (d / w) ** 2) : 0);

/** The engraved/embossed pattern on the field, inside radius `rMax`, fading near the emblem. */
function paintPattern(L: Layers, pattern: FieldPattern, seed: number, rMax: number, moat: DistanceGrid | null): void {
    const px = (2 * L.h.extent) / L.h.size;
    const keep = (x: number, y: number) => {
        const r = Math.hypot(x, y);
        let k = 1 - smooth(rMax - 0.012, rMax, r);
        if (moat) k *= smooth(0.012, 0.045, moat.d(x, y));
        return k;
    };
    const rand = rng(seed);
    switch (pattern) {
        case 'guilloche': {
            const sp = 0.0145, w = Math.max(px * 0.9, 0.0026);
            L.h.paint((h, x, y) => {
                const r = Math.hypot(x, y), th = Math.atan2(y, x);
                const f = (r - 0.011 * Math.sin(12 * th + r * 26)) / sp;
                const d = Math.min(fract(f), 1 - fract(f)) * sp;
                return h + GROOVE(d, w) * 0.8 * keep(x, y);
            });
            // frosted between the lines, with the odd polished grain catching the light (glitter)
            L.rough.paint((v, x, y) => v + keep(x, y) * (rand() < 0.03 ? -0.2 : 0.16));
            break;
        }
        case 'grid': {
            const sp = 0.034, w = Math.max(px, 0.0028);
            L.h.paint((h, x, y) => {
                const u = (x + y) * Math.SQRT1_2 / sp, v = (x - y) * Math.SQRT1_2 / sp;
                const du = Math.min(fract(u), 1 - fract(u)) * sp, dv = Math.min(fract(v), 1 - fract(v)) * sp;
                const major = Math.round(u) % 4 === 0 || Math.round(v) % 4 === 0;
                return h + Math.min(GROOVE(du, w), GROOVE(dv, w)) * (major ? 1 : 0.6) * keep(x, y);
            });
            break;
        }
        case 'sunburst': {
            L.h.paint((h, x, y) => {
                const r = Math.hypot(x, y), th = Math.atan2(y, x);
                const brushed = 0.18 * (0.5 + 0.5 * Math.cos(th * 220)) * smooth(0.04, 0.12, r);
                const k = Math.round((th / (Math.PI * 2)) * 32), dth = th - (k / 32) * Math.PI * 2;
                const ray = GROOVE(Math.abs(Math.sin(dth)) * r, Math.max(px, 0.003)) * smooth(0.12, 0.2, r) * (k % 2 ? 0.6 : 1);
                return h + (ray - brushed) * keep(x, y);
            });
            break;
        }
        case 'carbon': {
            const tw = 0.024;
            L.h.paint((h, x, y) => {
                const u = (x + y) / tw, v = (x - y) / tw;
                const cell = (Math.floor(u) + Math.floor(v * 0.5)) & 1;
                const t = cell ? fract(u) : fract(v);
                return h + (Math.sin(t * Math.PI) * 0.45 - 0.2) * keep(x, y);
            });
            L.rough.paint((v, x, y) => {
                const u = (x + y) / tw, w = (x - y) / tw;
                return v + ((Math.floor(u) + Math.floor(w * 0.5)) & 1 ? 0.12 : -0.05) * keep(x, y);
            });
            break;
        }
        case 'matrix': {
            const sp = 0.03, r0 = 0.0065;
            const lit = rng(seed ^ 0x51);
            for (let gy = -rMax; gy <= rMax; gy += sp * 0.866) {
                const row = Math.round(gy / (sp * 0.866));
                for (let gx = -rMax + (row & 1 ? sp / 2 : 0); gx <= rMax; gx += sp) {
                    const k = keep(gx, gy);
                    if (k < 0.05) continue;
                    const on = lit() < 0.18;
                    L.h.splat(circle(gx, gy, r0), px * 2, (h, d) => Math.max(h, smooth(px, -px, d) * 0.7 * k));
                    if (on) L.glow.splat(circle(gx, gy, r0 * 0.7), px * 2, (g, d) => Math.max(g, smooth(px, -px, d) * 0.9 * k));
                }
            }
            break;
        }
        case 'swirl': {
            const arms = 7, sp = 1;
            L.h.paint((h, x, y) => {
                const r = Math.max(1e-4, Math.hypot(x, y)), th = Math.atan2(y, x);
                const f = (th / (Math.PI * 2)) * arms - Math.log(r) * 3.2;
                const d = Math.min(fract(f / sp), 1 - fract(f / sp)) * r * 1.6;
                return h + GROOVE(d, Math.max(px, 0.004)) * 0.75 * keep(x, y) * smooth(0.06, 0.14, r);
            });
            break;
        }
        case 'ripples': {
            L.h.paint((h, x, y) => {
                const r = Math.hypot(x, y);
                return h + 0.2 * Math.sin(r * 120 - 1.2) * Math.exp(-r * 2.2) * smooth(0.04, 0.12, r) * keep(x, y);
            });
            break;
        }
        case 'circuit': {
            const traces = 54, w = Math.max(px * 0.9, 0.0055);
            for (let t = 0; t < traces; t++) {
                let a = rand() * Math.PI * 2;
                let r = 0.16 + rand() * 0.22;
                let x = Math.cos(a) * r, y = Math.sin(a) * r;
                const steps = 2 + Math.floor(rand() * 3);
                for (let s = 0; s < steps; s++) {
                    // radial run, then a 45° jog
                    const len = 0.04 + rand() * 0.09;
                    const turn = s % 2 === 1 ? (rand() < 0.5 ? -1 : 1) * Math.PI / 4 : 0;
                    const dir = a + turn;
                    const nx = x + Math.cos(dir) * len, ny = y + Math.sin(dir) * len;
                    if (Math.hypot(nx, ny) > rMax - 0.03) break;
                    const k = Math.min(keep(x, y), keep(nx, ny));
                    L.h.splat(segment(x, y, nx, ny, w), px * 2, (h, d) => Math.max(h, smooth(px, -px, d) * 0.65 * k));
                    x = nx; y = ny;
                    if (turn === 0) a = Math.atan2(y, x);
                    r = Math.hypot(x, y);
                }
                // pad: a ring with a drilled centre
                const k = keep(x, y);
                L.h.splat(circle(x, y, w * 2.4), px * 2, (h, d) => Math.max(h, smooth(px, -px, d) * 0.75 * k));
                L.h.splat(circle(x, y, w * 1.1), px * 2, (h, d) => (d < 0 ? Math.min(h, -0.5 * k) : undefined));
            }
            break;
        }
        case 'plain':
            break;
    }
}

/** Text along a circle: `top` reads clockwise over the top, else counter-clockwise under the bottom. */
function arcText(text: string, radius: number, cap: number, top: boolean, weight = 0.11, tracking = 0.34): Sdf2[] {
    const chars = [...text].filter(hasGlyph);
    if (!chars.length) return [];
    const widths = chars.map((ch, i) => advance(ch, weight, i === chars.length - 1 ? 0 : tracking) * cap);
    const total = widths.reduce((a, b) => a + b, 0);
    const span = total / radius; // radians
    const parts: Sdf2[] = [];
    let s = 0;
    chars.forEach((ch, i) => {
        const centre = s + (widths[i] - (i === chars.length - 1 ? 0 : tracking * cap)) / 2;
        s += widths[i];
        if (ch === ' ') return;
        // centred on its own width, cap height centred on the baseline arc
        const g = glyphSdf(ch, weight, -(advance(ch, weight, 0) - weight * 2) / 2, -0.5);
        if (!g) return;
        // angle of this glyph's centre along the arc
        const ang = top ? Math.PI / 2 + span / 2 - centre / radius : -Math.PI / 2 - span / 2 + centre / radius;
        const rot = top ? ang - Math.PI / 2 : ang + Math.PI / 2;
        parts.push(place(g, cap, Math.cos(ang) * radius, Math.sin(ang) * radius, rot));
    });
    return parts;
}

/** Engrave (or raise) shapes; a list is splatted part by part, each over its own small box. */
function engrave(L: Layers, s: Sdf2 | Sdf2[] | null, depth: number, raised = false): void {
    if (!s) return;
    const px = (2 * L.h.extent) / L.h.size;
    for (const part of Array.isArray(s) ? s : [s]) {
        L.h.splat(part, px * 2, (h, d) => {
            const k = smooth(px, -px, d);
            return raised ? Math.max(h, k * depth) : Math.min(h, -k * depth + (1 - k) * h);
        });
    }
}

// ── post-process: height → maps ──────────────────────────────────────────────

interface Finish {
    /** Metal albedo modulation or enamel colour. */
    base: [number, number, number];
    roughness: number;
    enamel: boolean;
}

function finishOf(spec: CoinSpec, back: boolean): Finish {
    const f = back ? spec.trim : spec.field.finish;
    if (f === 'enamel') {
        const n = parseInt((spec.field.enamel ?? '#3a4150').slice(1), 16);
        return { base: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255], roughness: 0.18, enamel: true };
    }
    return { base: [1, 1, 1], roughness: COIN_METALS[f].roughness, enamel: false };
}

type Pixels = ConstructorParameters<typeof DataTexture>[0];

function toTexture(data: Pixels, size: number, srgb: boolean, wrap = false): DataTexture {
    const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    if (wrap) t.wrapS = t.wrapT = RepeatWrapping;
    t.needsUpdate = true;
    return t;
}

/** 5×5 Sobel → tangent-space normals (row 0 = v 0 = bottom). */
export function normalsFromHeight(h: Float32Array, size: number, strength: number) {
    const out = new Uint8Array(size * size * 4);
    const kx = [-1, -2, 0, 2, 1], ks = [1, 4, 6, 4, 1];
    const at = (i: number, j: number) => h[Math.min(size - 1, Math.max(0, j)) * size + Math.min(size - 1, Math.max(0, i))];
    for (let j = 0; j < size; j++) {
        const edgeRow = j < 2 || j >= size - 2;
        for (let i = 0; i < size; i++) {
            let gx = 0, gy = 0;
            if (edgeRow || i < 2 || i >= size - 2) {
                for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
                    const v = at(i + a, j + b);
                    gx += v * kx[a + 2] * ks[b + 2];
                    gy += v * kx[b + 2] * ks[a + 2];
                }
            } else {
                for (let b = -2; b <= 2; b++) {
                    const row = (j + b) * size + i;
                    const sb = ks[b + 2], kb = kx[b + 2];
                    for (let a = -2; a <= 2; a++) {
                        const v = h[row + a];
                        gx += v * kx[a + 2] * sb;
                        gy += v * kb * ks[a + 2];
                    }
                }
            }
            // the 5×5 Sobel answers 128 to a slope of one height unit per pixel
            const nx = (-gx / 128) * strength, ny = (-gy / 128) * strength, nz = 1;
            const L = Math.hypot(nx, ny, nz);
            const k = (j * size + i) * 4;
            out[k] = Math.round((nx / L * 0.5 + 0.5) * 255);
            out[k + 1] = Math.round((ny / L * 0.5 + 0.5) * 255);
            out[k + 2] = Math.round((nz / L * 0.5 + 0.5) * 255);
            out[k + 3] = 255;
        }
    }
    return out;
}

async function bakeFace(L: Layers, finish: Finish, footprint: DistanceGrid | null, hasGlow: boolean, step: () => Promise<void> | void): Promise<FaceMaps> {
    const N = L.h.size, h = L.h.data;
    const px = (2 * L.h.extent) / N;
    // occlusion: cavities (below their surroundings) + the emblem's contact shadow, light from above
    const hb = blur(h, N, Math.max(1, N / 170));
    let shadow: Float32Array | null = null;
    if (footprint) {
        const shifted = new Float32Array(N * N);
        const off = 0.018;
        for (let j = 0; j < N; j++) {
            const y = L.h.toWorld(j) + off;
            for (let i = 0; i < N; i++) shifted[j * N + i] = smooth(px, -px, footprint.d(L.h.toWorld(i), y));
        }
        shadow = blur(shifted, N, Math.max(2, N / 48));
    }
    await step();
    const color = new Uint8Array(N * N * 4), orm = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) {
        const y = L.h.toWorld(j);
        for (let i = 0; i < N; i++) {
            const x = L.h.toWorld(i), k = j * N + i, r = Math.hypot(x, y) / L.h.extent;
            const cavity = Math.max(0, hb[k] - h[k]);
            let ao = 1 - Math.min(0.55, cavity * 0.9) - (h[k] < -0.2 ? 0.12 : 0);
            if (shadow) ao *= 1 - 0.5 * shadow[k];
            ao *= 0.86 + 0.14 * (1 - smooth(0.72, 1, r)); // vignette into the rim
            // albedo: grooves read darker (metal dust in the cut), raised lines brighter, then a gentle S-curve
            let a = 0.9 + 0.1 * Math.max(0, h[k]) - 0.32 * Math.max(0, -h[k]);
            a = a + 0.22 * (a - 0.5) * (1 - Math.abs(2 * a - 1));
            const tint = finish.enamel ? 0.72 + 0.28 * (1 + Math.min(0, h[k])) : 1;
            for (let c = 0; c < 3; c++) color[k * 4 + c] = Math.round(Math.min(1, Math.max(0, finish.base[c] * a * tint)) ** (1 / 2.2) * 255);
            color[k * 4 + 3] = 255;
            const rough = Math.min(1, Math.max(0.03, finish.roughness + L.rough.data[k] + (h[k] < -0.15 ? 0.32 : 0)));
            orm[k * 4] = Math.round(Math.max(0, Math.min(1, ao)) * 255);
            orm[k * 4 + 1] = Math.round(rough * 255);
            orm[k * 4 + 2] = 0;
            orm[k * 4 + 3] = 255;
        }
    }
    await step();
    const normalMap = toTexture(normalsFromHeight(h, N, (N / 512) * 2.4), N, false);
    let emissiveMap: DataTexture | null = null;
    if (hasGlow) {
        await step();
        const g = L.glow.data;
        const b1 = blur(g, N, N / 340), b2 = blur(g, N, N / 90), b3 = blur(g, N, N / 30);
        const e = new Uint8Array(N * N * 4);
        for (let k = 0; k < N * N; k++) {
            const v = Math.min(1, g[k] * 0.9 + b1[k] * 0.9 + b2[k] * 0.7 + b3[k] * 0.5);
            e[k * 4] = e[k * 4 + 1] = e[k * 4 + 2] = Math.round(v ** (1 / 2.2) * 255);
            e[k * 4 + 3] = 255;
        }
        emissiveMap = toTexture(e, N, true);
    }
    return { map: toTexture(color, N, true), normalMap, ormMap: toTexture(orm, N, false), emissiveMap };
}

// ── the two faces ────────────────────────────────────────────────────────────

const noYield = () => undefined;

/** Bake both faces of a coin. `footprint` is the emblem silhouette (coin units). */
export async function bakeCoinMaps(spec: CoinSpec, footprint: Sdf2 | null, o: TextureOptions = {}): Promise<CoinMaps> {
    const size = o.size ?? 512;
    const step = o.yieldStep ?? noYield;
    const seed = hashString(spec.id);

    // obverse
    const F: Layers = { h: new Raster(size, FIELD_R), glow: new Raster(size, FIELD_R), rough: new Raster(size, FIELD_R) };
    const grid = footprint ? new DistanceGrid(footprint, FIELD_R) : null;
    await step();
    paintPattern(F, spec.field.pattern, seed, 0.57, grid);
    await step();
    // legend band: a fine border line, the network over the top, the ticker under the bottom
    engrave(F, union(circleLine(0.585, 0.0028), circleLine(0.668, 0.0024)), 0.6);
    engrave(F, arcText(spec.network.toUpperCase(), 0.627, 0.036, true), 0.85);
    engrave(F, arcText(`· ${spec.symbol} ·`, 0.627, 0.036, false), 0.85);
    if (spec.field.glowRing) {
        // a dashed ring of inlaid light round the emblem
        const ring: Sdf2[] = [];
        for (let i = 0; i < 48; i++) {
            const a0 = (i / 48) * Math.PI * 2, a1 = a0 + (Math.PI * 2 / 48) * 0.62;
            ring.push(segment(Math.cos(a0) * 0.515, Math.sin(a0) * 0.515, Math.cos(a1) * 0.515, Math.sin(a1) * 0.515, 0.006));
        }
        engrave(F, ring, 0.5);
        const px = (2 * FIELD_R) / size;
        for (const seg of ring) F.glow.splat(seg, px * 2, (g, d) => Math.max(g, smooth(px, -px, d)));
    }
    await step();
    const hasGlow = !!spec.field.glowRing || spec.field.pattern === 'matrix';
    const front = await bakeFace(F, finishOf(spec, false), grid, hasGlow, step);
    await step();

    // reverse: guilloché, the ticker raised in the centre, the legend round it
    const bs = Math.max(128, size >> 1);
    const B: Layers = { h: new Raster(bs, BACK_FIELD_R), glow: new Raster(bs, BACK_FIELD_R), rough: new Raster(bs, BACK_FIELD_R) };
    // the ticker raised in the centre (₿ for Bitcoin, drawn taller: it is one glyph)
    const monoSdf = spec.id === 'btc'
        ? place(bitcoinSignSdf(0.1), 0.48)
        : (() => { const t = textSdf(spec.symbol, 0.12, 0.2); return t ? place(t.sdf, Math.min(0.32, 1.0 / t.width)) : null; })();
    paintPattern(B, 'guilloche', seed ^ 0x9e37, 0.74, monoSdf ? new DistanceGrid(monoSdf, BACK_FIELD_R, 112) : null);
    engrave(B, monoSdf, 0.9, true);
    engrave(B, union(circleLine(0.76, 0.004), circleLine(0.865, 0.004)), 0.6);
    engrave(B, arcText(spec.network.toUpperCase(), 0.812, 0.044, true), 0.85);
    engrave(B, arcText('BOLT XR', 0.812, 0.044, false), 0.85);
    await step();
    const back = await bakeFace(B, finishOf(spec, true), null, false, step);
    return { front, back };
}

function circleLine(r: number, w: number): Sdf2 {
    return { d: (x, y) => Math.abs(Math.hypot(x, y) - r) - w, box: [-r - w, -r - w, r + w, r + w] };
}

/** Reeded edge: one groove per texel row repeat; set `repeat.x` to the reed count. */
export function reedingNormalMap(): DataTexture {
    const W = 64, H = 4;
    const h = new Float32Array(W);
    for (let i = 0; i < W; i++) h[i] = Math.pow(0.5 + 0.5 * Math.cos((i / W) * Math.PI * 2), 0.6);
    const out = new Uint8Array(W * H * 4);
    for (let i = 0; i < W; i++) {
        const dh = (h[(i + 1) % W] - h[(i - 1 + W) % W]) * 0.5 * W * 0.12;
        const L = Math.hypot(dh, 1);
        for (let j = 0; j < H; j++) {
            const k = (j * W + i) * 4;
            out[k] = Math.round((-dh / L * 0.5 + 0.5) * 255);
            out[k + 1] = 128;
            out[k + 2] = Math.round((1 / L * 0.5 + 0.5) * 255);
            out[k + 3] = 255;
        }
    }
    const t = new DataTexture(out, W, H, RGBAFormat, UnsignedByteType);
    t.colorSpace = NoColorSpace;
    t.wrapS = t.wrapT = RepeatWrapping;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
}

export function disposeMaps(m: CoinMaps): void {
    for (const f of [m.front, m.back]) {
        f.map.dispose();
        f.normalMap.dispose();
        f.ormMap.dispose();
        f.emissiveMap?.dispose();
    }
}
