/**
 * lib/mint/mannequin.ts — a gallery display arm for the try-on: a left forearm and a smooth,
 * fingers-together hand, in the IcedWatch frame (forearm along X with the hand at +X, the
 * back of the wrist toward +Z, the thumb on the 6 o'clock side, −Y).
 *
 * The wrist cross-section at x = 0 is exactly the watch's `WristSize` ellipse, so every
 * edition's bracelet closes round it. Built procedurally: one swept body (superellipse
 * sections whose size, flatness and curl follow a profile from elbow to fingertips) plus a
 * swept thumb.
 */

import {
    BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, MeshPhysicalMaterial, Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WristSize } from './wrist';

interface Section { x: number; a: number; b: number; z: number; n: number }

// x (m) · half-width and half-depth relative to the wrist · palmward curl (m) · superellipse exponent
const PROFILE: readonly Section[] = [
    { x: -0.215, a: 1.2, b: 1.3, z: 0, n: 2 },
    { x: -0.15, a: 1.2, b: 1.28, z: 0, n: 2 },
    { x: -0.08, a: 1.1, b: 1.15, z: 0, n: 2 },
    { x: 0, a: 1, b: 1, z: 0, n: 2 },
    { x: 0.03, a: 1.03, b: 0.88, z: -0.002, n: 2.2 },
    { x: 0.055, a: 1.3, b: 0.76, z: -0.004, n: 2.8 },
    { x: 0.085, a: 1.42, b: 0.68, z: -0.005, n: 3 },
    { x: 0.11, a: 1.44, b: 0.64, z: -0.006, n: 3 },
    { x: 0.14, a: 1.3, b: 0.56, z: -0.009, n: 2.8 },
    { x: 0.17, a: 1.12, b: 0.49, z: -0.014, n: 2.6 },
    { x: 0.196, a: 0.96, b: 0.43, z: -0.02, n: 2.4 },
];

/** Catmull–Rom through the profile, by x. */
function sample(x: number): Section {
    const P = PROFILE;
    let i = 0;
    while (i < P.length - 2 && x > P[i + 1].x) i++;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const t = Math.min(1, Math.max(0, (x - p1.x) / (p2.x - p1.x)));
    const cr = (k: keyof Section) => {
        const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
        return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    };
    return { x, a: cr('a'), b: cr('b'), z: cr('z'), n: cr('n') };
}

/** Superellipse point at angle θ: |y/a|^n + |z/b|^n = 1. */
const sePoint = (theta: number, a: number, b: number, n: number) => {
    const c = Math.cos(theta), s = Math.sin(theta);
    const e = 2 / n;
    return { y: a * Math.sign(c) * Math.pow(Math.abs(c), e), z: b * Math.sign(s) * Math.pow(Math.abs(s), e) };
};

function grid(rows: Vector3[][]): BufferGeometry {
    const ny = rows.length, nx = rows[0].length;
    const pos: number[] = [], idx: number[] = [];
    for (const row of rows) for (const v of row) pos.push(v.x, v.y, v.z);
    for (let i = 0; i < ny - 1; i++) {
        for (let j = 0; j < nx - 1; j++) {
            const a = i * nx + j, b = a + 1, c = a + nx, d = c + 1;
            idx.push(a, b, c, b, d, c); // outward
        }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    // weld the seam and the poles so the shading is continuous
    const welded = mergeVertices(g, 1e-7);
    g.dispose();
    welded.computeVertexNormals();
    return welded;
}

/** The arm and hand body. `axisZ` is the wrist axis height in the watch frame (zBack − depth/2). */
function bodyGeometry(wrist: WristSize, axisZ: number, inset: number): BufferGeometry {
    const aw = wrist.width / 2 - inset, bw = wrist.depth / 2 - inset;
    const x0 = PROFILE[0].x, x1 = PROFILE[PROFILE.length - 1].x;
    const capA = 0.028, capB = 0.022; // elbow and fingertip rounding lengths
    const N = 160, M = 72;
    const rows: Vector3[][] = [];
    for (let i = 0; i <= N; i++) {
        // denser near the caps
        const u = i / N;
        const x = x0 + (x1 - x0) * (0.5 - 0.5 * Math.cos(Math.PI * u));
        const s = sample(x);
        let k = 1;
        if (x < x0 + capA) { const t = (x0 + capA - x) / capA; k = Math.sqrt(Math.max(0, 1 - t * t)); }
        if (x > x1 - capB) { const t = (x - (x1 - capB)) / capB; k = Math.sqrt(Math.max(0, 1 - t * t)); }
        const ring: Vector3[] = [];
        for (let j = 0; j <= M; j++) {
            const th = (j / M) * Math.PI * 2;
            const p = sePoint(th, s.a * aw * k, s.b * bw * k, s.n);
            ring.push(new Vector3(x, p.y, axisZ + s.z + p.z));
        }
        rows.push(ring);
    }
    return grid(rows);
}

function thumbGeometry(wrist: WristSize, axisZ: number): BufferGeometry {
    const k = wrist.width / 0.058;
    const curve = new CatmullRomCurve3([
        new Vector3(0.03, -0.018 * k, axisZ - 0.004),
        new Vector3(0.06, -0.041 * k, axisZ - 0.008),
        new Vector3(0.088, -0.05 * k, axisZ - 0.012),
        new Vector3(0.112, -0.049 * k, axisZ - 0.015),
    ]);
    const N = 64, M = 40;
    const frames = curve.computeFrenetFrames(N, false);
    const rows: Vector3[][] = [];
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const c = curve.getPointAt(t);
        let r = (0.0125 - 0.0035 * t) * k;
        if (t > 0.85) r *= Math.sqrt(Math.max(0, 1 - ((t - 0.85) / 0.15) ** 2));
        const ring: Vector3[] = [];
        for (let j = 0; j <= M; j++) {
            const th = (j / M) * Math.PI * 2;
            ring.push(c.clone()
                .addScaledVector(frames.normals[i], Math.cos(th) * r * 0.86)
                .addScaledVector(frames.binormals[i], Math.sin(th) * r));
        }
        rows.push(ring);
    }
    return grid(rows);
}

export function mannequinGeometry(wrist: WristSize, axisZ: number, inset = 0.0006): BufferGeometry {
    const parts = [bodyGeometry(wrist, axisZ, inset), thumbGeometry(wrist, axisZ)];
    const merged = mergeGeometries(parts, false);
    parts.forEach(p => p.dispose());
    if (!merged) throw new Error('mannequin merge failed');
    return merged;
}

export type MannequinFinish = 'porcelain' | 'bronze' | 'onyx';

export const MANNEQUIN_FINISHES: Record<MannequinFinish, { label: string; color: [number, number, number]; roughness: number; sheen: number }> = {
    porcelain: { label: 'Porcelain', color: [0.62, 0.6, 0.57], roughness: 0.42, sheen: 0.25 },
    bronze: { label: 'Bronze', color: [0.16, 0.075, 0.04], roughness: 0.48, sheen: 0.35 },
    onyx: { label: 'Onyx', color: [0.012, 0.012, 0.015], roughness: 0.5, sheen: 0.5 },
};

export function mannequinMaterial(finish: MannequinFinish): MeshPhysicalMaterial {
    const f = MANNEQUIN_FINISHES[finish];
    return new MeshPhysicalMaterial({
        color: new Color(...f.color),
        roughness: f.roughness,
        clearcoat: 0.25,
        clearcoatRoughness: 0.5,
        sheen: f.sheen,
        sheenRoughness: 0.5,
        sheenColor: new Color(...f.color).lerp(new Color(1, 1, 1), 0.12),
    });
}

export function setMannequinFinish(m: MeshPhysicalMaterial, finish: MannequinFinish): void {
    const f = MANNEQUIN_FINISHES[finish];
    m.color.setRGB(...f.color);
    m.roughness = f.roughness;
    m.sheen = f.sheen;
    m.sheenColor.setRGB(...f.color).lerp(new Color(1, 1, 1), 0.12);
}
