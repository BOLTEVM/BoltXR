/**
 * lib/coins/coinFx.ts — the coin's light: holographic halo, bloom, streak, burst.
 *
 * WebXR renders straight into the headset's framebuffer, so screen-space
 * post-processing (bloom passes, lens flares) is not available there. The
 * coins carry their post-processing in their own materials instead, so it
 * looks the same on the desktop and in the headset:
 *
 *   halo   — the holographic telemetry ring floating over the coin, one shader
 *            with a style per network (data ticks, hash blocks, crimson
 *            shards, ZK dot matrix, hex segments, particle stream, lightning)
 *   bloom  — a soft additive glow billboard behind the coin
 *   streak — an anamorphic flare across the coin while it is pointed at
 *   burst  — sparks thrown off the rim when it mints in or its balance rises
 *
 * All additive, depth-tested, no depth writes.
 */

import {
    AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Points, ShaderMaterial, Vector2, Vector3,
} from 'three';
import type { HaloStyle } from './catalog';

const STYLE_ID: Record<HaloStyle, number> = { plain: 0, data: 1, hash: 2, shard: 3, matrix: 4, hex: 5, stream: 6, lightning: 7, orbit: 0 };

const NOISE = /* glsl */ `
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const HALO_VERT = /* glsl */ `
varying vec2 vP;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
    vP = position.xy;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const HALO_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uStyle;
uniform float uStale;
uniform float uSeed;
uniform float uR0;
uniform float uR1;
varying vec2 vP;
varying vec3 vWorld;
varying vec3 vNormalW;
${NOISE}
const float TAU = 6.2831853;
void main() {
    float r = length(vP);
    float rr = (r - uR0) / (uR1 - uR0);               // 0 inner edge … 1 outer edge
    float th = atan(vP.y, vP.x);
    float u = th / TAU + 0.5;                          // 0…1 round the ring
    float t = uTime;
    float band = smoothstep(0.0, 0.08, rr) * smoothstep(1.0, 0.92, rr);
    float core = exp(-pow((rr - 0.5) / 0.07, 2.0));
    float soft = exp(-pow((rr - 0.5) / 0.32, 2.0));
    float a = core * 0.55 + soft * 0.18;
    int style = int(uStyle + 0.5);
    if (style == 1) {
        // data: ticks round the rim, a scrolling run of dashes, a live bar trace inside
        float seg = floor(u * 96.0 + t * 2.5);
        float dash = step(0.35, h11(seg + uSeed)) * step(0.15, fract(u * 96.0 + t * 2.5));
        float tick = step(0.9, fract(u * 192.0)) * smoothstep(0.78, 0.9, rr);
        float bars = step(rr, 0.12 + 0.3 * h11(floor(u * 160.0) + floor(t * 3.0) * 7.0 + uSeed)) * step(0.06, rr);
        a += dash * exp(-pow((rr - 0.55) / 0.06, 2.0)) * 1.2 + tick * 0.8 + bars * 0.35;
    } else if (style == 2) {
        // hash: rows of tiny lit blocks, like an engraved hash scrolling past
        float cx = floor(u * 180.0 - t * 4.0), cy = floor(rr * 6.0);
        float bit = step(0.55, h21(vec2(cx, cy) + uSeed));
        float inCell = step(0.18, fract(u * 180.0 - t * 4.0)) * step(0.2, fract(rr * 6.0));
        a += bit * inCell * step(0.2, rr) * step(rr, 0.85) * 0.75;
    } else if (style == 3) {
        // shards: segments with gaps, each flickering on its own
        float s = floor(u * 28.0);
        float gap = smoothstep(0.0, 0.06, fract(u * 28.0)) * smoothstep(1.0, 0.94, fract(u * 28.0));
        float fl = 0.55 + 0.45 * sin(t * (4.0 + 6.0 * h11(s + uSeed)) + s);
        a = (core * 0.9 + soft * 0.25) * gap * fl;
    } else if (style == 4) {
        // ZK dot matrix: a grid of cells blinking on and off
        vec2 cell = vec2(floor(u * 120.0), floor(rr * 5.0));
        vec2 f = vec2(fract(u * 120.0), fract(rr * 5.0)) - 0.5;
        float on = step(0.62, h21(cell + floor(t * 2.0 + h21(cell) * 4.0)));
        a = soft * 0.2 + on * smoothstep(0.32, 0.1, length(f)) * 1.1;
    } else if (style == 5) {
        // hex: six segments, bright vertices, a highlight sweeping round
        float k = fract(u * 6.0);
        float vtx = exp(-pow(min(k, 1.0 - k) / 0.04, 2.0));
        float sweep = exp(-pow(fract(u - t * 0.15) - 0.5, 2.0) * 60.0);
        a = core * (0.6 + 1.2 * sweep) + vtx * core * 1.4 + soft * 0.15;
    } else if (style == 6) {
        // stream: sparks flowing round the ring at different speeds and radii
        float lane = floor(rr * 7.0);
        float sp = 0.06 + 0.12 * h11(lane + uSeed);
        float x = fract(u * 14.0 - t * sp * 14.0 + h11(lane * 3.1));
        float spark = exp(-x * 9.0) * step(0.3, h11(floor(u * 14.0 - t * sp * 14.0) + lane * 17.0));
        a = soft * 0.2 + spark * smoothstep(0.5, 0.0, abs(fract(rr * 7.0) - 0.5)) * 1.3;
    } else if (style == 7) {
        // lightning: two arcs jumping along noisy paths round the ring, flickering
        float a2 = 0.0;
        for (int i = 0; i < 2; i++) {
            float fi = float(i);
            float n = vnoise(vec2(u * 18.0, t * 7.0 + fi * 13.0)) * 0.7 + vnoise(vec2(u * 55.0, t * 11.0 + fi * 5.0)) * 0.3;
            float path = 0.5 + (n - 0.5) * 0.9;
            float flick = step(0.25, h11(floor(t * 14.0) + fi * 9.0 + uSeed));
            a2 += exp(-abs(rr - path) / 0.025) * flick;
        }
        a = soft * 0.18 + a2 * 1.1;
    }
    // stale (network not answering): cooler, flickering, tinted red
    float fl = 1.0 - uStale * 0.35 * step(0.5, h11(floor(t * 9.0)));
    vec3 col = mix(uColor, vec3(1.0, 0.18, 0.15), uStale * 0.8);
    // fade the ring where it is seen edge-on, keep it glowing face-on
    float facing = 0.45 + 0.55 * abs(dot(normalize(cameraPosition - vWorld), normalize(vNormalW)));
    gl_FragColor = vec4(col * a * band * uIntensity * fl * facing, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export interface HaloUniforms {
    uTime: { value: number };
    uColor: { value: Color };
    uIntensity: { value: number };
    uStyle: { value: number };
    uStale: { value: number };
    uSeed: { value: number };
    uR0: { value: number };
    uR1: { value: number };
}

/** Halo ring material; use with a RingGeometry(r0, r1). */
export function haloMaterial(style: HaloStyle, color: string, r0: number, r1: number, seed = 0): ShaderMaterial & { uniforms: HaloUniforms } {
    return new ShaderMaterial({
        name: `Coin · halo ${style}`,
        vertexShader: HALO_VERT,
        fragmentShader: HALO_FRAG,
        uniforms: {
            uTime: { value: 0 }, uColor: { value: new Color(color) }, uIntensity: { value: 1 }, uStyle: { value: STYLE_ID[style] },
            uStale: { value: 0 }, uSeed: { value: seed }, uR0: { value: r0 }, uR1: { value: r1 },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
    }) as ShaderMaterial & { uniforms: HaloUniforms };
}

// ── billboards: bloom and streak ─────────────────────────────────────────────

const BILLBOARD_VERT = /* glsl */ `
uniform float uSize;
uniform float uDepth;
uniform vec2 uStretch;
varying vec2 vUv;
void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // object scale, so the glow follows the coin's size
    float s = length(vec3(modelMatrix[0].xyz));
    mv.xy += (uv - 0.5) * uSize * s * uStretch;
    mv.z += uDepth * s;
    gl_Position = projectionMatrix * mv;
}
`;

const BLOOM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uShape;
varying vec2 vUv;
void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float a;
    if (uShape < 0.5) {
        float r2 = dot(p, p);
        a = exp(-r2 * 5.5) * 0.65 + exp(-r2 * 16.0) * 0.35;
    } else {
        // anamorphic streak: a thin horizontal line with a bright core
        a = exp(-pow(p.y * 26.0, 2.0)) * exp(-abs(p.x) * 2.6) + exp(-dot(p, p) * 40.0) * 0.6;
    }
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export interface GlowUniforms {
    uColor: { value: Color };
    uIntensity: { value: number };
    uSize: { value: number };
    uDepth: { value: number };
    uStretch: { value: Vector2 };
    uShape: { value: number };
}

/**
 * Camera-facing glow. `shape` 'bloom' sits behind the coin (`depth` < 0) and
 * shows round its silhouette; 'streak' sits in front.
 */
export function glowMaterial(shape: 'bloom' | 'streak', color: string, size: number, depth: number): ShaderMaterial & { uniforms: GlowUniforms } {
    return new ShaderMaterial({
        name: `Coin · ${shape}`,
        vertexShader: BILLBOARD_VERT,
        fragmentShader: BLOOM_FRAG,
        uniforms: {
            uColor: { value: new Color(color) }, uIntensity: { value: 0 }, uSize: { value: size }, uDepth: { value: depth },
            uStretch: { value: shape === 'streak' ? new Vector2(1.7, 0.42) : new Vector2(1, 1) }, uShape: { value: shape === 'streak' ? 1 : 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
    }) as ShaderMaterial & { uniforms: GlowUniforms };
}

// ── burst ────────────────────────────────────────────────────────────────────

const BURST_VERT = /* glsl */ `
attribute vec3 aDir;
attribute float aSeed;
uniform float uT;
uniform float uScale;
uniform float uPixel;
varying float vA;
varying float vSeed;
void main() {
    float t = uT;
    float speed = 0.9 + aSeed * 1.4;
    vec3 p = aDir * (1.02 + speed * t) + vec3(0.0, -1.2 * t * t, 0.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vA = clamp(1.0 - t / (0.7 + aSeed * 0.6), 0.0, 1.0) * step(0.0, t);
    vSeed = aSeed;
    float size = (0.05 + 0.07 * aSeed) * uScale * vA;
    gl_PointSize = max(0.0, size * uPixel / max(0.05, -mv.z));
    gl_Position = projectionMatrix * mv;
}
`;

const BURST_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
varying float vSeed;
void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    vec2 q = abs(p);
    float star = exp(-q.x * 18.0) * exp(-q.y * 2.0) + exp(-q.y * 18.0) * exp(-q.x * 2.0) + exp(-dot(p, p) * 10.0);
    if (star * vA < 0.01) discard;
    vec3 c = mix(uColor, vec3(1.0), 0.5 + 0.5 * vSeed);
    gl_FragColor = vec4(c * star * vA * 1.4, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export interface BurstUniforms {
    uT: { value: number };
    uColor: { value: Color };
    uScale: { value: number };
    uPixel: { value: number };
}

/** Sparks thrown from the rim (unit coin): set `uT` to seconds since the burst (< 0 = off). */
export function burstPoints(color: string, count = 56, seed = 1): Points & { material: ShaderMaterial & { uniforms: BurstUniforms } } {
    const dir: number[] = [], sd: number[] = [], pos: number[] = [];
    let a = seed >>> 0;
    const rand = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < count; i++) {
        const th = (i / count) * Math.PI * 2 + rand() * 0.2;
        const v = new Vector3(Math.cos(th), Math.sin(th), (rand() - 0.5) * 0.8).normalize();
        dir.push(v.x, v.y, v.z);
        sd.push(rand());
        pos.push(0, 0, 0);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('aDir', new Float32BufferAttribute(dir, 3));
    g.setAttribute('aSeed', new Float32BufferAttribute(sd, 1));
    const m = new ShaderMaterial({
        name: 'Coin · burst',
        vertexShader: BURST_VERT,
        fragmentShader: BURST_FRAG,
        uniforms: { uT: { value: -1 }, uColor: { value: new Color(color) }, uScale: { value: 1 }, uPixel: { value: 800 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
    }) as ShaderMaterial & { uniforms: BurstUniforms };
    const p = new Points(g, m) as Points & { material: ShaderMaterial & { uniforms: BurstUniforms } };
    p.frustumCulled = false;
    p.name = 'Coin · burst';
    return p;
}
