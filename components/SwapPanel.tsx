'use client';

import { useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { Text, RoundedBox } from '@react-three/drei';
import Button3D, { XR_THEME } from './xr/Button3D';
import AmountKeypad from './xr/AmountKeypad';
import { useWallet, type Token } from '@/hooks/useWallet';
import type { SwapQuote } from '@/lib/boltows/ows-core';
import { getExplorerTxUrl } from '@/lib/boltows/chains';
import { errorMessage, formatAmount, formatUsd, truncateAddress } from '@/lib/format';

interface SwapPanelProps {
    /** Chain key of the preselected source token, if any. */
    initialFrom?: string | null;
    onClose: () => void;
}

type Step = 'from' | 'to' | 'amount' | 'review' | 'executing' | 'done';

/** Quotes older than this are refreshed (and must be re-reviewed) before signing. */
const QUOTE_TTL_MS = 60_000;

/** Wall-clock time; only called from event handlers (quote fetch / confirm). */
const nowMs = () => Date.now();

function TokenChoice({ token, onPick, position }: { token: Token; onPick: () => void; position: [number, number, number] }) {
    const balance = token.status === 'success' ? `${formatAmount(token.balance, 4)} ${token.symbol}` : token.status === 'loading' ? 'LOADING' : 'OFFLINE';
    return (
        <group position={position}>
            <Button3D label={`${token.symbol}  ·  ${token.network.toUpperCase()}`} onPress={onPick} width={1.1} height={0.2} color={XR_THEME.raised} fontSize={0.05} />
            <mesh position={[-0.47, 0, 0.03]}>
                <circleGeometry args={[0.035, 20]} />
                <meshBasicMaterial color={token.color} />
            </mesh>
            <Text position={[0, -0.15, 0]} fontSize={0.032} color={XR_THEME.faint} anchorX="center">{balance}</Text>
        </group>
    );
}

export default function SwapPanel({ initialFrom, onClose }: SwapPanelProps) {
    const wallet = useWallet();
    const { tokens, getSwapQuote, executeSwap, parseAmount, swapSlippage } = wallet;
    const swappable = useMemo(() => tokens.filter(t => t.canSwap), [tokens]);

    const [fromKey, setFromKey] = useState<string | null>(initialFrom && swappable.some(t => t.chainKey === initialFrom) ? initialFrom : null);
    const [toKey, setToKey] = useState<string | null>(null);
    const [step, setStep] = useState<Step>(fromKey ? 'to' : 'from');
    const [amount, setAmount] = useState('');
    const [quote, setQuote] = useState<{ value: SwapQuote; at: number } | null>(null);
    const [loadingQuote, setLoadingQuote] = useState(false);
    const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
    const [hash, setHash] = useState<string | null>(null);

    const from = swappable.find(t => t.chainKey === fromKey) || null;
    const to = swappable.find(t => t.chainKey === toKey) || null;
    const fromBalanceKnown = from?.status === 'success';

    const fetchQuote = async (): Promise<SwapQuote | null> => {
        if (!from || !to) return null;
        setLoadingQuote(true);
        setMessage(null);
        try {
            const value = await getSwapQuote({
                fromChainKey: from.chainKey,
                toChainKey: to.chainKey,
                fromSymbol: from.symbol,
                toSymbol: to.symbol,
                amount,
            });
            setQuote({ value, at: nowMs() });
            return value;
        } catch (e) {
            setQuote(null);
            setMessage({ text: errorMessage(e), error: true });
            return null;
        } finally {
            setLoadingQuote(false);
        }
    };

    const goToReview = async () => {
        if (!from) return;
        try {
            const value = parseAmount(amount, from.chainKey);
            if (fromBalanceKnown && value > ethers.parseUnits(from.balance, from.decimals)) {
                setMessage({ text: 'AMOUNT EXCEEDS YOUR BALANCE', error: true });
                return;
            }
        } catch (e) {
            setMessage({ text: errorMessage(e).toUpperCase(), error: true });
            return;
        }
        setStep('review');
        await fetchQuote();
    };

    const confirmSwap = async () => {
        if (!from || !quote) return;
        // Never sign an old price: refresh first and let the user review the new one.
        if (nowMs() - quote.at > QUOTE_TTL_MS) {
            const fresh = await fetchQuote();
            if (fresh) setMessage({ text: 'QUOTE REFRESHED — REVIEW THE NEW RATE, THEN CONFIRM' });
            return;
        }
        setStep('executing');
        setMessage(null);
        try {
            setHash(await executeSwap(quote.value, from.chainKey));
            setStep('done');
        } catch (e) {
            setMessage({ text: errorMessage(e), error: true });
            setStep('review');
        }
    };

    const q = quote?.value;
    const received = q ? formatAmount(ethers.formatUnits(BigInt(q.toAmount || '0'), q.toToken.decimals), 6) : null;
    const minimum = q ? formatAmount(ethers.formatUnits(BigInt(q.toAmountMin || '0'), q.toToken.decimals), 6) : null;
    const usd = from?.usdPrice !== undefined && amount ? Number(amount) * from.usdPrice : null;
    const setMax = () => {
        // Leave a little for gas on the source chain.
        if (!from || !fromBalanceKnown) return;
        const balance = ethers.parseUnits(from.balance, from.decimals);
        const reserve = balance / 50n; // 2%
        setAmount(ethers.formatUnits(balance - reserve, from.decimals));
    };

    const title = step === 'done' ? 'SWAP SUBMITTED' : from && to ? `${from.symbol} TO ${to.symbol}` : 'CROSS-CHAIN SWAP';
    const choices = (exclude: string | null) => swappable.filter(t => t.chainKey !== exclude);

    return (
        <group>
            <RoundedBox args={[1.5, 2.3, 0.08]} radius={0.08} smoothness={4}>
                <meshStandardMaterial color={XR_THEME.surface} transparent opacity={0.9} metalness={0.8} roughness={0.2} />
            </RoundedBox>
            <RoundedBox args={[1.52, 2.32, 0.04]} radius={0.08} smoothness={4} position={[0, 0, -0.04]}>
                <meshStandardMaterial color={XR_THEME.success} transparent opacity={0.3} emissive={XR_THEME.success} emissiveIntensity={0.35} />
            </RoundedBox>

            <group position={[0, 0, 0.05]}>
                <Text position={[0, 0.98, 0]} fontSize={0.09} color="white" anchorX="center">{title}</Text>
                <mesh position={[0, 0.88, 0]}>
                    <planeGeometry args={[0.6, 0.005]} />
                    <meshBasicMaterial color={XR_THEME.success} />
                </mesh>

                {(step === 'from' || step === 'to') && (
                    <group>
                        <Text position={[0, 0.74, 0]} fontSize={0.045} color={XR_THEME.muted} anchorX="center">
                            {step === 'from' ? 'SWAP FROM' : `SWAP ${from?.symbol ?? ''} TO`}
                        </Text>
                        {choices(step === 'to' ? fromKey : null).map((t, i) => (
                            <TokenChoice
                                key={t.chainKey}
                                token={t}
                                position={[0, 0.5 - i * 0.36, 0]}
                                onPick={() => {
                                    setMessage(null);
                                    if (step === 'from') {
                                        setFromKey(t.chainKey);
                                        if (toKey === t.chainKey) setToKey(null);
                                        setStep('to');
                                    } else {
                                        setToKey(t.chainKey);
                                        setStep('amount');
                                    }
                                }}
                            />
                        ))}
                        {swappable.length < 2 && (
                            <Text position={[0, 0.2, 0]} fontSize={0.04} color={XR_THEME.muted} anchorX="center" maxWidth={1.2} textAlign="center">
                                SWAPS NEED AT LEAST TWO SUPPORTED NETWORKS.
                            </Text>
                        )}
                        <Text position={[0, -0.62, 0]} fontSize={0.032} color={XR_THEME.faint} anchorX="center" maxWidth={1.3} textAlign="center">
                            ROUTED BY LI.FI ACROSS DEXS AND BRIDGES. NATIVE ASSETS ONLY.
                        </Text>
                        <Button3D
                            label={step === 'to' ? 'BACK' : 'CANCEL'}
                            onPress={() => (step === 'to' ? setStep('from') : onClose())}
                            position={[0, -0.9, 0]}
                            width={0.6}
                            height={0.16}
                        />
                    </group>
                )}

                {step === 'amount' && from && (
                    <group>
                        <Text position={[0, 0.74, 0]} fontSize={0.04} color={XR_THEME.faint} anchorX="center">
                            {fromBalanceKnown ? `AVAILABLE ${formatAmount(from.balance)} ${from.symbol}` : 'BALANCE UNAVAILABLE'}
                        </Text>
                        <Text position={[0, 0.6, 0]} fontSize={0.11} color="white" anchorX="center" maxWidth={1.3}>
                            {`${amount || '0'} ${from.symbol}`}
                        </Text>
                        <Text position={[0, 0.5, 0]} fontSize={0.04} color={XR_THEME.muted} anchorX="center">
                            {usd !== null && Number.isFinite(usd) ? `~ ${formatUsd(usd)}` : ' '}
                        </Text>
                        <AmountKeypad
                            value={amount}
                            onChange={v => { setMessage(null); setAmount(v); }}
                            decimals={from.decimals}
                            onMax={setMax}
                            maxDisabled={!fromBalanceKnown}
                            position={[0, 0.33, 0]}
                        />
                        <Button3D label="BACK" onPress={() => { setStep('to'); setMessage(null); }} position={[-0.3, -0.9, 0]} width={0.5} height={0.16} />
                        <Button3D label="GET QUOTE" onPress={goToReview} position={[0.3, -0.9, 0]} width={0.5} height={0.16} color={XR_THEME.info} disabled={!amount} />
                    </group>
                )}

                {(step === 'review' || step === 'executing') && from && to && (
                    <group>
                        <Text position={[-0.6, 0.72, 0]} fontSize={0.038} color={XR_THEME.faint} anchorX="left">YOU PAY</Text>
                        <Text position={[-0.6, 0.62, 0]} fontSize={0.07} color="white" anchorX="left">{`${formatAmount(amount)} ${from.symbol}`}</Text>
                        <Text position={[-0.6, 0.54, 0]} fontSize={0.034} color={XR_THEME.muted} anchorX="left">{`ON ${from.network.toUpperCase()}`}</Text>

                        <Text position={[-0.6, 0.4, 0]} fontSize={0.038} color={XR_THEME.faint} anchorX="left">YOU RECEIVE (ESTIMATED)</Text>
                        <Text position={[-0.6, 0.3, 0]} fontSize={0.07} color={received && !loadingQuote ? XR_THEME.success : XR_THEME.muted} anchorX="left">
                            {loadingQuote ? 'FETCHING QUOTE…' : received ? `~ ${received} ${to.symbol}` : 'NO QUOTE'}
                        </Text>
                        <Text position={[-0.6, 0.22, 0]} fontSize={0.034} color={XR_THEME.muted} anchorX="left">{`ON ${to.network.toUpperCase()}`}</Text>

                        {q && !loadingQuote && (
                            <group>
                                <Text position={[-0.6, 0.06, 0]} fontSize={0.036} color={XR_THEME.muted} anchorX="left">
                                    {`MINIMUM RECEIVED  ${minimum} ${to.symbol}`}
                                </Text>
                                <Text position={[-0.6, -0.02, 0]} fontSize={0.036} color={XR_THEME.muted} anchorX="left">
                                    {`SLIPPAGE  ${(swapSlippage * 100).toFixed(1)}%   ·   ROUTE  ${q.tool.toUpperCase()}`}
                                </Text>
                                <Text position={[-0.6, -0.1, 0]} fontSize={0.036} color={XR_THEME.muted} anchorX="left">
                                    {`GAS  ~$${q.estimatedGasUSD}   ·   ETA  ${q.executionDurationSeconds ? `~${Math.max(1, Math.round(q.executionDurationSeconds / 60))} MIN` : 'N/A'}`}
                                </Text>
                            </group>
                        )}
                        <Text position={[0, -0.3, 0]} fontSize={0.034} color="#fbbf24" anchorX="center" maxWidth={1.3} textAlign="center">
                            CROSS-CHAIN SWAPS CANNOT BE REVERSED ONCE SUBMITTED.
                        </Text>
                        <Button3D label="BACK" onPress={() => { setStep('amount'); setMessage(null); }} position={[-0.3, -0.9, 0]} width={0.5} height={0.16} disabled={step === 'executing'} />
                        {q || loadingQuote ? (
                            <Button3D
                                label={step === 'executing' ? 'SIGNING…' : 'CONFIRM SWAP'}
                                onPress={confirmSwap}
                                position={[0.3, -0.9, 0]}
                                width={0.5}
                                height={0.16}
                                color={XR_THEME.success}
                                disabled={step === 'executing' || loadingQuote || !q}
                            />
                        ) : (
                            <Button3D label="RETRY QUOTE" onPress={fetchQuote} position={[0.3, -0.9, 0]} width={0.5} height={0.16} color={XR_THEME.info} />
                        )}
                    </group>
                )}

                {step === 'done' && from && to && (
                    <group>
                        <Text position={[0, 0.5, 0]} fontSize={0.06} color="white" anchorX="center" maxWidth={1.3} textAlign="center">
                            {`${formatAmount(amount)} ${from.symbol} TO ${to.symbol}`}
                        </Text>
                        <Text position={[0, 0.34, 0]} fontSize={0.035} color={XR_THEME.muted} anchorX="center" maxWidth={1.3} textAlign="center">
                            {`SUBMITTED ON ${from.network.toUpperCase()}. FUNDS ARRIVE ON ${to.network.toUpperCase()} AFTER THE BRIDGE COMPLETES.`}
                        </Text>
                        <Text position={[0, 0.16, 0]} fontSize={0.035} color={XR_THEME.muted} anchorX="center">{hash ? truncateAddress(hash, 10, 8) : ''}</Text>
                        {hash && getExplorerTxUrl(from.chainKey, hash) && (
                            <Button3D label="OPEN IN EXPLORER" onPress={() => window.open(getExplorerTxUrl(from.chainKey, hash)!, '_blank', 'noopener,noreferrer')}
                                position={[0, -0.1, 0]} width={1.0} height={0.18} color={XR_THEME.brand} />
                        )}
                        <Button3D label="DONE" onPress={onClose} position={[0, -0.9, 0]} width={0.6} height={0.16} color={XR_THEME.info} />
                    </group>
                )}

                {message && (
                    <Text position={[0, -0.68, 0]} fontSize={0.034} color={message.error ? XR_THEME.danger : XR_THEME.success} anchorX="center" maxWidth={1.35} textAlign="center">
                        {message.text}
                    </Text>
                )}
            </group>
        </group>
    );
}
