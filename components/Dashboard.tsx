'use client';

import { Text, useTexture } from '@react-three/drei';

interface DashboardProps {
    account: string | null;
    isLocked?: boolean;
    onConnect: () => void;
}

export default function Dashboard({ account, isLocked, onConnect }: DashboardProps) {
    const logoTexture = useTexture('/logo.png');

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
                <Text position={[0, -0.4, 0.02]} fontSize={0.08} color="#10b981" anchorX="center">
                    {account.slice(0, 6)}...{account.slice(-4)}
                </Text>
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
