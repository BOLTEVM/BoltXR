/**
 * lib/gems/gemBatch.ts — setting hundreds of stones in a handful of draws.
 *
 * Collect placements (cut, stone, position, table normal, orientation,
 * size, chase order), then `build()` turns them into one InstancedMesh per
 * cut × stone kind plus one instanced glint layer, all sharing the watch's
 * dance uniforms. Stones that move together (a rotating halo ring, the
 * floating stone, the crown) get their own batch under that moving parent.
 */

import {
    BufferGeometry, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry,
    Vector3, type Material, type ShaderMaterial,
} from 'three';
import { GEMS, type GemKind } from './catalog';
import { cutGeometry, type CutKind } from './gemGeometry';
import { createGemMaterial, createGlintMaterial, type GemUniforms } from './gemMaterial';

export interface StonePlacement {
    cut: CutKind;
    ratio?: number;
    gem: GemKind;
    /** Girdle centre. */
    pos: Vector3;
    /** Table normal (the stone looks this way). */
    up: Vector3;
    /** Long axis for baguettes / emerald cuts. */
    along?: Vector3;
    /** Girdle width, metres. */
    size: number;
    /** 0…1 position round its setting (the chase wave travels along it). */
    order: number;
    seed?: number;
}

/** One gem material per stone kind, plus the glint material, shared by every batch of a watch. */
export class GemMaterialSet {
    private readonly mats = new Map<GemKind, ShaderMaterial>();
    readonly glint: ShaderMaterial;

    constructor(readonly shared: GemUniforms, glintSize = 2.4) {
        this.glint = createGlintMaterial(shared, glintSize);
    }

    get(gem: GemKind): ShaderMaterial {
        let m = this.mats.get(gem);
        if (!m) {
            m = createGemMaterial(GEMS[gem], this.shared, `Watch · ${gem}`);
            this.mats.set(gem, m);
        }
        return m;
    }

    dispose(): void {
        for (const m of this.mats.values()) m.dispose();
        this.glint.dispose();
    }
}

const _m = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();

/** World-free placement → instance matrix (table normal = local +Y, long axis = local +X). */
export function stoneMatrix(p: StonePlacement, out = new Matrix4()): Matrix4 {
    _y.copy(p.up).normalize();
    if (p.along) _x.copy(p.along);
    else _x.set(1, 0, 0);
    _x.addScaledVector(_y, -_x.dot(_y));
    if (_x.lengthSq() < 1e-10) {
        _x.set(0, 0, 1).addScaledVector(_y, -_y.z);
        if (_x.lengthSq() < 1e-10) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
    }
    _x.normalize();
    _z.crossVectors(_x, _y);
    out.makeBasis(_x, _y, _z);
    out.scale(_z.set(p.size, p.size, p.size));
    out.setPosition(p.pos);
    return out;
}

export class GemBatch {
    readonly items: StonePlacement[] = [];
    private seedCounter = 0;

    constructor(private readonly seedBase = 1) {}

    add(p: StonePlacement): void {
        if (p.seed === undefined) p.seed = fract(Math.sin((this.seedBase + ++this.seedCounter) * 12.9898) * 43758.5453);
        this.items.push(p);
    }

    get count(): number {
        return this.items.length;
    }

    /** InstancedMeshes (one per cut × stone) + the glint layer, under one Group. */
    build(mats: GemMaterialSet, glints = true, name = 'stones'): Group {
        const group = new Group();
        group.name = `Watch · ${name}`;
        const buckets = new Map<string, StonePlacement[]>();
        for (const it of this.items) {
            const key = `${it.cut}|${(it.ratio ?? 0).toFixed(2)}|${it.gem}`;
            let b = buckets.get(key);
            if (!b) buckets.set(key, (b = []));
            b.push(it);
        }
        for (const [key, list] of buckets) {
            const [cut, ratio, gem] = key.split('|') as [CutKind, string, GemKind];
            const geo = cutGeometry(cut, Number(ratio)).clone();
            withInstanceAttributes(geo, list);
            const mesh = new InstancedMesh(geo, mats.get(gem), list.length);
            mesh.name = `Watch · ${name} · ${gem} ${cut}`;
            list.forEach((p, i) => mesh.setMatrixAt(i, stoneMatrix(p, _m)));
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
            mesh.frustumCulled = false; // tiny parts, moving parents — culling buys nothing here
            group.add(mesh);
        }
        if (glints && this.items.length) {
            const geo = new PlaneGeometry(1, 1);
            withInstanceAttributes(geo, this.items);
            const mesh = new InstancedMesh(geo, mats.glint, this.items.length);
            mesh.name = `Watch · ${name} · glints`;
            this.items.forEach((p, i) => mesh.setMatrixAt(i, stoneMatrix(p, _m)));
            mesh.instanceMatrix.needsUpdate = true;
            mesh.frustumCulled = false;
            mesh.renderOrder = 10;
            group.add(mesh);
        }
        return group;
    }
}

function withInstanceAttributes(geo: BufferGeometry, list: StonePlacement[]): void {
    const seed = new Float32Array(list.length), order = new Float32Array(list.length);
    list.forEach((p, i) => { seed[i] = p.seed ?? 0; order[i] = p.order; });
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1));
    geo.setAttribute('aOrder', new InstancedBufferAttribute(order, 1));
}

function fract(x: number): number {
    return x - Math.floor(x);
}

/** Setting beads / prongs: tiny polished spheres, one draw for the lot. */
export class BeadBatch {
    readonly pos: Vector3[] = [];
    readonly size: number[] = [];

    add(p: Vector3, radius: number): void {
        this.pos.push(p.clone());
        this.size.push(radius);
    }

    build(material: Material, detail = 1): InstancedMesh | null {
        if (!this.pos.length) return null;
        const mesh = new InstancedMesh(new IcosahedronGeometry(1, detail), material, this.pos.length);
        mesh.name = 'Watch · setting beads';
        this.pos.forEach((p, i) => {
            _m.makeScale(this.size[i], this.size[i], this.size[i]).setPosition(p);
            mesh.setMatrixAt(i, _m);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
        return mesh;
    }
}
