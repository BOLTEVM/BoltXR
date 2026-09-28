'use client';

import { useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { Text, RoundedBox } from '@react-three/drei';
import Button3D, { XR_THEME } from './xr/Button3D';
import { useWallet, type Token } from '@/hooks/useWallet';
import { CHAINS, getExplorerTxUrl } from '@/lib/boltows/chains';
import { errorMessage, formatAmount, formatUsd, truncateAddress } from '@/lib/format';

interface TransactionPanelProps {
    token: Token;
    onClose: () => void;
}

type Step = 'overview' | 'recipient' | 'amount' | 'review' | 'sending' | 'done';

const AMOUNT_KEYS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'DEL'],
];

export default function TransactionPanel({ token, onClose }: TransactionPanelProps) {
    const wallet = useWallet();
    const { validateAddress, parseAmount, estimateFee, send } = wallet;
    const chain = CHAINS[token.chainKey];
    const [step, setStep] = useState<Step>('overview');
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
    const [fee, setFee] = useState<string | null>(null);
    const [hash, setHash] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const decimals = chain?.nativeCurrency.decimals ?? 18;
    const balanceKnown = token.status === 'success';

    const acceptRecipient = useCallback((text: string) => {
        const candidate = text.trim();
        if (!candidate) return;
        if (validateAddress(candidate, token.chainKey)) {
            setRecipient(candidate);
            setMessage(null);
        } else {
            setMessage({ text: `NOT A VALID ${token.network.toUpperCase()} ADDRESS`, error: true });
        }
    }, [validateAddress, token.chainKey, token.network]);

    // Desktop: Ctrl/Cmd+V pastes a recipient while on that step.
    useEffect(() => {
        if (step !== 'recipient') return;
        const onPaste = (e: ClipboardEvent) => acceptRecipient(e.clipboardData?.getData('text') || '');
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [step, acceptRecipient]);

    useEffect(() => {
        if (step !== 'review') return;
        let cancelled = false;
        estimateFee(token.chainKey).then(f => { if (!cancelled) setFee(f); });
        return () => { cancelled = true; };
    }, [step, estimateFee, token.chainKey]);

    const pasteFromClipboard = async () => {
        try {
            acceptRecipient(await navigator.clipboard.readText());
        } catch {
            setMessage({ text: 'CLIPBOARD BLOCKED — PRESS CTRL/CMD+V INSTEAD', error: true });
        }
    };

    const pressAmountKey = (key: string) => {
        setMessage(null);
        if (key === 'DEL') return setAmount(a => a.slice(0, -1));
        if (key === '.') return setAmount(a => (a.includes('.') ? a : (a || '0') + '.'));
        setAmount(a => {
            if (a.length >= 18) return a;
            const fraction = a.split('.')[1];
            if (fraction !== undefined && fraction.length >= decimals) return a;
            return a === '0' ? key : a + key;
        });
    };

    const setMax = async () => {
        if (!balanceKnown) return;
        const balance = ethers.parseUnits(token.balance, decimals);
        const f = await estimateFee(token.chainKey);
        // Keep 1.5x the estimated fee aside for gas.
        const reserve = f ? ethers.parseUnits(f, decimals) * 3n / 2n : 0n;
        setAmount(ethers.formatUnits(balance > reserve ? balance - reserve : 0n, decimals));
    };

    const validateAmount = (): boolean => {
        try {
            const value = parseAmount(amount, token.chainKey);
            if (balanceKnown && value > ethers.parseUnits(token.balance, decimals)) {
                setMessage({ text: 'AMOUNT EXCEEDS YOUR BALANCE', error: true });
                return false;
            }
            return true;
        } catch (e) {
            setMessage({ text: errorMessage(e).toUpperCase(), error: true });
            return false;
        }
    };

    const confirmSend = async () => {
        setStep('sending');
        setMessage(null);
        try {
            const txHash = await send({ chainKey: token.chainKey, to: recipient, amount });
            setHash(txHash);
            setStep('done');
        } catch (e) {
            setMessage({ text: errorMessage(e), error: true });
            setStep('review');
        }
    };

    const copyAddress = async () => {
        try {
            await navigator.clipboard.writeText(token.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard unavailable */ }
    };

    const usd = token.usdPrice !== undefined && amount ? Number(amount) * token.usdPrice : null;
    const symbol = token.symbol;

    return (
        <group>
            {/* Panel */}
            <RoundedBox args={[1.5, 2.3, 0.08]} radius={0.08} smoothness={4}>
                <meshStandardMaterial color={XR_THEME.surface} transparent opacity={0.9} metalness={0.8} roughness={0.2} />
            </RoundedBox>
            <RoundedBox args={[1.52, 2.32, 0.04]} radius={0.08} smoothness={4} position={[0, 0, -0.04]}>
                <meshStandardMaterial color={token.color} transparent opacity={0.35} emissive={token.color} emissiveIntensity={0.4} />
            </RoundedBox>

            <group position={[0, 0, 0.05]}>
                <Text position={[0, 0.98, 0]} fontSize={0.1} color="white" anchorX="center">
                    {step === 'overview' ? token.name.toUpperCase() : `SEND ${symbol}`}
                </Text>
                <mesh position={[0, 0.88, 0]}>
                    <planeGeometry args={[0.6, 0.005]} />
                    <meshBasicMaterial color={token.color} />
                </mesh>

                {step === 'overview' && (
                    <group>
                        <Text position={[0, 0.72, 0]} fontSize={0.04} color={XR_THEME.faint} anchorX="center">YOUR ADDRESS</Text>
                        <Text position={[0, 0.64, 0]} fontSize={0.045} color="#cbd5e1" anchorX="center">{truncateAddress(token.address, 10, 8)}</Text>
                        <Text position={[0, 0.42, 0]} fontSize={0.05} color={XR_THEME.faint} anchorX="center">BALANCE</Text>
                        <Text position={[0, 0.28, 0]} fontSize={0.13} color="white" anchorX="center">
                            {token.status === 'success' ? `${formatAmount(token.balance)} ${symbol}` : token.status === 'loading' ? 'LOADING…' : 'OFFLINE'}
                        </Text>
                        <Text position={[0, 0.16, 0]} fontSize={0.045} color={XR_THEME.muted} anchorX="center">
                            {token.usdValue !== undefined ? formatUsd(token.usdValue) : ''}
                        </Text>
                        <Button3D
                            label={token.canSend ? `SEND ${symbol}` : `SENDING ${symbol} NOT SUPPORTED YET`}
                            onPress={() => { setMessage(null); setStep('recipient'); }}
                            position={[0, -0.15, 0]}
                            width={1.1}
                            height={0.2}
                            color={XR_THEME.info}
                            disabled={!token.canSend || wallet.isLocked}
                        />
                        <Button3D label={copied ? 'COPIED!' : 'COPY MY ADDRESS'} onPress={copyAddress} position={[0, -0.42, 0]} width={1.1} height={0.2} color={XR_THEME.brand} />
                        <Button3D label="CLOSE" onPress={onClose} position={[0, -0.9, 0]} width={0.6} height={0.16} />
                    </group>
                )}

                {step === 'recipient' && (
                    <group>
                        <Text position={[0, 0.7, 0]} fontSize={0.045} color={XR_THEME.muted} anchorX="center" maxWidth={1.3} textAlign="center">
                            COPY THE RECIPIENT&apos;S {token.network.toUpperCase()} ADDRESS, THEN PASTE IT HERE
                        </Text>
                        <RoundedBox args={[1.3, 0.3, 0.02]} radius={0.03} smoothness={4} position={[0, 0.38, -0.01]}>
                            <meshStandardMaterial color="#020617" />
                        </RoundedBox>
                        <Text position={[0, 0.38, 0.01]} fontSize={0.04} color={recipient ? XR_THEME.text : XR_THEME.faint} anchorX="center" maxWidth={1.2} textAlign="center">
                            {recipient || 'NO ADDRESS YET'}
                        </Text>
                        <Button3D label="PASTE ADDRESS" onPress={pasteFromClipboard} position={[0, 0.05, 0]} width={1.1} height={0.2} color={XR_THEME.brand} />
                        <Button3D label="BACK" onPress={() => { setStep('overview'); setMessage(null); }} position={[-0.3, -0.9, 0]} width={0.5} height={0.16} />
                        <Button3D label="NEXT" onPress={() => { setMessage(null); setStep('amount'); }} position={[0.3, -0.9, 0]} width={0.5} height={0.16} color={XR_THEME.info} disabled={!recipient} />
                    </group>
                )}

                {step === 'amount' && (
                    <group>
                        <Text position={[0, 0.74, 0]} fontSize={0.04} color={XR_THEME.faint} anchorX="center">
                            {balanceKnown ? `AVAILABLE ${formatAmount(token.balance)} ${symbol}` : 'BALANCE UNAVAILABLE'}
                        </Text>
                        <Text position={[0, 0.6, 0]} fontSize={0.11} color="white" anchorX="center" maxWidth={1.3}>
                            {`${amount || '0'} ${symbol}`}
                        </Text>
                        <Text position={[0, 0.5, 0]} fontSize={0.04} color={XR_THEME.muted} anchorX="center">
                            {usd !== null && Number.isFinite(usd) ? `~ ${formatUsd(usd)}` : ' '}
                        </Text>
                        <group position={[-0.1, 0.33, 0]}>
                            {AMOUNT_KEYS.map((row, i) => row.map((key, j) => (
                                <Button3D key={key} label={key} onPress={() => pressAmountKey(key)} position={[(j - 1) * 0.3, -i * 0.2, 0]}
                                    width={0.27} height={0.17} fontSize={key === 'DEL' ? 0.045 : 0.07} color={XR_THEME.raised} />
                            )))}
                        </group>
                        <Button3D label="MAX" onPress={setMax} position={[0.55, 0.33, 0]} width={0.22} height={0.17} fontSize={0.045} color={XR_THEME.brand} disabled={!balanceKnown} />
                        <Button3D label="CLR" onPress={() => setAmount('')} position={[0.55, 0.13, 0]} width={0.22} height={0.17} fontSize={0.045} />
                        <Button3D label="BACK" onPress={() => { setStep('recipient'); setMessage(null); }} position={[-0.3, -0.9, 0]} width={0.5} height={0.16} />
                        <Button3D label="REVIEW" onPress={() => { if (validateAmount()) setStep('review'); }} position={[0.3, -0.9, 0]} width={0.5} height={0.16} color={XR_THEME.info} disabled={!amount} />
                    </group>
                )}

                {(step === 'review' || step === 'sending') && (
                    <group>
                        <Text position={[0, 0.66, 0]} fontSize={0.12} color="white" anchorX="center" maxWidth={1.3}>{`${formatAmount(amount)} ${symbol}`}</Text>
                        <Text position={[0, 0.54, 0]} fontSize={0.04} color={XR_THEME.muted} anchorX="center">{usd !== null && Number.isFinite(usd) ? `~ ${formatUsd(usd)}` : ' '}</Text>
                        <Text position={[-0.6, 0.38, 0]} fontSize={0.04} color={XR_THEME.faint} anchorX="left">TO</Text>
                        <Text position={[-0.6, 0.3, 0]} fontSize={0.036} color={XR_THEME.text} anchorX="left" maxWidth={1.2}>{recipient}</Text>
                        <Text position={[-0.6, 0.12, 0]} fontSize={0.04} color={XR_THEME.faint} anchorX="left">NETWORK</Text>
                        <Text position={[-0.6, 0.05, 0]} fontSize={0.045} color={XR_THEME.text} anchorX="left">{chain?.name}</Text>
                        <Text position={[-0.6, -0.1, 0]} fontSize={0.04} color={XR_THEME.faint} anchorX="left">NETWORK FEE</Text>
                        <Text position={[-0.6, -0.17, 0]} fontSize={0.045} color={XR_THEME.text} anchorX="left">
                            {fee ? `~ ${formatAmount(fee, 8)} ${symbol}` : 'ESTIMATED AT SIGNING'}
                        </Text>
                        <Text position={[0, -0.36, 0]} fontSize={0.036} color="#fbbf24" anchorX="center" maxWidth={1.3} textAlign="center">
                            TRANSACTIONS CANNOT BE REVERSED. CHECK THE ADDRESS.
                        </Text>
                        <Button3D label="BACK" onPress={() => { setStep('amount'); setMessage(null); }} position={[-0.3, -0.9, 0]} width={0.5} height={0.16} disabled={step === 'sending'} />
                        <Button3D label={step === 'sending' ? 'SIGNING…' : 'CONFIRM & SEND'} onPress={confirmSend} position={[0.3, -0.9, 0]} width={0.5} height={0.16} color={XR_THEME.success} disabled={step === 'sending'} />
                    </group>
                )}

                {step === 'done' && (
                    <group>
                        <Text position={[0, 0.55, 0]} fontSize={0.12} color={XR_THEME.success} anchorX="center">SENT</Text>
                        <Text position={[0, 0.36, 0]} fontSize={0.05} color="white" anchorX="center">{`${formatAmount(amount)} ${symbol} TO ${truncateAddress(recipient)}`}</Text>
                        <Text position={[0, 0.2, 0]} fontSize={0.035} color={XR_THEME.muted} anchorX="center" maxWidth={1.3} textAlign="center">
                            {`SUBMITTED TO ${chain?.name.toUpperCase()} · ${hash ? truncateAddress(hash, 10, 8) : ''}`}
                        </Text>
                        {hash && getExplorerTxUrl(token.chainKey, hash) && (
                            <Button3D label="OPEN IN EXPLORER" onPress={() => window.open(getExplorerTxUrl(token.chainKey, hash)!, '_blank', 'noopener,noreferrer')}
                                position={[0, -0.1, 0]} width={1.0} height={0.18} color={XR_THEME.brand} />
                        )}
                        <Button3D label="DONE" onPress={onClose} position={[0, -0.9, 0]} width={0.6} height={0.16} color={XR_THEME.info} />
                    </group>
                )}

                {message && (
                    <Text position={[0, -0.68, 0]} fontSize={0.036} color={message.error ? XR_THEME.danger : XR_THEME.success} anchorX="center" maxWidth={1.35} textAlign="center">
                        {message.text}
                    </Text>
                )}
            </group>
        </group>
    );
}
