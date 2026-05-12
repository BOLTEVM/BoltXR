'use client';

import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float, RoundedBox } from '@react-three/drei';
import { Mesh, Group, Vector3, MathUtils } from 'three';

interface SwapScaleProps {
  inputToken: any | null;
  targetToken: any | null;
  onSelectTarget: (token: any) => void;
  onConfirm: () => void;
  availableTokens: any[];
}

export default function SwapScale({ 
  inputToken, 
  targetToken, 
  onSelectTarget, 
  onConfirm,
  availableTokens 
}: SwapScaleProps) {
  const armRef = useRef<Group>(null);
  const leftPanRef = useRef<Group>(null);
  const rightPanRef = useRef<Group>(null);

  // Animation state for the scale tipping
  const [targetRotation, setTargetRotation] = useState(0);
  const currentRotation = useRef(0);

  // Calculate route type — all routing via unified LI.FI SwapProvider
  const routeType = useMemo(() => {
    if (!inputToken || !targetToken) return null;
    if (inputToken.chainId === targetToken.chainId) return "SWAP (LI.FI)";
    return "BRIDGE (LI.FI CROSS-CHAIN)";
  }, [inputToken, targetToken]);

  useFrame((state, delta) => {
    // Determine target rotation based on whether we have an input token
    const newTarget = inputToken ? (targetToken ? 0 : -0.2) : 0;
    setTargetRotation(newTarget);

    // Smoothly animate the arm rotation
    currentRotation.current = MathUtils.lerp(currentRotation.current, targetRotation, delta * 2);
    if (armRef.current) {
      armRef.current.rotation.z = currentRotation.current;
    }

    // Keep pans vertical
    if (leftPanRef.current) leftPanRef.current.rotation.z = -currentRotation.current;
    if (rightPanRef.current) rightPanRef.current.rotation.z = -currentRotation.current;
  });

  return (
    <group>
      {/* Base */}
      <mesh position={[0, -0.8, 0]}>
        <cylinderGeometry args={[0.4, 0.5, 0.1, 32]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Main Pillar */}
      <mesh position={[0, -0.35, 0]}>
        <cylinderGeometry args={[0.05, 0.08, 1, 16]} />
        <meshStandardMaterial color="#334155" metalness={1} roughness={0} />
      </mesh>

      {/* Arm Assembly */}
      <group ref={armRef} position={[0, 0.15, 0]}>
        <mesh>
          <boxGeometry args={[2, 0.05, 0.05]} />
          <meshStandardMaterial color="#475569" metalness={0.9} />
        </mesh>

        {/* Left Pan */}
        <group ref={leftPanRef} position={[-0.9, -0.3, 0]}>
          <mesh>
             <cylinderGeometry args={[0.3, 0.3, 0.02, 32]} />
             <meshStandardMaterial 
                color={inputToken ? "#8b5cf6" : "#1e293b"} 
                transparent 
                opacity={0.8}
                emissive={inputToken ? "#8b5cf6" : "#000"}
                emissiveIntensity={0.5}
             />
          </mesh>
          <Text position={[0, -0.1, 0.03]} fontSize={0.04} color="#94a3b8">SOURCE</Text>
        </group>

        {/* Right Pan */}
        <group ref={rightPanRef} position={[0.9, -0.3, 0]}>
          <mesh>
             <cylinderGeometry args={[0.3, 0.3, 0.02, 32]} />
             <meshStandardMaterial 
                color={targetToken ? "#3b82f6" : "#1e293b"} 
                transparent 
                opacity={0.8}
                emissive={targetToken ? "#3b82f6" : "#000"}
                emissiveIntensity={0.5}
             />
          </mesh>
          <Text position={[0, -0.1, 0.03]} fontSize={0.04} color="#94a3b8">DESTINATION</Text>
        </group>
      </group>

      {/* Floating UI for Token Selection */}
      {inputToken && !targetToken && (
        <group position={[0, 0.8, 0]}>
          <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2}>
            <RoundedBox args={[1.6, 0.8, 0.05]} radius={0.05}>
                <meshStandardMaterial color="#0f172a" transparent opacity={0.9} metalness={0.8} />
            </RoundedBox>
            <Text position={[0, 0.3, 0.03]} fontSize={0.06} color="white" font="/fonts/Inter-Bold.woff">SELECT TARGET ASSET</Text>
            
            <group position={[-0.5, 0, 0.03]}>
              {availableTokens.filter(t => t.symbol !== inputToken.symbol).slice(0, 3).map((token, i) => (
                    <group 
                      key={token.symbol} 
                      position={[i * 0.5, 0, 0]}
                      onClick={() => onSelectTarget(token)}
                    >
                    <mesh>
                        <circleGeometry args={[0.15, 32]} />
                        <meshStandardMaterial color={token.color} emissive={token.color} emissiveIntensity={0.5} />
                    </mesh>
                    <Text position={[0, -0.2, 0]} fontSize={0.05} color="white">{token.symbol}</Text>
                    </group>
              ))}
            </group>
          </Float>
        </group>
      )}

      {/* Confirmation UI with Route Telemetry */}
      {inputToken && targetToken && (
        <group position={[0, 0.8, 0]}>
          <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2}>
            <RoundedBox args={[1.5, 0.8, 0.05]} radius={0.05}>
                <meshStandardMaterial color="#0f172a" transparent opacity={0.95} metalness={0.9} />
            </RoundedBox>
            
            <Text position={[0, 0.25, 0.03]} fontSize={0.07} color="white">
                SWAP {inputToken.symbol} → {targetToken.symbol}
            </Text>
 
            <Text position={[0, 0.1, 0.03]} fontSize={0.04} color="#10b981">
                OPTIMAL ROUTE: {routeType}
            </Text>
            
            <mesh position={[0, 0, 0.03]}>
                <planeGeometry args={[1.2, 0.002]} />
                <meshStandardMaterial color="#334155" />
            </mesh>
 
            <group position={[0, -0.2, 0.03]} onClick={onConfirm}>
                <RoundedBox args={[0.8, 0.2, 0.05]} radius={0.05}>
                    <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.2} />
                </RoundedBox>
                <Text position={[0, 0, 0.03]} fontSize={0.06} color="white" font="/fonts/Inter-Black.woff">EXECUTE CROSS-CHAIN SWAP</Text>
            </group>
 
            <Text position={[0, -0.35, 0.03]} fontSize={0.03} color="#64748b">
                ESTIMATED TIME: {inputToken.chainId === targetToken.chainId ? "< 30s" : "~3-5m"}
            </Text>
          </Float>
        </group>
      )}

      <pointLight position={[0, 0.5, 0]} color="#6366f1" intensity={3} distance={3} />
    </group>
  );
}
