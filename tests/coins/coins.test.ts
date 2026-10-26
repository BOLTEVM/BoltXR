import { describe, expect, test } from 'bun:test';
import { Box3, BufferGeometry, Vector3 } from 'three';
import { COINS, COIN_ORDER, coinFor } from '../../lib/coins/catalog';
import { arcSlots, isPositiveAmount, selectHoldings, type WalletAsset } from '../../lib/coins/holdings';
import { circle, outlines, polygon, segment, signedArea, traceContours, union } from '../../lib/coins/sdf2d';
import { textSdf, bitcoinSignSdf, hasGlyph } from '../../lib/coins/glyphs';
import { bezelStones, bodyGeometry, discGeometry, FIELD_Z, SEAT_R0, SEAT_R1, shapesFromSvgPath } from '../../lib/coins/coinGeometry';
import { buildEmblem } from '../../lib/coins/emblems';
import { bakeCoinMaps, normalsFromHeight } from '../../lib/coins/coinTextures';
import { CHAINS, SELECTED_CHAINS } from '../../lib/boltows/chains';

const asset = (chainKey: string, balance: string, status: WalletAsset['status'] = 'success', usdValue?: number): WalletAsset => ({
    chainKey, symbol: CHAINS[chainKey]?.nativeCurrency.symbol ?? chainKey.toUpperCase(), network: CHAINS[chainKey]?.name ?? chainKey,
    color: CHAINS[chainKey]?.color ?? '#888888', balance, status, usdValue,
});

describe('catalog', () => {
    test('every chain the wallet shows has a designed coin', () => {
        for (const key of SELECTED_CHAINS) {
            const c = coinFor({ chainKey: key, symbol: CHAINS[key].nativeCurrency.symbol });
            expect(c.generated).toBeFalsy();
            expect(c.chainKeys).toContain(key);
            expect(c.symbol).toBe(CHAINS[key].nativeCurrency.symbol);
        }
    });

    test('all ten Currencychips coins are designed', () => {
        expect(COIN_ORDER.length).toBe(10);
        for (const id of COIN_ORDER) expect(COINS[id].id).toBe(id);
    });

    test('a token on a chain is not mistaken for the chain coin', () => {
        const usdt = coinFor({ chainKey: 'ethereum', symbol: 'USDT', tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', color: '#26a17b' });
        expect(usdt.generated).toBe(true);
        expect(usdt.emblem.text).toBe('USDT');
        // and the same asset gets the same coin every time
        expect(coinFor({ chainKey: 'ethereum', symbol: 'USDT', tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7' })).toBe(usdt);
    });

    test('chains without a design get a generated coin readable even with a dark colour', () => {
        const xrp = coinFor({ chainKey: 'xrpl_evm', symbol: 'XRP', color: '#23292F' });
        expect(xrp.generated).toBe(true);
        expect(xrp.field.enamel).not.toBe('#23292F');
    });
});

describe('holdings: only what the wallet holds becomes a coin', () => {
    test('zero balances and unread chains show no coin', () => {
        const v = selectHoldings([asset('ethereum', '0.5', 'success', 1500), asset('bitcoin', '0'), asset('sui', '0', 'loading'), asset('tron', '0', 'error')]);
        expect(v.coins.map(c => c.asset.chainKey)).toEqual(['ethereum']);
        expect(v.pending.map(a => a.chainKey)).toEqual(['sui']);
        expect(v.unreachable.map(a => a.chainKey)).toEqual(['tron']);
        expect(v.settled).toBe(false);
    });

    test('a fresh wallet (all placeholders loading) shows nothing yet', () => {
        const v = selectHoldings(SELECTED_CHAINS.map(k => asset(k, '0', 'loading')));
        expect(v.coins).toHaveLength(0);
        expect(v.pending).toHaveLength(SELECTED_CHAINS.length);
    });

    test('an empty wallet that has answered is settled with no coins', () => {
        const v = selectHoldings(SELECTED_CHAINS.map(k => asset(k, '0')));
        expect(v.coins).toHaveLength(0);
        expect(v.settled).toBe(true);
    });

    test('a network that stops answering keeps its coin, marked stale', () => {
        const v = selectHoldings([asset('bitcoin', '0.01', 'error')]);
        expect(v.coins[0].stale).toBe(true);
    });

    test('dust counts as held (no float rounding)', () => {
        expect(isPositiveAmount('0.000000000000000001')).toBe(true);
        expect(isPositiveAmount('0.000000')).toBe(false);
        expect(isPositiveAmount('')).toBe(false);
        expect(isPositiveAmount('abc')).toBe(false);
    });

    test('largest USD position first, unpriced after, sizes follow share', () => {
        const v = selectHoldings([asset('polygon', '10', 'success', 5), asset('bitcoin', '0.1', 'success', 6000), asset('sui', '3'), asset('ethereum', '1', 'success', 2500)]);
        expect(v.coins.map(c => c.asset.chainKey)).toEqual(['bitcoin', 'ethereum', 'polygon', 'sui']);
        expect(v.coins[0].scale).toBeGreaterThan(v.coins[2].scale);
        expect(v.coins[3].scale).toBe(1);
        for (const c of v.coins) expect(c.scale).toBeGreaterThanOrEqual(0.85);
    });
});

describe('layout', () => {
    test('slots are centred, face the viewer and never overlap', () => {
        for (const n of [1, 2, 3, 8, 12]) {
            const s = arcSlots(n);
            expect(s).toHaveLength(n);
            const xs = s.map(p => p.position[0]);
            expect(Math.abs(xs.reduce((a, b) => a + b, 0) / n)).toBeLessThan(n > 9 ? 1.5 : 1e-9);
            for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
                const d = Math.hypot(s[i].position[0] - s[j].position[0], s[i].position[1] - s[j].position[1], s[i].position[2] - s[j].position[2]);
                expect(d).toBeGreaterThan(0.6);
            }
            // yaw turns +Z toward the origin
            for (const p of s) {
                const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
                const tx = -p.position[0], tz = -p.position[2], L = Math.hypot(tx, tz);
                expect(fx * tx / L + fz * tz / L).toBeGreaterThan(0.999);
            }
        }
        expect(arcSlots(1)[0].position[0]).toBe(0);
    });
});

describe('sdf + contours', () => {
    test('a ring traces to one outer with one hole', () => {
        const ring = { d: (x: number, y: number) => Math.abs(Math.hypot(x, y) - 0.5) - 0.1, box: [-0.6, -0.6, 0.6, 0.6] as [number, number, number, number] };
        const o = outlines(traceContours(ring, 128).loops);
        expect(o).toHaveLength(1);
        expect(o[0].holes).toHaveLength(1);
        expect(signedArea(o[0].outer)).toBeGreaterThan(0);
        const area = signedArea(o[0].outer) + signedArea(o[0].holes[0]);
        expect(area).toBeCloseTo(Math.PI * (0.6 ** 2 - 0.4 ** 2), 2);
    });

    test('a circle traces close to its true outline', () => {
        const o = outlines(traceContours(circle(0, 0, 0.4), 160).loops);
        expect(signedArea(o[0].outer)).toBeCloseTo(Math.PI * 0.16, 2);
    });

    test('glyph letters with counters get holes (B, O, A, R)', () => {
        for (const [ch, holes] of [['B', 2], ['O', 1], ['A', 1], ['R', 1], ['T', 0]] as const) {
            const t = textSdf(ch, 0.1)!;
            const o = outlines(traceContours(t.sdf, 160).loops);
            expect(o).toHaveLength(1);
            expect(o[0].holes.length).toBe(holes);
        }
    });

    test('₿ is one piece with the B counters as holes', () => {
        const o = outlines(traceContours(bitcoinSignSdf(0.1), 192).loops);
        expect(o).toHaveLength(1);
        expect(o[0].holes.length).toBe(2);
    });

    test('every ticker the wallet knows can be lettered', () => {
        for (const c of Object.values(CHAINS)) for (const ch of c.nativeCurrency.symbol) expect(hasGlyph(ch)).toBe(true);
    });

    test('polygon sdf is negative inside, positive outside', () => {
        const p = polygon([[0, 0], [1, 0], [1, 1], [0, 1]]);
        expect(p.d(0.5, 0.5)).toBeCloseTo(-0.5, 6);
        expect(p.d(2, 0.5)).toBeCloseTo(1, 6);
        expect(union(segment(0, 0, 1, 0, 0.1), circle(3, 0, 0.5)).d(3, 0)).toBeCloseTo(-0.5, 6);
    });
});

describe('sculpt', () => {
    const facing = (g: BufferGeometry) => {
        // fraction of triangles whose winding agrees with their stored normal
        const p = g.getAttribute('position'), n = g.getAttribute('normal'), idx = g.getIndex();
        const tri = idx ? idx.count / 3 : p.count / 3;
        let ok = 0;
        const a = new Vector3(), b = new Vector3(), c = new Vector3(), nn = new Vector3();
        for (let t = 0; t < tri; t++) {
            const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
            a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
            const f = b.clone().sub(a).cross(c.clone().sub(a));
            if (f.lengthSq() < 1e-14) { ok++; continue; }
            nn.fromBufferAttribute(n, i0).add(new Vector3().fromBufferAttribute(n, i1)).add(new Vector3().fromBufferAttribute(n, i2));
            if (f.dot(nn) > 0) ok++;
        }
        return ok / tri;
    };

    test('the coin body is closed round, wound outward, unit radius', () => {
        for (const tiered of [false, true]) {
            const g = bodyGeometry(tiered, 96);
            expect(facing(g)).toBeGreaterThan(0.999);
            const box = new Box3().setFromBufferAttribute(g.getAttribute('position') as never);
            expect(box.max.x).toBeCloseTo(1, 3);
            expect(box.max.z).toBeLessThan(0.13);
            expect(g.groups.map(gr => gr.materialIndex)).toContain(1);
        }
    });

    test('field discs face out on both sides', () => {
        expect(facing(discGeometry(0.7, 0.05, 48, 4))).toBeGreaterThan(0.999);
        expect(facing(discGeometry(0.88, -0.075, 48, 4, true))).toBeGreaterThan(0.999);
    });

    test('every coin builds its emblem within the field, on the face', () => {
        for (const id of COIN_ORDER) {
            const e = buildEmblem(COINS[id], { res: 128 });
            expect(e.parts.length + e.stones.spin.length).toBeGreaterThan(0);
            for (const part of e.parts) {
                part.geometry.computeBoundingBox();
                const bb = part.geometry.boundingBox!;
                expect(Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.y), Math.abs(bb.max.y))).toBeLessThan(0.7);
                // nothing pokes through the reverse
                expect(bb.min.z + (part.pivot === 'float' ? e.floatZ : 0)).toBeGreaterThan(-0.075);
            }
            expect(e.footprint).not.toBeNull();
        }
    });

    test('bezel stones stay on the seat and do not overlap', () => {
        for (const id of COIN_ORDER) {
            const s = bezelStones(COINS[id].bezel);
            expect(s.length).toBeGreaterThan(24);
            for (const st of s) {
                const r = Math.hypot(st.pos.x, st.pos.y);
                expect(r).toBeGreaterThan(SEAT_R0 - 0.01);
                expect(r).toBeLessThan(SEAT_R1 + 0.01);
            }
            // neighbours in the same row are at least a stone apart (round stones)
            if (s[0].cut === 'brilliant') {
                const d = s[0].pos.distanceTo(s[1].pos);
                expect(d).toBeGreaterThanOrEqual(s[0].size * 0.99);
            }
        }
    });

    test('pavé sits on the emblem top', () => {
        const e = buildEmblem(COINS.btc, { res: 128 });
        const pave = e.stones.face.filter(s => s.gem === 'canary');
        expect(pave.length).toBeGreaterThan(15);
        for (const s of pave) expect(s.pos.z).toBeGreaterThan(FIELD_Z + 0.03);
    });

    test('an SVG logo path can replace the emblem', () => {
        const shapes = shapesFromSvgPath('M10 10 L90 10 L90 90 L10 90 Z M30 30 L30 70 L70 70 L70 30 Z');
        expect(shapes.length).toBeGreaterThan(0);
        const e = buildEmblem({ ...COINS.eth, emblem: { ...COINS.eth.emblem, svgPath: 'M0 0 L100 0 L50 90 Z' } });
        expect(e.parts.map(p => p.name)).toEqual(['logo']);
    });
});

describe('texture', () => {
    test('a flat height field gives straight-up normals', () => {
        const n = normalsFromHeight(new Float32Array(16 * 16), 16, 2);
        expect([n[0], n[1], n[2]]).toEqual([128, 128, 255]);
    });

    test('a slope tilts the normal away from the rise', () => {
        const s = 32, h = new Float32Array(s * s);
        for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) h[j * s + i] = i * 0.1;
        const n = normalsFromHeight(h, s, 1);
        const k = (16 * s + 16) * 4;
        expect(n[k]).toBeLessThan(128); // -x
        expect(Math.abs(n[k + 1] - 128)).toBeLessThan(2);
    });

    test('every coin bakes both faces deterministically', async () => {
        for (const id of ['eth', 'pol', 'sol'] as const) {
            const spec = COINS[id];
            const e = buildEmblem(spec, { res: 96 });
            const a = await bakeCoinMaps(spec, e.footprint, { size: 128 });
            const b = await bakeCoinMaps(spec, e.footprint, { size: 128 });
            expect(a.front.map.image.width).toBe(128);
            expect(Buffer.from(a.front.normalMap.image.data as Uint8Array).equals(Buffer.from(b.front.normalMap.image.data as Uint8Array))).toBe(true);
            expect(!!a.front.emissiveMap).toBe(!!spec.field.glowRing || spec.field.pattern === 'matrix');
            // the field is not blank: the pattern and legend engrave it
            const d = a.front.normalMap.image.data as Uint8Array;
            let tilted = 0;
            for (let k = 0; k < d.length; k += 4) if (Math.abs(d[k] - 128) > 6 || Math.abs(d[k + 1] - 128) > 6) tilted++;
            expect(tilted / (d.length / 4)).toBeGreaterThan(0.03);
        }
    });
});
