/**
 * lib/coins/emblems.ts — what is sculpted on each coin's face.
 *
 * Every emblem is built from the same few tools: a 2D signed distance field
 * extruded into bevelled relief (₿, monograms, the bolt, the vortex, the sun,
 * cups and spokes), a swept tube (the knot), and faceted stones (the ETH
 * prism, the SUI pear, the POL hexagon, centre brilliants and pavé).
 *
 * Output is plain geometry + where it hangs, so the model can choose
 * materials and animate the pivots; `footprint` is the emblem's silhouette on
 * the field (for the baked contact shadow and the polished moat round it).
 */

import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import type { CoinGem, CoinSpec } from './catalog';
import {
    bezelStones, bipyramidGeometry, edgeFrameGeometry, fancyCutGeometry, FIELD_Z, knotGeometry, paveStones, pearOutline,
    polygonOutline, reliefGeometry, sdfRelief, shapesFromSvgPath, tierStones, type CoinStone,
} from './coinGeometry';
import { bitcoinSignSdf, textSdf } from './glyphs';
import { arc, circle, offset, place, polygon, segment, subtract, union, type Sdf2, type Vec2 } from './sdf2d';

/** Where a part hangs: fixed to the face, turning about the coin's axis, or floating in front. */
export type Pivot = 'face' | 'spin' | 'float';

export type PartMaterial = 'emblem' | 'trim' | 'enamel' | { gem: CoinGem };

export interface EmblemPart {
    name: string;
    geometry: BufferGeometry;
    /** One material, or one per geometry group (ExtrudeGeometry: [caps, sides]). */
    material: PartMaterial | PartMaterial[];
    pivot: Pivot;
}

export type EmblemMotion = 'none' | 'spin' | 'turn' | 'rock' | 'flicker';

export interface EmblemBuild {
    parts: EmblemPart[];
    /** Stones on the face (bezel, tier) and on/in the emblem, by pivot. */
    stones: Record<Pivot, CoinStone[]>;
    /** Silhouette on the field, coin units (null: none). */
    footprint: Sdf2 | null;
    motion: EmblemMotion;
    /** Height of the floating pivot above the field (coin units). */
    floatZ: number;
}

export interface EmblemOptions {
    /** Contour resolution for traced reliefs. */
    res?: number;
}

const RELIEF = { height: 0.062, bevel: 0.012, base: FIELD_Z };
/** Girdle height for pavé on a relief's flat top: crowns stand just proud of the metal. */
const PAVE_Z = FIELD_Z + RELIEF.height - 0.004 - 0.002;

/** Constant per-vertex seed/order so a single stone mesh can use the instanced gem shader. */
export function withGemAttributes(g: BufferGeometry, seed: number, order = 0): BufferGeometry {
    const n = g.getAttribute('position').count;
    g.setAttribute('aSeed', new Float32BufferAttribute(new Float32Array(n).fill(seed), 1));
    g.setAttribute('aOrder', new Float32BufferAttribute(new Float32Array(n).fill(order), 1));
    return g;
}

/** Table normal +Y → coin +Z (toward the viewer), then place. */
function stoneOnFace(g: BufferGeometry, size: number, z: number, x = 0, y = 0): BufferGeometry {
    g.applyMatrix4(new Matrix4().makeRotationX(Math.PI / 2).premultiply(new Matrix4().makeScale(size, size, size)).setPosition(x, y, z));
    return g;
}

const UP = new Vector3(0, 0, 1);

function centreStone(gem: CoinGem, size: number, z: number, cut: CoinStone['cut'] = 'brilliant'): CoinStone {
    return { cut, gem, pos: new Vector3(0, 0, z), up: UP, size, order: 0.5 };
}

export function buildEmblem(spec: CoinSpec, o: EmblemOptions = {}): EmblemBuild {
    const res = o.res ?? 192;
    const e = spec.emblem;
    const face: CoinStone[] = [...bezelStones(spec.bezel)];
    if (spec.tiered && spec.bezel.innerRow) face.push(...tierStones(spec.bezel.innerRow));
    const out: EmblemBuild = { parts: [], stones: { face, spin: [], float: [] }, footprint: null, motion: 'none', floatZ: 0 };
    const relief = (name: string, sdf: Sdf2, material: EmblemPart['material'], pivot: Pivot, r = RELIEF) => {
        const g = sdfRelief(sdf, { ...r, res });
        if (g) out.parts.push({ name, geometry: g, material, pivot });
    };

    if (e.svgPath) {
        const g = reliefGeometry(shapesFromSvgPath(e.svgPath, 0.92), RELIEF);
        if (g) out.parts.push({ name: 'logo', geometry: g, material: 'emblem', pivot: 'face' });
        out.footprint = circle(0, 0, 0.46);
        return out;
    }

    switch (e.kind) {
        case 'bitcoinSign': {
            const sdf = place(bitcoinSignSdf(0.1), 0.64);
            relief('₿', sdf, 'emblem', 'face');
            if (e.pave) out.stones.face.push(...paveStones(sdf, e.pave, PAVE_Z, 0.05));
            out.footprint = sdf;
            break;
        }
        case 'monogram': {
            const text = e.text ?? spec.symbol;
            const t = textSdf(text, 0.11, 0.16);
            if (!t) break;
            const s = Math.min(0.46, 1.06 / t.width);
            const sdf = place(t.sdf, s);
            relief(text, sdf, 'emblem', 'face');
            if (e.pave) out.stones.face.push(...paveStones(sdf, e.pave, PAVE_Z, Math.min(0.05, 0.22 * s * 0.92)));
            out.footprint = sdf;
            break;
        }
        case 'bolt': {
            const bolt = polygon(BOLT);
            // platinum frame below, enamel inlay standing proud of it (caps enamel, sides platinum)
            relief('bolt frame', offset(bolt, 0.038), 'trim', 'face', { height: 0.04, bevel: 0.01, base: FIELD_Z });
            relief('bolt inlay', bolt, ['enamel', 'trim'], 'face', { height: 0.072, bevel: 0.008, base: FIELD_Z });
            out.footprint = offset(bolt, 0.038);
            out.motion = 'flicker';
            break;
        }
        case 'vortex': {
            const arms: Sdf2[] = [];
            const ARMS = 5;
            for (let a = 0; a < ARMS; a++) {
                const pts: Vec2[] = [];
                for (let i = 0; i <= 22; i++) {
                    const th = (i / 22) * 3.4;
                    const r = 0.13 * Math.exp(0.4 * th);
                    const ang = th + (a / ARMS) * Math.PI * 2;
                    pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
                }
                for (let i = 0; i < pts.length - 1; i++) {
                    const w0 = 0.05 * (1 - i / 22) + 0.01, w1 = 0.05 * (1 - (i + 1) / 22) + 0.01;
                    arms.push(segment(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w0, w1));
                }
            }
            const sdf = union(...arms, arc(0, 0, 0.125, 0, Math.PI * 2, 0.022));
            relief('vortex', sdf, 'emblem', 'spin', { height: 0.05, bevel: 0.012, base: FIELD_Z });
            if (e.gem) out.stones.spin.push(centreStone(e.gem, 0.17, FIELD_Z + 0.035));
            out.footprint = sdf;
            out.motion = 'spin';
            break;
        }
        case 'sun': {
            const rays: Sdf2[] = [];
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2, long = i % 2 === 0;
                const r0 = 0.25, r1 = long ? 0.56 : 0.44, w = long ? 0.055 : 0.045;
                const c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
                rays.push(polygon([[c * r0 + px * w, s * r0 + py * w], [c * r1, s * r1], [c * r0 - px * w, s * r0 - py * w]]));
            }
            const disk = circle(0, 0, 0.2);
            relief('sun rays', union(...rays, arc(0, 0, 0.245, 0, Math.PI * 2, 0.018)), 'emblem', 'spin', { height: 0.045, bevel: 0.01, base: FIELD_Z });
            relief('sun disk', disk, 'emblem', 'spin', { height: 0.07, bevel: 0.014, base: FIELD_Z });
            if (e.gem) out.stones.spin.push(centreStone(e.gem, 0.2, FIELD_Z + 0.07 - 0.004 - 0.003));
            out.footprint = union(disk, ...rays);
            out.motion = 'spin';
            break;
        }
        case 'knot': {
            const k = knotGeometry(0.42, 0.05, 0.42);
            k.translate(0, 0, FIELD_Z + 0.05);
            out.parts.push({ name: 'knot', geometry: k, material: 'emblem', pivot: 'spin' });
            if (e.gem) out.stones.spin.push(centreStone(e.gem, 0.2, FIELD_Z + 0.012, 'cabochon'));
            const ring: Sdf2[] = [];
            for (let i = 0; i < 90; i++) {
                const a = (i / 90) * Math.PI * 2;
                const x = (Math.sin(a) + 2 * Math.sin(2 * a)) * 0.14, y = (Math.cos(a) - 2 * Math.cos(2 * a)) * 0.14;
                ring.push(circle(x, y, 0.06));
            }
            out.footprint = union(...ring);
            out.motion = 'spin';
            break;
        }
        case 'hexGem': {
            const outer = polygon(polygonOutline(6, 0.36, Math.PI / 6)), inner = polygon(polygonOutline(6, 0.29, Math.PI / 6));
            relief('hex cup', subtract(outer, inner), 'trim', 'spin', { height: 0.085, bevel: 0.012, base: FIELD_Z });
            const spokes = union(...polygonOutline(6, 1, Math.PI / 6).map(([x, y]) => segment(x * 0.36, y * 0.36, x * 0.6, y * 0.6, 0.016)));
            relief('hex spokes', spokes, 'trim', 'spin', { height: 0.03, bevel: 0.008, base: FIELD_Z });
            if (e.gem) {
                const g = stoneOnFace(fancyCutGeometry(polygonOutline(6, 0.5, Math.PI / 6), 0.16, 0.2, 0.6), 0.6, FIELD_Z + 0.07);
                out.parts.push({ name: 'hex stone', geometry: withGemAttributes(g, 0.37), material: { gem: e.gem }, pivot: 'spin' });
            }
            out.footprint = union(outer, spokes);
            out.motion = 'spin';
            break;
        }
        case 'pear': {
            const size = 0.62;
            const outline = pearOutline(28);
            // the stone's outline as it lies on the face (girdle plane XZ → coin XY, point up)
            const flat: Vec2[] = outline.map(([x, z]) => [x * size, -z * size]);
            const cup = polygon(flat);
            relief('pear cup', subtract(offset(cup, 0.034), offset(cup, -0.012)), 'trim', 'float', { height: 0.05, bevel: 0.01, base: 0 });
            if (e.gem) {
                const g = stoneOnFace(fancyCutGeometry(outline, 0.17, 0.26, 0.5), size, 0.03);
                out.parts.push({ name: 'pear stone', geometry: withGemAttributes(g, 0.61), material: { gem: e.gem }, pivot: 'float' });
            }
            out.footprint = offset(cup, 0.034);
            out.floatZ = FIELD_Z + 0.03;
            out.motion = 'rock';
            break;
        }
        case 'octahedron': {
            const { geometry, edges } = bipyramidGeometry(0.2, 0.36);
            const toFace = new Matrix4().makeRotationX(Math.PI / 2);
            geometry.applyMatrix4(toFace);
            out.parts.push({ name: 'prism', geometry: withGemAttributes(geometry, 0.83), material: { gem: e.gem ?? 'sapphire' }, pivot: 'float' });
            const frame = edgeFrameGeometry(edges, 0.011);
            frame.applyMatrix4(toFace);
            out.parts.push({ name: 'prism frame', geometry: frame, material: 'emblem', pivot: 'float' });
            out.footprint = polygon([[0, 0.36], [0.2, 0], [0, -0.36], [-0.2, 0]]);
            out.floatZ = 0.26;
            out.motion = 'turn';
            break;
        }
    }
    return out;
}

/** The lightning bolt (BOLT), coin units. */
const BOLT: Vec2[] = [
    [-0.1, 0.56], [0.27, 0.56], [0.07, 0.12], [0.29, 0.12], [-0.17, -0.58], [-0.01, -0.06], [-0.23, -0.06],
];
