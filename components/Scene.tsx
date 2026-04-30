'use client';

import { Suspense, useState } from 'react';
import { Environment, Grid, OrbitControls, Stars } from '@react-three/drei';
import { useWallet } from '@/hooks/useWallet';
import Token3D from './Token3D';
import Dashboard from './Dashboard';
import TransactionPanel from './TransactionPanel';
import SwapScale from './SwapScale';
import SecurityPinPad from './SecurityPinPad';
import TokenRain from './TokenRain';
import EnvironmentSelector, { EnvType } from './EnvironmentSelector';

export default function Scene() {
    const { tokens, account, isLocked, isVaultSetup, unlock, setup, connect, send, swap, lockoutUntil } = useWallet();
    const [selectedToken, setSelectedToken] = useState<any>(null);
    const [inputTokenForSwap, setInputTokenForSwap] = useState<any>(null);
    const [targetTokenForSwap, setTargetTokenForSwap] = useState<any>(null);
    
    // Environment State
    const [env, setEnv] = useState<EnvType>('space');

    // PIN Pad State
    const [showPinPad, setShowPinPad] = useState(false);
    const [pinPadAction, setPinPadAction] = useState<'unlock' | 'setup' | null>(null);
    const [pinError, setPinError] = useState("");

    const handleConnect = () => {
        if (isLocked) {
            setPinPadAction('unlock');
            setShowPinPad(true);
        } else if (!isVaultSetup) {
            setPinPadAction('setup');
            setShowPinPad(true);
        } else {
            connect();
        }
    };

    const handlePinConfirm = async (pin: string) => {
        setPinError("");
        if (pinPadAction === 'unlock') {
            const success = await unlock(pin);
            if (success) {
                setShowPinPad(false);
                setPinPadAction(null);
            } else {
                setPinError("INVALID PIN");
            }
        } else if (pinPadAction === 'setup') {
            const mnemonic = await setup(pin);
            if (mnemonic) {
                alert("Vault Created! Save your mnemonic:\n" + mnemonic);
                setShowPinPad(false);
                setPinPadAction(null);
            } else {
                setPinError("SETUP FAILED");
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
            setInputTokenForSwap(token);
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
            {env === 'rain' && <TokenRain count={40} />}
            
            <Environment preset={env === 'rain' ? 'city' : (env === 'space' ? 'night' : env as any)} />

            <Grid 
                args={[20, 20]} 
                cellColor={env === 'forest' ? "#064e3b" : "#202030"} 
                sectionColor={env === 'forest' ? "#065f46" : "#404060"} 
                position={[0, -2, 0]} 
                infiniteGrid 
            />

            {/* Main Dashboard */}
            <group position={[0, 2.4, -3]}>
                <Dashboard account={account} isLocked={isLocked} onConnect={handleConnect} />
            </group>

            {/* Environment Selector */}
            <group position={[0, 0.5, -2.5]}>
                <EnvironmentSelector current={env} onSelect={setEnv} />
            </group>

            {/* Security PIN Pad (Conditional Overlay) */}
            {showPinPad && (
                <group position={[0, 1.5, -1]}>
                    <SecurityPinPad 
                        title={pinPadAction === 'setup' ? "SET NEW PIN" : "UNLOCK VAULT"}
                        error={pinError}
                        lockoutUntil={lockoutUntil}
                        onConfirm={handlePinConfirm}
                        onCancel={() => { setShowPinPad(false); setPinPadAction(null); }}
                    />
                </group>
            )}

            {/* Swap Scale */}
            {!showPinPad && (
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
            {!showPinPad && (
                <group position={[0, 1.2, 0]}>
                    {tokens.map((token, i) => {
                        const angle = (i - (tokens.length - 1) / 2) * 0.4;
                        const x = Math.sin(angle) * radius;
                        const z = -Math.cos(angle) * radius;
                        if (inputTokenForSwap?.symbol === token.symbol) return null;

                        return (
                            <Token3D
                                key={token.symbol}
                                symbol={token.symbol}
                                color={token.color}
                                network={token.network}
                                balance={token.balance}
                                status={token.status}
                                logo={token.logo}
                                position={[x, 0, z]}
                                onClick={() => setSelectedToken(token)}
                                onDrop={handleDrop}
                            />
                        );
                    })}
                </group>
            )}

            {/* Transaction Panel */}
            {selectedToken && !showPinPad && (
                <group position={[selectedToken.symbol === 'ETH' ? -1.5 : 1.5, 1.5, -2]} rotation={[0, selectedToken.symbol === 'ETH' ? 0.3 : -0.3, 0]}>
                    <TransactionPanel
                        token={selectedToken}
                        onClose={() => setSelectedToken(null)}
                        onSend={send}
                        onSwap={swap}
                    />
                </group>
            )}

            <OrbitControls makeDefault target={[0, 1.2, -1]} minDistance={1} maxDistance={10} />
        </>
    );
}
