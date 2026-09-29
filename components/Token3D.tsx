import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float } from '@react-three/drei';
import { Mesh, Group, Vector3 } from 'three';

/**
 * Ticker on both faces of the coin. Rendered locally rather than from remote
 * logo images: those need CORS for WebGL, fail offline, and leak which chains
 * the user holds to third-party hosts.
 */
function CoinFaces({ symbol }: { symbol: string }) {
    const size = symbol.length > 3 ? 0.09 : 0.12;
    return (
        <>
            <Text position={[0, 0.042, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={size} color="white" anchorX="center" anchorY="middle">
                {symbol}
            </Text>
            <Text position={[0, -0.042, 0]} rotation={[Math.PI / 2, 0, Math.PI]} fontSize={size} color="white" anchorX="center" anchorY="middle">
                {symbol}
            </Text>
        </>
    );
}

interface Token3DProps {
    symbol: string;
    color: string;
    balance: string;
    network: string;
    position: [number, number, number];
    onClick: () => void;
    status: 'loading' | 'success' | 'error';
}

export default function Token3D({ symbol, color, balance, network, position, onClick, status }: Token3DProps) {
    const meshRef = useRef<Mesh>(null);
    const groupRef = useRef<Group>(null);
    const [hovered, setHovered] = useState(false);

    const home = useMemo(() => new Vector3(...position), [position]);

    useFrame((state, delta) => {
        const mesh = meshRef.current;
        if (mesh) {
            mesh.rotation.y += delta * 0.4;
            mesh.rotation.x = hovered || status === 'error'
                ? Math.sin(state.clock.elapsedTime * 2) * (status === 'error' ? 0.4 : 0.2)
                : 0;
        }
        // Ease back into its slot (e.g. after the layout changes).
        groupRef.current?.position.lerp(home, 0.1);
    });

    return (
        <Float floatIntensity={1} speed={2} rotationIntensity={0.5}>
            <group 
                ref={groupRef} 
                position={position}
                onClick={(e) => {
                    // The whole coin (body, halo, labels) is the target: a spinning
                    // coin seen edge-on is otherwise nearly impossible to hit.
                    e.stopPropagation();
                    onClick();
                }}
                onPointerOver={(e) => {
                    e.stopPropagation();
                    setHovered(true);
                    document.body.style.cursor = 'pointer';
                }}
                onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
            >
                <mesh visible={false}>
                    <circleGeometry args={[0.42, 24]} />
                    <meshBasicMaterial />
                </mesh>

                {/* Error Halo */}
                {status === 'error' && (
                    <mesh position={[0, 0, -0.05]}>
                        <ringGeometry args={[0.35, 0.4, 32]} />
                        <meshBasicMaterial color="#ef4444" transparent opacity={0.8} />
                    </mesh>
                )}

                {/* 3D Coin Body */}
                <mesh
                    ref={meshRef}
                    scale={hovered ? 1.2 : 1}
                    rotation={[Math.PI / 2, 0, 0]}
                >
                    <cylinderGeometry args={[0.3, 0.3, 0.08, 32]} />
                    <meshStandardMaterial
                        color={status === 'error' ? '#ef4444' : color}
                        metalness={0.9}
                        roughness={0.1}
                        emissive={status === 'error' ? '#ef4444' : color}
                        emissiveIntensity={hovered || status === 'error' ? 0.8 : 0.2}
                    />

                    {/* Logo faces (both sides) */}
                    <CoinFaces symbol={symbol} />

                </mesh>

                {/* Token Symbol (Floating Label) */}
                <Text
                    position={[0, 0.45, 0]}
                    fontSize={0.08}
                    color="white"
                    anchorX="center"
                    anchorY="bottom"
                >
                    {symbol}
                </Text>

                {/* Network Indicator */}
                <group position={[0, -0.55, 0]}>
                    <mesh>
                        <sphereGeometry args={[0.04, 16, 16]} />
                        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} />
                    </mesh>
                    <Text
                        position={[0.1, 0, 0]}
                        fontSize={0.05}
                        color={status === 'error' ? '#ef4444' : "#94a3b8"}
                        anchorX="left"
                        anchorY="middle"
                    >
                        {status === 'error' ? `${network} (OFFLINE)` : network}
                    </Text>
                </group>

                {/* Balance Text */}
                {(hovered) && (
                    <group position={[0, 0.7, 0]}>
                        <mesh>
                            <planeGeometry args={[0.8, 0.25]} />
                            <meshStandardMaterial color="#000" transparent opacity={0.8} />
                        </mesh>
                        <Text
                            position={[0, 0, 0.01]}
                            fontSize={0.12}
                            color="white"
                            anchorX="center"
                            anchorY="middle"
                        >
                            {status === 'success' ? `${balance} ${symbol}` : status === 'loading' ? 'LOADING' : 'OFFLINE'}
                        </Text>
                    </group>
                )}
            </group>
        </Float>
    );
}
