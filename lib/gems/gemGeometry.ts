/**
 * lib/gems/gemGeometry.ts — faceted stones as flat-shaded BufferGeometry.
 *
 * Unit stones: girdle width 1 (round: diameter 1), table facing +Y, girdle at
 * y = 0, crown above, pavilion below. Every facet is its own flat triangle
 * set, so the gem shader can key sparkle and fire off the facet normal.
 *
 *   brilliant — 57-facet round brilliant (table, 8 stars, 8 kites, 16 upper
 *               girdles, girdle band, 16 lower girdles, 8 pavilion mains)
 *   baguette  — rectangular step cut (2 crown steps, 3 pavilion steps, keel)
 *   emerald   — octagonal step cut (clipped corners)
 *   cabochon  — smooth dome for crowns and jewel bearings
 */

import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

type V3 = [number, number, number];

class FacetBuilder {
    readonly pos: number[] = [];
    readonly nrm: number[] = [];
    private readonly center: Vector3;
    private readonly a = new Vector3();
    private readonly b = new Vector3();
    private readonly c = new Vector3();
    private readonly n = new Vector3();
    private readonly m = new Vector3();

    constructor(center: V3) {
        this.center = new Vector3(...center);
    }

    /** One triangle, wound so its normal faces away from the stone's centre. */
    tri(p: V3, q: V3, r: V3): void {
        this.a.set(...p); this.b.set(...q); this.c.set(...r);
        this.n.subVectors(this.b, this.a).cross(this.m.subVectors(this.c, this.a));
        if (this.n.lengthSq() < 1e-14) return; // degenerate (keel tips)
        this.n.normalize();
        this.m.set(0, 0, 0).add(this.a).add(this.b).add(this.c).multiplyScalar(1 / 3).sub(this.center);
        let A = p, B = q;
        if (this.n.dot(this.m) < 0) { A = q; B = p; this.n.negate(); }
        this.pos.push(...A, ...B, ...r);
        for (let i = 0; i < 3; i++) this.nrm.push(this.n.x, this.n.y, this.n.z);
    }

    quad(p: V3, q: V3, r: V3, s: V3): void {
        this.tri(p, q, r);
        this.tri(p, r, s);
    }

    fan(ring: V3[], apex: V3): void {
        for (let i = 0; i < ring.length; i++) this.tri(ring[i], ring[(i + 1) % ring.length], apex);
    }

    band(lo: V3[], hi: V3[]): void {
        const n = lo.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            this.quad(lo[i], lo[j], hi[j], hi[i]);
        }
    }

    build(): BufferGeometry {
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
        g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
        g.computeBoundingSphere();
        return g;
    }
}

const polar = (r: number, deg: number, y: number): V3 => {
    const a = (deg * Math.PI) / 180;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
};

/**
 * Round brilliant. Proportions after Tolkowsky: table 57 %, crown 16 %,
 * pavilion 43 %, thin girdle.
 */
export function brilliantGeometry(): BufferGeometry {
    const R = 0.5, crown = 0.162, girdle = 0.02, pavilion = 0.431;
    const fb = new FacetBuilder([0, -0.12, 0]);
    const T: V3[] = [], S: V3[] = [], G: V3[] = [], L: V3[] = [], Q: V3[] = [];
    for (let j = 0; j < 8; j++) {
        T.push(polar(0.285, 45 * j + 22.5, crown));
        S.push(polar(0.405, 45 * j, crown * 0.62));
        Q.push(polar(0.205, 45 * j, -girdle - pavilion * 0.62));
    }
    for (let k = 0; k < 16; k++) {
        G.push(polar(R, 22.5 * k, 0));
        L.push(polar(R, 22.5 * k, -girdle));
    }
    const C: V3 = [0, -girdle - pavilion, 0];
    // table
    fb.fan(T, [0, crown, 0]);
    for (let j = 0; j < 8; j++) {
        const jn = (j + 1) % 8;
        // star facet on each table edge
        fb.tri(T[j], T[jn], S[jn]);
        // kite (bezel) facet under each table corner
        fb.tri(T[j], S[j], G[2 * j + 1]);
        fb.tri(T[j], G[2 * j + 1], S[jn]);
        // upper girdle pair around each star point
        fb.tri(S[j], G[(2 * j + 15) % 16], G[2 * j]);
        fb.tri(S[j], G[2 * j], G[2 * j + 1]);
        // pavilion: lower girdle pair + main kite to the culet
        fb.tri(Q[j], L[2 * j], L[(2 * j + 15) % 16]);
        fb.tri(Q[j], L[2 * j + 1], L[2 * j]);
        fb.tri(L[2 * j + 1], Q[j], C);
        fb.tri(L[2 * j + 1], C, Q[jn]);
    }
    fb.band(L, G);
    return fb.build();
}

function rectRing(hx: number, hz: number, y: number, clip = 0): V3[] {
    if (clip <= 0) return [[hx, y, hz], [-hx, y, hz], [-hx, y, -hz], [hx, y, -hz]];
    const c = Math.min(clip, hx * 0.9, hz * 0.9);
    return [
        [hx, y, hz - c], [hx - c, y, hz], [-hx + c, y, hz], [-hx, y, hz - c],
        [-hx, y, -hz + c], [-hx + c, y, -hz], [hx - c, y, -hz], [hx, y, -hz + c],
    ];
}

/**
 * Step cut along X: `length` × 1 at the girdle. `clip` > 0 makes it an
 * emerald (octagonal) cut.
 */
function stepCut(length: number, clip: number): BufferGeometry {
    const hx = length / 2, hz = 0.5;
    const fb = new FacetBuilder([0, -0.1, 0]);
    const ring = (inset: number, y: number) => rectRing(hx - inset, hz - inset, y, clip > 0 ? Math.max(0.02, clip - inset * 0.6) : 0);
    const table = ring(0.26, 0.15);
    const crown1 = ring(0.13, 0.095);
    const gTop = ring(0, 0);
    const gBot = ring(0, -0.025);
    const p1 = ring(0.15, -0.2);
    const p2 = ring(0.3, -0.36);
    const keelHx = Math.max(0.04, hx - 0.48);
    const keel = rectRing(keelHx, 0.005, -0.48, 0);
    // table cap
    fb.fan(table, [0, 0.15, 0]);
    fb.band(crown1, table);
    fb.band(gTop, crown1);
    fb.band(gBot, gTop);
    fb.band(p1, gBot);
    fb.band(p2, p1);
    // pavilion to keel: map the ring (4 or 8 points) onto the 4-point keel by side
    const n = p2.length;
    for (let i = 0; i < n; i++) {
        const a = p2[i], b = p2[(i + 1) % n];
        const ka = nearest(keel, a), kb = nearest(keel, b);
        if (ka === kb) fb.tri(a, b, ka);
        else fb.quad(a, b, kb, ka);
    }
    fb.quad(keel[0], keel[1], keel[2], keel[3]);
    return fb.build();
}

function nearest(list: V3[], p: V3): V3 {
    let best = list[0], bd = Infinity;
    for (const q of list) {
        const d = (q[0] - p[0]) ** 2 + (q[2] - p[2]) ** 2;
        if (d < bd) { bd = d; best = q; }
    }
    return best;
}

/** Rectangular baguette, length:width = `ratio`:1 (along X). */
export function baguetteGeometry(ratio = 2.2): BufferGeometry {
    return stepCut(ratio, 0);
}

/** Octagonal emerald cut, length:width = `ratio`:1 (along X). */
export function emeraldCutGeometry(ratio = 1.45): BufferGeometry {
    return stepCut(ratio, 0.16);
}

/** Smooth dome (crown jewel, bearings). Radius 0.5, base at y = 0. */
export function cabochonGeometry(segments = 24): BufferGeometry {
    const fb = new FacetBuilder([0, 0.05, 0]);
    const rings = 6;
    const rows: V3[][] = [];
    for (let i = 0; i <= rings; i++) {
        const t = (i / rings) * (Math.PI / 2);
        const r = Math.cos(t) * 0.5, y = Math.sin(t) * 0.32;
        const row: V3[] = [];
        for (let k = 0; k < segments; k++) row.push(polar(Math.max(r, 1e-4), (360 * k) / segments, y));
        rows.push(row);
    }
    for (let i = 0; i < rings - 1; i++) fb.band(rows[i], rows[i + 1]);
    fb.fan(rows[rings - 1], [0, 0.32, 0]); // close the dome at its apex
    fb.fan(rows[0], [0, 0, 0]);
    const g = fb.build();
    // smooth the dome's normals: a cabochon is polished, not faceted
    const p = g.getAttribute('position'), nAttr = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
        // ellipsoid (0.5, 0.32, 0.5): normal ∝ (x/a², y/b², z/a²)
        const v = new Vector3(p.getX(i), p.getY(i) * 2.44, p.getZ(i));
        if (p.getY(i) <= 1e-6) v.set(0, -1, 0); else v.normalize();
        nAttr.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
}

export type CutKind = 'brilliant' | 'baguette' | 'emerald' | 'cabochon';

const cache = new Map<string, BufferGeometry>();

/** Shared, cached cut geometry (one per cut/ratio). */
export function cutGeometry(cut: CutKind, ratio = 0): BufferGeometry {
    const key = `${cut}:${ratio.toFixed(2)}`;
    let g = cache.get(key);
    if (!g) {
        g = cut === 'brilliant' ? brilliantGeometry()
            : cut === 'baguette' ? baguetteGeometry(ratio || 2.2)
                : cut === 'emerald' ? emeraldCutGeometry(ratio || 1.45)
                    : cabochonGeometry();
        cache.set(key, g);
    }
    return g;
}

/** Facet count of a cut geometry (triangles), for budgets and tests. */
export function triangleCount(g: BufferGeometry): number {
    return g.getAttribute('position').count / 3;
}
