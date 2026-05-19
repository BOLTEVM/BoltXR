'use client';

import { useState } from 'react';
import { Text, useTexture, RoundedBox } from '@react-three/drei';
import { Interactive } from '@react-three/xr';

interface DashboardProps {
    account: string | null;
    isLocked?: boolean;
    onConnect: () => void;
    onShowQR?: () => void;
    onShowContracts?: () => void;
}

function DashBtn({ label, onClick, position, color }: { label: string; onClick: () => void; position: [number, number, number]; color: string }) {
    const [hovered, setHovered] = useState(false);
    return (
        <Interactive onSelect={onClick}>
            <group position={position} onPointerDown={onClick} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
                <RoundedBox args={[0.5, 0.15, 0.02]} radius={0.02} smoothness={4} scale={hovered ? 1.05 : 1}>
                    <meshStandardMaterial color={hovered ? "#fff" : color} emissive={hovered ? "#fff" : color} emissiveIntensity={hovered ? 0.5 : 0.2} metalness={0.8} roughness={0.2} />
                </RoundedBox>
                <Text position={[0, 0, 0.02]} fontSize={0.04} color={hovered ? "black" : "white"} anchorX="center" anchorY="middle">
                    {label}
                </Text>
            </group>
        </Interactive>
    );
}

export default function Dashboard({ account, isLocked, onConnect, onShowQR, onShowContracts }: DashboardProps) {
    const logoTexture = useTexture('/0logov3.png');

    return (
        <group>
            {/* Logo */}
            <mesh position={[0, 0.75, 0.02]}>
                <planeGeometry args={[0.4, 0.4]} />
                <meshBasicMaterial map={logoTexture} transparent />
            </mesh>
            {/* Glossy Panel */}
            <mesh>
                <planeGeometry args={[2.5, 1.2]} />
                <meshStandardMaterial
                    color={"#0f172a"}
                    transparent
                    opacity={0.8}
                    metalness={0.8}
                    roughness={0.1}
                />
            </mesh>

            {/* Border */}
            <mesh position={[0, 0, -0.01]}>
                <planeGeometry args={[2.55, 1.25]} />
                <meshStandardMaterial color={account ? "#10b981" : isLocked ? "#ef4444" : "#6366f1"} transparent opacity={0.5} />
            </mesh>

            <Text position={[0, 0.3, 0.02]} fontSize={0.2} color="white" anchorX="center" anchorY="bottom">
                BOLT XR WALLET
            </Text>

            <Text position={[0, -0.1, 0.02]} fontSize={0.1} color="#94a3b8" anchorX="center" anchorY="top">
                {account ? `WALLET ACTIVE` : isLocked ? "VAULT LOCKED" : "WAITING FOR CONNECTION"}
            </Text>

            {account ? (
                <>
                    <Text position={[0, -0.35, 0.02]} fontSize={0.08} color="#10b981" anchorX="center">
                        {account.slice(0, 6)}...{account.slice(-4)}
                    </Text>
                    <group position={[0, -0.55, 0.02]}>
                        {onShowQR && <DashBtn label="QR" onClick={onShowQR} position={[-0.32, 0, 0]} color="#a855f7" />}
                        {onShowContracts && <DashBtn label="CONTRACTS" onClick={onShowContracts} position={[0.32, 0, 0]} color="#10b981" />}
                    </group>
                </>
            ) : (
                <group position={[0, -0.4, 0.02]} onClick={onConnect}>
                     <mesh>
                        <planeGeometry args={[0.8, 0.2]} />
                        <meshStandardMaterial color="#6366f1" />
                     </mesh>
                     <Text fontSize={0.06} color="white" position={[0, 0, 0.01]}>
                        {isLocked ? "UNLOCK VAULT" : "CONNECT"}
                     </Text>
                </group>
            )}
        </group>
    );
}
