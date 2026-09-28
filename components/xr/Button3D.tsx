'use client';

import { useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Text, RoundedBox } from '@react-three/drei';

export const XR_THEME = {
  surface: '#0f172a',
  raised: '#1e293b',
  brand: '#8b5cf6',
  info: '#3b82f6',
  success: '#10b981',
  danger: '#ef4444',
  neutral: '#334155',
  text: '#f8fafc',
  muted: '#94a3b8',
  faint: '#64748b',
};

interface Button3DProps {
  label: string;
  onPress: () => void;
  position?: [number, number, number];
  width?: number;
  height?: number;
  color?: string;
  fontSize?: number;
  disabled?: boolean;
}

/**
 * Shared 3D button. Pointer events work for the desktop mouse and for XR
 * controllers / hands in @react-three/xr v6, so there is exactly one handler.
 */
export default function Button3D({
  label, onPress, position = [0, 0, 0], width = 0.8, height = 0.2, color = XR_THEME.neutral, fontSize, disabled = false,
}: Button3DProps) {
  const [hovered, setHovered] = useState(false);
  const active = hovered && !disabled;

  const setCursor = (value: string) => { if (typeof document !== 'undefined') document.body.style.cursor = value; };

  return (
    <group
      position={position}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (!disabled) onPress();
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); if (!disabled) setCursor('pointer'); }}
      onPointerOut={() => { setHovered(false); setCursor('auto'); }}
    >
      <RoundedBox args={[width, height, 0.04]} radius={Math.min(0.04, height / 3)} smoothness={4} scale={active ? 1.04 : 1}>
        <meshStandardMaterial
          color={disabled ? XR_THEME.raised : active ? '#ffffff' : color}
          emissive={disabled ? '#000000' : active ? '#ffffff' : color}
          emissiveIntensity={active ? 0.4 : 0.15}
          metalness={0.6}
          roughness={0.3}
          transparent={disabled}
          opacity={disabled ? 0.5 : 1}
        />
      </RoundedBox>
      <Text
        position={[0, 0, 0.03]}
        fontSize={fontSize ?? Math.min(0.06, height * 0.32)}
        color={disabled ? XR_THEME.faint : active ? '#000000' : XR_THEME.text}
        anchorX="center"
        anchorY="middle"
        maxWidth={width * 0.92}
      >
        {label}
      </Text>
    </group>
  );
}
