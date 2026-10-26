/**
 * lib/mint/holderCheck.ts — the second, independent answer to "may this watch be worn?".
 *
 * The wallet only puts an Iced-Out XR watch on a wrist after `useWatchOwnership` has seen, this
 * session, that one of the holder addresses owns it. The watch then asks again by itself, every
 * time it is put on (so on every app load), through a different call — `ownerOf(edition)`, read
 * fresh from the chain, never from a cache — against holder addresses it gathers itself (the
 * vault's own address and signature-verified links). If that answer says the watch is not held,
 * the first gate was bypassed: the watch self-destructs.
 *
 * No exceptions: before the contract exists, or for a token nobody has minted, nobody holds it.
 * Only a failure to reach the chain is not taken as proof either way — the watch then stays
 * locked, showing it could not check, and keeps trying.
 *
 * Client-side, both checks can be removed by someone who edits the app's JavaScript; they stop
 * everyone who does not. Real protection for anything of value needs a server (docs/iced-watches.md).
 */

import { Contract, JsonRpcProvider, Network, getAddress, isCallException } from 'ethers';
import { MINT_CONFIG, mintDeployed } from './config';
import { lastVaultAddress, loadHolders } from './ownership';

export type HolderVerdict = 'holder' | 'stolen' | 'offline';

const OWNER_OF = ['function ownerOf(uint256 tokenId) view returns (address)', 'error ERC721NonexistentToken(uint256 tokenId)'];

let provider: JsonRpcProvider | null = null;
function reader(): JsonRpcProvider {
    // its own provider, not the shared one in client.ts
    if (!provider) {
        const c = MINT_CONFIG.chain;
        provider = new JsonRpcProvider(c.rpc, c.chainId, { staticNetwork: Network.from(c.chainId) });
    }
    return provider;
}

/** The addresses that may hold watches on this device, gathered here rather than taken from React state. */
export function holderAddresses(vaultAddress?: string | null): string[] {
    const out = new Set<string>();
    for (const a of [vaultAddress, lastVaultAddress(), ...loadHolders().map(h => h.address)]) {
        if (!a) continue;
        try { out.add(getAddress(a)); } catch { /* not an address */ }
    }
    return [...out];
}

/**
 * Who owns `edition` right now, compared with `holders`. Throws only when the chain could not be
 * asked (the caller retries); every other outcome is a verdict.
 */
export async function checkHolder(edition: number, holders: string[]): Promise<Exclude<HolderVerdict, 'offline'>> {
    if (!Number.isInteger(edition) || edition < 1 || edition > 150) return 'stolen';
    if (!mintDeployed()) return 'stolen';
    if (holders.length === 0) return 'stolen';
    let owner: string;
    try {
        owner = await new Contract(MINT_CONFIG.contract, OWNER_OF, reader()).getFunction('ownerOf').staticCall(edition) as string;
    } catch (e) {
        // the contract answered "no such token" (never minted): nobody holds it
        if (isCallException(e) && (e.revert?.name === 'ERC721NonexistentToken' || e.reason || e.data)) return 'stolen';
        throw e;
    }
    const o = getAddress(owner);
    return holders.some(h => h === o) ? 'holder' : 'stolen';
}
