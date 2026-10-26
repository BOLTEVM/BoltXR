/**
 * lib/coins/holdings.ts — which coins appear, from what the wallet holds.
 *
 * A coin is shown for an asset only when the wallet has read a balance for it
 * and that balance is above zero. Nothing is shown "just in case": an asset
 * still loading, or one whose network has never answered, has no coin, and
 * is reported separately so the scene can say so instead of guessing.
 *
 * If a network that did answer before stops answering, its coin stays, with
 * the last balance read, marked stale (the wallet keeps the last known
 * balance on a failed refresh).
 *
 * Pure: no React, no three.js.
 */

import { coinFor, type CoinSpec } from './catalog';

export interface WalletAsset {
    chainKey: string;
    symbol: string;
    network: string;
    color: string;
    /** Whole units, full precision ("0" until read). */
    balance: string;
    status: 'loading' | 'success' | 'error';
    usdPrice?: number;
    usdValue?: number;
    tokenAddress?: string;
}

export interface Holding {
    /** Stable identity of the asset (chain + contract). */
    key: string;
    asset: WalletAsset;
    coin: CoinSpec;
    /** Balance as a number (for ordering and sizing only; display uses `asset.balance`). */
    amount: number;
    usd: number | null;
    /** Network did not answer the last refresh: this is the last balance read. */
    stale: boolean;
    /** Share of the portfolio's known USD value (0 when unpriced). */
    share: number;
    /** Size multiplier: bigger positions read as bigger coins (0.85…1.25). */
    scale: number;
}

export interface HoldingsView {
    coins: Holding[];
    /** Assets whose first balance read is still in flight. */
    pending: WalletAsset[];
    /** Assets whose network failed and for which no balance was ever read. */
    unreachable: WalletAsset[];
    /** Every asset has answered at least once (or failed). */
    settled: boolean;
}

export const assetKey = (a: Pick<WalletAsset, 'chainKey' | 'tokenAddress'>): string =>
    `${a.chainKey}:${a.tokenAddress ? a.tokenAddress.toLowerCase() : 'native'}`;

/** A decimal string strictly above zero (exact: no float rounding of dust). */
export function isPositiveAmount(value: string): boolean {
    const v = value.trim();
    if (!/^\d*\.?\d*$/.test(v) || v === '' || v === '.') return false;
    return /[1-9]/.test(v);
}

export function selectHoldings(assets: readonly WalletAsset[]): HoldingsView {
    const coins: Omit<Holding, 'share' | 'scale'>[] = [];
    const pending: WalletAsset[] = [];
    const unreachable: WalletAsset[] = [];
    const seen = new Set<string>();

    for (const asset of assets) {
        const key = assetKey(asset);
        if (seen.has(key)) continue;
        seen.add(key);
        const held = isPositiveAmount(asset.balance);
        if (asset.status === 'loading') {
            // a refresh in flight after a successful read keeps the coin
            if (held) coins.push(entry(asset, key, false));
            else pending.push(asset);
        } else if (asset.status === 'error') {
            if (held) coins.push(entry(asset, key, true));
            else unreachable.push(asset);
        } else if (held) {
            coins.push(entry(asset, key, false));
        }
    }

    const order = new Map(assets.map((a, i) => [assetKey(a), i]));
    coins.sort((a, b) => {
        if (a.usd !== null && b.usd !== null && a.usd !== b.usd) return b.usd - a.usd;
        if ((a.usd === null) !== (b.usd === null)) return a.usd === null ? 1 : -1;
        return (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0);
    });

    const total = coins.reduce((s, c) => s + (c.usd ?? 0), 0);
    const withSize: Holding[] = coins.map(c => {
        const share = total > 0 && c.usd !== null ? c.usd / total : 0;
        const scale = total > 0 && c.usd !== null ? clamp(0.85 + 0.4 * Math.sqrt(share), 0.85, 1.25) : 1;
        return { ...c, share, scale };
    });

    return { coins: withSize, pending, unreachable, settled: pending.length === 0 };
}

function entry(asset: WalletAsset, key: string, stale: boolean): Omit<Holding, 'share' | 'scale'> {
    const amount = Number(asset.balance);
    const usd = asset.usdValue !== undefined && Number.isFinite(asset.usdValue)
        ? asset.usdValue
        : asset.usdPrice !== undefined && Number.isFinite(asset.usdPrice) && Number.isFinite(amount)
            ? asset.usdPrice * amount
            : null;
    return { key, asset, coin: coinFor(asset), amount: Number.isFinite(amount) ? amount : 0, usd, stale };
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
}

// ── where the coins stand ────────────────────────────────────────────────────

export interface Slot {
    position: [number, number, number];
    /** Yaw that turns the coin's face toward the arc's centre (the viewer). */
    yaw: number;
}

export interface ArcOptions {
    /** Arc radius, metres (the coins stand this far from the viewer). */
    radius?: number;
    /** Angle between neighbouring coins, radians. */
    spacing?: number;
    /** Most coins on one row before a second row starts above. */
    perRow?: number;
    /** Height between rows, metres. */
    rowGap?: number;
}

/**
 * An arc of slots in front of the viewer, centred, largest holding in the
 * middle and the rest alternating outwards, so the eye lands on what matters.
 */
export function arcSlots(count: number, o: ArcOptions = {}): Slot[] {
    const radius = o.radius ?? 2.5, spacing = o.spacing ?? 0.3, perRow = o.perRow ?? 9, rowGap = o.rowGap ?? 0.8;
    const slots: Slot[] = [];
    const rows = Math.ceil(count / perRow);
    for (let row = 0; row < rows; row++) {
        const n = Math.min(perRow, count - row * perRow);
        for (let i = 0; i < n; i++) {
            // centre-out seats: odd rows 0, +1, −1, +2 …; even rows ±½, ±1½ … (no middle seat)
            const seat = n % 2 === 1
                ? (i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 === 1 ? 1 : -1))
                : (Math.floor(i / 2) + 0.5) * (i % 2 === 0 ? 1 : -1);
            const a = seat * spacing;
            slots.push({ position: [Math.sin(a) * radius, row * rowGap, -Math.cos(a) * radius], yaw: -a });
        }
    }
    return slots;
}
