'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float } from '@react-three/drei';
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
  const groupRef = useRef<Group>(null);
  const armRef = useRef<Group>(null);
  const leftPanRef = useRef<Group>(null);
  const rightPanRef = useRef<Group>(null);

  // Animation state for the scale tipping
  const [targetRotation, setTargetRotation] = useState(0);
  const currentRotation = useRef(0);

  useFrame((state, delta) => {
    // Determine target rotation based on whether we have an input token
    const newTarget = inputToken ? -0.2 : 0;
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
    <group ref={groupRef}>
      {/* Base */}
      <mesh position={[0, -0.8, 0]}>
        <cylinderGeometry args={[0.4, 0.5, 0.1, 32]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Main Pillar */}
      <mesh position={[0, -0.35, 0]}>
        <cylinderGeometry args={[0.05, 0.08, 1, 16]} />
        <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Arm Assembly */}
      <group ref={armRef} position={[0, 0.15, 0]}>
        {/* Horizontal Beam */}
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
          <Text position={[0, -0.1, 0.01]} fontSize={0.05} color="#94a3b8">INPUT</Text>
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
          <Text position={[0, -0.1, 0.01]} fontSize={0.05} color="#94a3b8">TARGET</Text>
        </group>
      </group>

      {/* Floating UI for Token Selection */}
      {inputToken && !targetToken && (
        <group position={[0, 0.8, 0]}>
          <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
            <mesh>
              <planeGeometry args={[1.5, 0.8]} />
              <meshStandardMaterial color="#0f172a" transparent opacity={0.9} />
            </mesh>
            <Text position={[0, 0.3, 0.01]} fontSize={0.06} color="white">SELECT TARGET ASSET</Text>
            
            {/* Token List */}
            <group position={[-0.5, 0, 0.01]}>
              {availableTokens.filter(t => t.symbol !== inputToken.symbol).slice(0, 3).map((token, i) => (
                <group key={token.symbol} position={[i * 0.5, 0, 0]} onClick={() => onSelectTarget(token)}>
                  <mesh>
                    <circleGeometry args={[0.15, 32]} />
                    <meshStandardMaterial color={token.color} emissive={token.color} emissiveIntensity={0.3} />
                  </mesh>
                  <Text position={[0, -0.2, 0]} fontSize={0.05} color="white">{token.symbol}</Text>
                </group>
              ))}
            </group>
          </Float>
        </group>
      )}

      {/* Confirmation UI */}
      {inputToken && targetToken && (
        <group position={[0, 0.8, 0]}>
          <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
            <mesh>
              <planeGeometry args={[1.2, 0.6]} />
              <meshStandardMaterial color="#0f172a" transparent opacity={0.9} />
            </mesh>
            <Text position={[0, 0.15, 0.01]} fontSize={0.08} color="white">Swap {inputToken.symbol} for {targetToken.symbol}?</Text>
            
            <group position={[0, -0.15, 0.01]} onClick={onConfirm}>
              <mesh>
                <planeGeometry args={[0.6, 0.15]} />
                <meshStandardMaterial color="#10b981" />
              </mesh>
              <Text position={[0, 0, 0.01]} fontSize={0.06} color="white">CONFIRM SWAP</Text>
            </group>
          </Float>
        </group>
      )}

      {/* Decorative Effects */}
      <pointLight position={[0, 0.5, 0]} color="#6366f1" intensity={2} distance={2} />
    </group>
  );
}
