'use client';

import { useState, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, RoundedBox, Float } from '@react-three/drei';
import { Group } from 'three';
 
interface TransactionPanelProps {
    token: {
        symbol: string;
        name: string;
        balance: string;
        address: string;
        network: string;
        color: string;
        chainId: string;
    };
    onClose: () => void;
    onSend: (to: string, amount: string, symbol: string) => Promise<boolean>;
    onSwap: (from: string, to: string, amount: string) => Promise<boolean>;
}
 
function Button3D({ label, onClick, position, color = "#444" }: { label: string, onClick: () => void, position: [number, number, number], color?: string }) {
    const [hovered, setHovered] = useState(false);
    return (
        <group 
          position={position}
          onPointerDown={onClick}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
            <RoundedBox args={[0.8, 0.25, 0.05]} radius={0.05} smoothness={4} scale={hovered ? 1.05 : 1}>
                <meshStandardMaterial
                    color={hovered ? "#fff" : color}
                    emissive={hovered ? "#fff" : color}
                    emissiveIntensity={hovered ? 0.5 : 0.2}
                    metalness={0.8}
                    roughness={0.2}
                />
            </RoundedBox>
            <Text position={[0, 0, 0.04]} fontSize={0.06} color={hovered ? "black" : "white"} anchorX="center" anchorY="middle">
                {label}
            </Text>
        </group>
    );
}

export default function TransactionPanel({ token, onClose, onSend, onSwap }: TransactionPanelProps) {
    const [status, setStatus] = useState<string>("");
    
    const truncatedAddress = useMemo(() => {
        if (!token.address) return "";
        return `${token.address.substring(0, 8)}...${token.address.substring(token.address.length - 6)}`;
    }, [token.address]);

    const feeInfo = useMemo(() => {
        if (token.symbol === 'BTC') return "~45 sats/vB";
        if (token.symbol === 'SUI') return "~0.002 SUI";
        return "Live Gas (LI.FI)";
    }, [token.symbol]);

    const handleSend = async () => {
        setStatus("PREPARING SIGNATURE...");
        const dest = token.symbol === 'BTC' ? "bc1qxy2kg..." : "0x742d35Cc...";
        const success = await onSend(dest, "0.01", token.symbol);
        if (success) {
            setStatus("TRANSACTION BROADCAST!");
        } else {
            setStatus("SIGNING FAILED");
        }
        setTimeout(() => setStatus(""), 4000);
    };

    const handleSwap = async () => {
        setStatus("PREPARING SWAP...");
        const success = await onSwap(token.symbol, "USDC", "1.0");
        if (success) {
            setStatus("SWAP COMPLETE!");
        } else {
            setStatus("SWAP FAILED");
        }
        setTimeout(() => setStatus(""), 4000);
    };

    return (
        <group>
            <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2}>
                {/* Immersive Glass Background */}
                <RoundedBox args={[1.5, 2.2, 0.1]} radius={0.1} smoothness={4}>
                    <meshStandardMaterial 
                        color="#0f172a" 
                        transparent 
                        opacity={0.85} 
                        metalness={0.9} 
                        roughness={0.1} 
                    />
                </RoundedBox>
                <RoundedBox args={[1.52, 2.22, 0.05]} radius={0.1} smoothness={4} position={[0, 0, -0.05]}>
                    <meshStandardMaterial color={token.color} transparent opacity={0.4} emissive={token.color} emissiveIntensity={0.5} />
                </RoundedBox>

                {/* Header Section */}
                <Text position={[0, 0.9, 0.06]} fontSize={0.14} color="white" anchorX="center">
                    {token.name.toUpperCase()}
                </Text>

                <mesh position={[0, 0.75, 0.06]}>
                    <planeGeometry args={[0.6, 0.005]} />
                    <meshStandardMaterial color={token.color} emissive={token.color} emissiveIntensity={1} />
                </mesh>

                <Text position={[0, 0.6, 0.06]} fontSize={0.06} color="#94a3b8" anchorX="center">
                    {token.network.toUpperCase()} PROTOCOL
                </Text>

                {/* Wallet Info Card */}
                <group position={[0, 0.35, 0.06]}>
                    <RoundedBox args={[1.2, 0.3, 0.02]} radius={0.05}>
                        <meshStandardMaterial color="#1e293b" metalness={0.8} />
                    </RoundedBox>
                    <Text position={[-0.5, 0.05, 0.02]} fontSize={0.04} color="#64748b" anchorX="left">
                        YOUR ADDRESS
                    </Text>
                    <Text position={[-0.5, -0.05, 0.02]} fontSize={0.05} color="#cbd5e1" anchorX="left">
                        {truncatedAddress}
                    </Text>
                </group>

                <group position={[0, -0.05, 0.06]}>
                    <Text fontSize={0.06} color="#64748b" position={[0, 0.12, 0]} anchorX="center">
                        AVAILABLE ASSETS
                    </Text>
                    <Text fontSize={0.18} color="white" anchorX="center">
                        {token.balance} <Text fontSize={0.1} color={token.color} position={[0.2, 0, 0]}>{token.symbol}</Text>
                    </Text>
                    <Text fontSize={0.04} color="#10b981" position={[0, -0.12, 0]} anchorX="center">
                        EST. FEE: {feeInfo}
                    </Text>
                </group>

                {/* Interactive Actions */}
                <group position={[0, -0.5, 0.06]}>
                    <Button3D label={`SEND ${token.symbol}`} position={[0, 0.15, 0]} onClick={handleSend} color="#3b82f6" />
                    <Button3D label="INSTANT SWAP" position={[0, -0.15, 0]} onClick={handleSwap} color="#8b5cf6" />
                </group>

                <Button3D label="DISMISS" position={[0, -0.9, 0.06]} onClick={onClose} color="#334155" />

                {/* Animated Status Bar */}
                {status && (
                    <group position={[0, -0.7, 0.08]}>
                        <Text fontSize={0.05} color="#10b981" anchorX="center">
                            {status}
                        </Text>
                    </group>
                )}
            </Float>
        </group>
    );
}
