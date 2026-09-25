'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import {
  WalletData, SwapQuote, SwapError, HistoryData,
  estimateTransferFee, isValidAddressForChain, isVaultLocked, MIN_NEW_PIN_LENGTH,
} from '@/lib/boltows/ows-core';
import { walletCore as core } from '@/lib/boltows/core-instance';
import { CHAINS, SELECTED_CHAINS } from '@/lib/boltows/chains';
import { errorMessage } from '@/lib/format';

export { MIN_NEW_PIN_LENGTH };

export type Token = {
    chainKey: string;
    symbol: string;
    name: string;
    /** Full-precision balance in whole units ("0" while loading or on error). */
    balance: string;
    decimals: number;
    address: string;
    network: string;
    color: string;
    chainId: string;
    tokenAddress?: string;
    status: 'loading' | 'success' | 'error';
    error?: string;
    logo: string;
    usdPrice?: number;
    usdValue?: number;
    canSend: boolean;
    canSwap: boolean;
};

export type VaultStatus = 'checking' | 'no-vault' | 'locked' | 'unlocked';

export interface SendParams {
    chainKey: string;
    to: string;
    /** Human-readable amount in whole units (e.g. "0.05"). */
    amount: string;
}

export interface SwapQuoteRequest {
    fromChainKey: string;
    toChainKey: string;
    fromSymbol: string;
    toSymbol: string;
    /** Human-readable amount in whole units. */
    amount: string;
}

export interface UnlockResult {
    ok: boolean;
    error?: string;
}

interface WalletContextValue {
    status: VaultStatus;
    isLocked: boolean;
    isVaultSetup: boolean;
    account: string | null;
    walletId: string | null;
    addresses: Record<string, string>;
    tokens: Token[];
    prices: Record<string, number>;
    totalUsd: number | null;
    refreshing: boolean;
    lastUpdated: number | null;
    failedAttempts: number;
    lockoutUntil: number | null;
    history: HistoryData[];
    swapStatus: string | null;
    swapSlippage: number;
    setSwapSlippage: (value: number) => void;
    unlock: (pin: string) => Promise<UnlockResult>;
    setup: (pin: string) => Promise<string | null>;
    restore: (mnemonic: string, pin: string) => Promise<void>;
    lock: () => void;
    refresh: () => Promise<void>;
    refreshHistory: () => Promise<void>;
    revealMnemonic: (pin: string) => Promise<string | null>;
    validateAddress: (address: string, chainKey: string) => boolean;
    parseAmount: (amount: string, chainKey: string) => bigint;
    estimateFee: (chainKey: string) => Promise<string | null>;
    send: (params: SendParams) => Promise<string>;
    getSwapQuote: (request: SwapQuoteRequest) => Promise<SwapQuote>;
    executeSwap: (quote: SwapQuote, fromChainKey: string) => Promise<string>;
    /** Convenience: quote + execute in one step. Returns success. */
    swap: (fromSymbol: string, toSymbol: string, amount: string) => Promise<boolean>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const BALANCE_REFRESH_MS = 30_000;
const LOCK_POLL_MS = 5_000;
const ACTIVITY_THROTTLE_MS = 20_000;

const placeholderTokens = (addresses: Record<string, string>): Token[] =>
    SELECTED_CHAINS.filter(key => CHAINS[key]).map(key => {
        const chain = CHAINS[key];
        return {
            chainKey: key,
            symbol: chain.nativeCurrency.symbol,
            name: chain.name,
            balance: '0',
            decimals: chain.nativeCurrency.decimals,
            address: addresses[key] || '',
            network: chain.name,
            color: chain.color,
            chainId: chain.id,
            status: 'loading',
            logo: chain.logo,
            canSend: chain.canSend,
            canSwap: chain.canSwap,
        };
    });

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [status, setStatus] = useState<VaultStatus>('checking');
    const [activeWallet, setActiveWallet] = useState<WalletData | null>(null);
    const [addresses, setAddresses] = useState<Record<string, string>>({});
    const [tokens, setTokens] = useState<Token[]>([]);
    const [prices, setPrices] = useState<Record<string, number>>({});
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [guard, setGuard] = useState(() => ({ failures: 0, lockedUntil: null as number | null }));
    const [history, setHistory] = useState<HistoryData[]>([]);
    const [swapStatus, setSwapStatus] = useState<string | null>(null);
    const [swapSlippage, setSwapSlippage] = useState(0.005); // 0.5% default
    const swapStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearWalletState = useCallback(() => {
        setActiveWallet(null);
        setAddresses({});
        setTokens([]);
        setHistory([]);
    }, []);

    const loadWallet = useCallback(async () => {
        let wallets = await core.getWallets('ethereum');
        if (wallets.length === 0) {
            // A vault without accounts (e.g. freshly restored) gets its first wallet.
            wallets = [await core.createNewWallet('Main Wallet', 'ethereum')];
        }
        const wallet = wallets[0];
        const addrs = await core.getWalletAddresses(wallet.id, SELECTED_CHAINS);
        setActiveWallet(wallet);
        setAddresses(addrs);
        setTokens(placeholderTokens(addrs));
        setStatus('unlocked');
    }, []);

    // Initial vault detection
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const setup = await core.isVaultSetup();
            const locked = await core.isVaultLocked();
            if (cancelled) return;
            setGuard(core.getUnlockGuard());
            if (!setup) {
                setStatus('no-vault');
            } else if (locked) {
                setStatus('locked');
            } else {
                await loadWallet();
            }
        })().catch(e => {
            console.error('Vault check failed:', e);
            if (!cancelled) setStatus('locked');
        });
        return () => { cancelled = true; };
    }, [loadWallet]);

    // Keep UI in sync with the core's inactivity auto-lock.
    useEffect(() => {
        if (status !== 'unlocked') return;
        const id = setInterval(() => {
            if (isVaultLocked()) {
                clearWalletState();
                setStatus('locked');
            }
        }, LOCK_POLL_MS);
        return () => clearInterval(id);
    }, [status, clearWalletState]);

    // User activity extends the session (auto-lock is inactivity-based).
    useEffect(() => {
        if (status !== 'unlocked') return;
        let last = 0;
        const onActivity = () => {
            const now = Date.now();
            if (now - last < ACTIVITY_THROTTLE_MS) return;
            last = now;
            core.touch();
        };
        window.addEventListener('pointerdown', onActivity, { passive: true });
        window.addEventListener('keydown', onActivity);
        return () => {
            window.removeEventListener('pointerdown', onActivity);
            window.removeEventListener('keydown', onActivity);
        };
    }, [status]);

    const refresh = useCallback(async () => {
        if (!activeWallet) return;
        setRefreshing(true);
        try {
            const [priceMap, results] = await Promise.all([
                core.getAssetPrices().catch(() => ({} as Record<string, number>)),
                Promise.all(SELECTED_CHAINS.map(async key => {
                    const address = addresses[key];
                    if (!address) return { key, error: 'No address for this chain' };
                    try {
                        return { key, balance: await core.fetchNativeBalance(address, key) };
                    } catch (e) {
                        return { key, error: errorMessage(e) };
                    }
                })),
            ]);

            setPrices(priceMap);
            setTokens(prev => {
                const base = prev.length ? prev : placeholderTokens(addresses);
                return base.map(token => {
                    const result = results.find(r => r.key === token.chainKey);
                    const usdPrice = priceMap[token.chainKey];
                    if (!result) return token;
                    if ('balance' in result && result.balance !== undefined) {
                        const numeric = Number(result.balance);
                        return {
                            ...token,
                            balance: result.balance,
                            status: 'success' as const,
                            error: undefined,
                            usdPrice,
                            usdValue: usdPrice !== undefined && Number.isFinite(numeric) ? numeric * usdPrice : undefined,
                        };
                    }
                    // Keep the last known balance when a refresh fails.
                    return { ...token, status: 'error' as const, error: result.error, usdPrice };
                });
            });
            setLastUpdated(Date.now());
        } finally {
            setRefreshing(false);
        }
    }, [activeWallet, addresses]);

    useEffect(() => {
        if (status !== 'unlocked' || !activeWallet) return;
        const first = setTimeout(refresh, 0);
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') refresh();
        }, BALANCE_REFRESH_MS);
        return () => {
            clearTimeout(first);
            clearInterval(id);
        };
    }, [status, activeWallet, refresh]);

    const refreshHistory = useCallback(async () => {
        if (!activeWallet) return;
        await core.refreshHistoryStatuses().catch(() => undefined);
        const own = new Set(Object.values(addresses).map(a => a.toLowerCase()));
        const all = await core.getHistory('', 'all');
        setHistory(all.filter(h => own.has(h.from.toLowerCase()) || own.has(h.to.toLowerCase())));
    }, [activeWallet, addresses]);

    const unlock = useCallback(async (pin: string): Promise<UnlockResult> => {
        const current = core.getUnlockGuard();
        if (current.lockedUntil && Date.now() < current.lockedUntil) {
            setGuard(current);
            return { ok: false, error: 'Too many attempts — please wait' };
        }
        const success = await core.unlockVault(pin);
        setGuard(core.getUnlockGuard());
        if (!success) return { ok: false, error: 'Incorrect PIN' };
        await loadWallet();
        return { ok: true };
    }, [loadWallet]);

    const setup = useCallback(async (pin: string) => {
        const mnemonic = await core.setupVault(pin);
        if (!mnemonic) return null;
        await loadWallet();
        return mnemonic;
    }, [loadWallet]);

    const restore = useCallback(async (mnemonic: string, pin: string) => {
        await core.resetVault(mnemonic, pin);
        await loadWallet();
    }, [loadWallet]);

    const lock = useCallback(() => {
        core.lock();
        clearWalletState();
        setStatus('locked');
    }, [clearWalletState]);

    const validateAddress = useCallback((address: string, chainKey: string) => isValidAddressForChain(address, chainKey), []);

    const parseAmount = useCallback((amount: string, chainKey: string): bigint => {
        const chain = CHAINS[chainKey];
        if (!chain) throw new Error('Unknown network');
        const trimmed = amount.trim();
        if (!/^\d*\.?\d+$/.test(trimmed) && !/^\d+\.$/.test(trimmed)) throw new Error('Enter a valid amount');
        const value = ethers.parseUnits(trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed, chain.nativeCurrency.decimals);
        if (value <= 0n) throw new Error('Amount must be greater than zero');
        return value;
    }, []);

    const estimateFee = useCallback((chainKey: string) => estimateTransferFee(chainKey), []);

    const send = useCallback(async ({ chainKey, to, amount }: SendParams) => {
        if (!activeWallet) throw new Error('Unlock your vault first');
        const chain = CHAINS[chainKey];
        if (!chain) throw new Error('Unknown network');
        if (!chain.canSend) throw new Error(`Sending ${chain.nativeCurrency.symbol} is not supported yet`);
        const recipient = to.trim();
        if (!isValidAddressForChain(recipient, chainKey)) throw new Error(`Not a valid ${chain.name} address`);
        if (addresses[chainKey] && recipient.toLowerCase() === addresses[chainKey].toLowerCase()) {
            throw new Error('That is your own address');
        }
        const value = parseAmount(amount, chainKey);
        const token = tokens.find(t => t.chainKey === chainKey);
        if (token?.status === 'success' && value > ethers.parseUnits(token.balance, chain.nativeCurrency.decimals)) {
            throw new Error('Amount exceeds your balance');
        }
        const hash = await core.sendTransaction(activeWallet.id, chainKey, { to: recipient, value: value.toString() });
        refresh();
        return hash;
    }, [activeWallet, addresses, parseAmount, tokens, refresh]);

    const getSwapQuote = useCallback(async (request: SwapQuoteRequest) => {
        if (!activeWallet) throw new Error('Unlock your vault first');
        const fromAddress = addresses[request.fromChainKey];
        if (!fromAddress) throw new SwapError('No address for the source network', 'NO_ADDRESS');
        const amount = parseAmount(request.amount, request.fromChainKey);
        return core.getSwapQuote({
            fromChainKey: request.fromChainKey,
            toChainKey: request.toChainKey,
            fromToken: request.fromSymbol,
            toToken: request.toSymbol,
            fromAmount: amount.toString(),
            fromAddress,
            slippage: swapSlippage,
        });
    }, [activeWallet, addresses, parseAmount, swapSlippage]);

    const executeSwap = useCallback(async (quote: SwapQuote, fromChainKey: string) => {
        if (!activeWallet) throw new Error('Unlock your vault first');
        const hash = await core.executeSwap(activeWallet.id, fromChainKey, quote);
        refresh();
        return hash;
    }, [activeWallet, refresh]);

    const flashSwapStatus = useCallback((message: string) => {
        setSwapStatus(message);
        if (swapStatusTimer.current) clearTimeout(swapStatusTimer.current);
        swapStatusTimer.current = setTimeout(() => setSwapStatus(null), 6000);
    }, []);

    const swap = useCallback(async (fromSymbol: string, toSymbol: string, amount: string) => {
        const from = tokens.find(t => t.symbol === fromSymbol);
        const to = tokens.find(t => t.symbol === toSymbol);
        if (!from || !to) {
            flashSwapStatus('ERROR: TOKEN NOT FOUND');
            return false;
        }
        try {
            setSwapStatus('FETCHING QUOTE');
            const quote = await getSwapQuote({
                fromChainKey: from.chainKey, toChainKey: to.chainKey,
                fromSymbol, toSymbol, amount,
            });
            setSwapStatus('SIGNING');
            const hash = await executeSwap(quote, from.chainKey);
            flashSwapStatus(`SUBMITTED: ${hash.substring(0, 10)}…`);
            return true;
        } catch (e) {
            flashSwapStatus(e instanceof SwapError ? `ERROR: ${e.message}` : `ERROR: ${errorMessage(e)}`);
            return false;
        }
    }, [tokens, getSwapQuote, executeSwap, flashSwapStatus]);

    useEffect(() => () => {
        if (swapStatusTimer.current) clearTimeout(swapStatusTimer.current);
    }, []);

    const totalUsd = useMemo(() => {
        const valued = tokens.filter(t => t.usdValue !== undefined);
        if (valued.length === 0) return null;
        return valued.reduce((sum, t) => sum + (t.usdValue || 0), 0);
    }, [tokens]);

    const value: WalletContextValue = {
        status,
        isLocked: status !== 'unlocked',
        isVaultSetup: status === 'locked' || status === 'unlocked',
        account: activeWallet?.address || null,
        walletId: activeWallet?.id || null,
        addresses,
        tokens,
        prices,
        totalUsd,
        refreshing,
        lastUpdated,
        failedAttempts: guard.failures,
        lockoutUntil: guard.lockedUntil,
        history,
        swapStatus,
        swapSlippage,
        setSwapSlippage,
        unlock,
        setup,
        restore,
        lock,
        refresh,
        refreshHistory,
        revealMnemonic: (pin: string) => core.revealMnemonic(pin),
        validateAddress,
        parseAmount,
        estimateFee,
        send,
        getSwapQuote,
        executeSwap,
        swap,
    };

    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export function useWallet() {
    const context = useContext(WalletContext);
    if (!context) throw new Error('useWallet must be used within a WalletProvider');
    return context;
}
