'use client';

/**
 * useMintSale — the live Iced-Out XR Watches sale (phase, minted, next price, the account's
 * allowance and pass), polled while the mint modal is open; the curve alone before deployment.
 */

import { useCallback, useEffect, useState } from 'react';
import { getAddress } from 'ethers';
import { describeMintError, fetchSale, tableSale, type SaleState } from '@/lib/mint/client';
import { mintDeployed } from '@/lib/mint/config';
import { discoverWallets, connectWallet, ensureMintChain, walletChainId, type BrowserWallet } from '@/lib/mint/wallets';

const POLL_MS = 12_000;

export function useMintSale(account: string | null, active: boolean) {
    const [sale, setSale] = useState<SaleState>(() => tableSale());
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(mintDeployed());
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        if (!active || !mintDeployed()) return;
        let cancelled = false;
        const load = () => fetchSale(account)
            .then(s => { if (!cancelled) { setSale(s); setError(null); setLoading(false); } })
            .catch(e => { if (!cancelled) { setError(describeMintError(e)); setLoading(false); } });
        void load();
        const timer = window.setInterval(load, POLL_MS);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, [account, active, nonce]);

    const refresh = useCallback(() => setNonce(n => n + 1), []);
    return { sale, error, loading, refresh };
}

/** Installed browser wallets, the connected one, its account and chain. */
export function useBrowserWallet() {
    const [wallets, setWallets] = useState<BrowserWallet[]>([]);
    const [wallet, setWallet] = useState<BrowserWallet | null>(null);
    const [account, setAccount] = useState<string | null>(null);
    const [chainId, setChainId] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => discoverWallets(setWallets), []);

    useEffect(() => {
        const p = wallet?.provider;
        if (!p?.on) return;
        const onAccounts = (...args: unknown[]) => {
            const list = args[0] as string[] | undefined;
            try { setAccount(list?.[0] ? getAddress(list[0]) : null); } catch { setAccount(null); }
        };
        const onChain = (...args: unknown[]) => setChainId(Number(args[0]));
        p.on('accountsChanged', onAccounts);
        p.on('chainChanged', onChain);
        return () => {
            p.removeListener?.('accountsChanged', onAccounts);
            p.removeListener?.('chainChanged', onChain);
        };
    }, [wallet]);

    const connect = useCallback(async (w: BrowserWallet) => {
        setBusy(true);
        setError(null);
        try {
            const a = await connectWallet(w);
            setWallet(w);
            setAccount(a);
            setChainId(await walletChainId(w));
        } catch (e) {
            setError(describeMintError(e));
        } finally {
            setBusy(false);
        }
    }, []);

    const switchChain = useCallback(async () => {
        if (!wallet) return;
        setBusy(true);
        setError(null);
        try {
            await ensureMintChain(wallet);
            setChainId(await walletChainId(wallet));
        } catch (e) {
            setError(describeMintError(e));
        } finally {
            setBusy(false);
        }
    }, [wallet]);

    const disconnect = useCallback(() => {
        setWallet(null);
        setAccount(null);
        setChainId(null);
    }, []);

    return { wallets, wallet, account, chainId, busy, error, connect, switchChain, disconnect, clearError: () => setError(null) };
}
