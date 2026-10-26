/**
 * lib/coins/catalog.ts — the Currencychips coins as buildable specs.
 *
 * One spec per coin in Currencychips/manifest.json (ETH, BTC, QUAI, POL, BNB,
 * MON, SUI, TRX, SOL, BOLT): which metals the rim, field and emblem are cast
 * in, how the bezel is set, the emblem that is sculpted on the face, the
 * pattern engraved round it and the holographic halo above it. Any asset
 * without a designed coin gets one generated from its ticker and colour, so
 * a new chain or token never shows up as a blank.
 *
 * The faces carry the ticker and original emblems (a gem, a sun, a knot, a
 * bolt…) rather than redrawings of each network's official logo. A network's
 * own logo can be dropped in later as an SVG path (see `EmblemSpec.svgPath`).
 *
 * Pure data: no three.js, so the vault, the 2D wallet and tests can read it.
 */

import { GEMS, METALS, type GemKind, type GemOptics, type MetalFinish } from '../gems/catalog';

// ── materials ────────────────────────────────────────────────────────────────

export type CoinMetal = 'yellowGold' | 'whiteGold' | 'platinum' | 'roseGold' | 'titanium' | 'violetTitanium' | 'carbon' | 'obsidian' | 'gunmetal';

export const COIN_METALS: Record<CoinMetal, MetalFinish> = {
    yellowGold: METALS.yellowGold,
    whiteGold: METALS.whiteGold,
    platinum: METALS.platinum,
    roseGold: METALS.roseGold,
    titanium: METALS.titanium,
    carbon: METALS.carbon,
    obsidian: METALS.obsidian,
    /** Anodised titanium: the oxide film's interference colour. */
    violetTitanium: { color: [0.1, 0.04, 0.3], roughness: 0.3, brushed: true, clearcoat: 0.5, metalness: 1 },
    gunmetal: { color: [0.11, 0.11, 0.125], roughness: 0.2, brushed: false, clearcoat: 0.4, metalness: 1 },
};

export type CoinGem = GemKind | 'tanzanite' | 'aquamarine';

export const COIN_GEMS: Record<CoinGem, GemOptics> = {
    ...GEMS,
    tanzanite: { ior: 1.694, dispersion: 0.03, body: '#6d55ff', absorb: 2.3, opaque: 0 },
    aquamarine: { ior: 1.577, dispersion: 0.014, body: '#66e2f0', absorb: 1.1, opaque: 0 },
};

// ── what a coin is made of ───────────────────────────────────────────────────

/** How the outer bezel is set. */
export type BezelSetting =
    | 'pave'            // round brilliants, shoulder to shoulder
    | 'baguetteRadial'  // baguettes pointing out from the centre (sunburst bezel)
    | 'baguetteChannel' // baguettes end to end round the ring
    | 'emeraldChannel'; // emerald cuts end to end

export interface BezelSpec {
    setting: BezelSetting;
    gem: CoinGem;
    /** Every Nth stone is `accent` (2 = alternate). 0: none. */
    accentEvery: number;
    accent?: CoinGem;
    /** A second row of round brilliants on a raised inner tier (stepped coins). */
    innerRow?: CoinGem;
}

export type EmblemKind =
    | 'octahedron'   // faceted bipyramid gem with a platinum girdle, floating above the field
    | 'bitcoinSign'  // the ₿ currency sign, pavé-set
    | 'monogram'     // the ticker in raised geometric capitals
    | 'bolt'         // lightning bolt: enamel inlay in a platinum frame
    | 'knot'         // a braided trefoil knot round a cabochon
    | 'hexGem'       // hexagonal step-cut stone in a hex bezel cup
    | 'vortex'       // spiral vortex arms round a centre stone
    | 'pear'         // pear-cut stone lying in a prong cup
    | 'sun';         // sun disk with alternating long and short rays

export interface EmblemSpec {
    kind: EmblemKind;
    metal: CoinMetal;
    /** Stone(s) set in or on the emblem. */
    gem?: CoinGem;
    /** Pavé over the emblem's top face. */
    pave?: CoinGem;
    /** Enamel inlay colour (bolt). */
    enamel?: string;
    /** Monogram text (defaults to the ticker). */
    text?: string;
    /**
     * Optional: an official logo as one SVG path `d` (absolute M/L/C/Q/Z,
     * any viewBox) to sculpt instead of the built-in emblem, e.g. from a
     * network's brand kit. Left unset by default.
     */
    svgPath?: string;
}

/** What is engraved on the field. */
export type FieldPattern = 'circuit' | 'guilloche' | 'grid' | 'sunburst' | 'carbon' | 'matrix' | 'swirl' | 'ripples' | 'plain';

export interface FieldSpec {
    /** Metal, or 'enamel' (glossy colour). */
    finish: CoinMetal | 'enamel';
    enamel?: string;
    pattern: FieldPattern;
    /** A glowing inlay ring round the emblem (baked emissive), hex colour. */
    glowRing?: string;
}

/** The holographic complication floating above the coin. */
export type HaloStyle = 'data' | 'hash' | 'shard' | 'matrix' | 'hex' | 'stream' | 'orbit' | 'lightning' | 'plain';

export interface CoinSpec {
    id: string;
    symbol: string;
    /** Network name engraved on the legend. */
    network: string;
    /** Wallet chain keys whose native asset this coin is. */
    chainKeys: string[];
    /** Accent colour (glow, halo, labels). */
    accent: string;
    rim: CoinMetal;
    /** Second metal for lips and the reverse. */
    trim: CoinMetal;
    field: FieldSpec;
    bezel: BezelSpec;
    emblem: EmblemSpec;
    halo: HaloStyle;
    /** Diamond-set ring orbiting the coin (SUI). */
    orbitRing?: { metal: CoinMetal; gem: CoinGem };
    /** Raised inner tier (stepped bezel). */
    tiered?: boolean;
    /** Generated for an asset without a designed coin. */
    generated?: boolean;
}

export const COINS: Record<string, CoinSpec> = {
    eth: {
        id: 'eth', symbol: 'ETH', network: 'Ethereum', chainKeys: ['ethereum'], accent: '#5ee7ff',
        rim: 'yellowGold', trim: 'platinum', tiered: true,
        field: { finish: 'yellowGold', pattern: 'circuit' },
        bezel: { setting: 'pave', gem: 'diamond', accentEvery: 0, innerRow: 'diamond' },
        emblem: { kind: 'octahedron', metal: 'platinum', gem: 'sapphire' },
        halo: 'data',
    },
    btc: {
        id: 'btc', symbol: 'BTC', network: 'Bitcoin', chainKeys: ['bitcoin'], accent: '#ffb347',
        rim: 'yellowGold', trim: 'yellowGold',
        field: { finish: 'yellowGold', pattern: 'circuit' },
        bezel: { setting: 'baguetteRadial', gem: 'diamond', accentEvery: 0 },
        emblem: { kind: 'bitcoinSign', metal: 'yellowGold', pave: 'canary' },
        halo: 'hash',
    },
    quai: {
        id: 'quai', symbol: 'QUAI', network: 'Quai Network', chainKeys: ['quai', 'quai_orchard'], accent: '#ff3b55',
        rim: 'roseGold', trim: 'roseGold',
        field: { finish: 'roseGold', pattern: 'grid' },
        bezel: { setting: 'pave', gem: 'ruby', accentEvery: 2, accent: 'diamond' },
        emblem: { kind: 'knot', metal: 'roseGold', gem: 'ruby' },
        halo: 'shard',
    },
    pol: {
        id: 'pol', symbol: 'POL', network: 'Polygon', chainKeys: ['polygon'], accent: '#a855f7',
        rim: 'whiteGold', trim: 'platinum',
        field: { finish: 'gunmetal', pattern: 'matrix', glowRing: '#a855f7' },
        bezel: { setting: 'baguetteRadial', gem: 'amethyst', accentEvery: 0 },
        emblem: { kind: 'hexGem', metal: 'platinum', gem: 'amethyst' },
        halo: 'matrix',
    },
    bnb: {
        id: 'bnb', symbol: 'BNB', network: 'BNB Smart Chain', chainKeys: ['bsc'], accent: '#ffd25a',
        rim: 'yellowGold', trim: 'yellowGold',
        field: { finish: 'yellowGold', pattern: 'guilloche' },
        bezel: { setting: 'pave', gem: 'canary', accentEvery: 2, accent: 'carbonado' },
        emblem: { kind: 'monogram', metal: 'yellowGold', pave: 'diamond' },
        halo: 'hex',
    },
    mon: {
        id: 'mon', symbol: 'MON', network: 'Monad', chainKeys: ['monad'], accent: '#8b7bff',
        rim: 'yellowGold', trim: 'platinum',
        field: { finish: 'violetTitanium', pattern: 'swirl' },
        bezel: { setting: 'pave', gem: 'diamond', accentEvery: 6, accent: 'tanzanite' },
        emblem: { kind: 'vortex', metal: 'platinum', gem: 'tanzanite' },
        halo: 'stream',
    },
    sui: {
        id: 'sui', symbol: 'SUI', network: 'Sui', chainKeys: ['sui'], accent: '#5fe1ff',
        rim: 'platinum', trim: 'whiteGold',
        field: { finish: 'platinum', pattern: 'ripples' },
        bezel: { setting: 'pave', gem: 'diamond', accentEvery: 0 },
        emblem: { kind: 'pear', metal: 'platinum', gem: 'aquamarine' },
        halo: 'orbit',
        orbitRing: { metal: 'yellowGold', gem: 'diamond' },
    },
    trx: {
        id: 'trx', symbol: 'TRX', network: 'Tron', chainKeys: ['tron'], accent: '#ff2d55',
        rim: 'yellowGold', trim: 'yellowGold',
        field: { finish: 'yellowGold', pattern: 'circuit' },
        bezel: { setting: 'baguetteChannel', gem: 'ruby', accentEvery: 2, accent: 'diamond' },
        emblem: { kind: 'monogram', metal: 'yellowGold' },
        halo: 'data',
    },
    sol: {
        id: 'sol', symbol: 'SOL', network: 'Solana', chainKeys: ['solana'], accent: '#14f195',
        rim: 'yellowGold', trim: 'yellowGold',
        field: { finish: 'carbon', pattern: 'carbon', glowRing: '#14f195' },
        bezel: { setting: 'emeraldChannel', gem: 'emerald', accentEvery: 2, accent: 'amethyst' },
        emblem: { kind: 'sun', metal: 'yellowGold', gem: 'emerald' },
        halo: 'data',
    },
    bolt: {
        id: 'bolt', symbol: 'BOLT', network: 'BOLTEVM', chainKeys: ['boltevm'], accent: '#5ef9ff',
        rim: 'yellowGold', trim: 'platinum',
        field: { finish: 'yellowGold', pattern: 'sunburst' },
        bezel: { setting: 'baguetteRadial', gem: 'diamond', accentEvery: 0 },
        emblem: { kind: 'bolt', metal: 'platinum', enamel: '#0583c2' },
        halo: 'lightning',
    },
};

/** Designed coins, in the order the manifest lists them. */
export const COIN_ORDER = ['eth', 'btc', 'quai', 'pol', 'bnb', 'mon', 'sui', 'trx', 'bolt', 'sol'] as const;

// ── matching a wallet asset to its coin ──────────────────────────────────────

export interface AssetRef {
    chainKey: string;
    symbol: string;
    network?: string;
    color?: string;
    /** Set for contract tokens; natives leave it unset. */
    tokenAddress?: string;
}

const BY_CHAIN = new Map<string, string>();
for (const c of Object.values(COINS)) for (const k of c.chainKeys) BY_CHAIN.set(k, c.id);
const BY_SYMBOL = new Map(Object.values(COINS).map(c => [c.symbol, c.id]));

const generatedCache = new Map<string, CoinSpec>();

/**
 * The coin for a wallet asset: a chain's native asset gets its chain's coin;
 * a token whose ticker has a designed coin gets that one; anything else gets
 * a coin generated from its ticker and colour (stable for the same asset).
 */
export function coinFor(asset: AssetRef): CoinSpec {
    if (!asset.tokenAddress) {
        const id = BY_CHAIN.get(asset.chainKey);
        if (id) return COINS[id];
    }
    const bySymbol = BY_SYMBOL.get(asset.symbol.toUpperCase());
    if (bySymbol) return COINS[bySymbol];
    const key = `${asset.chainKey}:${asset.tokenAddress ?? ''}:${asset.symbol}`;
    let spec = generatedCache.get(key);
    if (!spec) {
        spec = generatedCoin(asset);
        generatedCache.set(key, spec);
    }
    return spec;
}

/** Ticker letters the monogram font can draw (others are dropped). */
export const MONOGRAM_CHARS = /[A-Z0-9]/;

function generatedCoin(asset: AssetRef): CoinSpec {
    const symbol = asset.symbol.toUpperCase();
    const text = [...symbol].filter(ch => MONOGRAM_CHARS.test(ch)).join('').slice(0, 4) || '?';
    const accent = /^#[0-9a-f]{6}$/i.test(asset.color ?? '') ? (asset.color as string) : '#c8a24a';
    // a dark accent colour (e.g. XRP's near-black) still needs a visible field
    const enamel = luminance(accent) < 0.08 ? '#3a4150' : accent;
    return {
        id: `gen:${asset.chainKey}:${asset.tokenAddress ?? 'native'}:${symbol}`,
        symbol,
        network: asset.network ?? asset.chainKey,
        chainKeys: [asset.chainKey],
        accent: luminance(accent) < 0.08 ? '#c8d2e6' : accent,
        rim: 'yellowGold',
        trim: 'yellowGold',
        field: { finish: 'enamel', enamel, pattern: 'guilloche' },
        bezel: { setting: 'pave', gem: 'diamond', accentEvery: 0 },
        emblem: { kind: 'monogram', metal: 'yellowGold', text },
        halo: 'data',
        generated: true,
    };
}

/** Relative luminance of an sRGB hex colour (0…1). */
export function luminance(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
