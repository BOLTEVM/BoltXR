/**
 * lib/coins/CoinModel.ts — one living coin: sculpted, textured, animated.
 *
 * Framework-free three.js (the vault drives it from React; the render
 * harness drives it headless). Unit coin (radius 1, face +Z); scale `root`
 * to metres.
 *
 *   root
 *    ├ bloom            glow billboard behind the coin
 *    ├ hit              invisible disc: the only thing pointer rays test
 *    └ motion           drop-in, bob, scale (appear · hover · pulse · leave)
 *        ├ spin         sway, the occasional flip, the mint-in spin
 *        │   ├ body, obverse field, reverse field
 *        │   ├ face     emblem + bezel stones fixed to the face
 *        │   ├ turn     emblem parts turning about the coin's axis
 *        │   └ float    emblem floating in front (ETH prism, SUI pear)
 *        ├ halo / orbit holographic ring above, or the SUI orbit ring
 *        ├ streak       flare while pointed at
 *        └ burst        sparks when it mints in or its balance rises
 *
 * Animation states: appear (drops in spinning, lands with sparks and a
 * celebration of the stones) → idle (sway, bob, a flip now and then, stones
 * twinkling, halo telemetry running) ⇄ hover (turns to face you, grows,
 * stones chase, halo brightens, streak) · pulse (balance up: punch, sparks,
 * celebration; down: a dip) · stale (network not answering: halo goes red
 * and flickers, the coin wobbles) → leave (shrinks away; `gone` when done).
 */

import {
    CircleGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, PlaneGeometry, RingGeometry, TorusGeometry,
    Vector3, Vector4, type BufferGeometry, type Camera, type Material, type Object3D, type PerspectiveCamera,
} from 'three';
import { createGemUniforms, DANCE_WEIGHTS, type DanceMode, type GemUniforms } from '../gems/gemMaterial';
import { enamelMaterial, metalMaterial } from '../gems/materials';
import type { StudioEnvironment } from '../gems/studioEnv';
import { COIN_METALS, type CoinSpec } from './catalog';
import { BACK_FIELD_R, BACK_FIELD_Z, bodyGeometry, discGeometry, FIELD_R, FIELD_Z, type CoinStone } from './coinGeometry';
import { buildEmblem, type EmblemBuild, type PartMaterial, type Pivot } from './emblems';
import { buildStones, CoinGemSet } from './coinGems';
import { bakeCoinMaps, hashString, reedingNormalMap, type CoinMaps } from './coinTextures';
import { burstPoints, glowMaterial, haloMaterial, type BurstUniforms } from './coinFx';

export type CoinQuality = 'xr' | 'hero';

const QUALITY: Record<CoinQuality, { segments: number; disc: number; texture: number; contour: number }> = {
    xr: { segments: 120, disc: 72, texture: 384, contour: 160 },
    hero: { segments: 256, disc: 160, texture: 1024, contour: 256 },
};

/** Reeds round the edge. */
const REEDS = 150;

export interface CoinModelOptions {
    env: StudioEnvironment;
    quality?: CoinQuality;
    /** Softer sparkle, no flips or celebration strobe (Settings → calm). */
    calm?: boolean;
    /** Start already landed (no drop-in). */
    landed?: boolean;
    /** Flip over now and then while idle (default true; never when calm). */
    flips?: boolean;
    /** Seconds into the intro to start at: 0 drops in from above; ~1 just scales in; ≥ 1.3 is landed. */
    introAt?: number;
    /** Yield between texture baking steps (defaults to a macrotask). */
    yieldStep?: () => Promise<void> | void;
}

// ── shared, cached assets ────────────────────────────────────────────────────

interface CoinAssets {
    emblem: EmblemBuild;
    maps: Promise<CoinMaps>;
}

const assetCache = new Map<string, CoinAssets>();
const geoCache = new Map<string, BufferGeometry>();
let reeding: ReturnType<typeof reedingNormalMap> | null = null;

// setTimeout, not requestAnimationFrame: window rAF is paused during an immersive WebXR session
const macrotask = () => new Promise<void>(r => setTimeout(r, 0));

/** One bake at a time: the first coin's faces arrive first, and steps never pile up in one frame. */
let bakeQueue: Promise<unknown> = Promise.resolve();

function assetsFor(spec: CoinSpec, quality: CoinQuality, yieldStep?: () => Promise<void> | void): CoinAssets {
    const key = `${spec.id}|${quality}|${spec.emblem.svgPath ? hashString(spec.emblem.svgPath) : ''}`;
    let a = assetCache.get(key);
    if (!a) {
        const q = QUALITY[quality];
        const emblem = buildEmblem(spec, { res: q.contour });
        const maps = bakeQueue.then(() => bakeCoinMaps(spec, emblem.footprint, { size: q.texture, yieldStep: yieldStep ?? macrotask }));
        bakeQueue = maps.catch(() => undefined);
        a = { emblem, maps };
        assetCache.set(key, a);
    }
    return a;
}

function cachedGeo(key: string, make: () => BufferGeometry): BufferGeometry {
    let g = geoCache.get(key);
    if (!g) geoCache.set(key, (g = make()));
    return g;
}

/** Free every cached coin geometry and texture (e.g. when the XR scene unmounts for good). */
export async function disposeCoinCache(): Promise<void> {
    for (const a of assetCache.values()) {
        for (const p of a.emblem.parts) p.geometry.dispose();
        const m = await a.maps.catch(() => null);
        if (m) for (const f of [m.front, m.back]) { f.map.dispose(); f.normalMap.dispose(); f.ormMap.dispose(); f.emissiveMap?.dispose(); }
    }
    assetCache.clear();
    for (const g of geoCache.values()) g.dispose();
    geoCache.clear();
    reeding?.dispose();
    reeding = null;
}

/** Start building a coin's assets ahead of time (geometry now, textures in the background). */
export function prewarmCoin(spec: CoinSpec, quality: CoinQuality = 'xr'): Promise<void> {
    return assetsFor(spec, quality).maps.then(() => undefined);
}

// ── easing ───────────────────────────────────────────────────────────────────

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOutBack = (x: number) => { const c = 1.6; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeOutBounce = (x: number) => {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
};

const noRaycast = () => undefined;

// ── the model ────────────────────────────────────────────────────────────────

export class CoinModel {
    readonly root = new Group();
    readonly hit: Mesh;
    readonly spec: CoinSpec;

    private readonly motion = new Group();
    private readonly spin = new Group();
    private readonly face = new Group();
    private readonly turn = new Group();
    private readonly float = new Group();
    private readonly haloPivot = new Group();
    private readonly orbit = new Group();
    private readonly gemUniforms: GemUniforms;
    private readonly gems: CoinGemSet;
    private readonly ownedMaterials: Material[] = [];
    private readonly ownedGeometries: BufferGeometry[] = [];
    private readonly fieldFront: MeshPhysicalMaterial;
    private readonly fieldBack: MeshPhysicalMaterial;
    private readonly enamel: MeshPhysicalMaterial | null = null;
    private readonly halo: ReturnType<typeof haloMaterial> | null = null;
    private readonly bloom: ReturnType<typeof glowMaterial>;
    private readonly streak: ReturnType<typeof glowMaterial>;
    private readonly burst: ReturnType<typeof burstPoints>;
    private readonly emblem: EmblemBuild;
    private readonly phase: number;
    private readonly reeds: ReturnType<typeof reedingNormalMap>;

    private age = 0;
    private hoverTarget = 0;
    private hover = 0;
    private pulseT = Infinity;
    private dipT = Infinity;
    private staleK = 0;
    private staleTarget = 0;
    private leaveT = -1;
    private calm: boolean;
    private readonly flips: boolean;
    private disposed = false;
    private readonly dance = new Vector4(1, 0, 0, 0);

    constructor(spec: CoinSpec, o: CoinModelOptions) {
        this.spec = spec;
        this.calm = !!o.calm;
        this.flips = o.flips ?? true;
        const quality = o.quality ?? 'xr';
        const q = QUALITY[quality];
        const env = o.env;
        this.phase = (hashString(spec.id) % 1000) / 1000;
        this.root.name = `Coin · ${spec.symbol}`;
        // tooling and tests can reach the model from the scene graph
        this.root.userData.coinModel = this;
        this.age = o.landed ? 10 : Math.max(0, o.introAt ?? 0);

        // stones: one uniform set per coin so each dances on its own
        this.gemUniforms = createGemUniforms(env.cube, env.keyDirs, env.keyColors);
        this.gemUniforms.uDanceW.value = this.dance;
        this.gems = new CoinGemSet(this.gemUniforms, 2.0);

        // metals
        const rim = this.own(metalMaterial(COIN_METALS[spec.rim], env.pmrem, { name: `${spec.symbol} rim` }));
        const edge = this.own(metalMaterial(COIN_METALS[spec.rim], env.pmrem, { name: `${spec.symbol} edge` }));
        reeding ??= reedingNormalMap();
        // a clone shares the reeding's pixels, with its own repeat
        const reeds = (this.reeds = reeding.clone());
        reeds.repeat.set(REEDS, 1);
        reeds.needsUpdate = true;
        edge.normalMap = reeds;
        edge.normalScale.set(1.4, 1.4);
        edge.roughness = Math.min(1, edge.roughness + 0.06);
        const emblemMetal = this.own(metalMaterial(COIN_METALS[spec.emblem.metal], env.pmrem, { name: `${spec.symbol} emblem` }));
        emblemMetal.roughness *= 0.7;
        const trim = this.own(metalMaterial(COIN_METALS[spec.trim], env.pmrem, { name: `${spec.symbol} trim` }));
        if (spec.emblem.enamel) {
            this.enamel = this.own(enamelMaterial(spec.emblem.enamel, env.pmrem));
            this.enamel.envMapIntensity = 0.4; // saturated colour under the gloss, not a mirror
        }
        this.fieldFront = this.own(this.fieldMaterial(spec.field.finish, env, `${spec.symbol} obverse`));
        this.fieldBack = this.own(this.fieldMaterial(spec.trim, env, `${spec.symbol} reverse`));

        // body + fields (shared geometry)
        const body = new Mesh(cachedGeo(`body|${!!spec.tiered}|${q.segments}`, () => bodyGeometry(!!spec.tiered, q.segments)), [rim, edge]);
        body.name = 'Coin · body';
        const front = new Mesh(cachedGeo(`front|${q.disc}`, () => discGeometry(FIELD_R + 0.002, FIELD_Z, q.disc, 8)), this.fieldFront);
        const back = new Mesh(cachedGeo(`back|${q.disc}`, () => discGeometry(BACK_FIELD_R + 0.002, BACK_FIELD_Z, q.disc, 8, true)), this.fieldBack);
        front.name = 'Coin · obverse';
        back.name = 'Coin · reverse';
        this.spin.add(body, front, back, this.face, this.turn, this.float);

        // emblem + stones
        this.emblem = assetsFor(spec, quality, o.yieldStep).emblem;
        const pick = (m: PartMaterial): Material =>
            typeof m === 'object' ? this.gems.get(m.gem) : m === 'emblem' ? emblemMetal : m === 'trim' ? trim : (this.enamel ?? trim);
        const pivot: Record<Pivot, Group> = { face: this.face, spin: this.turn, float: this.float };
        for (const part of this.emblem.parts) {
            const mesh = new Mesh(part.geometry, Array.isArray(part.material) ? part.material.map(pick) : pick(part.material));
            mesh.name = `Coin · ${part.name}`;
            pivot[part.pivot].add(mesh);
        }
        this.float.position.z = this.emblem.floatZ;
        (Object.keys(pivot) as Pivot[]).forEach((p, i) => {
            const list: CoinStone[] = this.emblem.stones[p];
            if (list.length) pivot[p].add(buildStones(list, this.gems, `${spec.symbol} ${p} stones`, hashString(spec.id) % 997 + i * 101));
        });

        // halo, or the orbit ring
        if (spec.orbitRing) {
            const ringMat = this.own(metalMaterial(COIN_METALS[spec.orbitRing.metal], env.pmrem, { name: `${spec.symbol} orbit` }));
            const torus = this.ownGeo(new TorusGeometry(1.24, 0.032, 12, 160));
            const ring = new Mesh(torus, ringMat);
            const stones: CoinStone[] = [];
            const n = 120;
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2;
                stones.push({ cut: 'brilliant', gem: spec.orbitRing.gem, pos: new Vector3(Math.cos(a) * 1.24, Math.sin(a) * 1.24, 0.03), up: new Vector3(0, 0, 1), size: 0.056, order: i / n });
            }
            const spinRing = new Group();
            spinRing.add(ring, buildStones(stones, this.gems, `${spec.symbol} orbit stones`, 77));
            this.orbit.add(spinRing);
            this.orbit.rotation.set(1.18, 0.0, 0.42);
            this.motion.add(this.orbit);
        } else {
            this.halo = haloMaterial(spec.halo, spec.accent, 0.5, 0.86, (hashString(spec.id) % 97) / 7);
            this.own(this.halo);
            const ring = new Mesh(this.ownGeo(new RingGeometry(0.5, 0.86, 160, 1)), this.halo);
            ring.name = 'Coin · halo';
            this.haloPivot.add(ring);
            this.haloPivot.position.set(0, 1.34, 0.05);
            this.haloPivot.rotation.x = -Math.PI / 2 + 0.38;
            this.motion.add(this.haloPivot);
        }

        // glow
        this.bloom = this.own(glowMaterial('bloom', spec.accent, 3.4, -0.35));
        const bloom = new Mesh(this.ownGeo(new PlaneGeometry(1, 1)), this.bloom);
        bloom.name = 'Coin · bloom';
        bloom.frustumCulled = false;
        bloom.renderOrder = -1;
        this.streak = this.own(glowMaterial('streak', mixHex(spec.accent, '#ffffff', 0.55), 2.0, 0.25));
        const streak = new Mesh(this.ownGeo(new PlaneGeometry(1, 1)), this.streak);
        streak.name = 'Coin · streak';
        streak.frustumCulled = false;
        streak.renderOrder = 12;
        this.burst = burstPoints(mixHex(spec.accent, '#ffe6a8', 0.4), 60, hashString(spec.id));
        this.own(this.burst.material);
        this.ownGeo(this.burst.geometry);
        this.motion.add(this.spin, streak, this.burst);

        // pointer target: steady even while the coin is edge-on mid-flip. Drawn (so pointer systems
        // that skip invisible objects still find it) but writes neither colour nor depth.
        this.hit = new Mesh(this.ownGeo(new CircleGeometry(1.32, 32)), this.own(new MeshBasicMaterial({ side: DoubleSide, colorWrite: false, depthWrite: false })));
        this.hit.name = 'Coin · hit';
        this.motion.add(bloom);
        this.root.add(this.hit, this.motion);
        this.root.traverse(obj => {
            // stone batches clone their cut geometry: those copies are this coin's to free
            if ((obj as Mesh).isMesh && obj.name.includes('stones ·')) this.ownGeo((obj as Mesh).geometry);
            if (obj !== this.hit && (obj as Mesh).isMesh) (obj as Mesh).raycast = noRaycast;
            if ((obj as { isPoints?: boolean }).isPoints) (obj as Object3D).raycast = noRaycast;
        });

        // textures arrive when baked
        assetsFor(spec, quality, o.yieldStep).maps.then(maps => this.applyMaps(maps)).catch(() => undefined);
        this.update(0, 0);
    }

    // ── state ────────────────────────────────────────────────────────────────

    setHover(on: boolean): void {
        this.hoverTarget = on ? 1 : 0;
    }

    /** Balance went up (sparks, celebration) or down (a dip). */
    pulse(direction: 'up' | 'down'): void {
        if (this.leaveT >= 0) return;
        if (direction === 'up') this.pulseT = 0;
        else this.dipT = 0;
    }

    /** The network did not answer the last refresh: this coin shows its last known balance. */
    setStale(stale: boolean): void {
        this.staleTarget = stale ? 1 : 0;
    }

    setCalm(calm: boolean): void {
        this.calm = calm;
    }

    /** Start the exit animation (the coin is no longer held). */
    leave(): void {
        if (this.leaveT < 0) this.leaveT = 0;
    }

    /** Back after a leave started (the balance returned before it finished). */
    stay(): void {
        this.leaveT = -1;
    }

    /** Exit animation finished: unmount and dispose. */
    get gone(): boolean {
        return this.leaveT > 0.6;
    }

    get leaving(): boolean {
        return this.leaveT >= 0;
    }

    /** Current animation state (for tooling and tests). */
    get state(): { hover: number; stale: number; leaving: boolean; age: number } {
        return { hover: this.hover, stale: this.staleK, leaving: this.leaveT >= 0, age: this.age };
    }

    // ── per frame ────────────────────────────────────────────────────────────

    /**
     * Advance by `dt` seconds at scene time `t`. `camera` and `viewportHeight`
     * (CSS px of the drawing buffer) size the sparks.
     */
    update(dt: number, t: number, camera?: Camera, viewportHeight?: number): void {
        if (this.disposed) return;
        dt = Math.min(dt, 0.1);
        this.age += dt;
        if (this.leaveT >= 0) this.leaveT += dt;
        this.pulseT += dt;
        this.dipT += dt;
        // land → celebrate once
        if (this.age - dt < 0.62 && this.age >= 0.62 && this.leaveT < 0) this.pulseT = 0;
        const k = 1 - Math.exp(-dt * 9);
        this.hover += (this.hoverTarget * (this.leaveT >= 0 ? 0 : 1) - this.hover) * k;
        this.staleK += (this.staleTarget - this.staleK) * (1 - Math.exp(-dt * 4));
        const h = this.hover, ph = this.phase * 10;

        // appear / leave
        const ap = clamp01(this.age / 1.25);
        const lp = this.leaveT >= 0 ? easeInOut(clamp01(this.leaveT / 0.6)) : 0;
        const appearScale = this.age >= 1.25 ? 1 : Math.max(0.001, easeOutBack(ap));
        const drop = (1 - easeOutBounce(clamp01(this.age / 0.9))) * 1.8;
        const pulseK = this.pulseT < 1 ? Math.exp(-this.pulseT * 5) * Math.sin(this.pulseT * 22) : 0;
        const dipK = this.dipT < 0.8 ? Math.sin(clamp01(this.dipT / 0.8) * Math.PI) : 0;
        const scale = appearScale * (1 + 0.1 * h) * (1 + 0.14 * pulseK) * (1 - 0.1 * dipK) * (1 - lp);
        this.motion.scale.setScalar(Math.max(0.001, scale));
        this.motion.position.y = drop + Math.sin(t * 1.1 + ph) * 0.05 * (1 - h) - lp * 0.6;

        // sway, flip, mint-in spin
        const sway = Math.sin(t * 0.55 + ph) * 0.34 * (1 - h);
        let flip = 0;
        if (this.flips && !this.calm && this.age > 3) {
            const period = 12 + this.phase * 6, p = ((t + ph * 3) % period) / 1.5;
            if (p < 1) flip = easeInOut(p) * Math.PI * 2 * (1 - h);
        }
        const enterSpin = (1 - easeOutCubic(ap)) * Math.PI * 4;
        this.spin.rotation.y = sway + flip + enterSpin + lp * Math.PI * 1.5;
        this.spin.rotation.x = this.staleK * Math.sin(t * 2.2) * 0.22;

        // emblem motion
        switch (this.emblem.motion) {
            case 'spin': this.turn.rotation.z = -t * 0.45; break;
            case 'turn': this.float.rotation.y = t * 0.8; this.float.position.z = this.emblem.floatZ + Math.sin(t * 1.4) * 0.025; break;
            case 'rock': this.float.rotation.z = Math.sin(t * 0.9) * 0.1; this.float.rotation.y = Math.sin(t * 0.7) * 0.28; break;
            case 'flicker':
                if (this.enamel) this.enamel.emissiveIntensity = 0.14 + 0.36 * flicker(t) + 0.4 * h;
                break;
        }
        this.orbit.children[0]?.rotation.set(0, 0, t * 0.35);

        // light
        const glowPulse = this.pulseT < 2 ? Math.exp(-this.pulseT * 1.8) : 0;
        if (this.halo) {
            const u = this.halo.uniforms;
            u.uTime.value = t;
            u.uIntensity.value = (0.95 + 0.9 * h + 1.2 * glowPulse) * appearScale * (1 - lp) * (1 - 0.4 * dipK);
            u.uStale.value = this.staleK;
            this.haloPivot.rotation.z = t * 0.12;
        }
        this.bloom.uniforms.uIntensity.value = (0.13 + 0.22 * h + 0.55 * glowPulse) * (1 - lp);
        this.streak.uniforms.uIntensity.value = 0.6 * h * (1 - lp);
        if (this.fieldFront.emissiveMap) this.fieldFront.emissiveIntensity = 1.0 + 0.35 * Math.sin(t * 2.1 + ph) + 1.2 * glowPulse + 0.4 * h;

        const bu: BurstUniforms = this.burst.material.uniforms;
        bu.uT.value = this.pulseT < 1.6 ? this.pulseT : -1;
        bu.uScale.value = this.root.getWorldScale(_s).x;
        const pc = camera as PerspectiveCamera | undefined;
        if (pc?.isPerspectiveCamera && viewportHeight) bu.uPixel.value = viewportHeight / (2 * Math.tan((pc.fov * Math.PI) / 360));

        // stones: idle twinkle, chase while pointed at, celebration on a pulse
        const mode: DanceMode = this.leaveT >= 0 ? 'idle' : this.pulseT < 2.2 ? (this.calm ? 'pulse' : 'celebrate') : h > 0.4 ? 'chase' : 'idle';
        const w = DANCE_WEIGHTS[mode];
        const kd = 1 - Math.exp(-dt * 6);
        this.dance.set(this.dance.x + (w[0] - this.dance.x) * kd, this.dance.y + (w[1] - this.dance.y) * kd, this.dance.z + (w[2] - this.dance.z) * kd, this.dance.w + (w[3] - this.dance.w) * kd);
        this.gemUniforms.uTime.value = t;
        this.gemUniforms.uSparkle.value = this.calm ? 0.65 : 1;
        this.gemUniforms.uGlint.value = (this.calm ? 0.55 : 1) * (1 - lp);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.root.removeFromParent();
        for (const m of this.ownedMaterials) m.dispose();
        this.reeds.dispose();
        for (const g of this.ownedGeometries) g.dispose();
        this.gems.dispose();
    }

    // ── internals ────────────────────────────────────────────────────────────

    private own<T extends Material>(m: T): T {
        this.ownedMaterials.push(m);
        return m;
    }

    private ownGeo<T extends BufferGeometry>(g: T): T {
        this.ownedGeometries.push(g);
        return g;
    }

    private fieldMaterial(finish: CoinSpec['field']['finish'], env: StudioEnvironment, name: string): MeshPhysicalMaterial {
        if (finish === 'enamel') {
            return new MeshPhysicalMaterial({
                name: `Coin · ${name}`, color: new Color(1, 1, 1), metalness: 0, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03,
                envMap: env.pmrem, envMapIntensity: 1.1,
            });
        }
        const f = COIN_METALS[finish];
        const m = metalMaterial(f, env.pmrem, { name });
        m.color.setRGB(f.color[0], f.color[1], f.color[2]);
        return m;
    }

    private applyMaps(maps: CoinMaps): void {
        if (this.disposed) return;
        const set = (m: MeshPhysicalMaterial, f: CoinMaps['front'], enamel: boolean) => {
            m.map = f.map;
            m.normalMap = f.normalMap;
            m.normalScale.set(1, 1);
            m.roughnessMap = f.ormMap;
            m.roughness = 1;
            m.aoMap = f.ormMap;
            m.aoMapIntensity = 1;
            if (enamel) m.color.setRGB(1, 1, 1);
            if (f.emissiveMap) {
                m.emissiveMap = f.emissiveMap;
                m.emissive = new Color(this.spec.accent);
                m.emissiveIntensity = 1;
            }
            m.needsUpdate = true;
        };
        set(this.fieldFront, maps.front, this.spec.field.finish === 'enamel');
        set(this.fieldBack, maps.back, false);
    }
}

const _s = new Vector3();

function flicker(t: number): number {
    const a = Math.sin(t * 23.0) * Math.sin(t * 7.3 + 1.3);
    return a > 0.55 ? 1 : 0.35 + 0.3 * Math.sin(t * 3.1);
}

function mixHex(a: string, b: string, k: number): string {
    const ca = new Color(a), cb = new Color(b);
    return `#${ca.lerp(cb, k).getHexString()}`;
}
