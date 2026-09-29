'use client';

import { useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { Group, MathUtils } from 'three';
import { XR_THEME } from './xr/Button3D';

interface SwapScaleProps {
  /** Opens the swap panel. */
  onActivate: () => void;
  disabled?: boolean;
}

/** The swap "scale": a tappable centerpiece that opens the cross-chain swap flow. */
export default function SwapScale({ onActivate, disabled = false }: SwapScaleProps) {
  const armRef = useRef<Group>(null);
  const leftPanRef = useRef<Group>(null);
  const rightPanRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    // Gentle idle sway; tips further while hovered to invite interaction.
    const t = state.clock.elapsedTime;
    const target = Math.sin(t * 0.8) * (hovered ? 0.18 : 0.06);
    if (armRef.current) {
      armRef.current.rotation.z = MathUtils.lerp(armRef.current.rotation.z, target, 0.08);
      const z = armRef.current.rotation.z;
      if (leftPanRef.current) leftPanRef.current.rotation.z = -z;
      if (rightPanRef.current) rightPanRef.current.rotation.z = -z;
    }
  });

  const setCursor = (value: string) => { document.body.style.cursor = value; };

  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (!disabled) onActivate(); }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); if (!disabled) setCursor('pointer'); }}
      onPointerOut={() => { setHovered(false); setCursor('auto'); }}
    >
      {/* Invisible hit area so the whole scale is easy to tap */}
      <mesh position={[0, -0.2, 0]} visible={false}>
        <boxGeometry args={[2.1, 1.3, 0.4]} />
        <meshBasicMaterial />
      </mesh>

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
          <meshStandardMaterial color={hovered && !disabled ? XR_THEME.success : '#475569'} metalness={0.9} />
        </mesh>

        <group ref={leftPanRef} position={[-0.9, -0.3, 0]}>
          <mesh>
            <cylinderGeometry args={[0.3, 0.3, 0.02, 32]} />
            <meshStandardMaterial color="#8b5cf6" transparent opacity={0.8} emissive="#8b5cf6" emissiveIntensity={hovered ? 0.7 : 0.35} />
          </mesh>
          <Text position={[0, -0.1, 0.03]} fontSize={0.04} color={XR_THEME.muted}>FROM</Text>
        </group>

        <group ref={rightPanRef} position={[0.9, -0.3, 0]}>
          <mesh>
            <cylinderGeometry args={[0.3, 0.3, 0.02, 32]} />
            <meshStandardMaterial color="#3b82f6" transparent opacity={0.8} emissive="#3b82f6" emissiveIntensity={hovered ? 0.7 : 0.35} />
          </mesh>
          <Text position={[0, -0.1, 0.03]} fontSize={0.04} color={XR_THEME.muted}>TO</Text>
        </group>
      </group>

      <Text position={[0, 0.42, 0]} fontSize={0.055} color={hovered && !disabled ? XR_THEME.success : XR_THEME.muted} anchorX="center">
        {disabled ? 'UNLOCK TO SWAP' : 'TAP THE SCALE TO SWAP'}
      </Text>

      <pointLight position={[0, 0.5, 0]} color="#6366f1" intensity={3} distance={3} />
    </group>
  );
}
