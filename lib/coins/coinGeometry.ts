/**
 * lib/coins/coinGeometry.ts — sculpting a coin.
 *
 * Unit coin: radius 1, face toward +Z, centred on the origin (the vault
 * scales it to metres). From the centre out, on the obverse:
 *
 *   field   r < 0.70, z = 0.050  — engraved pattern + legend (texture)
 *   bead    a polished wire round the field (or, on stepped coins, a raised
 *           inner tier carrying a row of pavé)
 *   seat    r 0.77…0.93, z = 0.078 — where the bezel stones are set
 *   lip     the raised outer rim, rounded over the edge
 *   edge    r = 1, z ±0.08 — reeded (normal map)
 *
 * The reverse is a plain mirror rim round a wider engraved field.
 * Emblems are traced from signed distance fields into bevelled extrusions;
 * stones are placements for the gem batch.
 */

import {
    BufferGeometry, Curve, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, Matrix4, Path, Quaternion, Shape, ShapePath,
    TubeGeometry, Vector2, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { outlines, traceContours, type Sdf2, type Vec2 } from './sdf2d';
import type { CoinGem } from './catalog';
import type { CutKind } from '../gems/gemGeometry';

export const FIELD_R = 0.7;
export const FIELD_Z = 0.05;
export const SEAT_Z = 0.078;
export const SEAT_R0 = 0.77;
export const SEAT_R1 = 0.93;
export const EDGE_Z = 0.08;
export const BACK_FIELD_R = 0.885;
export const BACK_FIELD_Z = -0.075;
export const TIER_Z = 0.118;
export const TIER_R0 = 0.703;
export const TIER_R1 = 0.762;

// ── body: a radial sweep of the profile ──────────────────────────────────────

type P = [number, number];

interface Section {
    pts: P[];
    group: 0 | 1; // 0 rim metal, 1 reeded edge
}

function profile(tiered: boolean): Section[] {
    const front: P[] = tiered
        ? [[FIELD_R, FIELD_Z], [FIELD_R, 0.104], [TIER_R0, TIER_Z - 0.006], [0.712, TIER_Z], [0.752, TIER_Z], [TIER_R1, TIER_Z - 0.006], [0.768, 0.1], [SEAT_R0, SEAT_Z]]
        : [[FIELD_R, FIELD_Z], [0.704, 0.072], [0.718, 0.086], [0.742, 0.091], [0.762, 0.085], [SEAT_R0, SEAT_Z]];
    return [
        { pts: front, group: 0 },
        { pts: [[SEAT_R0, SEAT_Z], [SEAT_R1, SEAT_Z]], group: 0 },
        { pts: [[SEAT_R1, SEAT_Z], [0.938, 0.103], [0.952, 0.113], [0.972, 0.112], [0.99, 0.099], [1, EDGE_Z]], group: 0 },
        { pts: [[1, EDGE_Z], [1, -EDGE_Z]], group: 1 },
        { pts: [[1, -EDGE_Z], [0.99, -0.099], [0.972, -0.112], [0.952, -0.113], [0.932, -0.103], [0.912, -0.087], [0.896, -0.08], [BACK_FIELD_R, BACK_FIELD_Z]], group: 0 },
    ];
}

/** Rim + edge as one geometry with two groups (0 rim metal, 1 reeded edge). */
export function bodyGeometry(tiered: boolean, segments = 128): BufferGeometry {
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    const groups: { start: number; count: number; mat: number }[] = [];
    for (const sec of profile(tiered)) {
        const pts = sec.pts;
        // per-point profile normals (outward), smooth within the section
        const segN = pts.slice(1).map((p, i) => {
            const dr = p[0] - pts[i][0], dz = p[1] - pts[i][1];
            const L = Math.hypot(dr, dz) || 1;
            // the profile runs from the front face, round the edge, to the back: outward is (−dz, dr)
            return [-dz / L, dr / L] as P;
        });
        const ptN = pts.map((_, i) => {
            const a = segN[Math.max(0, i - 1)], b = segN[Math.min(segN.length - 1, i)];
            const nx = a[0] + b[0], nz = a[1] + b[1], L = Math.hypot(nx, nz) || 1;
            return [nx / L, nz / L] as P;
        });
        let len = 0;
        const along = pts.map((p, i) => (i === 0 ? 0 : (len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]))));
        const base = pos.length / 3;
        for (let s = 0; s <= segments; s++) {
            const th = (s / segments) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
            pts.forEach((p, i) => {
                pos.push(p[0] * c, p[0] * sn, p[1]);
                nrm.push(ptN[i][0] * c, ptN[i][0] * sn, ptN[i][1]);
                // edge: u round the coin, v across the edge; rim: v along the profile
                uv.push(s / segments, sec.group === 1 ? (p[1] + EDGE_Z) / (2 * EDGE_Z) : along[i] / (len || 1));
            });
        }
        const start = idx.length, n = pts.length;
        for (let s = 0; s < segments; s++) {
            for (let i = 0; i < n - 1; i++) {
                const a = base + s * n + i, b = base + (s + 1) * n + i;
                idx.push(a, a + 1, b, b, a + 1, b + 1);
            }
        }
        groups.push({ start, count: idx.length - start, mat: sec.group });
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    for (const gr of groups) g.addGroup(gr.start, gr.count, gr.mat);
    g.computeBoundingSphere();
    return g;
}

/** A flat disc facing +Z (or −Z for the reverse), UVs planar across its diameter. */
export function discGeometry(radius: number, z: number, segments = 96, rings = 6, back = false): BufferGeometry {
    const pos: number[] = [0, 0, z], nrm: number[] = [0, 0, back ? -1 : 1], uv: number[] = [0.5, 0.5], idx: number[] = [];
    for (let r = 1; r <= rings; r++) {
        const rad = (r / rings) * radius;
        for (let s = 0; s < segments; s++) {
            const th = (s / segments) * Math.PI * 2;
            const x = Math.cos(th) * rad, y = Math.sin(th) * rad;
            pos.push(x, y, z);
            nrm.push(0, 0, back ? -1 : 1);
            // the reverse is seen from behind: mirror u so its engraving reads correctly
            uv.push(0.5 + (back ? -x : x) / (2 * radius), 0.5 + y / (2 * radius));
        }
    }
    const ring = (r: number, s: number) => 1 + (r - 1) * segments + (s % segments);
    for (let s = 0; s < segments; s++) back ? idx.push(0, ring(1, s + 1), ring(1, s)) : idx.push(0, ring(1, s), ring(1, s + 1));
    for (let r = 1; r < rings; r++) {
        for (let s = 0; s < segments; s++) {
            const a = ring(r, s), b = ring(r, s + 1), c = ring(r + 1, s), d = ring(r + 1, s + 1);
            if (back) idx.push(a, d, c, a, b, d); else idx.push(a, c, d, a, d, b);
        }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
}

// ── relief: SDF → outline → bevelled extrusion ───────────────────────────────

export interface ReliefOptions {
    /** Height of the flat top above the base, coin units (the top sits at base + height − 0.004). */
    height: number;
    /** Bevel width and height. */
    bevel: number;
    /** z of the relief's base. */
    base: number;
    /** Contour grid resolution across the shape. */
    res?: number;
}

export function shapesFromSdf(sdf: Sdf2, res = 192): Shape[] {
    const { loops } = traceContours(sdf, res);
    return outlines(loops).map(o => {
        const shape = new Shape(o.outer.map(([x, y]) => new Vector2(x, y)));
        shape.holes = o.holes.map(h => new Path(h.map(([x, y]) => new Vector2(x, y))));
        return shape;
    });
}

export function reliefGeometry(shapes: Shape[], o: ReliefOptions): BufferGeometry | null {
    if (!shapes.length) return null;
    // the outline is already the shape's edge: the bevel grows inward, not outward
    const g = new ExtrudeGeometry(shapes, {
        depth: Math.max(0.001, o.height - 2 * o.bevel),
        bevelEnabled: o.bevel > 0,
        bevelThickness: o.bevel,
        bevelSize: o.bevel * 0.9,
        bevelOffset: -o.bevel * 0.9,
        bevelSegments: 2,
        curveSegments: 4,
    });
    // ExtrudeGeometry spans z ∈ [−bevel, depth + bevel]: base just below `base` (no gap at the seam), top at base + height
    g.translate(0, 0, o.base + o.bevel - 0.004);
    g.computeVertexNormals();
    return g;
}

/** Relief straight from an SDF. */
export function sdfRelief(sdf: Sdf2, o: ReliefOptions): BufferGeometry | null {
    return reliefGeometry(shapesFromSdf(sdf, o.res), o);
}

/**
 * Shapes from one SVG path `d` (M/L/H/V/C/Q/Z, absolute or relative), fitted
 * into a box `fit` wide centred on the origin, y up.
 */
export function shapesFromSvgPath(d: string, fit = 0.9): Shape[] {
    const sp = new ShapePath();
    const tok = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
    const num = () => Number(tok[i++]);
    while (i < tok.length) {
        if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
        const rel = cmd === cmd.toLowerCase();
        const ox = rel ? x : 0, oy = rel ? y : 0;
        switch (cmd.toUpperCase()) {
            case 'M': x = ox + num(); y = oy + num(); sp.moveTo(x, -y); sx = x; sy = y; cmd = rel ? 'l' : 'L'; break;
            case 'L': x = ox + num(); y = oy + num(); sp.lineTo(x, -y); break;
            case 'H': x = (rel ? x : 0) + num(); sp.lineTo(x, -y); break;
            case 'V': y = (rel ? y : 0) + num(); sp.lineTo(x, -y); break;
            case 'C': {
                const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num();
                x = ox + num(); y = oy + num();
                sp.bezierCurveTo(x1, -y1, x2, -y2, x, -y);
                break;
            }
            case 'Q': {
                const x1 = ox + num(), y1 = oy + num();
                x = ox + num(); y = oy + num();
                sp.quadraticCurveTo(x1, -y1, x, -y);
                break;
            }
            case 'Z':
                x = sx; y = sy;
                if (i < tok.length && !/[a-zA-Z]/.test(tok[i])) i++; // stray number after Z: skip it
                break;
            default: i++; // unsupported command: skip its token
        }
    }
    const shapes = sp.toShapes(true);
    // fit: centre and scale into the box
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of shapes) for (const p of s.getPoints()) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    if (!Number.isFinite(x0)) return [];
    const k = fit / Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const map = (pts: Vector2[]) => pts.map(p => new Vector2((p.x - cx) * k, (p.y - cy) * k));
    return shapes.map(s => {
        const out = new Shape(map(s.getPoints(12)));
        out.holes = s.holes.map(h => new Path(map(h.getPoints(12))));
        return out;
    });
}

// ── 3D emblem parts ──────────────────────────────────────────────────────────

/** Trefoil knot tube, flattened onto the face: the braided QUAI emblem. */
export function knotGeometry(radius = 0.4, tube = 0.05, flatten = 0.4): BufferGeometry {
    class Trefoil extends Curve<Vector3> {
        constructor() { super(); }
        override getPoint(t: number, target = new Vector3()): Vector3 {
            const a = t * Math.PI * 2;
            return target.set(Math.sin(a) + 2 * Math.sin(2 * a), Math.cos(a) - 2 * Math.cos(2 * a), -Math.sin(3 * a)).multiplyScalar(radius / 3);
        }
    }
    const g = new TubeGeometry(new Trefoil(), 240, tube, 12, true);
    g.scale(1, 1, flatten);
    return g;
}

/** Thin bars along a list of edges (the platinum frame of the ETH prism). */
export function edgeFrameGeometry(edges: [Vector3, Vector3][], radius = 0.012): BufferGeometry {
    const parts = edges.map(([a, b]) => {
        const L = a.distanceTo(b);
        const g = new CylinderGeometry(radius, radius, L, 8, 1, false);
        const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
        g.applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
        return g.toNonIndexed();
    });
    const merged = mergeGeometries(parts, false) as BufferGeometry;
    merged.computeVertexNormals();
    return merged;
}

// ── fancy-cut stones (beyond the watch's round, baguette and emerald cuts) ──

class Facets {
    readonly pos: number[] = [];
    readonly nrm: number[] = [];
    constructor(private readonly center: Vector3) {}
    tri(p: Vector3, q: Vector3, r: Vector3): void {
        const n = q.clone().sub(p).cross(r.clone().sub(p));
        if (n.lengthSq() < 1e-14) return;
        n.normalize();
        const m = p.clone().add(q).add(r).multiplyScalar(1 / 3).sub(this.center);
        let A = p, B = q;
        if (n.dot(m) < 0) { A = q; B = p; n.negate(); }
        for (const v of [A, B, r]) this.pos.push(v.x, v.y, v.z);
        for (let i = 0; i < 3; i++) this.nrm.push(n.x, n.y, n.z);
    }
    quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3): void { this.tri(a, b, c); this.tri(a, c, d); }
    build(): BufferGeometry {
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
        g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
        g.computeBoundingSphere();
        return g;
    }
}

/**
 * A faceted stone over any convex girdle outline (unit table normal +Y,
 * girdle at y = 0): table, two crown steps, girdle band, pavilion mains to a
 * culet. Pear, hexagon and other fancy shapes.
 */
export function fancyCutGeometry(outline: Vec2[], crown = 0.16, pavilion = 0.42, table = 0.56): BufferGeometry {
    const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length, cz = outline.reduce((s, p) => s + p[1], 0) / outline.length;
    const ring = (k: number, y: number) => outline.map(([x, z]) => new Vector3(cx + (x - cx) * k, y, cz + (z - cz) * k));
    const fb = new Facets(new Vector3(cx, -0.1, cz));
    const T = ring(table, crown), C = ring((1 + table) / 2 + 0.06, crown * 0.55), G = ring(1, 0), Gb = ring(1, -0.02), Pv = ring(0.45, -0.02 - pavilion * 0.6);
    const top = new Vector3(cx, crown, cz), culet = new Vector3(cx, -0.02 - pavilion, cz);
    const n = outline.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        fb.tri(T[i], T[j], top);
        fb.quad(C[i], C[j], T[j], T[i]);
        fb.quad(G[i], G[j], C[j], C[i]);
        fb.quad(Gb[i], Gb[j], G[j], G[i]);
        fb.quad(Pv[i], Pv[j], Gb[j], Gb[i]);
        fb.tri(Pv[j], Pv[i], culet);
    }
    return fb.build();
}

/** Teardrop outline (pear), point toward +Z (the girdle plane is XZ). */
export function pearOutline(n = 28, width = 0.62, length = 1): Vec2[] {
    const pts: Vec2[] = [];
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const x = Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), 1.25) * (width / 2) * 1.3;
        const z = Math.cos(t) * (length / 2);
        pts.push([x, -z]);
    }
    return pts;
}

export function polygonOutline(sides: number, radius = 0.5, phase = 0): Vec2[] {
    return Array.from({ length: sides }, (_, i) => {
        const a = phase + (i / sides) * Math.PI * 2;
        return [Math.cos(a) * radius, Math.sin(a) * radius] as Vec2;
    });
}

/** Elongated octahedron (square bipyramid), long axis ±Z, girdle corners on ±X/±Y. */
export function bipyramidGeometry(half = 0.24, length = 0.42): { geometry: BufferGeometry; edges: [Vector3, Vector3][] } {
    const top = new Vector3(0, 0, length), bot = new Vector3(0, 0, -length);
    const g = [new Vector3(half, 0, 0), new Vector3(0, half, 0), new Vector3(-half, 0, 0), new Vector3(0, -half, 0)];
    const fb = new Facets(new Vector3());
    const edges: [Vector3, Vector3][] = [];
    for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        // two facets per face so the sparkle varies across each half
        const m = g[i].clone().add(g[j]).multiplyScalar(0.5).multiplyScalar(1.04);
        fb.tri(g[i], m, top); fb.tri(m, g[j], top);
        fb.tri(g[i], m, bot); fb.tri(m, g[j], bot);
        edges.push([g[i], g[j]], [g[i], top], [g[i], bot]);
    }
    return { geometry: fb.build(), edges };
}

// ── stone placements ─────────────────────────────────────────────────────────

export interface CoinStone {
    cut: CutKind;
    ratio?: number;
    gem: CoinGem;
    pos: Vector3;
    up: Vector3;
    along?: Vector3;
    size: number;
    /** 0…1 round its setting (the chase wave follows it). */
    order: number;
}

const UP = new Vector3(0, 0, 1);

export interface BezelLayout {
    setting: 'pave' | 'baguetteRadial' | 'baguetteChannel' | 'emeraldChannel';
    gem: CoinGem;
    accent?: CoinGem;
    accentEvery: number;
}

/** Stones round the bezel seat. */
export function bezelStones(b: BezelLayout): CoinStone[] {
    const out: CoinStone[] = [];
    const mid = (SEAT_R0 + SEAT_R1) / 2, width = SEAT_R1 - SEAT_R0;
    const z = SEAT_Z + 0.006;
    const pick = (i: number) => (b.accentEvery > 0 && b.accent && i % b.accentEvery === b.accentEvery - 1 ? b.accent : b.gem);
    if (b.setting === 'pave') {
        // two staggered rows of brilliants
        const size = width * 0.43;
        const rows = [SEAT_R0 + width * 0.27, SEAT_R0 + width * 0.73];
        let k = 0;
        rows.forEach((r, row) => {
            const n = Math.floor((Math.PI * 2 * r) / (size * 1.07));
            for (let i = 0; i < n; i++) {
                const a = ((i + row * 0.5) / n) * Math.PI * 2;
                out.push({ cut: 'brilliant', gem: pick(k++), pos: new Vector3(Math.cos(a) * r, Math.sin(a) * r, z), up: UP, size, order: i / n });
            }
        });
    } else if (b.setting === 'baguetteRadial') {
        const w = 0.052, ratio = (width * 0.9) / w;
        const n = Math.floor((Math.PI * 2 * mid) / (w * 1.12));
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const dir = new Vector3(Math.cos(a), Math.sin(a), 0);
            out.push({ cut: 'baguette', ratio, gem: pick(i), pos: dir.clone().multiplyScalar(mid).setZ(z), up: UP, along: dir, size: w, order: i / n });
        }
    } else {
        const emerald = b.setting === 'emeraldChannel';
        const w = width * (emerald ? 0.62 : 0.58), ratio = emerald ? 1.3 : 1.7;
        const n = Math.floor((Math.PI * 2 * mid) / (w * ratio * 1.06));
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const tangent = new Vector3(-Math.sin(a), Math.cos(a), 0);
            out.push({ cut: emerald ? 'emerald' : 'baguette', ratio, gem: pick(i), pos: new Vector3(Math.cos(a) * mid, Math.sin(a) * mid, z), up: UP, along: tangent, size: w, order: i / n });
        }
    }
    return out;
}

/** The stepped coins' inner tier: one row of small brilliants. */
export function tierStones(gem: CoinGem): CoinStone[] {
    const r = (TIER_R0 + TIER_R1) / 2, size = (TIER_R1 - TIER_R0) * 0.8;
    const n = Math.floor((Math.PI * 2 * r) / (size * 1.08));
    return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return { cut: 'brilliant' as const, gem, pos: new Vector3(Math.cos(a) * r, Math.sin(a) * r, TIER_Z + 0.004), up: UP, size, order: i / n };
    });
}

/** Pavé over a relief's top: a hex grid of brilliants wherever a stone fits inside `sdf`. */
export function paveStones(sdf: Sdf2, gem: CoinGem, z: number, size: number): CoinStone[] {
    const out: CoinStone[] = [];
    const step = size * 1.06, rowH = step * Math.sqrt(3) / 2;
    const [x0, y0, x1, y1] = sdf.box;
    for (let row = 0, y = y0; y <= y1; row++, y += rowH) {
        for (let x = x0 + (row % 2 ? step / 2 : 0); x <= x1; x += step) {
            if (sdf.d(x, y) < -size * 0.42) {
                out.push({ cut: 'brilliant', gem, pos: new Vector3(x, y, z), up: UP, size, order: (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1 });
            }
        }
    }
    return out;
}
