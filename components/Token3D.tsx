import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float, useTexture } from '@react-three/drei';
import { Mesh, MeshStandardMaterial, Group, Vector3 } from 'three';

interface Token3DProps {
    symbol: string;
    color: string;
    balance: string;
    network: string;
    position: [number, number, number];
    onClick: () => void;
    status: 'loading' | 'success' | 'error';
    logo: string;
    onGrab?: (symbol: string) => void;
    onDrop?: (symbol: string, position: [number, number, number]) => void;
}

export default function Token3D({ symbol, color, balance, network, position, onClick, status, logo, onGrab, onDrop }: Token3DProps) {
    const meshRef = useRef<Mesh>(null);
    const groupRef = useRef<Group>(null);
    const [hovered, setHovered] = useState(false);
    const [isGrabbed, setIsGrabbed] = useState(false);

    // Load texture
    let texture: any = null;
    try {
        texture = useTexture(logo);
    } catch (e) {
        console.warn("Failed to load logo texture:", logo);
    }

    useFrame((state, delta) => {
        if (meshRef.current) {
            // Rotation animation (only if not grabbed)
            if (!isGrabbed) {
                meshRef.current.rotation.y += delta * 0.4;
            }

            if (hovered || status === 'error') {
                meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 2) * (status === 'error' ? 0.4 : 0.2);
            } else if (!isGrabbed) {
                meshRef.current.rotation.x = 0;
            }
        }

        // If grabbed, follow the pointer/hand
        if (isGrabbed && groupRef.current) {
            // In a real XR environment, we would use the controller/hand position
            // For now, we simulate with pointer position if available
            const { x, y } = state.pointer;
            groupRef.current.position.lerp(new Vector3(x * 5, y * 3 + 1.2, -2), 0.1);
        } else if (groupRef.current && !isGrabbed) {
            // Smoothly return to original position
            groupRef.current.position.lerp(new Vector3(...position), 0.1);
        }
    });

    const handleSelectStart = () => {
        setIsGrabbed(true);
        if (onGrab) onGrab(symbol);
    };

    const handleSelectEnd = () => {
        setIsGrabbed(false);
        if (onDrop && groupRef.current) {
            onDrop(symbol, [groupRef.current.position.x, groupRef.current.position.y, groupRef.current.position.z]);
        }
    };

    return (
        <Float floatIntensity={isGrabbed ? 0 : 1} speed={2} rotationIntensity={isGrabbed ? 0 : 0.5}>
            <group 
                ref={groupRef} 
                position={position}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    handleSelectStart();
                }}
                onPointerUp={(e) => {
                    e.stopPropagation();
                    handleSelectEnd();
                }}
                onPointerOver={() => setHovered(true)}
                onPointerOut={() => setHovered(false)}
            >
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
                    scale={hovered || isGrabbed ? 1.2 : 1}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClick();
                    }}
                    rotation={[Math.PI / 2, 0, 0]}
                >
                    <cylinderGeometry args={[0.3, 0.3, 0.08, 32]} />
                    <meshStandardMaterial
                        color={status === 'error' ? '#ef4444' : color}
                        metalness={0.9}
                        roughness={0.1}
                        emissive={status === 'error' ? '#ef4444' : (isGrabbed ? "#fff" : color)}
                        emissiveIntensity={hovered || status === 'error' || isGrabbed ? 0.8 : 0.2}
                    />

                    {/* Logo Face (Front) */}
                    {texture && (
                        <mesh position={[0, 0.041, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                            <circleGeometry args={[0.22, 32]} />
                            <meshStandardMaterial map={texture} transparent alphaTest={0.5} />
                        </mesh>
                    )}

                    {/* Logo Face (Back) */}
                    {texture && (
                        <mesh position={[0, -0.041, 0]} rotation={[Math.PI / 2, 0, 0]}>
                            <circleGeometry args={[0.22, 32]} />
                            <meshStandardMaterial map={texture} transparent alphaTest={0.5} />
                        </mesh>
                    )}
                </mesh>

                {/* Token Symbol (Floating Label) */}
                <Text
                    position={[0, 0.45, 0]}
                    fontSize={0.08}
                    color="white"
                    anchorX="center"
                    anchorY="bottom"
                    font="https://fonts.gstatic.com/s/outfit/v11/Q_k79p9L6NqT0EOf07A.woff"
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
                {(hovered || isGrabbed) && (
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
                            {balance} {symbol}
                        </Text>
                    </group>
                )}
            </group>
        </Float>
    );
}
