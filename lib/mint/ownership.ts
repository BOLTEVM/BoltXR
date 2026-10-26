/**
 * lib/mint/ownership.ts — which Iced-Out XR watches this device's holder addresses own.
 *
 * Holder addresses are the vault's own EVM address plus any address linked with a signature
 * (proving the person controls it — pasting someone else's address does not unlock anything).
 * Ownership is read from the contract (`tokensOfOwner`) and cached for a few minutes, plus a
 * last-known copy so a watch keeps showing offline or while the vault is locked.
 *
 * This is client-side gating: it keeps the watches to holders in this app, but a determined
 * person who rewrites the app's JavaScript could bypass it. See docs/iced-watches.md.
 */

import { getAddress, verifyMessage } from 'ethers';
import { MINT_CONFIG, mintDeployed } from './config';
import { watchContract } from './client';

const OWNED_KEY = 'bolt_watch_owned_v1';
const HOLDERS_KEY = 'bolt_watch_holders_v1';
const VAULT_KEY = 'bolt_watch_vault_address';

interface OwnedEntry { ids: number[]; at: number; chain: number; contract: string }

const read = <T>(key: string, fallback: T): T => {
    try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
};
const write = (key: string, value: unknown) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode / quota */ }
};

const sameCollection = (e: OwnedEntry | undefined): e is OwnedEntry =>
    !!e && e.chain === MINT_CONFIG.chain.chainId && e.contract.toLowerCase() === MINT_CONFIG.contract.toLowerCase();

/** Last known tokens of `address` (any age), or null. */
export function cachedTokensOf(address: string): number[] | null {
    const e = read<Record<string, OwnedEntry>>(OWNED_KEY, {})[address.toLowerCase()];
    return sameCollection(e) ? e.ids : null;
}

/** Tokens `address` owns, from the chain unless a fresh answer is cached. */
export async function tokensOf(address: string, maxAgeMs: number = MINT_CONFIG.ownershipTtlMs): Promise<number[]> {
    if (!mintDeployed()) return [];
    const key = address.toLowerCase();
    const all = read<Record<string, OwnedEntry>>(OWNED_KEY, {});
    const hit = all[key];
    if (sameCollection(hit) && Date.now() - hit.at < maxAgeMs) return hit.ids;
    const ids = ((await watchContract().getFunction('tokensOfOwner').staticCall(getAddress(address))) as bigint[]).map(Number);
    all[key] = { ids, at: Date.now(), chain: MINT_CONFIG.chain.chainId, contract: MINT_CONFIG.contract };
    write(OWNED_KEY, all);
    return ids;
}

export interface Ownership {
    ids: number[];
    byAddress: Record<string, number[]>;
}

export function mergeOwnership(byAddress: Record<string, number[]>): Ownership {
    const set = new Set<number>();
    for (const ids of Object.values(byAddress)) for (const id of ids) if (Number.isInteger(id) && id >= 1 && id <= 150) set.add(id);
    return { ids: [...set].sort((a, b) => a - b), byAddress };
}

/** Last-known ownership of `addresses`, without touching the network. */
export function cachedOwnership(addresses: string[]): Ownership {
    const byAddress: Record<string, number[]> = {};
    for (const a of addresses) {
        const ids = cachedTokensOf(a);
        if (ids) byAddress[a] = ids;
    }
    return mergeOwnership(byAddress);
}

export async function fetchOwnership(addresses: string[], maxAgeMs?: number): Promise<Ownership> {
    const entries = await Promise.all(addresses.map(async a => [a, await tokensOf(a, maxAgeMs)] as const));
    return mergeOwnership(Object.fromEntries(entries));
}

// ── holder addresses ──

export interface LinkedHolder {
    address: string;
    message: string;
    signature: string;
    linkedAt: number;
}

export function holderMessage(address: string, at: Date): string {
    return [
        'Bolt XR — link this address so this device can show the Iced-Out XR watches it holds.',
        '',
        `Address: ${getAddress(address)}`,
        `Issued: ${at.toISOString()}`,
        '',
        'Signing proves you control this address. It does not move funds or approve anything.',
    ].join('\n');
}

export function verifyHolder(h: LinkedHolder): boolean {
    try {
        const address = getAddress(h.address);
        return h.message.includes(`Address: ${address}`) && getAddress(verifyMessage(h.message, h.signature)) === address;
    } catch {
        return false;
    }
}

/** Linked holders whose signatures still verify. */
export function loadHolders(): LinkedHolder[] {
    return read<LinkedHolder[]>(HOLDERS_KEY, []).filter(verifyHolder);
}

export function saveHolder(h: LinkedHolder): LinkedHolder[] {
    if (!verifyHolder(h)) throw new Error('That signature does not match the address.');
    const list = loadHolders().filter(x => x.address.toLowerCase() !== h.address.toLowerCase());
    list.push({ ...h, address: getAddress(h.address) });
    write(HOLDERS_KEY, list);
    return list;
}

export function removeHolder(address: string): LinkedHolder[] {
    const list = loadHolders().filter(x => x.address.toLowerCase() !== address.toLowerCase());
    write(HOLDERS_KEY, list);
    return list;
}

/** The vault's EVM address is remembered (it is public) so a locked vault still shows its watch. */
export function rememberVaultAddress(address: string): void {
    try { localStorage.setItem(VAULT_KEY, getAddress(address)); } catch { /* ignore */ }
}

export function lastVaultAddress(): string | null {
    try {
        const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(VAULT_KEY);
        return v ? getAddress(v) : null;
    } catch {
        return null;
    }
}

/**
 * Which edition to wear: the chosen one if held, otherwise the first held one, otherwise the
 * classic watch (0). `0` chosen means the classic watch on purpose. `held` must come from the
 * chain this session — never from storage.
 */
export function wearableEdition(chosen: number, held: readonly number[]): number {
    if (chosen === 0) return 0;
    if (held.includes(chosen)) return chosen;
    return held[0] ?? 0;
}
