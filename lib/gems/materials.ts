/**
 * lib/gems/materials.ts — metals, crystal, lume, enamel, holo and the
 * procedural finishes (perlage, carbon twill, Damascus) the watches wear.
 *
 * Every texture is drawn on a canvas at runtime: no downloads, identical in
 * the headset, the desktop wallet and the headless renderer.
 */

import {
    AdditiveBlending, CanvasTexture, Color, DoubleSide, FrontSide, MeshPhysicalMaterial, MeshStandardMaterial,
    NormalBlending, RepeatWrapping, SRGBColorSpace, ShaderMaterial, Vector3,
    type CubeTexture, type Texture,
} from 'three';
import type { MetalFinish } from './catalog';

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export function makeCanvas(w: number, h: number): AnyCanvas {
    if (typeof document !== 'undefined') return Object.assign(document.createElement('canvas'), { width: w, height: h });
    return new OffscreenCanvas(w, h);
}

function ctx2d(c: AnyCanvas): CanvasRenderingContext2D {
    return c.getContext('2d') as CanvasRenderingContext2D;
}

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

const textures = new Map<string, CanvasTexture>();

function cachedTexture(key: string, size: number, paint: (g: CanvasRenderingContext2D, S: number) => void, srgb = true): CanvasTexture {
    let t = textures.get(key);
    if (!t) {
        const c = makeCanvas(size, size);
        paint(ctx2d(c), size);
        t = new CanvasTexture(c as HTMLCanvasElement);
        t.wrapS = t.wrapT = RepeatWrapping;
        if (srgb) t.colorSpace = SRGBColorSpace;
        t.anisotropy = 8;
        textures.set(key, t);
    }
    return t;
}

/** Perlage: overlapping circular graining, the classic movement-plate finish. */
export function perlageTexture(): CanvasTexture {
    return cachedTexture('perlage', 512, (g, S) => {
        g.fillStyle = '#8a8a8a';
        g.fillRect(0, 0, S, S);
        const step = S / 14, r = step * 0.82;
        for (let row = -1; row <= 15; row++) {
            for (let col = -1; col <= 15; col++) {
                const x = col * step + (row % 2 ? step / 2 : 0), y = row * step * 0.87;
                const grd = g.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.05, x, y, r);
                grd.addColorStop(0, '#f2f2f2');
                grd.addColorStop(0.55, '#b9b9b9');
                grd.addColorStop(1, '#6e6e6e');
                g.fillStyle = grd;
                g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
                g.strokeStyle = 'rgba(255,255,255,0.18)';
                g.lineWidth = 1;
                for (let k = 1; k < 9; k++) { g.beginPath(); g.arc(x, y, (r * k) / 9, 0, Math.PI * 2); g.stroke(); }
            }
        }
    });
}

/** 2×2 twill carbon fibre. */
export function carbonTexture(): CanvasTexture {
    return cachedTexture('carbon', 256, (g, S) => {
        const n = 16, cell = S / n;
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const horiz = ((x + y) >> 1) % 2 === 0;
                const grd = horiz ? g.createLinearGradient(0, y * cell, 0, (y + 1) * cell) : g.createLinearGradient(x * cell, 0, (x + 1) * cell, 0);
                grd.addColorStop(0, '#202022');
                grd.addColorStop(0.5, '#7a7a80');
                grd.addColorStop(1, '#1a1a1c');
                g.fillStyle = grd;
                g.fillRect(x * cell, y * cell, cell, cell);
                g.strokeStyle = 'rgba(0,0,0,0.6)';
                g.strokeRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1);
            }
        }
    });
}

/** Folded Damascus: flowing light/dark laminations. */
export function damascusTexture(seed = 7): CanvasTexture {
    return cachedTexture(`damascus:${seed}`, 512, (g, S) => {
        const img = g.createImageData(S, S);
        const r = rng(seed);
        const ph = [r() * 6, r() * 6, r() * 6];
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2; // tileable
                const w = Math.sin(v * 3 + ph[0] + Math.sin(u * 2 + ph[1]) * 1.6) * 1.4 + Math.sin(u * 1 + v * 2 + ph[2]) * 0.9;
                const band = 0.5 + 0.5 * Math.sin((u * 1 + w) * 9);
                const k = Math.pow(band, 1.6);
                const i = (y * S + x) * 4;
                img.data[i] = 70 + k * 185;
                img.data[i + 1] = 60 + k * 175;
                img.data[i + 2] = 55 + k * 160;
                img.data[i + 3] = 255;
            }
        }
        g.putImageData(img, 0, 0);
    });
}

/** Radial brushing directions (anisotropy map) for a sunburst dial. */
export function sunburstAnisotropyTexture(): CanvasTexture {
    return cachedTexture('sunburst-aniso', 256, (g, S) => {
        const img = g.createImageData(S, S);
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const dx = x + 0.5 - S / 2, dy = S / 2 - (y + 0.5);
                const l = Math.hypot(dx, dy) || 1;
                const i = (y * S + x) * 4;
                // brushing runs radially: the highlight is a line through the centre
                img.data[i] = Math.round((0.5 + 0.5 * (dx / l)) * 255);
                img.data[i + 1] = Math.round((0.5 + 0.5 * (dy / l)) * 255);
                img.data[i + 2] = 255;
                img.data[i + 3] = 255;
            }
        }
        g.putImageData(img, 0, 0);
    }, false);
}

export interface MetalOptions {
    name: string;
    pattern?: 'carbon' | 'damascus' | 'perlage' | null;
    /** Size of one pattern tile, metres (UVs from the extrusions are in metres). */
    tile?: number;
    tint?: number;
    side?: typeof FrontSide | typeof DoubleSide;
}

export function metalMaterial(f: MetalFinish, env: Texture, o: MetalOptions): MeshPhysicalMaterial {
    const m = new MeshPhysicalMaterial({
        name: `Watch · ${o.name}`,
        color: new Color(f.color[0], f.color[1], f.color[2]).multiplyScalar(o.tint ?? 1),
        metalness: f.metalness,
        roughness: f.roughness,
        envMap: env,
        envMapIntensity: 1,
        clearcoat: f.clearcoat,
        clearcoatRoughness: 0.03,
        side: o.side ?? FrontSide,
    });
    if (f.brushed) {
        m.anisotropy = 0.55;
        m.anisotropyRotation = Math.PI / 2;
    }
    if (o.pattern) {
        const base = o.pattern === 'carbon' ? carbonTexture() : o.pattern === 'damascus' ? damascusTexture() : perlageTexture();
        const t = base.clone();
        const k = 1 / (o.tile ?? 0.008);
        t.repeat.set(k, k);
        t.needsUpdate = true;
        m.map = t;
        if (o.pattern === 'carbon') {
            m.color.setRGB(0.32, 0.32, 0.35);
            m.metalness = 0.35;
            m.roughness = 0.38;
            m.clearcoat = 1;
        }
    }
    return m;
}

// ── sapphire crystal ────────────────────────────────────────────────────────

const CRYSTAL_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vP = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CRYSTAL_FRAG = /* glsl */ `
uniform samplerCube uEnv;
uniform float uEnvIntensity;
uniform vec3 uCoat;
varying vec3 vN;
varying vec3 vP;
void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vP);
    float c = clamp(dot(N, V), 0.0, 1.0);
    // anti-reflective coated sapphire: ~1% head-on (with the coating's blue cast), mirror at grazing
    float F = 0.01 + 0.99 * pow(1.0 - c, 5.0);
    vec3 env = textureCube(uEnv, reflect(-V, N)).rgb * uEnvIntensity;
    vec3 col = env * mix(uCoat, vec3(1.0), smoothstep(0.0, 0.4, F));
    gl_FragColor = vec4(col, clamp(F, 0.0, 0.92));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export function crystalMaterial(env: CubeTexture | null): ShaderMaterial {
    return new ShaderMaterial({
        name: 'Watch · Sapphire crystal',
        vertexShader: CRYSTAL_VERT,
        fragmentShader: CRYSTAL_FRAG,
        uniforms: { uEnv: { value: env }, uEnvIntensity: { value: 0.6 }, uCoat: { value: new Vector3(0.55, 0.7, 1.0) } },
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
    });
}

// ── lume, enamel, holo, glow ────────────────────────────────────────────────

export function lumeMaterial(hex: string): MeshStandardMaterial {
    return new MeshStandardMaterial({ name: 'Watch · Lume', color: '#e8efe6', emissive: new Color(hex), emissiveIntensity: 1.6, roughness: 0.55, metalness: 0 });
}

export function enamelMaterial(hex: string, env: Texture): MeshPhysicalMaterial {
    return new MeshPhysicalMaterial({
        name: 'Watch · Grand feu enamel', color: new Color(hex), roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
        emissive: new Color(hex), emissiveIntensity: 0.45, envMap: env, envMapIntensity: 1.1,
    });
}

export function holoMaterial(env: Texture): MeshPhysicalMaterial {
    return new MeshPhysicalMaterial({
        name: 'Watch · Holographic platinum', color: new Color(0.86, 0.87, 0.92), metalness: 1, roughness: 0.1,
        iridescence: 1, iridescenceIOR: 1.85, iridescenceThicknessRange: [180, 820], envMap: env, envMapIntensity: 1.35,
    });
}

export function glowCoreMaterial(hex: string, env: Texture): MeshPhysicalMaterial {
    return new MeshPhysicalMaterial({
        name: 'Watch · Glowing core', color: new Color(hex).multiplyScalar(0.6), emissive: new Color(hex), emissiveIntensity: 0.8, roughness: 0.12,
        metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMap: env,
    });
}

const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vP = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uStrength;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
void main() {
    vec3 V = normalize(cameraPosition - vP);
    float edge = pow(1.0 - abs(dot(normalize(vN), V)), 1.5);
    float scan = 0.65 + 0.35 * sin(vUv.y * 40.0 - uTime * 6.0);
    float fade = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
    float flick = 0.85 + 0.15 * sin(uTime * 23.0) * sin(uTime * 7.3);
    float a = (0.25 + edge) * scan * fade * flick * uStrength;
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

/** Additive holographic projection beam (cones, light curtains). */
export function beamMaterial(hex: string, strength = 0.6): ShaderMaterial {
    const c = new Color(hex);
    return new ShaderMaterial({
        name: 'Watch · Holo beam',
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        uniforms: { uColor: { value: new Vector3(c.r, c.g, c.b) }, uTime: { value: 0 }, uStrength: { value: strength } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
    });
}

/** Dispose cached canvas textures (call when the last watch is gone). */
export function disposeWatchTextures(): void {
    for (const t of textures.values()) t.dispose();
    textures.clear();
}

/**
 * A band of gilded glyphs for the holographic rune rings: procedural
 * stave-and-branch marks (no font, no real script), glowing on transparent.
 */
export function runeBandTexture(seed: number, glyphs = 44): CanvasTexture {
    return cachedTexture(`runes:${seed}:${glyphs}`, 2048, (g, S) => {
        g.clearRect(0, 0, S, S);
        const h = S / 16; // the band is 2048 × 128 inside a square canvas; UVs map v to the top 1/16
        const r = rng(seed);
        g.strokeStyle = 'rgba(255,214,120,1)';
        g.shadowColor = 'rgba(255,190,80,0.9)';
        g.shadowBlur = 10;
        g.lineCap = 'round';
        g.lineWidth = 5;
        for (const y of [h * 0.08, h * 0.92]) {
            g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
        }
        g.lineWidth = 6;
        const step = S / glyphs;
        for (let i = 0; i < glyphs; i++) {
            const x = (i + 0.5) * step, top = h * 0.24, bot = h * 0.76, mid = (top + bot) / 2, w = step * 0.26;
            g.beginPath();
            g.moveTo(x, top); g.lineTo(x, bot);
            const kind = Math.floor(r() * 6);
            const up = r() < 0.5 ? -1 : 1;
            if (kind === 0) { g.moveTo(x, top); g.lineTo(x + w, mid); g.lineTo(x, bot); }
            else if (kind === 1) { g.moveTo(x, mid); g.lineTo(x + w * up, top); g.moveTo(x, mid); g.lineTo(x + w * up, bot); }
            else if (kind === 2) { g.moveTo(x - w, top); g.lineTo(x + w, bot); }
            else if (kind === 3) { g.moveTo(x, top + (bot - top) * 0.2); g.lineTo(x + w, top); g.moveTo(x, top + (bot - top) * 0.5); g.lineTo(x + w, top + (bot - top) * 0.3); }
            else if (kind === 4) { g.moveTo(x, top); g.lineTo(x + w, top + (bot - top) * 0.3); g.lineTo(x, mid); g.lineTo(x + w, bot); }
            else { g.moveTo(x - w * 0.8, mid); g.lineTo(x + w * 0.8, mid); }
            g.stroke();
            if (r() < 0.35) { g.beginPath(); g.arc(x + step * 0.45, mid, 3, 0, Math.PI * 2); g.fillStyle = 'rgba(255,230,160,1)'; g.fill(); }
        }
    });
}
