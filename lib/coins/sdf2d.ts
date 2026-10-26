/**
 * lib/coins/sdf2d.ts — 2D signed distance shapes, and how they become relief.
 *
 * Emblems and lettering are described as unions of simple strokes (capsules,
 * arcs, polygons, circles). As signed distance fields they combine with min()
 * and inset/outset by adding a constant, so one description gives:
 *   · the emblem outline, traced with marching squares into polygons that
 *     ExtrudeGeometry turns into a bevelled relief (sculpt);
 *   · where pavé fits on the emblem's top (inside by at least a stone radius);
 *   · engraving and embossing splatted into texture height maps.
 *
 * Pure maths, deterministic, no DOM.
 */

export type Vec2 = [number, number];

/** A shape: signed distance (negative inside) and its bounding box. */
export interface Sdf2 {
    d(x: number, y: number): number;
    /** [minX, minY, maxX, maxY] of the shape's interior. */
    box: [number, number, number, number];
}

const EMPTY_BOX: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

export function circle(cx: number, cy: number, r: number): Sdf2 {
    return { d: (x, y) => Math.hypot(x - cx, y - cy) - r, box: [cx - r, cy - r, cx + r, cy + r] };
}

/** Rounded rectangle centred on (cx, cy). */
export function box(cx: number, cy: number, hw: number, hh: number, round = 0): Sdf2 {
    return {
        d(x, y) {
            const qx = Math.abs(x - cx) - hw + round, qy = Math.abs(y - cy) - hh + round;
            return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - round;
        },
        box: [cx - hw, cy - hh, cx + hw, cy + hh],
    };
}

/** A stroke from a to b, half-width r, round caps; `r1` tapers it to the end. */
export function segment(ax: number, ay: number, bx: number, by: number, r: number, r1 = r): Sdf2 {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
    const m = Math.max(r, r1);
    return {
        d(x, y) {
            const h = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L2));
            return Math.hypot(x - ax - dx * h, y - ay - dy * h) - (r + (r1 - r) * h);
        },
        box: [Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m],
    };
}

/**
 * A circular stroke of radius `R` round (cx, cy) from angle a0 to a1
 * (radians, counter-clockwise, a1 > a0), half-width r, round caps.
 */
export function arc(cx: number, cy: number, R: number, a0: number, a1: number, r: number): Sdf2 {
    const span = a1 - a0;
    const mid = a0 + span / 2;
    const full = span >= Math.PI * 2 - 1e-6;
    const ex0 = cx + Math.cos(a0) * R, ey0 = cy + Math.sin(a0) * R;
    const ex1 = cx + Math.cos(a1) * R, ey1 = cy + Math.sin(a1) * R;
    return {
        d(x, y) {
            const px = x - cx, py = y - cy;
            if (!full) {
                // angle from the arc's middle, wrapped to (-π, π]
                let t = Math.atan2(py, px) - mid;
                t -= Math.round(t / (Math.PI * 2)) * Math.PI * 2;
                if (Math.abs(t) > span / 2) return Math.min(Math.hypot(x - ex0, y - ey0), Math.hypot(x - ex1, y - ey1)) - r;
            }
            return Math.abs(Math.hypot(px, py) - R) - r;
        },
        box: [cx - R - r, cy - R - r, cx + R + r, cy + R + r],
    };
}

/** Exact signed distance to a simple polygon (any winding). */
export function polygon(pts: Vec2[]): Sdf2 {
    const n = pts.length;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return {
        d(x, y) {
            let d = (x - pts[0][0]) ** 2 + (y - pts[0][1]) ** 2;
            let s = 1;
            for (let i = 0, j = n - 1; i < n; j = i, i++) {
                const ex = pts[j][0] - pts[i][0], ey = pts[j][1] - pts[i][1];
                const wx = x - pts[i][0], wy = y - pts[i][1];
                const h = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1e-12)));
                const bx = wx - ex * h, by = wy - ey * h;
                d = Math.min(d, bx * bx + by * by);
                const c1 = y >= pts[i][1], c2 = y < pts[j][1], c3 = ex * wy > ey * wx;
                if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
            }
            return s * Math.sqrt(d);
        },
        box: [x0, y0, x1, y1],
    };
}

export function union(...parts: Sdf2[]): Sdf2 {
    const list = parts.filter(Boolean);
    const b: [number, number, number, number] = [...EMPTY_BOX];
    for (const p of list) { b[0] = Math.min(b[0], p.box[0]); b[1] = Math.min(b[1], p.box[1]); b[2] = Math.max(b[2], p.box[2]); b[3] = Math.max(b[3], p.box[3]); }
    return {
        d(x, y) {
            let m = Infinity;
            for (const p of list) {
                // cheap reject: outside a part's box by more than the current best
                const ox = Math.max(p.box[0] - x, x - p.box[2], 0), oy = Math.max(p.box[1] - y, y - p.box[3], 0);
                if (ox * ox + oy * oy >= m * m && m > 0) continue;
                const v = p.d(x, y);
                if (v < m) m = v;
            }
            return m;
        },
        box: b,
    };
}

export function subtract(a: Sdf2, b: Sdf2): Sdf2 {
    return { d: (x, y) => Math.max(a.d(x, y), -b.d(x, y)), box: a.box };
}

/** Grow (positive) or shrink (negative) a shape. */
export function offset(a: Sdf2, by: number): Sdf2 {
    const g = Math.max(by, 0);
    return { d: (x, y) => a.d(x, y) - by, box: [a.box[0] - g, a.box[1] - g, a.box[2] + g, a.box[3] + g] };
}

/** Scale about the origin, then translate. */
export function place(a: Sdf2, s: number, tx = 0, ty = 0, rot = 0): Sdf2 {
    const c = Math.cos(rot), sn = Math.sin(rot);
    const corners: Vec2[] = [[a.box[0], a.box[1]], [a.box[2], a.box[1]], [a.box[2], a.box[3]], [a.box[0], a.box[3]]]
        .map(([x, y]) => [(x * c - y * sn) * s + tx, (x * sn + y * c) * s + ty]);
    return {
        d(x, y) {
            const lx = (x - tx) / s, ly = (y - ty) / s;
            return a.d(lx * c + ly * sn, -lx * sn + ly * c) * s;
        },
        box: [Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[1])), Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[1]))],
    };
}

// ── outlines: marching squares ───────────────────────────────────────────────

export interface Contours {
    /** Closed loops (no repeated last point), in shape units. */
    loops: Vec2[][];
    /** Grid cell size used, shape units. */
    cell: number;
}

/**
 * Trace the zero contour of `s` on a grid of `res` cells across its box
 * (plus a margin), then simplify each loop to `tolerance`.
 */
export function traceContours(s: Sdf2, res = 192, tolerance?: number): Contours {
    const [bx0, by0, bx1, by1] = s.box;
    const span = Math.max(bx1 - bx0, by1 - by0);
    const cell = span / res;
    const pad = cell * 2;
    const x0 = bx0 - pad, y0 = by0 - pad;
    const nx = Math.ceil((bx1 - bx0 + 2 * pad) / cell) + 1;
    const ny = Math.ceil((by1 - by0 + 2 * pad) / cell) + 1;
    const v = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const d = s.d(x0 + i * cell, y0 + j * cell);
        v[j * nx + i] = d === 0 ? 1e-9 : d; // never exactly on the contour
    }
    // edge ids: horizontal edge (i,j)-(i+1,j) = 2*(j*nx+i), vertical (i,j)-(i,j+1) = 2*(j*nx+i)+1
    const point = new Map<number, Vec2>();
    const lerp = (a: number, b: number) => a / (a - b);
    const edgePoint = (id: number): Vec2 => {
        let p = point.get(id);
        if (!p) {
            const base = id >> 1, i = base % nx, j = (base / nx) | 0;
            if ((id & 1) === 0) {
                const t = lerp(v[j * nx + i], v[j * nx + i + 1]);
                p = [x0 + (i + t) * cell, y0 + j * cell];
            } else {
                const t = lerp(v[j * nx + i], v[(j + 1) * nx + i]);
                p = [x0 + i * cell, y0 + (j + t) * cell];
            }
            point.set(id, p);
        }
        return p;
    };
    const links = new Map<number, number[]>();
    const link = (a: number, b: number) => {
        (links.get(a) ?? links.set(a, []).get(a)!).push(b);
        (links.get(b) ?? links.set(b, []).get(b)!).push(a);
    };
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
        const k = (a < 0 ? 1 : 0) | (b < 0 ? 2 : 0) | (c < 0 ? 4 : 0) | (d < 0 ? 8 : 0);
        if (k === 0 || k === 15) continue;
        const bottom = 2 * (j * nx + i), top = 2 * ((j + 1) * nx + i), left = 2 * (j * nx + i) + 1, right = 2 * (j * nx + i + 1) + 1;
        switch (k) {
            case 1: case 14: link(left, bottom); break;
            case 2: case 13: link(bottom, right); break;
            case 3: case 12: link(left, right); break;
            case 4: case 11: link(right, top); break;
            case 6: case 9: link(bottom, top); break;
            case 7: case 8: link(left, top); break;
            case 5: case 10: {
                // saddle: the centre decides which corners connect
                const centreInside = (a + b + c + d) / 4 < 0;
                if ((k === 5) === centreInside) { link(left, top); link(bottom, right); } else { link(left, bottom); link(right, top); }
                break;
            }
        }
    }
    const loops: Vec2[][] = [];
    const used = new Set<number>();
    for (const start of links.keys()) {
        if (used.has(start)) continue;
        const loop: Vec2[] = [];
        let prev = -1, cur = start;
        while (!used.has(cur)) {
            used.add(cur);
            loop.push(edgePoint(cur));
            const next = (links.get(cur) ?? []).find(n => n !== prev && !used.has(n));
            if (next === undefined) break;
            prev = cur;
            cur = next;
        }
        if (loop.length >= 4) loops.push(simplifyLoop(loop, tolerance ?? cell * 0.25));
    }
    return { loops: loops.filter(l => l.length >= 3), cell };
}

/** Ramer–Douglas–Peucker on a closed loop. */
export function simplifyLoop(loop: Vec2[], tol: number): Vec2[] {
    if (loop.length < 8) return loop;
    // split at the two points farthest apart, simplify both halves
    let far = 0, best = -1;
    for (let i = 1; i < loop.length; i++) {
        const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
        if (d > best) { best = d; far = i; }
    }
    const a = rdp(loop.slice(0, far + 1), tol);
    const b = rdp([...loop.slice(far), loop[0]], tol);
    return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function rdp(pts: Vec2[], tol: number): Vec2[] {
    if (pts.length <= 2) return pts;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-12;
    let idx = 0, max = -1;
    for (let i = 1; i < pts.length - 1; i++) {
        const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
        if (d > max) { max = d; idx = i; }
    }
    if (max <= tol) return [pts[0], pts[pts.length - 1]];
    const l = rdp(pts.slice(0, idx + 1), tol), r = rdp(pts.slice(idx), tol);
    return [...l.slice(0, -1), ...r];
}

export function signedArea(loop: Vec2[]): number {
    let a = 0;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i++) a += (loop[j][0] - loop[i][0]) * (loop[j][1] + loop[i][1]);
    return a / 2;
}

export function pointInLoop(p: Vec2, loop: Vec2[]): boolean {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i++) {
        const [xi, yi] = loop[i], [xj, yj] = loop[j];
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

export interface Outline {
    /** Counter-clockwise outer boundary. */
    outer: Vec2[];
    /** Clockwise holes inside it. */
    holes: Vec2[][];
}

/** Group loops into outers with their holes (even nesting depth = outer). */
export function outlines(loops: Vec2[][]): Outline[] {
    const depth = loops.map((l, i) => loops.reduce((n, o, k) => (k !== i && pointInLoop(l[0], o) ? n + 1 : n), 0));
    const result: Outline[] = [];
    const outerIdx: number[] = [];
    loops.forEach((l, i) => {
        if (depth[i] % 2 === 0) {
            outerIdx.push(i);
            result.push({ outer: signedArea(l) > 0 ? l : [...l].reverse(), holes: [] });
        }
    });
    loops.forEach((l, i) => {
        if (depth[i] % 2 === 0) return;
        // the hole belongs to the innermost outer that contains it
        let owner = -1, ownerDepth = -1;
        outerIdx.forEach((oi, r) => {
            if (depth[oi] === depth[i] - 1 && pointInLoop(l[0], loops[oi]) && depth[oi] > ownerDepth) { owner = r; ownerDepth = depth[oi]; }
        });
        if (owner >= 0) result[owner].holes.push(signedArea(l) < 0 ? l : [...l].reverse());
    });
    return result;
}

// ── raster: splatting shapes into height maps ────────────────────────────────

/** A square float raster covering [-extent, extent]² in shape units (row 0 = bottom). */
export class Raster {
    readonly data: Float32Array;
    constructor(readonly size: number, readonly extent: number, fill = 0) {
        this.data = new Float32Array(size * size).fill(fill);
    }

    /** Pixel centre → shape units. */
    toWorld(i: number): number {
        return ((i + 0.5) / this.size * 2 - 1) * this.extent;
    }

    toPixel(w: number): number {
        return ((w / this.extent + 1) / 2) * this.size - 0.5;
    }

    /**
     * Visit every pixel within `margin` of the shape's box with its signed
     * distance; `fn` returns the new value (or undefined to keep it).
     */
    splat(s: Sdf2, margin: number, fn: (prev: number, d: number, x: number, y: number) => number | undefined): void {
        const i0 = Math.max(0, Math.floor(this.toPixel(s.box[0] - margin)));
        const i1 = Math.min(this.size - 1, Math.ceil(this.toPixel(s.box[2] + margin)));
        const j0 = Math.max(0, Math.floor(this.toPixel(s.box[1] - margin)));
        const j1 = Math.min(this.size - 1, Math.ceil(this.toPixel(s.box[3] + margin)));
        for (let j = j0; j <= j1; j++) {
            const y = this.toWorld(j);
            for (let i = i0; i <= i1; i++) {
                const x = this.toWorld(i);
                const d = s.d(x, y);
                if (d > margin) continue;
                const k = j * this.size + i;
                const nv = fn(this.data[k], d, x, y);
                if (nv !== undefined) this.data[k] = nv;
            }
        }
    }

    /** Per-pixel function of position (for analytic patterns). */
    paint(fn: (prev: number, x: number, y: number) => number): void {
        for (let j = 0; j < this.size; j++) {
            const y = this.toWorld(j);
            for (let i = 0; i < this.size; i++) {
                const k = j * this.size + i;
                this.data[k] = fn(this.data[k], this.toWorld(i), y);
            }
        }
    }

    clone(): Raster {
        const r = new Raster(this.size, this.extent);
        r.data.set(this.data);
        return r;
    }
}

/** Separable box blur, `passes` times (≈ gaussian for 3), radius in pixels. */
export function blur(src: Float32Array, size: number, radius: number, passes = 3): Float32Array {
    const r = Math.max(1, Math.round(radius));
    let a = Float32Array.from(src), b = new Float32Array(src.length);
    const w = 1 / (2 * r + 1);
    for (let p = 0; p < passes; p++) {
        for (let j = 0; j < size; j++) {
            const row = j * size;
            let acc = 0;
            for (let i = -r; i <= r; i++) acc += a[row + Math.min(size - 1, Math.max(0, i))];
            for (let i = 0; i < size; i++) {
                b[row + i] = acc * w;
                acc += a[row + Math.min(size - 1, i + r + 1)] - a[row + Math.max(0, i - r)];
            }
        }
        for (let i = 0; i < size; i++) {
            let acc = 0;
            for (let j = -r; j <= r; j++) acc += b[Math.min(size - 1, Math.max(0, j)) * size + i];
            for (let j = 0; j < size; j++) {
                a[j * size + i] = acc * w;
                acc += b[Math.min(size - 1, j + r + 1) * size + i] - b[Math.max(0, j - r) * size + i];
            }
        }
    }
    b = a;
    return b;
}
