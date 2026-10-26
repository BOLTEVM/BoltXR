/**
 * lib/gems/gemMaterial.ts — stones that sparkle, throw fire and dance.
 *
 * GEMS (instanced, one draw per cut × stone):
 *   · reflection off the facet (Schlick fresnel at the stone's IOR);
 *   · BRILLIANCE: the view ray refracts in, bounces off the pavilion
 *     twice and leaves through the crown — traced per colour channel at
 *     its own IOR, so white light splits into FIRE;
 *   · SCINTILLATION: every facet has its own tilt that drifts slowly, so
 *     flashes of the studio's lights travel across the stone as it moves
 *     (and even while it doesn't — the stones are alive);
 *   · body colour by Beer-Lambert absorption along the path (rubies get
 *     redder where light travels further), carbonado goes opaque black and
 *     lives on surface reflections.
 *
 * GLINTS (one instanced draw): a four-point star flare over each stone,
 * lit by the same analytic sparkle, culled to nothing when dark.
 *
 * DANCE: all stones share `GemUniforms`. `danceW` weights four patterns —
 * idle twinkle, a chase wave travelling round each setting (`aOrder`), a
 * heartbeat on every second, and a full celebration burst.
 */

import {
    AdditiveBlending, Color, FrontSide, ShaderMaterial, Vector3, Vector4,
    type CubeTexture, type IUniform,
} from 'three';
import type { GemOptics } from './catalog';

export interface GemUniforms {
    uTime: IUniform<number>;
    uDanceW: IUniform<Vector4>;
    uKeyDir: IUniform<Vector3[]>;
    uKeyCol: IUniform<Color[]>;
    uEnv: IUniform<CubeTexture | null>;
    uEnvIntensity: IUniform<number>;
    uSparkle: IUniform<number>;
    uGlint: IUniform<number>;
}

/** One shared uniform set per watch (or per scene). */
export function createGemUniforms(env: CubeTexture | null, keyDirs: Vector3[], keyColors: Color[]): GemUniforms {
    const dirs = [0, 1, 2].map(i => (keyDirs[i] ?? new Vector3(0, 1, 0)).clone().normalize());
    const cols = [0, 1, 2].map(i => (keyColors[i] ?? new Color(1, 1, 1)).clone());
    return {
        uTime: { value: 0 },
        uDanceW: { value: new Vector4(1, 0, 0, 0) },
        uKeyDir: { value: dirs },
        uKeyCol: { value: cols },
        uEnv: { value: env },
        uEnvIntensity: { value: 1 },
        uSparkle: { value: 1 },
        uGlint: { value: 1 },
    };
}

const HASH = /* glsl */ `
float gHash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 gHash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}
vec3 gRainbow(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
`;

/** Shared dance envelope: idle twinkle · chase wave · heartbeat · celebration. */
const DANCE = /* glsl */ `
float gDance(float seed, float order, float facet, float t, vec4 w) {
    float idle = 0.5 + 0.5 * sin(t * 2.3 + seed * 31.0 + facet * 7.0);
    float d = fract(order - t * 0.28) - 0.5;
    float chase = exp(-d * d * 140.0);
    float pulse = exp(-fract(t) * 5.0);
    float cele = 0.5 + 0.5 * sin(t * 11.0 + order * 47.0 + seed * 9.0);
    return w.x * (0.35 + idle) + w.y * (0.25 + chase * 3.5) + w.z * (0.4 + pulse * 2.4) + w.w * (0.6 + cele * 3.6);
}
`;

const GEM_VERT = /* glsl */ `
attribute float aSeed;
attribute float aOrder;
varying vec3 vWorldPos;
varying vec3 vWorldN;
// flat: per-facet / per-stone constants must arrive bit-exact, or the hashes that
// key each facet's tilt amplify interpolation noise into per-pixel speckle
flat varying vec3 vLocalN;
flat varying vec3 vAxis;
flat varying float vSeed;
flat varying float vOrder;
void main() {
    mat4 im = mat4(1.0);
    #ifdef USE_INSTANCING
        im = instanceMatrix;
    #endif
    vec4 wp = modelMatrix * im * vec4(position, 1.0);
    mat3 m3 = mat3(modelMatrix) * mat3(im);
    vWorldN = normalize(m3 * normal);
    vAxis = normalize(m3 * vec3(0.0, 1.0, 0.0));
    vLocalN = normal;
    vSeed = aSeed;
    vOrder = aOrder;
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const GEM_FRAG = /* glsl */ `
uniform samplerCube uEnv;
uniform float uEnvIntensity;
uniform float uIOR;
uniform float uDisp;
uniform vec3 uBody;
uniform float uAbsorb;
uniform float uOpaque;
uniform float uTime;
uniform vec4 uDanceW;
uniform float uSparkle;
uniform vec3 uKeyDir[3];
uniform vec3 uKeyCol[3];
uniform float uDebug;
varying vec3 vWorldPos;
varying vec3 vWorldN;
// flat: per-facet / per-stone constants must arrive bit-exact, or the hashes that
// key each facet's tilt amplify interpolation noise into per-pixel speckle
flat varying vec3 vLocalN;
flat varying vec3 vAxis;
flat varying float vSeed;
flat varying float vOrder;
${HASH}
${DANCE}
vec3 envS(vec3 d) { return textureCube(uEnv, d).rgb * uEnvIntensity; }
// light leaving the stone after two pavilion bounces, for one IOR
vec3 brilliance(vec3 V, vec3 N, vec3 A, vec3 P1, vec3 P2, float ior) {
    vec3 d1 = refract(-V, N, 1.0 / ior);
    if (dot(d1, d1) < 1e-4) d1 = reflect(-V, N);
    vec3 d2 = reflect(d1, P1);
    vec3 d3 = reflect(d2, P2);
    // leave through the crown: bend toward the table normal
    return normalize(mix(d3, A, 0.22));
}
void main() {
    vec3 N = normalize(vWorldN);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 A = normalize(vAxis);
    float t = uTime;
    // facet id from the (flat) facet normal; the offset keeps exact axes (0, ±1) off a floor() boundary
    float facet = gHash13(floor(vLocalN * 61.0 + 0.371) + vSeed * 13.7);
    vec3 jit = gHash33(vec3(facet * 91.0, vSeed * 57.0, 3.1)) - 0.5;
    float wobAmp = 0.06 + 0.12 * uDanceW.w;
    vec3 wob = vec3(sin(t * 1.7 + facet * 40.0), sin(t * 1.3 + vSeed * 60.0), cos(t * 1.1 + facet * 23.0)) * wobAmp;
    // pavilion mirrors: point down the stone's axis, tilted per facet
    vec3 P1 = normalize(-A + jit * 0.9 + wob);
    vec3 P2 = normalize(-A + jit.zxy * 1.1 - wob.yzx);

    float cosV = clamp(dot(N, V), 0.0, 1.0);
    float F0 = pow((uIOR - 1.0) / (uIOR + 1.0), 2.0);
    float F = F0 + (1.0 - F0) * pow(1.0 - cosV, 5.0);
    vec3 refl = envS(reflect(-V, N));

    // brilliance + fire: one trace per channel at its own IOR
    vec3 inner;
    inner.r = envS(brilliance(V, N, A, P1, P2, uIOR - uDisp * 0.5)).r;
    inner.g = envS(brilliance(V, N, A, P1, P2, uIOR)).g;
    inner.b = envS(brilliance(V, N, A, P1, P2, uIOR + uDisp * 0.5)).b;
    // longer paths through coloured stones darken and saturate them
    float path = 0.8 + 0.9 * (1.0 - cosV) + facet * 0.5;
    vec3 trans = pow(max(uBody, vec3(0.001)), vec3(uAbsorb * path * 0.35 + 0.0001));
    inner *= trans * (1.0 - F);
    inner = mix(inner, uBody * 0.04, uOpaque);

    // scintillation: the studio keys flashing off tilted facets
    float dance = gDance(vSeed, vOrder, facet, t, uDanceW);
    vec3 Np = normalize(N + jit * 0.32 + wob * 1.8);
    vec3 sp = vec3(0.0);
    for (int k = 0; k < 3; k++) {
        vec3 Rr = reflect(-V, normalize(Np + vec3(0.012, 0.0, 0.0)));
        vec3 Rb = reflect(-V, normalize(Np - vec3(0.012, 0.0, 0.0)));
        vec3 Rg = reflect(-V, Np);
        // three slightly different normals per channel: coloured flashes ("fire")
        sp += uKeyCol[k] * vec3(
            pow(max(dot(Rr, uKeyDir[k]), 0.0), 420.0),
            pow(max(dot(Rg, uKeyDir[k]), 0.0), 420.0),
            pow(max(dot(Rb, uKeyDir[k]), 0.0), 420.0));
    }
    sp *= mix(vec3(1.0), uBody, uAbsorb > 0.0 ? 0.5 : 0.0);
    vec3 celeTint = mix(vec3(1.0), gRainbow(vOrder + t * 0.25), 0.6 * uDanceW.w);

    vec3 col = refl * F * (1.0 + uOpaque * 1.5) + inner * (0.85 + 0.25 * dance) + sp * uSparkle * dance * 6.0 * celeTint;
    if (uDebug > 0.5) col = uDebug < 1.5 ? refl * F : uDebug < 2.5 ? inner : uDebug < 3.5 ? sp * dance * 6.0 : uDebug < 4.5 ? vec3(facet) : (brilliance(V, N, A, P1, P2, uIOR) * 0.5 + 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

/** A gem material sharing the watch's dance/time/env uniforms. */
export function createGemMaterial(optics: GemOptics, shared: GemUniforms, name = 'Watch · Gem'): ShaderMaterial {
    const body = new Color(optics.body); // sRGB hex → linear working space
    const mat = new ShaderMaterial({
        name,
        vertexShader: GEM_VERT,
        fragmentShader: GEM_FRAG,
        uniforms: {
            ...shared,
            uIOR: { value: optics.ior },
            uDisp: { value: optics.dispersion * 6 }, // exaggerated a touch: fire must read at wrist scale
            uBody: { value: new Vector3(body.r, body.g, body.b) },
            uAbsorb: { value: optics.absorb },
            uOpaque: { value: optics.opaque },
            uDebug: { value: 0 },
        },
        side: FrontSide,
    });
    return mat;
}

const GLINT_VERT = /* glsl */ `
attribute float aSeed;
attribute float aOrder;
uniform float uTime;
uniform vec4 uDanceW;
uniform vec3 uKeyDir[3];
uniform vec3 uKeyCol[3];
uniform float uGlint;
uniform float uGlintSize;
varying vec2 vUv;
varying vec3 vCol;
${HASH}
${DANCE}
void main() {
    mat4 im = mat4(1.0);
    #ifdef USE_INSTANCING
        im = instanceMatrix;
    #endif
    vec3 center = (modelMatrix * im * vec4(0.0, 0.2, 0.0, 1.0)).xyz;
    mat3 m3 = mat3(modelMatrix) * mat3(im);
    vec3 axis = normalize(m3 * vec3(0.0, 1.0, 0.0));
    float size = length(m3 * vec3(1.0, 0.0, 0.0));
    vec3 V = normalize(cameraPosition - center);
    // the facet that happens to face a light right now: random, drifting
    vec3 j = gHash33(vec3(aSeed * 113.0, aOrder * 71.0, 1.7)) - 0.5;
    float t = uTime;
    vec3 drift = vec3(sin(t * 0.9 + aSeed * 40.0), cos(t * 0.7 + aSeed * 23.0), sin(t * 1.1 + aOrder * 30.0)) * 0.22;
    vec3 n = normalize(axis + (j + drift) * 0.75);
    vec3 R = reflect(-V, n);
    vec3 c = vec3(0.0);
    for (int k = 0; k < 3; k++) c += uKeyCol[k] * pow(max(dot(R, uKeyDir[k]), 0.0), 110.0);
    float dance = gDance(aSeed, aOrder, 0.5, t, uDanceW);
    float facing = smoothstep(0.0, 0.25, dot(axis, V));
    float I = dot(c, vec3(0.333)) * dance * facing * uGlint;
    vCol = c / max(dot(c, vec3(0.333)), 1e-4) * I;
    vCol *= mix(vec3(1.0), gRainbow(aSeed + t * 0.15), 0.25 + 0.5 * uDanceW.w);
    vUv = uv;
    vec4 mv = viewMatrix * vec4(center, 1.0);
    if (I < 0.015) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // cull: no fragments for dark stones
        return;
    }
    float rot = aSeed * 6.2831 + t * 0.15;
    vec2 p = (uv - 0.5) * 2.0;
    p = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * p;
    mv.xy += p * size * uGlintSize * (0.7 + min(I, 3.0) * 0.9);
    mv.z += size * 0.6; // sit just in front of the stone
    gl_Position = projectionMatrix * mv;
}
`;

const GLINT_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    vec2 q = abs(p);
    float star = exp(-q.x * 34.0) * exp(-q.y * 2.6) + exp(-q.y * 34.0) * exp(-q.x * 2.6);
    vec2 d = vec2(q.x + q.y, abs(q.x - q.y)) * 0.7071;
    star += 0.35 * (exp(-d.y * 30.0) * exp(-d.x * 4.5));
    float core = exp(-dot(p, p) * 28.0) * 1.6;
    float a = (star + core) * smoothstep(1.0, 0.6, length(p));
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol * a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

/** Star-flare glints for every stone (instanced quads). */
export function createGlintMaterial(shared: GemUniforms, size = 2.4): ShaderMaterial {
    return new ShaderMaterial({
        name: 'Watch · Gem glints',
        vertexShader: GLINT_VERT,
        fragmentShader: GLINT_FRAG,
        uniforms: { ...shared, uGlintSize: { value: size } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
    });
}

export type DanceMode = 'idle' | 'chase' | 'pulse' | 'celebrate';

export const DANCE_WEIGHTS: Record<DanceMode, [number, number, number, number]> = {
    idle: [1, 0, 0, 0],
    chase: [0.5, 1, 0, 0],
    pulse: [0.6, 0, 1, 0],
    celebrate: [0.3, 0.6, 0, 1],
};
