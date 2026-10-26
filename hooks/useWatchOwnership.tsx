'use client';

/**
 * useWatchOwnership — which Iced-Out XR watches this device may wear.
 *
 * Only holders wear them: an edition is wearable when the vault's EVM address, or an address
 * linked with a signature, owns that token on chain (lib/mint/ownership.ts) — as read from the
 * chain THIS session. The last-known answer kept in storage is only for showing what you held;
 * it never puts a watch on a wrist (storage can be edited). Everyone else keeps the classic
 * Wrist OS watch and can try the watches on in the mint modal.
 *
 * The worn watch checks again by itself (lib/mint/holderCheck.ts) and self-destructs if this
 * gate was bypassed.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getAddress } from 'ethers';
import { useWallet } from './useWallet';
import { useSettings } from './useSettings';
import { MINT_CONFIG, mintDeployed } from '@/lib/mint/config';
import {
    cachedOwnership, fetchOwnership, lastVaultAddress, loadHolders, rememberVaultAddress, removeHolder, saveHolder,
    wearableEdition, type LinkedHolder, type Ownership,
} from '@/lib/mint/ownership';
import { errorMessage } from '@/lib/format';

export type OwnershipStatus = 'no-contract' | 'no-address' | 'checking' | 'ready' | 'error';

interface WatchOwnershipValue {
    status: OwnershipStatus;
    /** Token ids owned across the holder addresses, ascending. */
    owned: number[];
    byAddress: Record<string, number[]>;
    vaultAddress: string | null;
    holders: LinkedHolder[];
    error: string | null;
    /** Editions this session has seen held on chain (what may be worn). */
    verified: number[];
    canWear: (edition: number) => boolean;
    /** The edition actually worn: the chosen one if owned, else the first owned, else 0 (classic). */
    wornEdition: number;
    refresh: () => void;
    addHolder: (holder: LinkedHolder) => void;
    forgetHolder: (address: string) => void;
}

const Ctx = createContext<WatchOwnershipValue | undefined>(undefined);

const EMPTY: Ownership = { ids: [], byAddress: {} };

export function WatchOwnershipProvider({ children }: { children: React.ReactNode }) {
    const { addresses } = useWallet();
    const { watchEdition } = useSettings();
    const liveVault = addresses.ethereum || null;
    const [rememberedVault] = useState<string | null>(() => (typeof window === 'undefined' ? null : lastVaultAddress()));
    const [holders, setHolders] = useState<LinkedHolder[]>(() => (typeof window === 'undefined' ? [] : loadHolders()));
    const [result, setResult] = useState<{ key: string; ownership: Ownership; error: string | null; done: boolean }>({ key: '', ownership: EMPTY, error: null, done: false });
    const [nonce, setNonce] = useState(0);

    const vaultAddress = useMemo(() => {
        const a = liveVault || rememberedVault;
        try { return a ? getAddress(a) : null; } catch { return null; }
    }, [liveVault, rememberedVault]);

    useEffect(() => {
        if (liveVault) rememberVaultAddress(liveVault);
    }, [liveVault]);

    const list = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const a of [vaultAddress, ...holders.map(h => h.address)]) {
            if (a && !seen.has(a.toLowerCase())) { seen.add(a.toLowerCase()); out.push(a); }
        }
        return out;
    }, [vaultAddress, holders]);
    const key = list.join(',');

    useEffect(() => {
        if (!mintDeployed() || list.length === 0) return;
        let cancelled = false;
        // last-known answer first (offline, locked vault), then the chain
        Promise.resolve(cachedOwnership(list)).then(cached => {
            if (!cancelled) setResult(r => (r.key === key && r.done ? r : { key, ownership: cached, error: null, done: false }));
            // always from the chain: a cached answer can show what you held, never what you may wear
            return fetchOwnership(list, 0);
        }).then(ownership => {
            if (!cancelled) setResult({ key, ownership, error: null, done: true });
        }).catch(e => {
            if (!cancelled) setResult(r => ({ key, ownership: r.key === key ? r.ownership : cachedOwnership(list), error: errorMessage(e), done: true }));
        });
        const timer = window.setInterval(() => setNonce(n => n + 1), MINT_CONFIG.ownershipTtlMs);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, [key, list, nonce]);

    const current = result.key === key ? result : null;
    const owned = current?.ownership.ids ?? EMPTY.ids;
    const verified = current && current.done && !current.error ? current.ownership.ids : EMPTY.ids;
    const status: OwnershipStatus = !mintDeployed() ? 'no-contract'
        : list.length === 0 ? 'no-address'
            : !current?.done ? 'checking'
                : current.error ? 'error' : 'ready';

    const refresh = useCallback(() => setNonce(n => n + 1), []);
    const addHolder = useCallback((h: LinkedHolder) => setHolders(saveHolder(h)), []);
    const forgetHolder = useCallback((address: string) => setHolders(removeHolder(address)), []);

    const value = useMemo<WatchOwnershipValue>(() => ({
        status,
        owned,
        byAddress: current?.ownership.byAddress ?? {},
        vaultAddress,
        holders,
        error: current?.error ?? null,
        verified,
        canWear: (edition: number) => edition === 0 || verified.includes(edition),
        wornEdition: wearableEdition(watchEdition, verified),
        refresh,
        addHolder,
        forgetHolder,
    }), [status, owned, verified, current, vaultAddress, holders, watchEdition, refresh, addHolder, forgetHolder]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWatchOwnership(): WatchOwnershipValue {
    const v = useContext(Ctx);
    if (!v) throw new Error('useWatchOwnership must be used inside WatchOwnershipProvider');
    return v;
}
