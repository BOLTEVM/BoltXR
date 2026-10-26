/**
 * lib/coins/coinGems.ts — setting a coin's stones in a handful of draws.
 *
 * The same stone shader as the Iced-Out watches (reflection, fire, per-facet
 * scintillation, the dance patterns and star glints), with the coins' two
 * extra stones (tanzanite, aquamarine). One InstancedMesh per cut × stone,
 * plus one instanced glint layer, per pivot.
 */

import {
    BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, type ShaderMaterial,
} from 'three';
import { cutGeometry, type CutKind } from '../gems/gemGeometry';
import { createGemMaterial, createGlintMaterial, type GemUniforms } from '../gems/gemMaterial';
import { stoneMatrix, type StonePlacement } from '../gems/gemBatch';
import { COIN_GEMS, type CoinGem } from './catalog';
import type { CoinStone } from './coinGeometry';

export class CoinGemSet {
    private readonly mats = new Map<CoinGem, ShaderMaterial>();
    readonly glint: ShaderMaterial;

    constructor(readonly shared: GemUniforms, glintSize = 2.2) {
        this.glint = createGlintMaterial(shared, glintSize);
    }

    get(gem: CoinGem): ShaderMaterial {
        let m = this.mats.get(gem);
        if (!m) {
            m = createGemMaterial(COIN_GEMS[gem], this.shared, `Coin · ${gem}`);
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
/** stoneMatrix reads only position, table normal, long axis and size, which coin stones share with watch stones. */
const placement = (s: CoinStone) => s as unknown as StonePlacement;

function seeded(list: CoinStone[], base: number): number[] {
    return list.map((_, i) => {
        const v = Math.sin((base + i + 1) * 12.9898) * 43758.5453;
        return v - Math.floor(v);
    });
}

function withInstanceAttributes(geo: BufferGeometry, list: CoinStone[], seeds: number[]): void {
    geo.setAttribute('aSeed', new InstancedBufferAttribute(Float32Array.from(seeds), 1));
    geo.setAttribute('aOrder', new InstancedBufferAttribute(Float32Array.from(list.map(s => s.order)), 1));
}

/** Instanced stones (+ glints) for one pivot. Geometries are owned by the returned group. */
export function buildStones(stones: CoinStone[], mats: CoinGemSet, name: string, seedBase = 1, glints = true): Group {
    const group = new Group();
    group.name = `Coin · ${name}`;
    if (!stones.length) return group;
    const seeds = seeded(stones, seedBase);
    const buckets = new Map<string, { list: CoinStone[]; seeds: number[] }>();
    stones.forEach((s, i) => {
        const key = `${s.cut}|${(s.ratio ?? 0).toFixed(2)}|${s.gem}`;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { list: [], seeds: [] }));
        b.list.push(s);
        b.seeds.push(seeds[i]);
    });
    for (const [key, b] of buckets) {
        const [cut, ratio, gem] = key.split('|') as [CutKind, string, CoinGem];
        const geo = cutGeometry(cut, Number(ratio)).clone();
        withInstanceAttributes(geo, b.list, b.seeds);
        const mesh = new InstancedMesh(geo, mats.get(gem), b.list.length);
        mesh.name = `Coin · ${name} · ${gem} ${cut}`;
        b.list.forEach((p, i) => mesh.setMatrixAt(i, stoneMatrix(placement(p), _m)));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.frustumCulled = false;
        group.add(mesh);
    }
    if (glints) {
        const geo = new PlaneGeometry(1, 1);
        withInstanceAttributes(geo, stones, seeds);
        const mesh = new InstancedMesh(geo, mats.glint, stones.length);
        mesh.name = `Coin · ${name} · glints`;
        stones.forEach((p, i) => mesh.setMatrixAt(i, stoneMatrix(placement(p), _m)));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
        mesh.renderOrder = 10;
        group.add(mesh);
    }
    return group;
}
