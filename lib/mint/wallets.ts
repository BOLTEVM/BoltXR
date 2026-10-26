/**
 * lib/mint/wallets.ts — browser wallets (EIP-6963 discovery, with window.ethereum as the
 * fallback), connecting, and moving the wallet onto the mint chain.
 */

import { BrowserProvider, getAddress, type Eip1193Provider } from 'ethers';
import { MINT_CONFIG } from './config';

export interface BrowserWallet {
    id: string;
    name: string;
    /** data: URI from the wallet's EIP-6963 announcement. */
    icon?: string;
    provider: Eip1193Provider & { on?: (event: string, cb: (...args: unknown[]) => void) => void; removeListener?: (event: string, cb: (...args: unknown[]) => void) => void };
}

interface Eip6963Detail {
    info: { uuid: string; name: string; icon: string; rdns: string };
    provider: BrowserWallet['provider'];
}

/** Watch for installed wallets; returns a stop function. */
export function discoverWallets(onChange: (wallets: BrowserWallet[]) => void): () => void {
    if (typeof window === 'undefined') return () => undefined;
    const found = new Map<string, BrowserWallet>();
    const emit = () => {
        const list = [...found.values()];
        const legacy = (window as unknown as { ethereum?: BrowserWallet['provider'] }).ethereum;
        if (list.length === 0 && legacy) list.push({ id: 'injected', name: 'Browser wallet', provider: legacy });
        onChange(list);
    };
    const onAnnounce = (event: Event) => {
        const d = (event as CustomEvent<Eip6963Detail>).detail;
        if (!d?.info?.rdns || !d.provider) return;
        found.set(d.info.rdns, { id: d.info.rdns, name: d.info.name, icon: d.info.icon?.startsWith('data:image/') ? d.info.icon : undefined, provider: d.provider });
        emit();
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const settle = window.setTimeout(emit, 400);
    return () => {
        window.clearTimeout(settle);
        window.removeEventListener('eip6963:announceProvider', onAnnounce);
    };
}

const hexChain = (id: number) => `0x${id.toString(16)}`;

/** Ask the wallet to share an account (any chain). */
export async function requestAccount(wallet: BrowserWallet): Promise<string> {
    const accounts = (await wallet.provider.request({ method: 'eth_requestAccounts' })) as string[];
    if (!accounts?.length) throw new Error('The wallet did not share an account.');
    return getAddress(accounts[0]);
}

/** Accounts the wallet already shares with this site (eth_accounts: never prompts). */
export async function sharedAccounts(wallet: BrowserWallet): Promise<string[]> {
    try {
        const list = (await wallet.provider.request({ method: 'eth_accounts' })) as string[] | undefined;
        return (list ?? []).flatMap(a => { try { return [getAddress(a)]; } catch { return []; } });
    } catch {
        return [];
    }
}

/** Ask the wallet for an account and make sure it is on the mint chain. */
export async function connectWallet(wallet: BrowserWallet): Promise<string> {
    const account = await requestAccount(wallet);
    await ensureMintChain(wallet);
    return account;
}

export async function walletChainId(wallet: BrowserWallet): Promise<number> {
    return Number(await wallet.provider.request({ method: 'eth_chainId' }));
}

export async function ensureMintChain(wallet: BrowserWallet): Promise<void> {
    const c = MINT_CONFIG.chain;
    if ((await walletChainId(wallet)) === c.chainId) return;
    try {
        await wallet.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChain(c.chainId) }] });
    } catch (e) {
        const code = (e as { code?: number; data?: { originalError?: { code?: number } } })?.code
            ?? (e as { data?: { originalError?: { code?: number } } })?.data?.originalError?.code;
        if (code !== 4902) throw e;
        await wallet.provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
                chainId: hexChain(c.chainId),
                chainName: c.name,
                rpcUrls: [c.rpc],
                nativeCurrency: c.currency,
                ...(c.explorer ? { blockExplorerUrls: [c.explorer] } : {}),
            }],
        });
    }
    if ((await walletChainId(wallet)) !== c.chainId) throw new Error(`Switch your wallet to ${c.name} to mint.`);
}

/** EIP-191 signature from the wallet's account (used to link a holder address). */
export async function signWithWallet(wallet: BrowserWallet, account: string, message: string): Promise<string> {
    const signer = await new BrowserProvider(wallet.provider).getSigner(account);
    return signer.signMessage(message);
}
