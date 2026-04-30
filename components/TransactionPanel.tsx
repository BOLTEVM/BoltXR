'use client';

import { Interactive } from '@react-three/xr';
import { Text } from '@react-three/drei';
import { useState } from 'react';

interface TransactionPanelProps {
    token: any;
    onClose: () => void;
    onSend: (to: string, amount: string, symbol: string) => Promise<boolean>;
    onSwap: (from: string, to: string, amount: string) => Promise<boolean>;
}

function Button3D({ label, onClick, position, color = "#444" }: { label: string, onClick: () => void, position: [number, number, number], color?: string }) {
    const [hovered, setHovered] = useState(false);
    return (
        <Interactive onSelect={onClick} onHover={() => setHovered(true)} onBlur={() => setHovered(false)}>
            <group position={position}>
                <mesh scale={hovered ? 1.05 : 1}>
                    <planeGeometry args={[0.8, 0.25]} />
                    <meshStandardMaterial
                        color={hovered ? "#fff" : color}
                        emissive={hovered ? "#fff" : color}
                        emissiveIntensity={hovered ? 0.2 : 0}
                        transparent
                        opacity={0.9}
                    />
                </mesh>
                <Text position={[0, 0, 0.01]} fontSize={0.08} color={hovered ? "black" : "white"} anchorX="center" anchorY="middle">
                    {label}
                </Text>
            </group>
        </Interactive>
    );
}

export default function TransactionPanel({ token, onClose, onSend, onSwap }: TransactionPanelProps) {
    const [status, setStatus] = useState<string>("");

    const handleSend = async () => {
        setStatus("Processing Send...");
        await onSend("0x123...", "10", token.symbol);
        setStatus("Transaction Confirmed!");
        setTimeout(() => setStatus(""), 3000);
    };

    const handleSwap = async () => {
        setStatus("Processing Swap...");
        await onSwap(token.symbol, "USDC", "10");
        setStatus("Swap Successful!");
        setTimeout(() => setStatus(""), 3000);
    };

    return (
        <group>
            {/* Glass Background */}
            <mesh>
                <planeGeometry args={[1.5, 2]} />
                <meshStandardMaterial color="#000" transparent opacity={0.8} />
            </mesh>
            <mesh position={[0, 0, -0.01]}>
                <planeGeometry args={[1.52, 2.02]} />
                <meshStandardMaterial color={token.color} transparent opacity={0.3} />
            </mesh>

            {/* Header */}
            <Text position={[0, 0.8, 0.02]} fontSize={0.16} color="white" anchorX="center">
                {token.name}
            </Text>

            <mesh position={[0, 0.65, 0.01]}>
                <planeGeometry args={[0.5, 0.01]} />
                <meshStandardMaterial color={token.color} />
            </mesh>

            <Text position={[0, 0.5, 0.02]} fontSize={0.1} color="#aaa" anchorX="center">
                {token.network} Network
            </Text>

            <Text position={[0, 0.2, 0.02]} fontSize={0.12} color="white" anchorX="center">
                Balance: {token.balance} {token.symbol}
            </Text>

            {/* Actions */}
            <group position={[0, -0.2, 0]}>
                <Button3D label={`Send 10 ${token.symbol}`} position={[0, 0.15, 0.02]} onClick={handleSend} color="#3b82f6" />
                <Button3D label="Swap to USDC" position={[0, -0.15, 0.02]} onClick={handleSwap} color="#8b5cf6" />
            </group>

            <Button3D label="Close Panel" position={[0, -0.7, 0.02]} onClick={onClose} color="#ef4444" />

            {/* Status Indicator */}
            {status && (
                <Text position={[0, -0.5, 0.02]} fontSize={0.08} color="#10b981" anchorX="center">
                    {status}
                </Text>
            )}
        </group>
    );
}
