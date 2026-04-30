'use client';

import { useState, useEffect, useMemo } from 'react';
import { BoltwalletCore, WalletData } from '@/lib/boltows/ows-core';
import { CHAINS } from '@/lib/boltows/chains';

export type Token = {
    symbol: string;
    name: string;
    balance: string;
    address: string;
    network: string;
    color: string;
    chainId: string;
    tokenAddress?: string;
    status: 'loading' | 'success' | 'error';
    logo: string;
};

// Singleton instance of BoltwalletCore
const core = new BoltwalletCore();

export function useWallet() {
    const [isLocked, setIsLocked] = useState(true);
    const [isVaultSetup, setIsVaultSetup] = useState(false);
    const [wallets, setWallets] = useState<WalletData[]>([]);
    const [activeWallet, setActiveWallet] = useState<WalletData | null>(null);
    const [tokens, setTokens] = useState<Token[]>([]);
    const [prices, setPrices] = useState<Record<string, number>>({});

    useEffect(() => {
        const checkVault = async () => {
            const setup = await core.isVaultSetup();
            setIsVaultSetup(setup);
            const locked = await core.isVaultLocked();
            setIsLocked(locked);

            if (!locked) {
                const w = await core.getWallets();
                setWallets(w);
                if (w.length > 0) setActiveWallet(w[0]);
            }
        };

        checkVault();
    }, []);

    const fetchBalances = async () => {
        if (!activeWallet) return;

        const currentPrices = await core.getAssetPrices();
        setPrices(currentPrices);

        // Fetch balances for a subset of chains for the UI
        const selectedChains = ['ethereum', 'polygon', 'bsc', 'tron', 'monad', 'xrpl_evm'];
        
        const newTokens: Token[] = await Promise.all(selectedChains.map(async (chainKey) => {
            const config = CHAINS[chainKey];
            if (!config) return null as any;

            try {
                core.setChain(chainKey);
                const balance = await core.getNativeBalance(activeWallet.address);
                
                return {
                    symbol: config.nativeCurrency.symbol,
                    name: config.name,
                    balance: balance,
                    address: activeWallet.address,
                    network: config.name,
                    color: config.color,
                    chainId: config.id,
                    status: balance === "0.00" ? 'error' : 'success', // Simplified error check for mock purposes
                    logo: config.logo
                };
            } catch (err) {
                return {
                    symbol: config.nativeCurrency.symbol,
                    name: config.name,
                    balance: "0.00",
                    address: activeWallet.address,
                    network: config.name,
                    color: config.color,
                    chainId: config.id,
                    status: 'error',
                    logo: config.logo
                };
            }
        }));

        setTokens(newTokens.filter(t => t !== null));
    };

    useEffect(() => {
        if (!isLocked && activeWallet) {
            fetchBalances();
            const interval = setInterval(fetchBalances, 30000);
            return () => clearInterval(interval);
        }
    }, [isLocked, activeWallet]);

    const [failedAttempts, setFailedAttempts] = useState(0);
    const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

    const unlock = async (password: string) => {
        // Check for lockout
        if (lockoutUntil && Date.now() < lockoutUntil) {
            return false;
        }

        const success = await core.unlockVault(password);
        if (success) {
            setIsLocked(false);
            setFailedAttempts(0);
            setLockoutUntil(null);
            const w = await core.getWallets();
            setWallets(w);
            if (w.length > 0) setActiveWallet(w[0]);
            return true;
        } else {
            const newAttempts = failedAttempts + 1;
            setFailedAttempts(newAttempts);
            
            if (newAttempts >= 3) {
                // Lockout for 30 seconds after 3 failed attempts
                setLockoutUntil(Date.now() + 30000);
            }
            return false;
        }
    };

    const setup = async (password: string) => {
        const mnemonic = await core.setupVault(password);
        if (mnemonic) {
            setIsLocked(false);
            setIsVaultSetup(true);
            const w = await core.createNewWallet("Main Wallet");
            setWallets([w]);
            setActiveWallet(w);
            return mnemonic;
        }
        return null;
    };

    const send = async (to: string, amount: string, symbol: string) => {
        if (!activeWallet) return false;
        try {
            const token = tokens.find(t => t.symbol === symbol);
            if (!token) return false;

            // Find chain key by symbol or name
            const chainKey = Object.keys(CHAINS).find(key => CHAINS[key].nativeCurrency.symbol === symbol) || 'ethereum';
            core.setChain(chainKey);

            const tx = {
                to,
                value: amount,
                data: '0x'
            };

            await core.signTransaction(activeWallet.id, tx);
            // In a real app, we would broadcast here. BoltwalletCore.signTransaction simulated this.
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    };

    const swap = async (fromToken: string, toToken: string, amount: string) => {
        if (!activeWallet) return false;
        try {
            await core.getSwapQuote(fromToken, toToken, amount);
            await core.executeSwap(activeWallet.id, { fromAsset: fromToken, toAsset: toToken, fromAmount: amount });
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    };

    return {
        account: activeWallet?.address || null,
        tokens,
        isLocked,
        isVaultSetup,
        unlock,
        setup,
        connect: () => { }, // Handled by unlock/setup
        send,
        swap,
        failedAttempts,
        lockoutUntil
    };
}
