'use client';

import { useState } from 'react';
import { Environment, Lightformer, Grid, OrbitControls, Stars } from '@react-three/drei';
import { useWallet, MIN_NEW_PIN_LENGTH, type Token } from '@/hooks/useWallet';
import { errorMessage } from '@/lib/format';
import Token3D from './Token3D';
import Dashboard from './Dashboard';
import TransactionPanel from './TransactionPanel';
import SwapScale from './SwapScale';
import SecurityPinPad from './SecurityPinPad';
import TokenRain from './TokenRain';
import EnvironmentSelector, { EnvType } from './EnvironmentSelector';
import SecureInfoPanel from './SecureInfoPanel';
import SafeBoundary from './xr/SafeBoundary';
import QRPanel3D from './QRPanel3D';
import ContractClipboard3D from './ContractClipboard3D';

const ENV_TINT: Record<EnvType, string> = {
    space: '#6366f1',
    sunset: '#f43f5e',
    forest: '#10b981',
    city: '#3b82f6',
    rain: '#f59e0b',
};

export default function Scene() {
    const { tokens, account, isLocked, isVaultSetup, unlock, setup, swap, lock, lockoutUntil } = useWallet();
    const [selectedChain, setSelectedChain] = useState<string | null>(null);
    const selectedToken = tokens.find(t => t.chainKey === selectedChain) || null;
    const [inputTokenForSwap, setInputTokenForSwap] = useState<Token | null>(null);
    const [targetTokenForSwap, setTargetTokenForSwap] = useState<Token | null>(null);
    
    // Environment State
    const [env, setEnv] = useState<EnvType>('space');

    // PIN Pad State
    const [showPinPad, setShowPinPad] = useState(false);
    const [pinPadAction, setPinPadAction] = useState<'unlock' | 'setup' | 'setup-confirm' | null>(null);
    const [pendingPin, setPendingPin] = useState('');
    const [pinBusy, setPinBusy] = useState(false);
    const [pinError, setPinError] = useState("");
    
    // Secure Info State
    const [showSecureInfo, setShowSecureInfo] = useState(false);
    const [secureContent, setSecureContent] = useState("");

    // QR & Contract Clipboard State
    const [showQR, setShowQR] = useState(false);
    const [showClipboard, setShowClipboard] = useState(false);

    const handleConnect = () => {
        // First-run users must set up a vault before there is anything to unlock.
        if (!isVaultSetup) {
            setPinPadAction('setup');
            setShowPinPad(true);
        } else if (isLocked) {
            setPinPadAction('unlock');
            setShowPinPad(true);
        }
    };

    const closePinPad = () => {
        setShowPinPad(false);
        setPinPadAction(null);
        setPendingPin('');
        setPinError("");
    };

    const handlePinConfirm = async (pin: string) => {
        setPinError("");
        if (pinPadAction === 'unlock') {
            setPinBusy(true);
            const result = await unlock(pin);
            setPinBusy(false);
            if (result.ok) closePinPad();
            else setPinError((result.error || 'Incorrect PIN').toUpperCase());
        } else if (pinPadAction === 'setup') {
            if (/^(\d)\1+$/.test(pin)) {
                setPinError("AVOID REPEATED DIGITS");
                return;
            }
            setPendingPin(pin);
            setPinPadAction('setup-confirm');
        } else if (pinPadAction === 'setup-confirm') {
            if (pin !== pendingPin) {
                setPinError("PINS DO NOT MATCH — START AGAIN");
                setPendingPin('');
                setPinPadAction('setup');
                return;
            }
            setPinBusy(true);
            try {
                const mnemonic = await setup(pin);
                if (!mnemonic) throw new Error('Setup failed');
                setSecureContent(mnemonic);
                setShowSecureInfo(true);
                closePinPad();
            } catch (e) {
                setPinError(errorMessage(e).toUpperCase());
                setPinPadAction('setup');
            } finally {
                setPinBusy(false);
            }
        }
    };

    const handleDrop = (symbol: string, pos: [number, number, number]) => {
        const panX = -0.9;
        const panY = 0.9;
        const panZ = -1.5;
        const dist = Math.sqrt(Math.pow(pos[0] - panX, 2) + Math.pow(pos[1] - panY, 2) + Math.pow(pos[2] - panZ, 2));

        if (dist < 0.5) {
            const token = tokens.find(t => t.symbol === symbol);
            setInputTokenForSwap(token || null);
            setTargetTokenForSwap(null);
        } else if (inputTokenForSwap?.symbol === symbol) {
            setInputTokenForSwap(null);
            setTargetTokenForSwap(null);
        }
    };

    const handleConfirmSwap = async () => {
        if (inputTokenForSwap && targetTokenForSwap) {
            const success = await swap(inputTokenForSwap.symbol, targetTokenForSwap.symbol, "1");
            if (success) {
                setInputTokenForSwap(null);
                setTargetTokenForSwap(null);
            }
        }
    };

    const radius = 2.5;

    return (
        <>
            <ambientLight intensity={env === 'sunset' ? 0.6 : 0.4} />
            <pointLight position={[10, 10, 10]} intensity={1.5} />
            <pointLight position={[-10, 5, -5]} intensity={0.8} color={env === 'space' ? "#4c1d95" : "#f43f5e"} />

            {env === 'space' && <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />}
            {env === 'rain' && <SafeBoundary><TokenRain count={40} /></SafeBoundary>}
            
            {/* Procedural reflections: no remote HDR download, so it also works offline. */}
            <Environment resolution={64} frames={1}>
                <Lightformer intensity={1.2} color={ENV_TINT[env]} position={[0, 4, -6]} scale={[10, 4, 1]} />
                <Lightformer intensity={0.6} color="#ffffff" position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
                <Lightformer intensity={0.4} color={ENV_TINT[env]} position={[6, 1, 2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
            </Environment>

            <Grid 
                args={[20, 20]} 
                cellColor={env === 'forest' ? "#064e3b" : "#202030"} 
                sectionColor={env === 'forest' ? "#065f46" : "#404060"} 
                position={[0, -2, 0]} 
                infiniteGrid 
            />

            {/* Main Dashboard */}
            <group position={[0, 2.4, -3]}>
                <Dashboard account={account} isLocked={isLocked} isVaultSetup={isVaultSetup} onConnect={handleConnect} onLock={() => { lock(); setSelectedChain(null); setShowQR(false); setShowClipboard(false); }} onShowQR={() => setShowQR(!showQR)} onShowContracts={() => setShowClipboard(!showClipboard)} />
            </group>

            {/* Environment Selector */}
            {!showPinPad && !showSecureInfo && !selectedToken && (
                <group position={[0, 0.5, -2.5]}>
                    <EnvironmentSelector current={env} onSelect={setEnv} />
                </group>
            )}

            {/* Security PIN Pad (Conditional Overlay) */}
            {showPinPad && (
                <group position={[0, 1.5, -1]}>
                    <SecurityPinPad
                        title={pinPadAction === 'unlock' ? "UNLOCK VAULT" : pinPadAction === 'setup-confirm' ? "CONFIRM NEW PIN" : "CHOOSE A NEW PIN"}
                        subtitle={pinPadAction === 'unlock' ? undefined : `AT LEAST ${MIN_NEW_PIN_LENGTH} DIGITS · ENCRYPTS YOUR VAULT`}
                        minLength={pinPadAction === 'unlock' ? 4 : MIN_NEW_PIN_LENGTH}
                        error={pinError}
                        busy={pinBusy}
                        lockoutUntil={pinPadAction === 'unlock' ? lockoutUntil : null}
                        onConfirm={handlePinConfirm}
                        onCancel={closePinPad}
                    />
                </group>
            )}

            {/* Secure Info Panel (Mnemonic display) */}
            {showSecureInfo && (
                <group position={[0, 1.5, -1]}>
                    <SecureInfoPanel 
                        title="NEW VAULT SEED"
                        content={secureContent}
                        onClose={() => setShowSecureInfo(false)}
                    />
                </group>
            )}

            {/* Swap Scale */}
            {!showPinPad && !showSecureInfo && !selectedToken && (
                <group position={[0, 1.2, -1.5]}>
                    <SwapScale 
                        inputToken={inputTokenForSwap}
                        targetToken={targetTokenForSwap}
                        onSelectTarget={setTargetTokenForSwap}
                        onConfirm={handleConfirmSwap}
                        availableTokens={tokens}
                    />
                </group>
            )}

            {/* Tokens Layout */}
            {!showPinPad && !showSecureInfo && !selectedToken && (
                <group position={[0, 1.2, 0]}>
                    {tokens.map((token, i) => {
                        const angle = (i - (tokens.length - 1) / 2) * 0.4;
                        const x = Math.sin(angle) * radius;
                        const z = -Math.cos(angle) * radius;
                        if (inputTokenForSwap?.symbol === token.symbol) return null;

                        return (
                            <Token3D
                                key={token.chainKey}
                                symbol={token.symbol}
                                color={token.color}
                                network={token.network}
                                balance={token.balance}
                                status={token.status}
                                logo={token.logo}
                                position={[x, 0, z]}
                                onClick={() => setSelectedChain(token.chainKey)}
                                onDrop={handleDrop}
                            />
                        );
                    })}
                </group>
            )}

            {/* Transaction Panel */}
            {selectedToken && !showPinPad && !showSecureInfo && (
                // Focused view: centered in front of the user while the coins are hidden.
                <group position={[0, 1.5, 0.4]} scale={0.85}>
                    <TransactionPanel
                        key={selectedToken.chainKey}
                        token={selectedToken}
                        onClose={() => setSelectedChain(null)}
                    />
                </group>
            )}

            <OrbitControls makeDefault target={[0, 1.2, -1]} minDistance={1} maxDistance={10} />

            {/* QR Panel */}
            {showQR && !showPinPad && (
                <group position={[1.8, 1.8, -1.5]} rotation={[0, -0.3, 0]}>
                    <QRPanel3D address={account} onClose={() => setShowQR(false)} />
                </group>
            )}

            {/* Contract Clipboard */}
            {showClipboard && !showPinPad && (
                <group position={[-1.8, 1.5, -1.5]} rotation={[0, 0.3, 0]}>
                    <ContractClipboard3D
                        chainId="ethereum"
                        walletId={account}
                        onClose={() => setShowClipboard(false)}
                    />
                </group>
            )}
        </>
    );
}
